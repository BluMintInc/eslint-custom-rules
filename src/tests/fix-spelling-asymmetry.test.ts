import { Linter } from 'eslint';
import { parse as estreeParse } from '@typescript-eslint/typescript-estree';
import {
  FixtureCase,
  defaultFilenameFor,
  harvestFixtureCorpus,
  parserOptionsFor,
  severityWithOptions,
  silentWithoutProgramRuleNames,
} from '../utils/fixtureCorpus';

/**
 * A developer's choice of function spelling must not decide whether a rule
 * remediates a violation, nor whether it sees one at all.
 *
 * Every fixture is rewritten between equivalent spellings — declaration to
 * arrow and back, function expression to arrow, and concise arrow body to block
 * and back — and two things are diffed.
 *
 * **Fix availability.** A messageId reported in BOTH spellings where one side is
 * cleanly fixable and the other cleanly unfixable. Requiring the report on both
 * sides is what makes a finding unarguable: the rule already agrees the code is
 * a violation either way, and only remediates one way of writing it. A case
 * mixing fixable and unfixable messages under one messageId is a conditional
 * decline, which the two spellings may legitimately hit different numbers of.
 *
 * **Detection**, scoped to the concise/block body pair alone. Those two are the
 * same function of the same node type differing only in body form, so an
 * asymmetry there means the rule reads `BlockStatement` bodies exclusively. The
 * declaration/arrow pairs carry no such guarantee — many rules are about
 * declarations deliberately — and folding them in buries the signal.
 *
 * A rule that reports on only one spelling is broken whichever way it leans: it
 * either withholds a remedy the other spelling gets, or blesses code it flags
 * one rewrite away.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as {
  rules: Record<string, { meta?: Record<string, unknown> }>;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tsParser = require('@typescript-eslint/parser');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ts = require('typescript');

const PREFIX = '@blumintinc/blumint/';

const linter = new Linter();
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}
linter.defineParser('ts', tsParser);

const configFor = (rule: string, testCase: FixtureCase): Linter.Config =>
  ({
    parser: 'ts',
    parserOptions: parserOptionsFor(testCase),
    rules: { [PREFIX + rule]: severityWithOptions(testCase) },
  } as Linter.Config);

// ---------------------------------------------------------------------------
// Spelling transforms
// ---------------------------------------------------------------------------

const parseOrNull = (code: string, jsx: boolean) => {
  try {
    return estreeParse(code, { jsx, range: true, loc: true, comment: false });
  } catch {
    return null;
  }
};

/**
 * Whether a rewrite is actually legal, which parsing alone does not answer.
 *
 * TypeScript's parser is error-tolerant: it recovers from a syntax error and
 * returns a tree instead of throwing, so `parseOrNull` accepts corrupt output
 * and the rule then "disagrees" about code no developer could have written.
 * That fabricates findings — `=> ({ return x; })` survived a reparse and was
 * reported as a detection asymmetry. Reading the parse diagnostics is what
 * separates a legal rewrite from a recovered one.
 */
const isSyntacticallyValid = (code: string, jsx: boolean): boolean => {
  const file = ts.createSourceFile(
    jsx ? 'probe.tsx' : 'probe.ts',
    code,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    jsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  return ((file as any).parseDiagnostics || []).length === 0;
};

/**
 * A body binding `this`, `arguments` or `super`, or one that yields, does not
 * survive the declaration/arrow rewrite with its meaning intact. Matching the
 * raw text is deliberately over-broad: a skipped fixture costs one probe, while
 * a rewrite that changes meaning manufactures a finding out of nothing.
 */
const NEUTRALITY_BLOCKERS = /\bthis\b|\barguments\b|\bsuper\b|\byield\b/;

const isNeutral = (text: string) => !NEUTRALITY_BLOCKERS.test(text);

type Edit = { start: number; end: number; text: string };

const applyEdits = (source: string, edits: Edit[]) =>
  [...edits]
    .sort((a, b) => b.start - a.start)
    .reduce(
      (out, edit) => out.slice(0, edit.start) + edit.text + out.slice(edit.end),
      source,
    );

const walk = (
  node: any,
  visit: (n: any, parent: any) => void,
  parent?: any,
) => {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item.type === 'string') walk(item, visit, node);
      }
    } else if (child && typeof child.type === 'string') {
      walk(child, visit, node);
    }
  }
};

/**
 * `function NAME<T>(p): R { ... }` to `const NAME = <T>(p): R => { ... }`.
 *
 * The text between the name (or type parameters) and the body is reused
 * verbatim, because `(p): R` is already exactly an arrow's parameter list and
 * return annotation. Rebuilding it from the AST would drop defaults, modifiers
 * and comments.
 */
const declarationToArrow = (source: string, ast: any): Edit[] => {
  const edits: Edit[] = [];
  walk(ast, (node, parent) => {
    if (node.type !== 'FunctionDeclaration') return;
    if (node.generator || !node.id || !node.body) return;
    // `export default function` has no single-edit const equivalent.
    if (parent && parent.type === 'ExportDefaultDeclaration') return;
    if (!isNeutral(source.slice(node.range[0], node.range[1]))) return;
    const afterName = node.typeParameters
      ? node.typeParameters.range[1]
      : node.id.range[1];
    const typeParams = node.typeParameters
      ? source.slice(node.typeParameters.range[0], node.typeParameters.range[1])
      : '';
    const signature = source.slice(afterName, node.body.range[0]).trim();
    const body = source.slice(node.body.range[0], node.body.range[1]);
    edits.push({
      start: node.range[0],
      end: node.range[1],
      text: `const ${node.id.name} = ${
        node.async ? 'async ' : ''
      }${typeParams}${signature} => ${body};`,
    });
  });
  return edits;
};

/**
 * `const NAME = <T>(p): R => { ... }` to `function NAME<T>(p): R { ... }`.
 *
 * Block bodies only. A concise body would have to gain a `return`, which is a
 * second spelling change and is probed on its own below.
 */
const arrowToDeclaration = (source: string, ast: any): Edit[] => {
  const edits: Edit[] = [];
  walk(ast, (node) => {
    if (node.type !== 'VariableDeclaration' || node.kind !== 'const') return;
    if (node.declarations.length !== 1) return;
    const declarator = node.declarations[0];
    const init = declarator.init;
    if (!init || init.type !== 'ArrowFunctionExpression') return;
    if (init.body.type !== 'BlockStatement') return;
    if (declarator.id.type !== 'Identifier') return;
    // An annotated binding cannot move onto a function declaration.
    if (declarator.id.typeAnnotation) return;
    if (!isNeutral(source.slice(node.range[0], node.range[1]))) return;
    const typeParams = init.typeParameters
      ? source.slice(init.typeParameters.range[0], init.typeParameters.range[1])
      : '';
    const afterTypeParams = init.typeParameters
      ? init.typeParameters.range[1]
      : init.range[0] + (init.async ? 'async'.length : 0);
    const signature = source
      .slice(afterTypeParams, init.body.range[0])
      .trim()
      .replace(/=>$/, '')
      .trim();
    if (!signature.startsWith('(')) return;
    const body = source.slice(init.body.range[0], init.body.range[1]);
    edits.push({
      start: node.range[0],
      end: node.range[1],
      text: `${init.async ? 'async ' : ''}function ${
        declarator.id.name
      }${typeParams}${signature} ${body}`,
    });
  });
  return edits;
};

/** `function (p) { ... }` to `(p) => { ... }`. */
const functionExpressionToArrow = (source: string, ast: any): Edit[] => {
  const edits: Edit[] = [];
  walk(ast, (node) => {
    if (node.type !== 'FunctionExpression') return;
    if (node.generator || !node.body) return;
    // A named function expression binds its own name inside the body.
    if (node.id) return;
    if (!isNeutral(source.slice(node.range[0], node.range[1]))) return;
    const typeParams = node.typeParameters
      ? source.slice(node.typeParameters.range[0], node.typeParameters.range[1])
      : '';
    const afterKeyword = node.typeParameters
      ? node.typeParameters.range[1]
      : source.indexOf('(', node.range[0]);
    if (afterKeyword < 0) return;
    const signature = source.slice(afterKeyword, node.body.range[0]).trim();
    if (!signature.startsWith('(')) return;
    const body = source.slice(node.body.range[0], node.body.range[1]);
    edits.push({
      start: node.range[0],
      end: node.range[1],
      text: `${node.async ? 'async ' : ''}${typeParams}${signature} => ${body}`,
    });
  });
  return edits;
};

/** `(p) => expr` to `(p) => { return expr; }`. */
const conciseArrowToBlock = (source: string, ast: any): Edit[] => {
  const edits: Edit[] = [];
  walk(ast, (node) => {
    if (node.type !== 'ArrowFunctionExpression') return;
    if (node.body.type === 'BlockStatement') return;
    // Rewritten from after the arrow token rather than from the body node,
    // because an expression's own range stops INSIDE any parentheses wrapping
    // it — an ObjectExpression body most of all, where re-emitting the bare
    // slice would put a block where the return value belongs. The nearest `=>`
    // before the body is necessarily this arrow's, since a nested arrow in a
    // parameter default sits entirely to its left.
    const arrowToken = source.lastIndexOf('=>', node.body.range[0]);
    if (arrowToken < 0) return;
    const start = arrowToken + '=>'.length;
    const bodyText = source.slice(start, node.range[1]).trim();
    if (!bodyText) return;
    edits.push({
      start,
      end: node.range[1],
      text: ` { return ${bodyText}; }`,
    });
  });
  return edits;
};

/**
 * `(p) => { return expr; }` to `(p) => expr`.
 *
 * Declines when the block holds anything besides the return statement, which in
 * practice means a COMMENT. A comment is not decoration to a linter: the block
 * bodies in the corpus carry `eslint-disable-next-line react-hooks/exhaustive-deps`
 * and other directives, and a rewrite that drops one changes which rules fire.
 * Every finding it manufactured was of that shape — a rule that declines to fix
 * rather than delete a comment (`no-useless-usememo-primitives`), or one whose
 * exemption carrier is the comment itself (`no-entire-object-hook-deps`) —
 * so the perturbation, not the rule, was the asymmetry (#1859). The same
 * neutrality discipline `isNeutral` applies to `this`/`arguments`/`super`.
 */
const blockArrowToConcise = (source: string, ast: any): Edit[] => {
  const edits: Edit[] = [];
  walk(ast, (node) => {
    if (node.type !== 'ArrowFunctionExpression') return;
    if (node.body.type !== 'BlockStatement') return;
    const statements = node.body.body;
    if (statements.length !== 1) return;
    const only = statements[0];
    if (only.type !== 'ReturnStatement' || !only.argument) return;
    const inner = source
      .slice(node.body.range[0] + 1, node.body.range[1] - 1)
      .trim();
    if (inner !== source.slice(only.range[0], only.range[1]).trim()) return;
    const argument = source.slice(
      only.argument.range[0],
      only.argument.range[1],
    );
    if (!isNeutral(argument)) return;
    edits.push({
      start: node.body.range[0],
      end: node.body.range[1],
      // A bare object literal would re-parse as a block without these.
      text:
        only.argument.type === 'ObjectExpression' ? `(${argument})` : argument,
    });
  });
  return edits;
};

const TRANSFORMS = [
  { name: 'declaration->arrow', build: declarationToArrow },
  { name: 'arrow->declaration', build: arrowToDeclaration },
  { name: 'funcExpression->arrow', build: functionExpressionToArrow },
  { name: 'conciseArrow->block', build: conciseArrowToBlock },
  { name: 'blockArrow->concise', build: blockArrowToConcise },
] as const;

/**
 * The pair that isolates body FORM. Only these two feed the detection census,
 * because only they hold the node type fixed.
 */
const BODY_TRANSFORMS = new Set<string>([
  'conciseArrow->block',
  'blockArrow->concise',
]);

type Variant = { transform: string; code: string };

const variantsOf = (code: string, jsx: boolean): Variant[] => {
  const ast = parseOrNull(code, jsx);
  if (!ast) return [];
  // A fixture that is already broken cannot tell us anything about a rewrite
  // of it, and would make every one of its variants read as a finding.
  if (!isSyntacticallyValid(code, jsx)) return [];
  const variants: Variant[] = [];
  for (const transform of TRANSFORMS) {
    let edits: Edit[] = [];
    try {
      edits = transform.build(code, ast);
    } catch {
      continue;
    }
    if (!edits.length) continue;
    const rewritten = applyEdits(code, edits);
    if (rewritten === code) continue;
    // A rewrite that is not legal code is a harness defect, never a finding.
    if (!parseOrNull(rewritten, jsx)) continue;
    if (!isSyntacticallyValid(rewritten, jsx)) continue;
    variants.push({ transform: transform.name, code: rewritten });
  }
  return variants;
};

// ---------------------------------------------------------------------------
// Probe
// ---------------------------------------------------------------------------

type FixState = { withFix: number; withoutFix: number };

const fixStatesOf = (
  rule: string,
  code: string,
  testCase: FixtureCase,
  filename: string,
): Map<string, FixState> | null => {
  const id = PREFIX + rule;
  let messages: Linter.LintMessage[];
  try {
    messages = linter.verify(code, configFor(rule, testCase), { filename });
  } catch {
    return null;
  }
  // A fatal parse reports nothing else, so it would read as rule silence.
  if (messages.some((m) => m.fatal)) return null;
  const states = new Map<string, FixState>();
  for (const message of messages) {
    if (message.ruleId !== id) continue;
    const key = message.messageId || message.message;
    const state = states.get(key) || { withFix: 0, withoutFix: 0 };
    if (message.fix) state.withFix++;
    else state.withoutFix++;
    states.set(key, state);
  }
  return states;
};

type Finding = {
  rule: string;
  messageId: string;
  transform: string;
  detail: string;
  origin: string;
  filename: string;
  options?: readonly unknown[];
  original: string;
  variant: string;
};

type ProbeResult = {
  fixFindings: Finding[];
  detectionFindings: Finding[];
  /** messageIds present on BOTH sides — the only comparisons that can assert. */
  sharedMessageIds: number;
  /** Concise/block pairs compared — the detection census's own floor. */
  bodyComparisons: number;
  /** Shared-messageId pairs where at least one side carried a fix. */
  fixableComparisons: number;
  /** Body pairs where at least one side reported at all. */
  reportingBodyComparisons: number;
  /**
   * Why a case contributed nothing, carried so a rule whose row can never fail
   * names the reason rather than leaving it to inference. A variant that was
   * never built and one the rule was silent on are different failures.
   */
  variants: number;
  comparedVariants: number;
  /** The baseline lint succeeded; false means a fatal parse or a crash. */
  lintable: boolean;
  reported: boolean;
  /** The rule offered a fix on the untouched fixture. */
  offeredFix: boolean;
};

const EMPTY: ProbeResult = {
  fixFindings: [],
  detectionFindings: [],
  sharedMessageIds: 0,
  bodyComparisons: 0,
  fixableComparisons: 0,
  reportingBodyComparisons: 0,
  variants: 0,
  comparedVariants: 0,
  lintable: false,
  reported: false,
  offeredFix: false,
};

/**
 * Both censuses off one lint of each variant. Kept in one pass deliberately:
 * running them separately linted every variant twice for no extra coverage.
 */
const probeCase = (rule: string, testCase: FixtureCase): ProbeResult => {
  const filename = defaultFilenameFor(testCase);
  const jsx = filename.endsWith('.tsx');
  const before = fixStatesOf(rule, testCase.code, testCase, filename);
  if (!before) return EMPTY;

  const result: ProbeResult = {
    fixFindings: [],
    detectionFindings: [],
    sharedMessageIds: 0,
    bodyComparisons: 0,
    fixableComparisons: 0,
    reportingBodyComparisons: 0,
    variants: 0,
    comparedVariants: 0,
    lintable: true,
    reported: before.size > 0,
    offeredFix: [...before.values()].some((state) => state.withFix > 0),
  };

  for (const variant of variantsOf(testCase.code, jsx)) {
    result.variants++;
    const after = fixStatesOf(rule, variant.code, testCase, filename);
    if (!after) continue;
    result.comparedVariants++;

    const context = {
      rule,
      transform: variant.transform,
      origin: testCase.origin,
      filename,
      options: testCase.options,
      original: testCase.code,
      variant: variant.code,
    };

    if (BODY_TRANSFORMS.has(variant.transform)) {
      result.bodyComparisons++;
      // A pair silent on BOTH sides cannot produce a one-sided report, so it is
      // not a comparison that could ever have failed.
      if (before.size || after.size) result.reportingBodyComparisons++;
      for (const messageId of new Set([...before.keys(), ...after.keys()])) {
        const inOriginal = before.has(messageId);
        if (inOriginal === after.has(messageId)) continue;
        result.detectionFindings.push({
          ...context,
          messageId,
          detail: `reported on the ${
            inOriginal ? 'original' : 'rewritten'
          } spelling only`,
        });
      }
    }

    // The fix census needs the report on both sides, so it iterates the
    // original's messageIds and skips any the variant does not share.
    for (const [messageId, originalState] of before) {
      const variantState = after.get(messageId);
      if (!variantState) continue;
      result.sharedMessageIds++;
      // A finding is a polarity FLIP, so a pair where neither side carries a
      // fix cannot produce one however the two sides differ.
      if (originalState.withFix > 0 || variantState.withFix > 0) {
        result.fixableComparisons++;
      }

      const cleanlyFixable = (state: FixState) =>
        state.withFix > 0 && state.withoutFix === 0;
      const cleanlyUnfixable = (state: FixState) =>
        state.withFix === 0 && state.withoutFix > 0;

      // Only the unambiguous polarity flip: a case reporting a mix under one
      // messageId is a conditional decline, and the spellings may legitimately
      // hit different numbers of each.
      const fixableSide = cleanlyFixable(originalState)
        ? cleanlyUnfixable(variantState)
          ? 'original'
          : null
        : cleanlyUnfixable(originalState) && cleanlyFixable(variantState)
        ? 'rewritten'
        : null;
      if (!fixableSide) continue;

      result.fixFindings.push({
        ...context,
        messageId,
        detail: `fixable on the ${fixableSide} spelling only`,
      });
    }
  }
  return result;
};

const corpus = harvestFixtureCorpus();

/**
 * Only rules that measurably report NOTHING under this harness are excluded —
 * currently none. The wider "mentions the type checker" set was excluded before
 * on the theory that a bare `Linter` builds no program; it builds an isolated
 * single-file one, and all 16 of those rules report over their own fixtures, so
 * the exclusion suppressed live coverage rather than a false clean (#1859).
 */
const probeRules = Object.keys(plugin.rules)
  .filter((name) => !silentWithoutProgramRuleNames.has(name))
  .sort();

/**
 * Fixtures this guard's probe cannot be applied to, named per (guard, rule)
 * with the reason.
 *
 * The probe respells a fixture's TypeScript expressions — member access as a
 * computed key, an arrow body as a block — and asks whether the fix survives
 * the respelling. That needs TypeScript syntax to respell.
 * A `package.json` body and a Markdown document have neither, so a case in
 * either language cannot pose the question. Skipping by LANGUAGE rather than by
 * parse failure is what keeps the skip honest: a Markdown fence is an empty
 * template literal, so several of those fixtures do parse as TypeScript and
 * would otherwise answer a TypeScript question by accident (#1860).
 *
 * A rule-global exclusion would be the wrong instrument — it would un-gate every
 * other arm these rules participate in (#1839) — so the entry is scoped to this
 * guard and asserted in both directions below.
 */
const NON_TYPESCRIPT_FIXTURES: Record<string, string> = {
  'enforce-typescript-markdown-code-blocks':
    'declares only Markdown documents, under ruleTesterMarkdown',
  'no-unpinned-dependencies':
    'declares only package.json bodies, under ruleTesterJson',
  'prefer-nullish-coalescing-boolean-props':
    'declares one package.json body under ruleTesterJson alongside its TypeScript fixtures',
};

const fixFindings: Finding[] = [];
const detectionFindings: Finding[] = [];
let casesConsidered = 0;
let nonTypeScriptSkipped = 0;
const rulesWithNonTypeScriptFixtures = new Set<string>();
let sharedMessageIds = 0;
let bodyComparisons = 0;
const rulesCompared = new Set<string>();

/**
 * Per-rule bookkeeping, so each rule's row can assert the probe reached it.
 *
 * `sharedMessageIds` is the only counter a FIX finding can come out of and
 * `bodyComparisons` the only one a DETECTION finding can; the rest exist to say
 * WHY a rule was never reached, which is what turns a dark row into a
 * reviewable exemption instead of a green one.
 */
type Drive = {
  tsCases: number;
  lintableCases: number;
  reportingCases: number;
  fixOfferingCases: number;
  variants: number;
  comparedVariants: number;
  sharedMessageIds: number;
  bodyComparisons: number;
  fixableComparisons: number;
  reportingBodyComparisons: number;
};
const emptyDrive = (): Drive => ({
  tsCases: 0,
  lintableCases: 0,
  reportingCases: 0,
  fixOfferingCases: 0,
  variants: 0,
  comparedVariants: 0,
  sharedMessageIds: 0,
  bodyComparisons: 0,
  fixableComparisons: 0,
  reportingBodyComparisons: 0,
});
const driveByRule = new Map<string, Drive>(
  probeRules.map((rule) => [rule, emptyDrive()]),
);

for (const rule of probeRules) {
  const drive = driveByRule.get(rule)!;
  for (const testCase of corpus.byRule.get(rule) || []) {
    if (testCase.language !== 'ts') {
      nonTypeScriptSkipped++;
      rulesWithNonTypeScriptFixtures.add(rule);
      continue;
    }
    const result = probeCase(rule, testCase);
    casesConsidered++;
    drive.tsCases++;
    if (result.lintable) drive.lintableCases++;
    if (result.reported) drive.reportingCases++;
    if (result.offeredFix) drive.fixOfferingCases++;
    drive.variants += result.variants;
    drive.comparedVariants += result.comparedVariants;
    drive.sharedMessageIds += result.sharedMessageIds;
    drive.bodyComparisons += result.bodyComparisons;
    drive.fixableComparisons += result.fixableComparisons;
    drive.reportingBodyComparisons += result.reportingBodyComparisons;
    sharedMessageIds += result.sharedMessageIds;
    bodyComparisons += result.bodyComparisons;
    if (result.sharedMessageIds > 0) rulesCompared.add(rule);
    fixFindings.push(...result.fixFindings);
    detectionFindings.push(...result.detectionFindings);
  }
}

const detectionRules = [
  ...new Set(detectionFindings.map((f) => f.rule)),
].sort();

/**
 * Why a rule's per-rule row could never fail, read off the counters above.
 *
 * A row that renders green having compared nothing is worse than a missing row:
 * it names the rule in the jest output, so the next reader takes it as evidence
 * the rule WAS checked. Each rule therefore either asserts it drove at least one
 * comparison, or it is a NAMED SKIP carrying the measured reason — the same
 * non-vacuity check the controls at the bottom of this file already carry
 * (`sharedMessageIds + bodyComparisons > 0`), applied to the ~190 rows it was
 * never applied to (#1861).
 *
 * The causes are ordered from the outermost precondition inwards, so the one
 * named is the FIRST that failed: a rule with no TypeScript fixture is not also
 * "silent", it was never linted.
 */
const UNDRIVEN_CAUSES = {
  noFixer:
    'declares no meta.fixable, so it can never offer the fix whose availability this census diffs',
  noTsFixture:
    'declares no TypeScript fixture, and a function spelling is a TypeScript question',
  unlintable: 'every fixture fails to lint, so no baseline exists to compare',
  noRespelling:
    'no fixture contains a function this probe can respell (declaration, unnamed function expression or arrow)',
  variantUnlintable:
    'every respelling of every fixture fails to lint, so no pair was ever compared',
  silent: 'reports on none of its own fixtures under this harness',
  noSharedMessageId:
    'no messageId it reports survives into a respelling, so no pair states both sides of a fix question',
  noFixEverOffered:
    'declares meta.fixable yet offers no fix on any of its own fixtures here, so the fix channel is untested by its corpus',
  noFixInComparedPair:
    'offers a fix somewhere in its corpus, but never on a fixture whose respelling shares a messageId',
  noBodyRespelling:
    'no fixture contains a concise arrow body or a single-return block arrow, the pair this census diffs',
  silentOnBodyPairs:
    'reports on neither spelling of any concise/block pair its fixtures yield',
} as const;
type UndrivenCause = keyof typeof UNDRIVEN_CAUSES;

/** A rule with no fixer cannot offer one, so the whole fix census skips it. */
const fixableRuleNames = new Set(
  probeRules.filter((rule) => plugin.rules[rule]?.meta?.fixable),
);

const fixCauseOf = (rule: string): UndrivenCause | null => {
  const drive = driveByRule.get(rule)!;
  if (!fixableRuleNames.has(rule)) return 'noFixer';
  if (drive.tsCases === 0) return 'noTsFixture';
  if (drive.lintableCases === 0) return 'unlintable';
  if (drive.variants === 0) return 'noRespelling';
  if (drive.comparedVariants === 0) return 'variantUnlintable';
  if (drive.reportingCases === 0) return 'silent';
  if (drive.sharedMessageIds === 0) return 'noSharedMessageId';
  if (drive.fixableComparisons > 0) return null;
  return drive.fixOfferingCases === 0
    ? 'noFixEverOffered'
    : 'noFixInComparedPair';
};

const detectionCauseOf = (rule: string): UndrivenCause | null => {
  const drive = driveByRule.get(rule)!;
  if (drive.tsCases === 0) return 'noTsFixture';
  if (drive.lintableCases === 0) return 'unlintable';
  if (drive.bodyComparisons === 0) return 'noBodyRespelling';
  if (drive.reportingBodyComparisons === 0) return 'silentOnBodyPairs';
  return null;
};

const measuredUndriven = (
  causeOf: (rule: string) => UndrivenCause | null,
  skip?: UndrivenCause,
): Record<string, UndrivenCause> =>
  Object.fromEntries(
    probeRules
      .map((rule) => [rule, causeOf(rule)] as const)
      .filter(
        (entry): entry is readonly [string, UndrivenCause] =>
          !!entry[1] && entry[1] !== skip,
      ),
  );

/**
 * Rules the FIX census cannot drive, each with the measured cause.
 *
 * `noFixer` is derived from `meta.fixable` rather than listed, because a rule
 * that gains a fixer must enter the census automatically; every other cause is
 * a fact about the CORPUS, which no metadata announces, so it is named here and
 * asserted to still hold. Both directions and the cause itself are checked
 * below, so an entry cannot outlive what it describes.
 */
const FIX_UNDRIVEN: Record<string, UndrivenCause> = {
  // 22 of 22 `funcExpression->arrow` rewrites of its fixtures are discarded as
  // unparsable (#1870); the concise/block pairs that do survive report a
  // different messageId on each side, since reordering is what it measures.
  'class-methods-read-top-to-bottom': 'noSharedMessageId',
  'enforce-date-ttime': 'noSharedMessageId',
  'enforce-firestore-rules-get-access': 'noRespelling',
  'enforce-typescript-markdown-code-blocks': 'noTsFixture',
  'jsdoc-above-field': 'noRespelling',
  'no-unnecessary-destructuring': 'noSharedMessageId',
  'no-unpinned-dependencies': 'noTsFixture',
  // Reports 4 times over 105 fixtures and fixes none of them, so nothing in its
  // corpus exercises the fixer this census diffs.
  'no-usememo-for-pass-by-value': 'noFixEverOffered',
  'omit-index-html': 'noRespelling',
  'prefer-clone-deep': 'noFixInComparedPair',
  'prefer-fragment-shorthand': 'noRespelling',
  // All 41 `funcExpression->arrow` attempts on its fixtures are discarded as
  // unparsable and it has no other respellable site, so #1870 is the whole of
  // this entry: fixing that transform should retire it.
  'prefer-getter-over-parameterless-method': 'noRespelling',
  'prefer-params-over-parent-id': 'noFixInComparedPair',
  'sync-onwrite-name-func': 'noRespelling',
  'use-custom-link': 'noRespelling',
};

/**
 * Rules the DETECTION census cannot drive, each with the measured cause.
 *
 * Every entry here is a fact about the rule's fixtures, not about the rule:
 * `noBodyRespelling` means no fixture contains either body form to swap, and
 * `silentOnBodyPairs` means the fixtures that do contain one are fixtures the
 * rule says nothing about. Both are legitimate — but they are recorded rather
 * than rendered as a passing row, because a reader cannot tell the two apart in
 * jest output.
 */
const DETECTION_UNDRIVEN: Record<string, UndrivenCause> = {
  'array-methods-this-context': 'silentOnBodyPairs',
  'avoid-utils-directory': 'noBodyRespelling',
  'class-methods-read-top-to-bottom': 'silentOnBodyPairs',
  'dynamic-https-errors': 'silentOnBodyPairs',
  'enforce-centralized-mock-firestore': 'noBodyRespelling',
  'enforce-cloud-function-id-length': 'noBodyRespelling',
  'enforce-date-ttime': 'noBodyRespelling',
  'enforce-dynamic-file-naming': 'noBodyRespelling',
  'enforce-dynamic-imports': 'silentOnBodyPairs',
  'enforce-early-destructuring': 'silentOnBodyPairs',
  'enforce-empty-object-check': 'noBodyRespelling',
  'enforce-fieldpath-syntax-in-docsetter': 'noBodyRespelling',
  'enforce-firestore-path-utils': 'noBodyRespelling',
  'enforce-firestore-rules-get-access': 'noBodyRespelling',
  'enforce-id-capitalization': 'silentOnBodyPairs',
  'enforce-identifiable-firestore-type': 'noBodyRespelling',
  'enforce-m3-sentence-case': 'noBodyRespelling',
  'enforce-memoize-getters': 'silentOnBodyPairs',
  'enforce-realtimedb-path-utils': 'noBodyRespelling',
  'enforce-serializable-params': 'silentOnBodyPairs',
  'enforce-singular-type-names': 'noBodyRespelling',
  'enforce-storage-context': 'noBodyRespelling',
  'enforce-timestamp-now': 'noBodyRespelling',
  'enforce-types-directory-placement': 'silentOnBodyPairs',
  'enforce-typescript-markdown-code-blocks': 'noTsFixture',
  'export-if-in-doubt': 'silentOnBodyPairs',
  'extract-global-constants': 'silentOnBodyPairs',
  'flatten-push-calls': 'noBodyRespelling',
  'generic-starts-with-t': 'noBodyRespelling',
  'jsdoc-above-field': 'noBodyRespelling',
  'logical-top-to-bottom-grouping': 'silentOnBodyPairs',
  'no-always-true-false-conditions': 'silentOnBodyPairs',
  'no-async-foreach': 'noBodyRespelling',
  'no-circular-references': 'noBodyRespelling',
  'no-class-instance-destructuring': 'noBodyRespelling',
  'no-conditional-literals-in-jsx': 'noBodyRespelling',
  'no-curly-brackets-around-commented-properties': 'silentOnBodyPairs',
  'no-fill-template-mutation': 'silentOnBodyPairs',
  'no-filter-without-return': 'silentOnBodyPairs',
  'no-firestore-object-arrays': 'noBodyRespelling',
  'no-harness-coupled-disables': 'noBodyRespelling',
  'no-memoize-on-static': 'noBodyRespelling',
  'no-misused-switch-case': 'noBodyRespelling',
  'no-overridable-method-calls-in-constructor': 'silentOnBodyPairs',
  'no-passthrough-getters': 'silentOnBodyPairs',
  'no-redundant-boolean-callback-props': 'noBodyRespelling',
  'no-restricted-properties-fix': 'silentOnBodyPairs',
  'no-separate-loading-state': 'noBodyRespelling',
  'no-single-dismiss-dialog-button': 'noBodyRespelling',
  'no-stablehash-react-nodes': 'silentOnBodyPairs',
  'no-static-constants-in-dynamic-files': 'silentOnBodyPairs',
  'no-try-catch-already-exists-in-transaction': 'silentOnBodyPairs',
  'no-unnecessary-destructuring': 'silentOnBodyPairs',
  'no-unpinned-dependencies': 'noTsFixture',
  'omit-index-html': 'noBodyRespelling',
  'prefer-block-comments-for-declarations': 'noBodyRespelling',
  'prefer-destructuring-no-class': 'silentOnBodyPairs',
  'prefer-document-flattening': 'noBodyRespelling',
  'prefer-fragment-shorthand': 'noBodyRespelling',
  'prefer-getter-over-parameterless-method': 'noBodyRespelling',
  'prefer-type-alias-over-typeof-constant': 'noBodyRespelling',
  'prefer-type-over-interface': 'noBodyRespelling',
  'prefer-union-from-const-array': 'noBodyRespelling',
  'prefer-url-tostring-over-tojson': 'noBodyRespelling',
  'prefer-use-theme': 'noBodyRespelling',
  'require-dynamic-firebase-imports': 'silentOnBodyPairs',
  'require-https-error': 'noBodyRespelling',
  'require-https-error-cause': 'silentOnBodyPairs',
  'sync-onwrite-name-func': 'noBodyRespelling',
  'test-file-location-enforcement': 'noBodyRespelling',
  'use-custom-link': 'noBodyRespelling',
};

/**
 * Rules whose concise/block detection asymmetry is a known, filed decision
 * rather than an unnoticed defect.
 *
 * Enforced in BOTH directions below. A rule that stops flagging must be removed
 * from here, and a new one must be added consciously — a one-way list would let
 * a fresh defect hide under an entry written for something else. Keyed on the
 * rule name rather than on a finding count, so adding fixtures to an exempt
 * rule does not churn the gate while a NEW rule name still trips it.
 */
const DETECTION_EXEMPT: Record<string, string> = {
  // Registers only a `ReturnStatement` visitor, so a concise body is
  // structurally invisible. Parity is a breadth decision, not a mechanical fix:
  // it adds ~703 consumer reports, almost all `jest.mock` factories, where the
  // `as const` remedy makes properties readonly and can break a test that
  // reassigns a mock.
  'enforce-object-literal-as-const': 'breadth decision, tracked as #1795',
  // The `&&` and ternary shapes reached block bodies in #1794; the bare
  // identity shape is deliberately still concise-only, because widening it
  // would ship a second copy of behaviour whose boundary is unsettled.
  'no-undefined-null-passthrough': 'identity shape deferred, tracked as #1785',
  // Reports in BOTH spellings and swaps `preferMap` for `preferMapManual` when
  // the dispatch sits in a concise body, whose message names the reason: there
  // is no statement position to place the `Record` in, so the fix is withheld
  // and the developer is told to extract it. The census keys on messageId, so a
  // deliberate fixable/manual split reads as two one-sided detections.
  // Surfaced by the #1859 widening.
  'prefer-map-over-conditional-dispatch':
    'deliberate fixable/manual split on an expression body',
};

/**
 * Rules whose FIX asymmetry is a real defect, recorded so the census stays
 * actionable while each is filed and fixed. Deliberately separate from
 * `DETECTION_EXEMPT`, which records design decisions: merging the two would let
 * a bug retire under a "filed decision" label.
 *
 * Empty: no rule's fix availability turns on a function spelling. The map stays
 * declared because the assertion below reads it in BOTH directions — an empty
 * map is what makes the next finding fail loudly instead of landing in a slot
 * written for something else.
 *
 * The one entry it held was `prefer-use-deep-compare-memo`, which rewrote a call
 * to a `const`-spelled local hook while withholding the same rewrite from the
 * `function` spelling. Its cause was in the shared planner rather than the rule:
 * `planOrphanedImportRemoval` (`src/utils/importRemoval.ts`) counted a
 * declarator's own initializer write as a surviving reference, so a `const`
 * binding could never look orphaned. The planner discounts that self-write, and
 * both spellings decline (#1868).
 */
const FIX_KNOWN_DEFECTS: Record<string, string> = {};

const reportOf = (findings: Finding[]) =>
  findings
    .map(
      (f) =>
        `[${f.transform}] ${f.messageId}: ${f.detail}\n` +
        `src/tests/${f.origin} as ${f.filename}\n` +
        `options: ${JSON.stringify(f.options)}\n` +
        `--- original ---\n${f.original}\n--- rewritten ---\n${f.variant}`,
    )
    .join('\n\n');

const findingsFor = (rule: string, findings: Finding[]) =>
  findings.filter((f) => f.rule === rule);

// ---------------------------------------------------------------------------
// Controls. A zero over the real rules asserts nothing without these, and each
// census needs its own pair — they read different halves of the probe result.
// ---------------------------------------------------------------------------

const CONTROLS = [
  {
    name: 'control-fix-asymmetric',
    code: 'function widget() { return legacyCompare(a, b); }\n',
    expect: { fix: true, detection: false },
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'use the helper' },
      },
      create(context: any) {
        const report = (node: any, fixable: boolean) => {
          const call = node.body?.body?.[0]?.argument;
          if (!call || call.callee?.name !== 'legacyCompare') return;
          context.report({
            node,
            messageId: 'm',
            ...(fixable
              ? { fix: (f: any) => f.replaceText(call.callee, 'diff') }
              : {}),
          });
        };
        return {
          FunctionDeclaration: (node: any) => report(node, true),
          ArrowFunctionExpression: (node: any) => report(node, false),
        };
      },
    },
  },
  {
    name: 'control-fix-symmetric',
    code: 'function widget() { return legacyCompare(a, b); }\n',
    expect: { fix: false, detection: false },
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'use the helper' },
      },
      create(context: any) {
        const report = (node: any) => {
          const call = node.body?.body?.[0]?.argument;
          if (!call || call.callee?.name !== 'legacyCompare') return;
          context.report({
            node,
            messageId: 'm',
            fix: (f: any) => f.replaceText(call.callee, 'diff'),
          });
        };
        return { FunctionDeclaration: report, ArrowFunctionExpression: report };
      },
    },
  },
  {
    // Reads the returned expression only out of a block, so the concise
    // spelling of the same function goes unseen. This is the shape #1795 and
    // #1792 both had.
    name: 'control-detection-block-only',
    code: 'const build = () => { return { a: 1 }; };\n',
    expect: { fix: false, detection: true },
    rule: {
      meta: { type: 'problem', schema: [], messages: { m: 'annotate it' } },
      create(context: any) {
        return {
          ReturnStatement(node: any) {
            if (node.argument?.type !== 'ObjectExpression') return;
            context.report({ node, messageId: 'm' });
          },
        };
      },
    },
  },
  {
    // Sees the returned object through either body form, so it must stay
    // silent — without this the detection check would flag every rule that
    // merely reports on an object literal.
    name: 'control-detection-both-bodies',
    code: 'const build = () => { return { a: 1 }; };\n',
    expect: { fix: false, detection: false },
    rule: {
      meta: { type: 'problem', schema: [], messages: { m: 'annotate it' } },
      create(context: any) {
        const check = (node: any, argument: any) => {
          if (argument?.type !== 'ObjectExpression') return;
          context.report({ node, messageId: 'm' });
        };
        return {
          ReturnStatement: (node: any) => check(node, node.argument),
          ArrowFunctionExpression: (node: any) =>
            node.body?.type === 'BlockStatement'
              ? undefined
              : check(node, node.body),
        };
      },
    },
  },
] as const;

for (const control of CONTROLS) {
  linter.defineRule(PREFIX + control.name, control.rule as never);
}

const plantedCase = (code: string): FixtureCase => ({
  code,
  tester: 'ruleTesterTs',
  language: 'ts',
  origin: 'planted control',
  bucket: 'invalid',
});

const measuredFixUndriven = measuredUndriven(fixCauseOf, 'noFixer');
const measuredDetectionUndriven = measuredUndriven(detectionCauseOf);

/** The rows that CAN fail: every rule the census actually drove. */
const fixDrivenRules = probeRules.filter((rule) => !fixCauseOf(rule));
const detectionDrivenRules = probeRules.filter(
  (rule) => !detectionCauseOf(rule),
);

/**
 * A skipped row, titled with the rule and the measured reason. Jest renders
 * these as `○ skipped`, which is the point: a rule the probe never drove must
 * be visibly absent from the result rather than indistinguishable from a clean
 * one (#1861).
 */
const skipTitles = (causeOf: (rule: string) => UndrivenCause | null) =>
  probeRules
    .map((rule) => [rule, causeOf(rule)] as const)
    .filter((entry): entry is readonly [string, UndrivenCause] => !!entry[1])
    .map(([rule, cause]) => `${rule} — NOT DRIVEN: ${UNDRIVEN_CAUSES[cause]}`);

console.log(
  [
    `[fix-spelling-asymmetry] ${probeRules.length} rules probed, ` +
      `${rulesCompared.size} compared`,
    `  corpus: ${corpus.totalCases} cases from ${corpus.suitesUsed} suites, ` +
      `${corpus.failures.length} failed`,
    `  fix census: ${sharedMessageIds} shared messageIds, ` +
      `${fixFindings.length} finding(s); ${fixDrivenRules.length} rule(s) ` +
      `driven, ${probeRules.length - fixDrivenRules.length} named skip(s)`,
    `  detection census: ${bodyComparisons} body pairs, ` +
      `${detectionFindings.length} finding(s) across ` +
      `${detectionRules.length} rule(s); ${detectionDrivenRules.length} rule(s) ` +
      `driven, ${
        probeRules.length - detectionDrivenRules.length
      } named skip(s)`,
  ].join('\n'),
);

describe('fix availability must not depend on how a function is spelled', () => {
  /**
   * Floors sit on the ASSERTED counts. Cases and variants are bookkeeping — a
   * comparison only happens where a messageId appears on both sides, so that
   * is the number whose collapse would make every assertion below vacuous.
   */
  /**
   * The non-TypeScript skip, both ways. An unlisted rule whose fixtures get
   * skipped is a silent loss of coverage; a listed rule whose fixtures stop
   * being skipped is a dead entry that would absorb the next one. The count
   * floor keeps the set equality from passing vacuously.
   */
  it('skips only the named non-TypeScript fixtures', () => {
    expect([...rulesWithNonTypeScriptFixtures].sort()).toEqual(
      Object.keys(NON_TYPESCRIPT_FIXTURES).sort(),
    );
    expect(nonTypeScriptSkipped).toBeGreaterThan(0);
  });

  it('compares enough to make a zero mean something', () => {
    expect(corpus.failures).toEqual([]);
    expect(probeRules.length).toBeGreaterThan(150);
    expect(casesConsidered).toBeGreaterThan(5000);
    expect(sharedMessageIds).toBeGreaterThan(3000);
    expect(bodyComparisons).toBeGreaterThan(2000);
    expect(rulesCompared.size).toBeGreaterThan(100);
    // The rows that can actually fail, floored separately: the counts above
    // survive intact even if every comparison piles onto a handful of rules.
    expect(fixDrivenRules.length).toBeGreaterThan(50);
    expect(detectionDrivenRules.length).toBeGreaterThan(100);
  });

  /** Both directions, so a fixed rule must be removed rather than lingering. */
  it('flags exactly the rules whose fix asymmetry is recorded', () => {
    expect([...new Set(fixFindings.map((f) => f.rule))].sort()).toEqual(
      Object.keys(FIX_KNOWN_DEFECTS).sort(),
    );
  });

  /**
   * Two-way accounting for the skipped rows, cause included.
   *
   * A rule that becomes drivable fails as a stale entry; a rule that stops
   * being drivable fails as an unrecorded skip; and a rule that stays dark for
   * a DIFFERENT reason fails too, because the recorded cause is the claim being
   * made about it and a changed cause is a changed claim.
   */
  it('accounts for every rule the fix census cannot drive', () => {
    expect(measuredFixUndriven).toEqual(FIX_UNDRIVEN);
  });

  it('derives the fixer-less skip from meta rather than a list', () => {
    // `noFixer` is the one cause not written down, so it must be exactly the
    // rules with no `meta.fixable` — and no fix finding may ever come from one,
    // or deriving the skip would be hiding a finding rather than a vacuum.
    expect(
      probeRules.filter((rule) => fixCauseOf(rule) === 'noFixer').sort(),
    ).toEqual(probeRules.filter((rule) => !fixableRuleNames.has(rule)).sort());
    expect(
      [...new Set(fixFindings.map((f) => f.rule))].filter(
        (rule) => !fixableRuleNames.has(rule),
      ),
    ).toEqual([]);
    expect(fixableRuleNames.size).toBeGreaterThan(50);
  });

  /** Both maps at once: an unexplained or unmeasurable entry is dead weight. */
  it('explains every cause it records', () => {
    const causes = [
      ...Object.values(FIX_UNDRIVEN),
      ...Object.values(DETECTION_UNDRIVEN),
    ];
    expect(causes.filter((cause) => !UNDRIVEN_CAUSES[cause])).toEqual([]);
    // An entry naming a rule that is not probed is an exemption nothing can
    // retire, so it would sit there forever absorbing the next regression.
    const probed = new Set(probeRules);
    expect(
      [...Object.keys(FIX_UNDRIVEN), ...Object.keys(DETECTION_UNDRIVEN)].filter(
        (rule) => !probed.has(rule),
      ),
    ).toEqual([]);
  });

  it.each(fixDrivenRules.filter((rule) => !(rule in FIX_KNOWN_DEFECTS)))(
    '%s',
    (rule) => {
      // The row asserts it did work before it asserts a zero: an `expect('')
      // .toBe('')` over a rule the probe never compared is a green row that
      // validated nothing (#1861).
      expect(driveByRule.get(rule)!.fixableComparisons).toBeGreaterThan(0);
      // A rule reaching here reports a violation in both spellings and remedies
      // only one; the cure is to fix both or decline on both.
      expect(reportOf(findingsFor(rule, fixFindings))).toBe('');
    },
  );

  const fixSkips = skipTitles(fixCauseOf);
  if (fixSkips.length) {
    it.skip.each(fixSkips)('%s', () => undefined);
  }
});

describe('a concise and a block arrow body must be seen alike', () => {
  it('flags exactly the rules whose asymmetry is a filed decision', () => {
    expect(detectionRules).toEqual(Object.keys(DETECTION_EXEMPT).sort());
  });

  /** Both directions and the cause, exactly as the fix census does above. */
  it('accounts for every rule the detection census cannot drive', () => {
    expect(measuredDetectionUndriven).toEqual(DETECTION_UNDRIVEN);
  });

  it.each(detectionDrivenRules.filter((rule) => !(rule in DETECTION_EXEMPT)))(
    '%s',
    (rule) => {
      expect(driveByRule.get(rule)!.reportingBodyComparisons).toBeGreaterThan(
        0,
      );
      // Reported one way and silent the other: either a remedy is withheld, or
      // code the rule flags is blessed one rewrite away.
      expect(reportOf(findingsFor(rule, detectionFindings))).toBe('');
    },
  );

  const detectionSkips = skipTitles(detectionCauseOf);
  if (detectionSkips.length) {
    it.skip.each(detectionSkips)('%s', () => undefined);
  }
});

describe('both detectors are load-bearing', () => {
  it.each(CONTROLS.map((c) => [c.name, c.expect] as const))(
    'control %s yields %s',
    (name, expected) => {
      const control = CONTROLS.find((c) => c.name === name)!;
      const result = probeCase(name, plantedCase(control.code));
      // A control the probe never actually compared would prove nothing.
      expect(result.sharedMessageIds + result.bodyComparisons).toBeGreaterThan(
        0,
      );
      expect({
        fix: result.fixFindings.length > 0,
        detection: result.detectionFindings.length > 0,
      }).toEqual(expected);
    },
  );
});

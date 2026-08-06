import { Linter } from 'eslint';
import { parse as estreeParse } from '@typescript-eslint/typescript-estree';
import {
  FixtureCase,
  defaultFilenameFor,
  harvestFixtureCorpus,
  parserOptionsFor,
  severityWithOptions,
  typeAwareRuleNames,
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

/** `(p) => { return expr; }` to `(p) => expr`. */
const blockArrowToConcise = (source: string, ast: any): Edit[] => {
  const edits: Edit[] = [];
  walk(ast, (node) => {
    if (node.type !== 'ArrowFunctionExpression') return;
    if (node.body.type !== 'BlockStatement') return;
    const statements = node.body.body;
    if (statements.length !== 1) return;
    const only = statements[0];
    if (only.type !== 'ReturnStatement' || !only.argument) return;
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
};

const EMPTY: ProbeResult = {
  fixFindings: [],
  detectionFindings: [],
  sharedMessageIds: 0,
  bodyComparisons: 0,
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
  };

  for (const variant of variantsOf(testCase.code, jsx)) {
    const after = fixStatesOf(rule, variant.code, testCase, filename);
    if (!after) continue;

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
 * Type-aware rules are excluded: a bare `Linter` builds no program, so they
 * report nothing here and would contribute a false clean rather than a finding.
 */
const probeRules = Object.keys(plugin.rules)
  .filter((name) => !typeAwareRuleNames.has(name))
  .sort();

const fixFindings: Finding[] = [];
const detectionFindings: Finding[] = [];
let casesConsidered = 0;
let sharedMessageIds = 0;
let bodyComparisons = 0;
const rulesCompared = new Set<string>();

for (const rule of probeRules) {
  for (const testCase of corpus.byRule.get(rule) || []) {
    const result = probeCase(rule, testCase);
    casesConsidered++;
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
};

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
  origin: 'planted control',
  bucket: 'invalid',
});

console.log(
  [
    `[fix-spelling-asymmetry] ${probeRules.length} rules probed, ` +
      `${rulesCompared.size} compared`,
    `  corpus: ${corpus.totalCases} cases from ${corpus.suitesUsed} suites, ` +
      `${corpus.failures.length} failed`,
    `  fix census: ${sharedMessageIds} shared messageIds, ` +
      `${fixFindings.length} finding(s)`,
    `  detection census: ${bodyComparisons} body pairs, ` +
      `${detectionFindings.length} finding(s) across ` +
      `${detectionRules.length} rule(s)`,
  ].join('\n'),
);

describe('fix availability must not depend on how a function is spelled', () => {
  /**
   * Floors sit on the ASSERTED counts. Cases and variants are bookkeeping — a
   * comparison only happens where a messageId appears on both sides, so that
   * is the number whose collapse would make every assertion below vacuous.
   */
  it('compares enough to make a zero mean something', () => {
    expect(corpus.failures).toEqual([]);
    expect(probeRules.length).toBeGreaterThan(150);
    expect(casesConsidered).toBeGreaterThan(5000);
    expect(sharedMessageIds).toBeGreaterThan(3000);
    expect(bodyComparisons).toBeGreaterThan(2000);
    expect(rulesCompared.size).toBeGreaterThan(100);
  });

  it.each(probeRules)('%s', (rule) => {
    // A rule reaching here reports a violation in both spellings and remedies
    // only one; the cure is to fix both or decline on both.
    expect(reportOf(findingsFor(rule, fixFindings))).toBe('');
  });
});

describe('a concise and a block arrow body must be seen alike', () => {
  it('flags exactly the rules whose asymmetry is a filed decision', () => {
    expect(detectionRules).toEqual(Object.keys(DETECTION_EXEMPT).sort());
  });

  it.each(probeRules.filter((rule) => !(rule in DETECTION_EXEMPT)))(
    '%s',
    (rule) => {
      // Reported one way and silent the other: either a remedy is withheld, or
      // code the rule flags is blessed one rewrite away.
      expect(reportOf(findingsFor(rule, detectionFindings))).toBe('');
    },
  );
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

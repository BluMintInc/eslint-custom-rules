/**
 * A rule's SUGGESTIONS must not destroy a comment - over the WHOLE harvested
 * fixture corpus, not just that rule's own fixtures.
 *
 * `comment-fix-fidelity` asks this of the suggestion channel already, but pairs
 * each rule with its OWN fixtures (its `suggestionCasesByRule` is keyed on the
 * rule). `cross-comment-fidelity-closure` cross-pairs the same oracle but only
 * over `--fix`; it does not mention suggestions. This file is that empty cell.
 *
 * The pairing is what is new, not the corpus or the oracle - and that
 * distinction has already paid twice. Re-pairing this exact oracle over
 * `--fix` found #2023 (a relocated statement appended onto a line ending in a
 * `//` comment, commenting it out of the program) and #2024 (comments between
 * merged `||` operands deleted), both while the own-corpus guard was green.
 *
 * Measured clean at v1.20.158: 0 findings over 2,142 cross comparisons. The
 * value is the gate, not the result - a hand-run probe's silence and a
 * genuinely clean corpus are indistinguishable from the outside.
 *
 * The trivia, variant and neutrality machinery above `compareSuggestionCross`
 * is copied VERBATIM from `cross-comment-fidelity-closure.test.ts`; read that
 * file for why each piece is load-bearing. Only the transform changes: a
 * suggestion applied ALONE to the untouched source, never composed with a
 * sibling and never through a fix loop, because that is the only state an
 * editor can produce.
 */
import { Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import * as jsoncParser from 'jsonc-eslint-parser';
import {
  defaultFilenameFor,
  defineCorpusParsers,
  harvestFixtureCorpus,
  parserKeyFor,
  parserOptionsFor,
  ruleNameByIdentity,
  severityWithOptions,
  silentWithoutProgramRuleNames,
  suggestionEditsOf,
  suggestionRuleNames,
} from '../utils/fixtureCorpus';
import type {
  FixtureBucket,
  FixtureCase,
  FixtureLanguage,
} from '../utils/fixtureCorpus';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as {
  rules: Record<string, { meta?: { fixable?: string } }>;
  configs: { recommended: { rules: Record<string, unknown> } };
};
/* eslint-enable @typescript-eslint/no-var-requires */

const PREFIX = '@blumintinc/blumint/';

/**
 * EMPTY, and kept as the place an exclusion must be written.
 *
 * Its one entry was `no-entire-object-hook-deps`, discounted because with no
 * program every dependency reads as `unknown`-typed, so the rule reports and
 * deletes deps a consumer's CI would leave alone (#1621). That rationale is
 * about which dependencies get REPORTED. What this guard asks is what the fixer
 * then WRITES, which is range arithmetic and entirely syntactic — so the
 * exclusion was broader than its own reason, and no oracle had ever been
 * pointed at the hole it left. Three defects came out of it once one was:
 * #2208, a removal span anchored on a neighbouring element that swallowed the
 * comment between them; #2209 and #2210, a removal that stranded its binding.
 *
 * Dropping the name is MEASURED, not asserted: with the rule composed here the
 * suite is green, and it is driven non-vacuously rather than merely admitted.
 * The #1621 divergence itself is untouched and still real; it simply never
 * showed up as the thing this guard asks about.
 *
 * An entry here is one NAME rather than all 16 rules mentioning
 * `getParserServices` — discounting one measured divergence never justified
 * unprobing fifteen others (#1879) — and never belongs in
 * `silentWithoutProgramRuleNames`, which means "reports nothing here", nor at
 * rule-global scope, which un-gates every other arm at once (#1839).
 */
const DIVERGENT_WITHOUT_PROGRAM = new Set([]);

const linter = new Linter();
defineCorpusParsers(linter);
for (const [rule, name] of ruleNameByIdentity) {
  linter.defineRule(`${PREFIX}${name}`, rule as never);
}

/**
 * The screening config: everything the plugin ships enabled. A fixture reaches a
 * fixer through whichever rules REPORT on it, so the screen has to be the config
 * a consumer actually runs rather than the owner's rule alone.
 */
const RECOMMENDED: Record<string, unknown> = {};
for (const [id, severity] of Object.entries(plugin.configs.recommended.rules)) {
  if (!id.startsWith(PREFIX)) continue;
  if (severity === 'off' || severity === 0) continue;
  const name = id.slice(PREFIX.length);
  if (silentWithoutProgramRuleNames.has(name)) continue;
  if (DIVERGENT_WITHOUT_PROGRAM.has(name)) continue;
  RECOMMENDED[id] = severity;
}

/**
 * Fixtures write `// eslint-disable-next-line <rule>` with a BARE name, because
 * that is what `RuleTester` registers. Under the real prefixed ids a bare
 * directive matches nothing and the rule fixes anyway, so the snippet would be
 * probed in a state its author explicitly suppressed.
 */
const BARE_NAMES = [...ruleNameByIdentity.values()].sort(
  (a, b) => b.length - a.length,
);
const DIRECTIVE =
  /(eslint-disable(?:-next-line|-line)?|eslint-enable)([^\n*]*)/g;
const prefixDirectives = (code: string) =>
  code.replace(DIRECTIVE, (_whole, keyword: string, tail: string) => {
    let out = tail;
    for (const name of BARE_NAMES) {
      out = out.replace(
        new RegExp(`(^|[\\s,])${name}(?![\\w/-])`, 'g'),
        `$1${PREFIX}${name}`,
      );
    }
    return `${keyword}${out}`;
  });

/** A harvested case with its filename resolved from the CODE, never the tester. */
type ProbeCase = FixtureCase & { filename: string };

/**
 * The parser and its options come from the CASE, never from a constant: a JSON
 * or Markdown fixture handed to `@typescript-eslint/parser` is a fatal parse,
 * and since every consumer here filters messages by `ruleId`, that fatal is
 * indistinguishable from the rule staying silent (#1860, #1984).
 */
const configFor = (
  rules: Record<string, unknown>,
  testCase: ProbeCase,
): Linter.Config =>
  ({
    parser: parserKeyFor(testCase),
    parserOptions: parserOptionsFor(testCase),
    rules,
  } as unknown as Linter.Config);

const parseOptions = {
  ecmaVersion: 2022,
  sourceType: 'module',
  loc: true,
  range: true,
  comment: true,
  tokens: true,
} as const;

/**
 * Whether the oracle below reads a snippet as JSX, decided by the same thing the
 * linter decides it by: the FILENAME. `@typescript-eslint/parser` maps a `.ts`
 * path to `ScriptKind.TS`, which `ecmaFeatures.jsx: true` does not override, and
 * maps everything else that is not plainly TypeScript to a JSX-bearing kind. An
 * oracle fixed at `jsx: true` therefore disagrees with the linter on every `.ts`
 * fixture holding an angle-bracket assertion, each read as "does not parse" and
 * dropped before it was ever compared.
 */
const readsAsJsx = (filename: string) => !/\.[mc]?ts$/i.test(filename);

/** The comment-insensitive shape of a source, plus the comments it carries. */
type Trivia = { signature: string; comments: string[] };

const tsTrivia = (text: string, filename: string): Trivia | null => {
  try {
    const ast = tsParser.parse(text, {
      ...parseOptions,
      ecmaFeatures: { jsx: readsAsJsx(filename) },
    } as never) as {
      tokens?: { type: string; value: string }[];
      comments?: { value: string }[];
    };
    if (!ast.tokens) return null;
    return {
      signature: ast.tokens
        .map((token) => `${token.type} ${token.value}`)
        .join(''),
      comments: (ast.comments || []).map((comment) => comment.value),
    };
  } catch {
    return null;
  }
};

const jsonTrivia = (text: string): Trivia | null => {
  try {
    const { ast } = jsoncParser.parseForESLint(text, { ecmaVersion: 2020 });
    return {
      signature: (ast.tokens || [])
        .map((token) => `${token.type} ${token.value}`)
        .join(''),
      comments: (ast.comments || []).map((comment) => comment.value),
    };
  } catch {
    return null;
  }
};

const HTML_COMMENT = /<!--([\s\S]*?)-->/g;
/** A comment occupying a line by itself, indentation aside. */
const HTML_COMMENT_LINE = /^[\t ]*<!--[\s\S]*?-->[\t ]*$/;

/**
 * Markdown carries its trivia in the text, not in a parse: `markdown-eslint-parser`
 * hands ESLint an empty `Program` and leaves the document in `mdCode`, so there
 * is no token stream to compare and a parser-derived signature would be the
 * empty string for every input — making every perturbation look neutral.
 *
 * The signature is therefore the document with WHOLE-LINE comments removed, and
 * nothing else. Markdown has no inert inline comment: a comment sharing a line
 * with content changes that line's text, and for a fence rule it changes the
 * meaning outright — appending one to an opening fence turns it into a language
 * label. Leaving that residue in the signature is what makes such a variant fail
 * the neutrality check instead of manufacturing a divergence.
 */
const markdownTrivia = (text: string): Trivia => ({
  signature: text
    .split('\n')
    .filter((line) => !HTML_COMMENT_LINE.test(line))
    .join('\n'),
  comments: [...text.matchAll(HTML_COMMENT)].map((match) => match[1]),
});

const triviaOf = (
  text: string,
  language: FixtureLanguage,
  filename: string,
): Trivia | null => {
  if (language === 'json') return jsonTrivia(text);
  if (language === 'markdown') return markdownTrivia(text);
  return tsTrivia(text, filename);
};

/**
 * Signature of the comment-insensitive shape of a source. Two sources sharing a
 * signature differ only in comments and whitespace, so any difference in what a
 * fixer writes between them is the fixer's fault rather than a reaction to
 * changed code. `null` means the text does not parse, which is itself a finding
 * when the unperturbed baseline did.
 */
const tokenSignature = (
  text: string,
  language: FixtureLanguage,
  filename: string,
): string | null => triviaOf(text, language, filename)?.signature ?? null;

const commentsOf = (
  text: string,
  language: FixtureLanguage,
  filename: string,
): string[] | null => triviaOf(text, language, filename)?.comments ?? null;

const BLOCK_MARKER = '/* fidelityProbe */';
const LINE_MARKER = '// fidelityProbe';
const HTML_MARKER = '<!-- fidelityProbe -->';
/** Must not occur in any fixture's own source — see `comment-fix-fidelity`. */
const MARKER_TEXT = 'fidelityProbe';

/**
 * Both shapes are needed. A block comment is inert almost everywhere; a LINE
 * comment is the one that turns following code into a comment when a fixer joins
 * lines, which is the severe half of the class — and is exactly what #2023 did.
 */
type Variant = { kind: string; text: string };

/**
 * The marker must be a comment in the fixture's OWN language, or the probe stops
 * asking about comments. `// fidelityProbe` in Markdown is a paragraph of literal
 * text: the fixer preserves it, the comment scan finds no comment carrying it,
 * and the guard reads a `COMMENT_LOST` that never happened. JSONC accepts both
 * JavaScript shapes, so the JSON arm keeps the pair.
 */
const MARKERS_BY_LANGUAGE: Record<FixtureLanguage, Variant[]> = {
  ts: [
    { kind: 'BLOCK', text: BLOCK_MARKER },
    { kind: 'LINE', text: LINE_MARKER },
  ],
  json: [
    { kind: 'BLOCK', text: BLOCK_MARKER },
    { kind: 'LINE', text: LINE_MARKER },
  ],
  markdown: [{ kind: 'HTML', text: HTML_MARKER }],
};

function insertLineBefore(
  text: string,
  line: number,
  marker: string,
): string | null {
  const lines = text.split('\n');
  if (line < 1 || line > lines.length) return null;
  const indent = (lines[line - 1].match(/^\s*/) || [''])[0];
  lines.splice(line - 1, 0, `${indent}${marker}`);
  return lines.join('\n');
}

function appendTrailing(
  text: string,
  line: number,
  marker: string,
): string | null {
  const lines = text.split('\n');
  if (line < 1 || line > lines.length) return null;
  if (!lines[line - 1].trim()) return null;
  lines[line - 1] = `${lines[line - 1]} ${marker}`;
  return lines.join('\n');
}

type Finding = {
  /** The rule whose fixer ran. */
  rule: string;
  /** The rule whose suite the fixture belongs to. */
  owner: string;
  /** Whether the two differ, i.e. whether this pair is reachable only here. */
  cross: boolean;
  kind: 'PARSE_BREAK' | 'TRANSFORM_DIVERGED' | 'COMMENT_LOST';
  variantKind: string;
  origin: string;
  bucket: FixtureBucket;
  filename: string;
  variant: string;
  baseOutput: string;
  variantOutput: string;
};

/** Non-vacuity accounting; a zero finding count means nothing without these. */
const stats = {
  /** Harvested cases the driver walked. */
  fixtures: 0,
  /** (fixer, fixture) pairs formed, and the subset where fixer !== owner. */
  pairs: 0,
  crossPairs: 0,
  /** Pairs whose rule offered no APPLICABLE suggestion; nothing to compare. */
  baseNoFix: 0,
  /**
   * Pairs where the screen saw the rule offer a suggestion and the solo lint
   * then reported nothing at all. The screen runs every suggester at once and
   * the solo run configures one, so a rule whose report depends on another
   * rule's presence would leave here — silently, since the pair simply produces
   * no comparison.
   */
  baseSilent: 0,
  /** Pairs whose fixer rewrote the source, so a comparison could happen. */
  rewrites: 0,
  crossRewrites: 0,
  comparisons: 0,
  rejectedNonNeutral: 0,
  fixersRewriting: new Set<string>(),
  crossFixersRewriting: new Set<string>(),
  owners: new Set<string>(),
  /**
   * Cases dropped before they proved anything, every one asserted ZERO below. A
   * fatal parse reads exactly like a silent rule once messages are filtered by
   * `ruleId`, and a snippet with no signature is skipped before the comparison
   * runs, so an uncounted — or counted but unasserted — skip is a false clean
   * (#1984).
   */
  screenFatal: 0,
  screenThrew: 0,
  skippedFatal: 0,
  skippedNoSignature: 0,
  /**
   * Reported lines discarded by {@link SITE_CAP} and so never perturbed. A site
   * past the cap reads exactly like a faithful one, so a cap that silently
   * started biting would look like a clean pass. Asserted ZERO, and the cap is
   * kept close to the measurement rather than parked far above it (#2018).
   */
  droppedSites: 0,
  /**
   * The linter throwing instead of returning messages. Every one of these is a
   * pair that produced no verdict; they are counted separately from the fatals
   * because a throw does not even reach the message list.
   */
  verifyThrew: 0,
  /**
   * The fixer's OWN output failing to parse. That is `fixer-convergence`'s
   * finding rather than this one, so the pair is dropped — but counted, because
   * a dropped pair is a comparison that silently never happened.
   */
  baseOutputUnsignable: 0,
  /** Comparisons per language; a total would let TypeScript hide the rest. */
  comparisonsByLanguage: { ts: 0, json: 0, markdown: 0 } as Record<
    FixtureLanguage,
    number
  >,
};

const verify = (
  code: string,
  rules: Record<string, unknown>,
  testCase: ProbeCase,
) => {
  try {
    return linter.verify(code, configFor(rules, testCase), {
      filename: testCase.filename,
    });
  } catch {
    stats.verifyThrew++;
    return null;
  }
};

/**
 * Perturbation sites per case. The cap bounds the runtime of the slowest pairs
 * — it keeps one many-error fixture from dominating a sweep that already forms
 * 35k pairs — and is kept for that reason. What it must not be is SILENT: every
 * line it discards is a site the guard never probes. So the drop is counted and
 * asserted ZERO, and the cap sits just above the measured maximum rather than
 * far above it, where a ceiling stops measuring anything (#2018).
 */
const SITE_CAP = 8;

/**
 * The provably comment-only variants of one source. Reported lines are where a
 * transform edits, so they are where a rebuilt span shows up.
 */
function buildVariants(
  testCase: ProbeCase,
  signature: string,
  messages: { line?: number }[],
): Variant[] {
  const code = testCase.code;
  const variants: Variant[] = [];
  const addVariant = (kind: string, text: string | null) => {
    if (text === null) return;
    if (
      tokenSignature(text, testCase.language, testCase.filename) !== signature
    ) {
      stats.rejectedNonNeutral++;
      return;
    }
    variants.push({ kind, text });
  };

  const distinctLines = [
    ...new Set(
      messages
        .map((message) => message.line)
        .filter((line): line is number => Number.isInteger(line)),
    ),
  ];
  const reportedLines = distinctLines.slice(0, SITE_CAP);
  stats.droppedSites += distinctLines.length - reportedLines.length;

  for (const marker of MARKERS_BY_LANGUAGE[testCase.language]) {
    addVariant(`LEADING_${marker.kind}`, `${marker.text}\n${code}`);
    for (const line of reportedLines) {
      addVariant(
        `${marker.kind}_ABOVE`,
        insertLineBefore(code, line, marker.text),
      );
      addVariant(
        `TRAILING_${marker.kind}`,
        appendTrailing(code, line, marker.text),
      );
    }
  }
  return variants;
}

/**
 * The comparison for one (fixer, fixture) pair: fix the original, fix each
 * provably-neutral commented variant, and demand the two outputs agree once
 * comments are removed.
 *
 * The planted controls drive this same function, so a detector that silently
 * stopped firing fails there rather than reading as a clean corpus.
 */

/* ==================================================================
 * SUGGESTION CHANNEL, CROSS-PAIRED, COMMENT-FIDELITY ORACLE.
 *
 * Everything above is verbatim from cross-comment-fidelity-closure.
 * What changes is only which transform produces the compared output:
 * a SUGGESTION applied alone, rather than the `--fix` loop.
 * ================================================================== */

const SUGGESTERS = suggestionRuleNames.filter(
  (name) =>
    !silentWithoutProgramRuleNames.has(name) &&
    !DIVERGENT_WITHOUT_PROGRAM.has(name),
);

const sugStats = {
  /** Variants whose suggestion list did not line up with the baseline's. */
  shapeMismatch: 0,
  /** (variant, suggestion) pairs actually compared. */
  comparisons: 0,
  crossComparisons: 0,
  offered: 0,
  comparedByRule: new Map<string, number>(SUGGESTERS.map((rule) => [rule, 0])),
  crossComparedByRule: new Map<string, number>(
    SUGGESTERS.map((rule) => [rule, 0]),
  ),
};

/**
 * Suggestions are paired between the baseline and the commented variant
 * POSITIONALLY: with an identical non-comment token stream both lints must
 * offer the same list, and a variant that offers a different one is a
 * report-neutrality question rather than a fidelity one — counted and dropped
 * rather than judged here.
 */
function compareSuggestionCross(
  fixer: string,
  owner: string,
  testCase: ProbeCase,
  into: Finding[],
): void {
  const cross = fixer !== owner;
  const id = PREFIX + fixer;
  const solo = { [id]: severityWithOptions(testCase) as unknown };

  const signature = tokenSignature(
    testCase.code,
    testCase.language,
    testCase.filename,
  );
  if (signature === null) {
    stats.skippedNoSignature++;
    return;
  }

  const base = verify(testCase.code, solo, testCase);
  if (!base) return;
  if (base.some((message) => message.fatal)) {
    stats.skippedFatal++;
    return;
  }
  if (base.length === 0) {
    stats.baseSilent++;
    return;
  }

  const baseEdits = suggestionEditsOf(testCase.code, base, id);
  if (baseEdits.length === 0) {
    stats.baseNoFix++;
    return;
  }
  sugStats.offered += baseEdits.length;
  stats.rewrites++;
  stats.fixersRewriting.add(fixer);
  if (cross) {
    stats.crossRewrites++;
    stats.crossFixersRewriting.add(fixer);
  }

  for (const variant of buildVariants(testCase, signature, base)) {
    const variantMessages = verify(variant.text, solo, testCase);
    if (!variantMessages) continue;
    const variantEdits = suggestionEditsOf(variant.text, variantMessages, id);
    if (variantEdits.length !== baseEdits.length) {
      sugStats.shapeMismatch++;
      continue;
    }

    baseEdits.forEach((baseEdit, index) => {
      const variantEdit = variantEdits[index];
      stats.comparisons++;
      stats.comparisonsByLanguage[testCase.language]++;
      sugStats.comparisons++;
      sugStats.comparedByRule.set(
        fixer,
        (sugStats.comparedByRule.get(fixer) || 0) + 1,
      );
      if (cross) {
        sugStats.crossComparisons++;
        sugStats.crossComparedByRule.set(
          fixer,
          (sugStats.crossComparedByRule.get(fixer) || 0) + 1,
        );
      }

      const record = (kind: Finding['kind']) =>
        into.push({
          rule: fixer,
          owner,
          cross,
          kind,
          variantKind: variant.kind,
          origin: testCase.origin,
          bucket: testCase.bucket,
          filename: testCase.filename,
          variant: variant.text,
          baseOutput: baseEdit.output,
          variantOutput: variantEdit.output,
        });

      const baseSignature = tokenSignature(
        baseEdit.output,
        testCase.language,
        testCase.filename,
      );
      // An unparseable baseline output is `fixer-convergence`'s axis.
      if (baseSignature === null) {
        stats.baseOutputUnsignable++;
        return;
      }
      const variantSignature = tokenSignature(
        variantEdit.output,
        testCase.language,
        testCase.filename,
      );
      if (variantSignature === null) {
        record('PARSE_BREAK');
        return;
      }
      if (variantSignature !== baseSignature) {
        record('TRANSFORM_DIVERGED');
        return;
      }
      if (!variantEdit.output.includes(MARKER_TEXT)) {
        record('COMMENT_LOST');
        return;
      }
      const comments =
        commentsOf(variantEdit.output, testCase.language, testCase.filename) ||
        [];
      if (!comments.some((comment) => comment.includes(MARKER_TEXT))) {
        record('COMMENT_LOST');
      }
    });
  }
}

const corpus = harvestFixtureCorpus();
const findings: Finding[] = [];

for (const [owner, cases] of corpus.byRule) {
  stats.owners.add(owner);
  for (const fixture of cases) {
    stats.fixtures++;
    const filename = defaultFilenameFor(fixture);
    const source = prefixDirectives(fixture.code);
    const ownerCase: ProbeCase = { ...fixture, code: source, filename };
    /** A fixture's `options` belong to its OWNER. */
    const crossCase: ProbeCase = { ...ownerCase, options: undefined };

    /**
     * Screen with the seven suggestion-emitting rules at once. A suggestion is
     * never applied by the linter, so the rules cannot perturb each other and
     * attribution stays exact via `message.ruleId`.
     */
    const screenRules: Record<string, unknown> = {};
    for (const name of SUGGESTERS) {
      screenRules[PREFIX + name] =
        name === owner ? severityWithOptions(fixture) : 'error';
    }
    let screened: Linter.LintMessage[];
    try {
      screened = linter.verify(source, configFor(screenRules, ownerCase), {
        filename,
      });
    } catch {
      stats.screenThrew++;
      continue;
    }
    if (screened.some((message) => message.fatal)) {
      stats.screenFatal++;
      continue;
    }

    const offering = new Set(
      screened
        .filter((message) => (message.suggestions || []).length > 0)
        .map((message) => message.ruleId)
        .filter((id): id is string => !!id && id.startsWith(PREFIX))
        .map((id) => id.slice(PREFIX.length)),
    );
    for (const fixer of offering) {
      stats.pairs++;
      if (fixer !== owner) stats.crossPairs++;
      compareSuggestionCross(
        fixer,
        owner,
        fixer === owner ? ownerCase : crossCase,
        findings,
      );
    }
  }
}

const SWEEP = {
  fixtures: stats.fixtures,
  pairs: stats.pairs,
  crossPairs: stats.crossPairs,
  rewrites: stats.rewrites,
  crossRewrites: stats.crossRewrites,
  comparisons: sugStats.comparisons,
  crossComparisons: sugStats.crossComparisons,
  offered: sugStats.offered,
  shapeMismatch: sugStats.shapeMismatch,
  findings: findings.length,
  crossFindings: findings.filter((f) => f.cross).length,
};

/* ---------- planted controls, driven through the same function ---------- */
/* eslint-disable @typescript-eslint/no-explicit-any */
const CONTROL_REBUILD = 'control-rebuild-suggester';
const CONTROL_INPLACE = 'control-inplace-suggester';

linter.defineRule(PREFIX + CONTROL_REBUILD, {
  meta: {
    type: 'problem',
    hasSuggestions: true,
    schema: [],
    messages: { m: 'x', s: 'rebuild the call' },
  },
  create(context: any) {
    const src = context.getSourceCode();
    return {
      CallExpression(node: any) {
        if (node.callee.name !== 'rebuildMe') return;
        const args = node.arguments
          .map((argument: unknown) => src.getText(argument))
          .join(', ');
        context.report({
          node,
          messageId: 'm',
          suggest: [
            {
              messageId: 's',
              fix: (fixer: any) =>
                fixer.replaceText(node, `rebuildMe(${args})`),
            },
          ],
        });
      },
    };
  },
} as never);

linter.defineRule(PREFIX + CONTROL_INPLACE, {
  meta: {
    type: 'problem',
    hasSuggestions: true,
    schema: [],
    messages: { m: 'x', s: 'rename the binding' },
  },
  create(context: any) {
    return {
      Identifier(node: any) {
        if (node.name !== 'renameMe') return;
        context.report({
          node,
          messageId: 'm',
          suggest: [
            {
              messageId: 's',
              fix: (fixer: any) => fixer.replaceText(node, 'renamed'),
            },
          ],
        });
      },
    };
  },
} as never);
/* eslint-enable @typescript-eslint/no-explicit-any */

const plantedCase = (code: string): ProbeCase => ({
  code,
  options: undefined,
  origin: 'planted control',
  bucket: 'invalid' as FixtureBucket,
  language: 'ts' as FixtureLanguage,
  tester: 'ruleTesterTs',
  filename: 'control.ts',
});

const controlOutcomes: Array<{
  name: string;
  kinds: string[];
  comparisons: number;
}> = [];
for (const [name, code] of [
  // Multi-line with a trailing comma, so the REBUILT text differs from the
  // source and `suggestionEditsOf` keeps the edit. A single-line spelling
  // rebuilds byte-identically, the edit is dropped, and the control never
  // reaches the comparison — a vacuous positive.
  [CONTROL_REBUILD, 'rebuildMe(\n  1,\n);\n'],
  [CONTROL_INPLACE, 'const renameMe = 1;\n'],
] as Array<[string, string]>) {
  const found: Finding[] = [];
  const before = sugStats.comparisons;
  compareSuggestionCross(name, name, plantedCase(code), found);
  controlOutcomes.push({
    name,
    kinds: [...new Set(found.map((f) => f.kind))],
    comparisons: sugStats.comparisons - before,
  });
}

/**
 * Floors sit JUST UNDER what this harness measures, so ordinary corpus churn
 * does not move them while a harness that lost most of the corpus does. Move a
 * floor only WITH the measurement it is cut from.
 */
const FIXTURE_FLOOR = 22500; // measured 23973
const PAIR_FLOOR = 540; // measured 598
const CROSS_PAIR_FLOOR = 235; // measured 261
const REWRITE_FLOOR = 540; // measured 600
const CROSS_REWRITE_FLOOR = 235; // measured 261
const COMPARISON_FLOOR = 4200; // measured 4624
const CROSS_COMPARISON_FLOOR = 2050; // measured 2270
const OFFERED_FLOOR = 620; // measured 690
/** Owners whose fixtures the sweep walks — the denominator of every floor above. */
const OWNER_FLOOR = 185; // measured 194

/**
 * Suggestion-emitting rules that never fire on a FOREIGN fixture, so this
 * guard's cross arm cannot reach them and only the own-corpus arm in
 * `comment-fix-fidelity` covers them. Each carries its measured cause; an entry
 * that starts producing cross comparisons fails below as stale, so this cannot
 * rot into a shield.
 */
const NO_CROSS_REACH: Record<string, string> = {
  'enforce-dynamic-firebase-imports':
    'fires only on a firebase/firestore import specifier, which no other rule’s fixtures carry',
  'enforce-snapshot-state-narrowing':
    'fires only on a Firestore snapshot generic, which no other rule’s fixtures carry',
};

console.log(
  [
    'cross-suggestion comment fidelity: each rule’s SUGGESTIONS over EVERY rule’s fixtures',
    `  fixtures: ${stats.fixtures} walked, ${stats.pairs} pairs (${stats.crossPairs} cross)`,
    `  rewrites: ${stats.rewrites} (${stats.crossRewrites} cross), ${sugStats.offered} suggestions offered`,
    `  comparisons: ${sugStats.comparisons} (${sugStats.crossComparisons} cross), ${sugStats.shapeMismatch} dropped for a mismatched suggestion list`,
    `  per language: ${JSON.stringify(stats.comparisonsByLanguage)}`,
    `  pairs producing nothing: ${stats.baseSilent} silent, ${stats.baseNoFix} with no applicable suggestion`,
    `  owners walked: ${stats.owners.size}; fixers rewriting: ${stats.fixersRewriting.size} (${stats.crossFixersRewriting.size} cross)`,
    `  per rule (compared / cross): ${SUGGESTERS.map(
      (rule) =>
        `${rule} ${sugStats.comparedByRule.get(rule) || 0}/${
          sugStats.crossComparedByRule.get(rule) || 0
        }`,
    ).join(', ')}`,
    `  findings: ${findings.length} (${SWEEP.crossFindings} cross)`,
  ].join('\n'),
);

const groupKey = (finding: Finding) => `${finding.rule} :: ${finding.kind}`;

describe('a suggestion does not write text it does not own, on ANY rule’s fixtures', () => {
  it.each(SUGGESTERS)('%s', (rule) => {
    const hits = findings.filter((finding) => finding.rule === rule);
    expect(
      hits.map(
        (finding) =>
          `${groupKey(finding)} [${finding.variantKind}] via ${
            finding.owner
          }'s ` +
          `${finding.origin}\n--- variant ---\n${finding.variant}\n` +
          `--- base output ---\n${finding.baseOutput}\n` +
          `--- variant output ---\n${finding.variantOutput}`,
      ),
    ).toEqual([]);
  });
});

describe('the cross-paired suggestion fidelity guard is load-bearing', () => {
  it('reaches suggestions through OTHER rules’ fixtures', () => {
    expect(stats.fixtures).toBeGreaterThanOrEqual(FIXTURE_FLOOR);
    expect(stats.pairs).toBeGreaterThanOrEqual(PAIR_FLOOR);
    expect(stats.crossPairs).toBeGreaterThanOrEqual(CROSS_PAIR_FLOOR);
    expect(stats.rewrites).toBeGreaterThanOrEqual(REWRITE_FLOOR);
    expect(stats.crossRewrites).toBeGreaterThanOrEqual(CROSS_REWRITE_FLOOR);
    expect(sugStats.offered).toBeGreaterThanOrEqual(OFFERED_FLOOR);
    expect(sugStats.comparisons).toBeGreaterThanOrEqual(COMPARISON_FLOOR);
    expect(sugStats.crossComparisons).toBeGreaterThanOrEqual(
      CROSS_COMPARISON_FLOOR,
    );
    /**
     * And what variant construction THREW AWAY, capped just above its measured
     * 58. A variant whose token signature moved is correctly rejected — the
     * perturbation has to be neutral or it is testing itself — but the count
     * is also the only evidence that rejection stays incidental. It was
     * incremented and read by nothing, so a perturbation that started failing
     * neutrality wholesale would empty this corpus at a steady green.
     */
    expect(stats.rejectedNonNeutral).toBeLessThanOrEqual(80);
  });

  /**
   * Per-rule, because a global sum lets the lowest-yield rules go silent inside
   * it. Every suggestion-emitting rule must have been compared at least once,
   * and every rule NOT reached cross-rule must be named with a measured cause.
   */
  it('compares suggestions from every suggestion-bearing rule', () => {
    expect(
      SUGGESTERS.filter((rule) => (sugStats.comparedByRule.get(rule) || 0) < 1),
    ).toEqual([]);
    expect(
      SUGGESTERS.filter(
        (rule) => (sugStats.crossComparedByRule.get(rule) || 0) < 1,
      ).sort(),
    ).toEqual(Object.keys(NO_CROSS_REACH).sort());
  });

  /**
   * Skips are counted AND read; a counter no assertion reads discards cases in
   * silence (#1984). A mismatched suggestion list is a report-neutrality
   * question rather than a fidelity one, so it is dropped - and asserted zero,
   * so the next one is a conscious bump rather than silent attrition.
   */
  it('accounts for every case it does not judge', () => {
    expect({
      screenFatal: stats.screenFatal,
      screenThrew: stats.screenThrew,
      skippedFatal: stats.skippedFatal,
      skippedNoSignature: stats.skippedNoSignature,
      droppedSites: stats.droppedSites,
      verifyThrew: stats.verifyThrew,
      baseOutputUnsignable: stats.baseOutputUnsignable,
      shapeMismatch: sugStats.shapeMismatch,
      /**
       * A pair the screen formed and the solo lint then produced nothing for.
       * Both were bare returns: one had no counter at all, the other a counter
       * no `expect` read. Each is a comparison that silently never happened, and
       * the per-rule floors below are satisfied by whatever survives them.
       */
      baseSilent: stats.baseSilent,
      baseNoFix: stats.baseNoFix,
    }).toEqual({
      screenFatal: 0,
      screenThrew: 0,
      skippedFatal: 0,
      skippedNoSignature: 0,
      droppedSites: 0,
      verifyThrew: 0,
      baseOutputUnsignable: 0,
      shapeMismatch: 0,
      baseSilent: 0,
      baseNoFix: 0,
    });
  });

  /**
   * The comparison split by LANGUAGE, which the counter's own comment says a
   * total would hide. Written and read by nothing before, so the two zeros were
   * indistinguishable from a corpus that carries no JSON or Markdown at all.
   *
   * They are asserted as zeros DELIBERATELY: the screen only reaches a pair
   * through a rule that offers a suggestion, and none of the suggestion-emitting
   * rules fires on a `package.json` body or a Markdown document. The non-TS arms
   * of `MARKERS_BY_LANGUAGE` are therefore carried but unexercised here — a rule
   * that starts suggesting on either language is a conscious bump.
   */
  it('splits its comparisons by language rather than reporting a total', () => {
    expect(stats.comparisonsByLanguage.ts).toBeGreaterThanOrEqual(
      COMPARISON_FLOOR,
    );
    expect(stats.comparisonsByLanguage.json).toBe(0);
    expect(stats.comparisonsByLanguage.markdown).toBe(0);
    // The comparison total is the TypeScript arm and nothing else.
    expect(stats.comparisonsByLanguage.ts).toBe(sugStats.comparisons);
  });

  /**
   * The denominators. Every floor above is a count of pairs, and a corpus that
   * collapsed onto a handful of prolific suites — or a screen that stopped
   * reaching all but one suggester — satisfies each of them while measuring far
   * less. These three sets were accumulated and read by nothing.
   */
  it('walks the whole owner set, through every suggester', () => {
    expect(stats.owners.size).toBeGreaterThanOrEqual(OWNER_FLOOR);
    /**
     * Membership, not size: the planted controls route through the same
     * function and join `fixersRewriting`, so a size would be an accounting of
     * the controls as much as of the corpus.
     */
    expect(
      SUGGESTERS.filter((rule) => !stats.fixersRewriting.has(rule)),
    ).toEqual([]);
    expect(
      SUGGESTERS.filter((rule) => !stats.crossFixersRewriting.has(rule)).sort(),
    ).toEqual(Object.keys(NO_CROSS_REACH).sort());
  });

  /**
   * The comment-loss oracle is a presence test for `MARKER_TEXT`, so a fixture
   * carrying that token in its OWN source satisfies the check on the SUBJECT's
   * behalf: the planted marker can be destroyed while the fixture's own copy
   * keeps both gates green. `// fidelity` was such a fixture — the #1877
   * regression case, written for the very bug this guard exists to catch. The
   * rename that cured it is a coincidence waiting to expire, so the absence is
   * asserted rather than left to the token staying obscure.
   */
  it('guards the marker against fixture collision', () => {
    const colliding = [...corpus.byRule].flatMap(([owner, cases]) =>
      cases
        .filter((fixture) => fixture.code.includes(MARKER_TEXT))
        .map((fixture) => `${owner} :: ${fixture.origin}`),
    );
    expect([...new Set(colliding)]).toEqual([]);
  });

  /**
   * Both polarities, driven through the same comparison the corpus uses.
   *
   * The positive control's source is multi-line with a trailing comma ON
   * PURPOSE: a rebuild-shaped suggestion over a single-line spelling reproduces
   * its own source byte-for-byte, `suggestionEditsOf` drops the edit as a
   * no-op, the control never reaches the comparison, and the guard certifies a
   * vacuous clean. Its comparison count is asserted for exactly that reason.
   */
  it('detects a suggestion that rebuilds a span (positive control)', () => {
    const rebuild = controlOutcomes.find((c) => c.name === CONTROL_REBUILD);
    expect(rebuild).toBeDefined();
    expect(rebuild?.comparisons).toBeGreaterThan(0);
    expect(rebuild?.kinds).toContain('COMMENT_LOST');
  });

  it('stays silent on a suggestion that edits in place (negative control)', () => {
    const inplace = controlOutcomes.find((c) => c.name === CONTROL_INPLACE);
    expect(inplace).toBeDefined();
    expect(inplace?.comparisons).toBeGreaterThan(0);
    expect(inplace?.kinds).toEqual([]);
  });
});

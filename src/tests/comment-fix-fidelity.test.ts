/**
 * A fixer must not write text it does not own.
 *
 * Generalizes #1693/#1694/#1695. Each was a fixer that rebuilt a region from its
 * parts instead of editing the part it meant to change: `enforce-microdiff`
 * re-emitted a whole function body (deleting every other statement in it),
 * `enforce-centralized-mock-firestore` dropped whole LINES by index (deleting a
 * live statement that shared one) and re-emitted the file's leading trivia.
 *
 * The axis makes that visible without needing to know what each fixer intends:
 * perturb the input in a provably comment-only way and re-run `--fix`. Comments
 * carry no semantics, so with them stripped the transform must be identical. A
 * fixer that reconstructs a span instead of editing it fails immediately —
 * the perturbation lands inside the span it re-emits.
 *
 * Nothing else in the suite can see this class:
 *   - `fixer-convergence` / `fixer-type-safety` / `recommended-config-fix-closure`
 *     all judge the fix OUTPUT on its own; a body rebuilt without its statements
 *     is a perfectly good output in isolation.
 *   - `comment-orphan` covers a fixer deleting an eslint-disable, i.e. one
 *     comment shape and only when its subject survives.
 *   - The agora `fix: true` sweep is structurally blind: the mangled output
 *     parses, binds every reference, and converges. It returned 0 findings over
 *     8,700 files in the same cycle these three bugs were live.
 *
 * Neutrality is PROVEN, not assumed: a variant is used only when its non-comment
 * token stream is byte-identical to the original's. Without that guard a marker
 * landing inside a template literal or JSX text manufactures findings.
 *
 * The corpus spans every tester, and both the parser and the marker are chosen
 * per case from `fixtureCorpus`. A guard that keeps a local TypeScript-only
 * tester set drops the two `error`-severity fixable rules that declare under
 * `ruleTesterJson` and `ruleTesterMarkdown`, and one that names a fixture's file
 * after its tester turns every JSX fixture declared under `ruleTesterTs` into a
 * fatal parse — which, once messages are filtered by `ruleId`, is
 * indistinguishable from the fixer behaving (#1860, #1984).
 */
import { Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import * as jsoncParser from 'jsonc-eslint-parser';
import {
  defaultFilenameFor,
  defineCorpusParsers,
  harvestFixtureCorpus,
  harvestOnce,
  LANGUAGE_BY_TESTER,
  parserKeyFor,
  parserOptionsFor,
  silentWithoutProgramRuleNames,
  suggestionEditsOf,
  suggestionRuleNames,
} from '../utils/fixtureCorpus';
import type { FixtureLanguage } from '../utils/fixtureCorpus';
/**
 * The verified carve-outs, shared with
 * `src/tests/cross-comment-fidelity-closure.test.ts`, which asks this same
 * question of each fixer over every OTHER rule's fixtures.
 *
 * They live in their own module rather than on this suite because importing
 * them from here EXECUTES this whole sweep in the importer's process: measured,
 * that doubled the cross-paired guard's runtime from ~530s to ~1096s.
 */
import { COMMENT_FIDELITY_BASELINE } from './commentFidelityBaseline';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as {
  rules: Record<string, { meta?: { fixable?: string } }>;
};
/* eslint-enable @typescript-eslint/no-var-requires */

const PREFIX = '@blumintinc/blumint/';

/**
 * Only a rule that rewrites text can destroy a comment.
 *
 * The exclusion is `silentWithoutProgramRuleNames` — rules MEASURED to report
 * nothing here, and so unable to contribute anything but a false clean. It is
 * deliberately not "every rule that mentions `getParserServices`": that premise
 * was measured false (all 16 report — #1859), and it is doubly wrong for this
 * guard, which threads each case's own `parserOptions` — `project` included —
 * through to the linter, so the rules it dropped would have run fully
 * type-aware. Excluding them hid a fixer deleting comments under `--fix` at
 * `'error'` (#1877). Naming the shared set rather than rebuilding one locally is
 * what keeps this population from drifting out from under the guard again.
 */
const FIXABLE_RULES = new Set(
  Object.entries(plugin.rules)
    .filter(
      ([name, rule]) =>
        rule.meta?.fixable && !silentWithoutProgramRuleNames.has(name),
    )
    .map(([name]) => name),
);

const linter = new Linter();
defineCorpusParsers(linter);
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}

/**
 * The parser and its options come from the CASE, never from a constant: a JSON
 * or Markdown fixture handed to `@typescript-eslint/parser` is a fatal parse,
 * and since every consumer here filters messages by `ruleId`, that fatal is
 * indistinguishable from the rule staying silent (#1860, #1984).
 */
const configFor = (
  rules: Record<string, unknown>,
  testCase: InvalidCase,
): Linter.Config =>
  ({
    parser: parserKeyFor(testCase as never),
    parserOptions: parserOptionsFor(testCase as never),
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
 * fixture holding an angle-bracket assertion — 25 of them, each read as "does
 * not parse" and dropped before it was ever compared.
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

type InvalidCase = {
  code: string;
  filename: string;
  options?: readonly unknown[];
  parserOptions?: Record<string, unknown>;
  /** Which shared tester declared it, which fixes the parser. */
  tester: string;
  /** The tester's language, so the matching parser and marker are selected. */
  language: FixtureLanguage;
  origin: string;
};

/**
 * Resolved by OBJECT IDENTITY, never by the display name `run` received: ~100 of
 * the 311 suites pass a name that is not a rule name, and name-keyed matching
 * drops every case they declare.
 */
const ruleNameByIdentity = new Map<unknown, string>();
for (const [name, rule] of Object.entries(plugin.rules)) {
  ruleNameByIdentity.set(rule, name);
}

/**
 * Through the memoized accessor, because the suggestion corpus below reads the
 * adapted view of the same harvest: a second raw harvest in this module registry
 * returns zero suites (every suite file is already required, so no `run` call
 * re-executes) and would silently empty whichever corpus asked for it second.
 */
const harvested = harvestOnce();

const casesByRule = new Map<string, InvalidCase[]>();
/** Languages the corpus actually carries, asserted below against the drop. */
const languagesSeen = new Set<FixtureLanguage>();

/**
 * Every tester contributes, and the filename comes from the CODE.
 *
 * Restricting this loop to the TypeScript testers cost two registered rules
 * their entire corpus — `no-unpinned-dependencies` declares only under
 * `ruleTesterJson`, `enforce-typescript-markdown-code-blocks` only under
 * `ruleTesterMarkdown` — while both ship `recommended: 'error'` with
 * `fixable: 'code'`, so both rewrite consumer code untested on this axis
 * (#1860). Deriving the extension from the TESTER lost 14 more: a fixture
 * holding JSX under `ruleTesterTs` is a FATAL parse as `x.ts`, and a fatal is
 * indistinguishable from a silent rule once messages are filtered by `ruleId`
 * (#1984).
 */
for (const suite of harvested.suites) {
  const name = ruleNameByIdentity.get(suite.rule);
  if (!name || !FIXABLE_RULES.has(name)) continue;

  const language = LANGUAGE_BY_TESTER[suite.tester] ?? 'ts';
  const bucket = casesByRule.get(name) || [];
  for (const raw of suite.invalid) {
    const testCase = raw as Partial<InvalidCase> | null | undefined;
    if (!testCase || typeof testCase.code !== 'string') continue;
    const probed = {
      code: testCase.code,
      options: testCase.options,
      parserOptions: testCase.parserOptions,
      tester: suite.tester,
      language,
      origin: `src/tests/${suite.file}`,
    };
    languagesSeen.add(language);
    bucket.push({
      ...probed,
      filename: testCase.filename || defaultFilenameFor(probed as never),
    });
  }
  casesByRule.set(name, bucket);
}

const BLOCK_MARKER = '/* fidelityProbe */';
const LINE_MARKER = '// fidelityProbe';
const HTML_MARKER = '<!-- fidelityProbe -->';
/**
 * The token must not occur in any fixture's own source. The whole comment-loss
 * oracle is `output.includes(MARKER_TEXT)`, so a fixture carrying the token
 * itself survives the check on the fixer's behalf and a destroyed marker reads
 * as carried. `// fidelity` was exactly such a fixture — and, sharply, the
 * #1877 regression case written for the bug this guard exists to catch.
 * `guards the marker against fixture collision` below fails the build on any
 * new one.
 */
const MARKER_TEXT = 'fidelityProbe';

/**
 * Both shapes are needed. A block comment is inert almost everywhere; a LINE
 * comment is the one that turns following code into a comment when a fixer joins
 * lines, which is the severe half of the class.
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

/**
 * The suggestion kinds are the same three questions asked of a channel `--fix`
 * never touches, and they are kept as separate kinds so a baseline entry can
 * never be read as covering both channels of one rule.
 */
type Finding = {
  rule: string;
  kind:
    | 'PARSE_BREAK'
    | 'TRANSFORM_DIVERGED'
    | 'COMMENT_LOST'
    | 'SUGGESTION_PARSE_BREAK'
    | 'SUGGESTION_TRANSFORM_DIVERGED'
    | 'SUGGESTION_COMMENT_LOST';
  variantKind: string;
  origin: string;
  filename: string;
  before: string;
  variant: string;
  baseOutput: string;
  variantOutput: string;
};

/** Non-vacuity accounting; a zero finding count means nothing without these. */
const stats = {
  considered: 0,
  reported: 0,
  baselineFixed: 0,
  comparisons: 0,
  rejectedNonNeutral: 0,
  rulesCompared: new Set<string>(),
  /** Suggestion channel: one count per (variant, suggestion) pair compared. */
  suggestionComparisons: 0,
  /**
   * Variants whose suggestion list did not line up with the baseline's. A
   * comment changing WHICH reports appear is the neutrality-perturbation axis,
   * not this one, so those pairs are dropped rather than judged here.
   */
  suggestionShapeMismatch: 0,
  /**
   * Cases dropped before they proved anything, each asserted to be ZERO below.
   * A fatal parse reads exactly like a silent rule once messages are filtered by
   * `ruleId`, and an unsignable snippet is skipped before the comparison runs,
   * so an uncounted — or counted but unasserted — skip is a false clean (#1984).
   */
  skippedFatal: 0,
  skippedNoSignature: 0,
  skippedFatalSuggestion: 0,
  /**
   * The linter THROWING instead of returning messages or an output. Counted
   * apart from the fatals because a throw never reaches the message list at all,
   * and every one of these is a case that produced no verdict. The fix channel's
   * twin (`cross-comment-fidelity-closure`) pins the same three at zero over a
   * superset of these pairs; the suggestion channel has no twin, so its drops are
   * counted here or nowhere.
   */
  verifyThrew: 0,
  suggestionVerifyThrew: 0,
  baseFixThrew: 0,
  variantFixThrew: 0,
  /**
   * The fixer's or the suggestion's OWN baseline output failing to parse. That
   * is `fixer-convergence`'s finding rather than this one, so the case is
   * dropped — but a dropped case is a comparison that silently never happened.
   */
  baseOutputUnsignable: 0,
  suggestionBaseOutputUnsignable: 0,
  /**
   * Reported lines discarded by {@link SITE_CAP} and so never perturbed.
   * Asserted ZERO below for the same reason as the skips above: an unprobed
   * site reads exactly like a faithful one, so a cap that silently starts
   * biting would look like a clean pass (#1996).
   */
  droppedSites: 0,
  /** Comparisons per language; a total would let TypeScript hide the rest. */
  comparisonsByLanguage: { ts: 0, json: 0, markdown: 0 } as Record<
    FixtureLanguage,
    number
  >,
};

const soloRules = (name: string, testCase: InvalidCase) => ({
  [PREFIX + name]: testCase.options
    ? ['error', ...testCase.options]
    : ('error' as unknown),
});

const verify = (
  code: string,
  rules: Record<string, unknown>,
  tc: InvalidCase,
  onThrow: () => void,
) => {
  try {
    return linter.verify(code, configFor(rules, tc), {
      filename: tc.filename,
    });
  } catch {
    onThrow();
    return null;
  }
};

const fixOf = (
  code: string,
  rules: Record<string, unknown>,
  tc: InvalidCase,
  onThrow: () => void,
) => {
  try {
    return linter.verifyAndFix(code, configFor(rules, tc), {
      filename: tc.filename,
    });
  } catch {
    onThrow();
    return null;
  }
};

/**
 * Perturbation sites per case. The cap is a runtime bound on the slowest suite
 * here — it keeps one many-error fixture from dominating the run — and is kept
 * for that reason. What it must not be is SILENT: every line it discards is a
 * site the guard never probes, which is indistinguishable from a site that
 * passed. So the drop is counted and asserted zero, and the cap sits above the
 * measured maximum (5 distinct reported lines, over 4,587 cases) rather than at
 * it, leaving headroom before the assertion starts failing (#1996).
 */
const SITE_CAP = 8;

/**
 * The provably comment-only variants of one source. Reported lines are where a
 * transform edits, so they are where a rebuilt span shows up.
 */
function buildVariants(
  tc: InvalidCase,
  signature: string,
  messages: { line?: number }[],
): Variant[] {
  const code = tc.code;
  const variants: Variant[] = [];
  const addVariant = (kind: string, text: string | null) => {
    if (text === null) return;
    if (tokenSignature(text, tc.language, tc.filename) !== signature) {
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

  for (const marker of MARKERS_BY_LANGUAGE[tc.language]) {
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
 * The comparison, for one case: fix the original, fix each provably-neutral
 * commented variant, and demand the two outputs agree once comments are removed.
 */
function compareCase(rule: string, tc: InvalidCase, into: Finding[]): void {
  stats.considered++;
  const solo = soloRules(rule, tc);

  const signature = tokenSignature(tc.code, tc.language, tc.filename);
  if (signature === null) {
    stats.skippedNoSignature++;
    return;
  }

  const base = verify(tc.code, solo, tc, () => stats.verifyThrew++);
  if (!base) return;
  if (base.some((message) => message.fatal)) {
    stats.skippedFatal++;
    return;
  }
  /**
   * Perturbation sites come from THIS fixer's OWN reports.
   *
   * why: `verify` also returns ESLint's own `Definition for rule … was not
   * found` row when a fixture carries a directive naming a rule this bare
   * `Linter` never registered, and that row is located ON the directive
   * comment. Appending a marker there rewrites the directive's rule list, and
   * inserting a line above it separates the directive from the line it
   * suppresses — neither of which the token-signature proof can see, because
   * comments are not tokens. The fixture is then re-linted with its suppression
   * silently withdrawn and the resulting transform reads as a fidelity defect
   * of the fixer. Filtering by `ruleId` first is the same discipline
   * `composed-fix-core-violation-closure` applies to its counters, and for the
   * same reason: a rule-not-found row reads as both silence and inflation.
   */
  const reports = base.filter((message) => message.ruleId === PREFIX + rule);
  if (reports.length === 0) return;
  stats.reported++;

  const baseFix = fixOf(tc.code, solo, tc, () => stats.baseFixThrew++);
  if (!baseFix) return;
  const baseSignature = tokenSignature(
    baseFix.output,
    tc.language,
    tc.filename,
  );
  // An unparseable baseline output is a different axis (`fixer-convergence`).
  if (baseSignature === null) {
    stats.baseOutputUnsignable++;
    return;
  }
  if (baseFix.fixed) stats.baselineFixed++;

  const variants = buildVariants(tc, signature, reports);

  for (const variant of variants) {
    const variantFix = fixOf(
      variant.text,
      solo,
      tc,
      () => stats.variantFixThrew++,
    );
    if (!variantFix) continue;
    stats.comparisons++;
    stats.comparisonsByLanguage[tc.language]++;
    stats.rulesCompared.add(rule);

    const record = (kind: Finding['kind']) =>
      into.push({
        rule,
        kind,
        variantKind: variant.kind,
        origin: tc.origin,
        filename: tc.filename,
        before: tc.code,
        variant: variant.text,
        baseOutput: baseFix.output,
        variantOutput: variantFix.output,
      });

    const variantSignature = tokenSignature(
      variantFix.output,
      tc.language,
      tc.filename,
    );
    if (variantSignature === null) {
      record('PARSE_BREAK');
      continue;
    }
    if (variantSignature !== baseSignature) {
      record('TRANSFORM_DIVERGED');
      continue;
    }
    // Substring, not equality: a marker appended to a line that already ends in
    // a comment MERGES into it, and an exact-match predicate reads every such
    // case as a deletion.
    if (!variantFix.output.includes(MARKER_TEXT)) {
      record('COMMENT_LOST');
      continue;
    }
    const comments =
      commentsOf(variantFix.output, tc.language, tc.filename) || [];
    if (!comments.some((comment) => comment.includes(MARKER_TEXT))) {
      // Survives as text but is no longer a comment: it was absorbed into a
      // string or into another comment's body.
      record('COMMENT_LOST');
    }
  }
}

/**
 * The same question asked of the suggestion channel, which `--fix` never
 * touches: a suggestion that rebuilds a span destroys a comment exactly as a
 * fixer does, and the human accepting it has no way to see that it happened.
 *
 * Each suggestion is applied ALONE to the untouched source — never composed
 * with a sibling suggestion, never through a fix loop — because that is the only
 * state an editor can produce. Suggestions are paired between the baseline and
 * the commented variant POSITIONALLY: with an identical non-comment token
 * stream both lints must offer the same list, and a variant that offers a
 * different one is a report-neutrality question rather than a fidelity one, so
 * it is counted and dropped instead of judged here.
 */
function compareSuggestions(
  rule: string,
  tc: InvalidCase,
  into: Finding[],
): void {
  const id = PREFIX + rule;
  const solo = soloRules(rule, tc);

  const signature = tokenSignature(tc.code, tc.language, tc.filename);
  if (signature === null) {
    stats.skippedNoSignature++;
    return;
  }

  const base = verify(tc.code, solo, tc, () => stats.suggestionVerifyThrew++);
  if (!base) return;
  if (base.some((message) => message.fatal)) {
    stats.skippedFatalSuggestion++;
    return;
  }
  // Sites are this rule's own reports; see the note in `compareCase`.
  const reports = base.filter((message) => message.ruleId === id);
  if (reports.length === 0) return;
  const baseEdits = suggestionEditsOf(tc.code, base, id);
  if (baseEdits.length === 0) return;

  for (const variant of buildVariants(tc, signature, reports)) {
    const variantMessages = verify(
      variant.text,
      solo,
      tc,
      () => stats.suggestionVerifyThrew++,
    );
    if (!variantMessages) continue;
    const variantEdits = suggestionEditsOf(variant.text, variantMessages, id);
    if (variantEdits.length !== baseEdits.length) {
      stats.suggestionShapeMismatch++;
      continue;
    }

    baseEdits.forEach((baseEdit, index) => {
      const variantEdit = variantEdits[index];
      stats.suggestionComparisons++;
      suggestionComparedByRule.set(
        rule,
        (suggestionComparedByRule.get(rule) || 0) + 1,
      );

      const record = (kind: Finding['kind']) =>
        into.push({
          rule,
          kind,
          variantKind: variant.kind,
          origin: tc.origin,
          filename: tc.filename,
          before: tc.code,
          variant: variant.text,
          baseOutput: baseEdit.output,
          variantOutput: variantEdit.output,
        });

      const baseSignature = tokenSignature(
        baseEdit.output,
        tc.language,
        tc.filename,
      );
      // An unparseable baseline output is `fixer-convergence`'s axis.
      if (baseSignature === null) {
        stats.suggestionBaseOutputUnsignable++;
        return;
      }
      const variantSignature = tokenSignature(
        variantEdit.output,
        tc.language,
        tc.filename,
      );
      if (variantSignature === null) {
        record('SUGGESTION_PARSE_BREAK');
        return;
      }
      if (variantSignature !== baseSignature) {
        record('SUGGESTION_TRANSFORM_DIVERGED');
        return;
      }
      if (!variantEdit.output.includes(MARKER_TEXT)) {
        record('SUGGESTION_COMMENT_LOST');
        return;
      }
      const comments =
        commentsOf(variantEdit.output, tc.language, tc.filename) || [];
      if (!comments.some((comment) => comment.includes(MARKER_TEXT))) {
        record('SUGGESTION_COMMENT_LOST');
      }
    });
  }
}

/** Per-rule non-vacuity for the suggestion channel; a total would hide a zero. */
const suggestionComparedByRule = new Map<string, number>(
  suggestionRuleNames.map((rule) => [rule, 0]),
);

/**
 * Suggestion-bearing rules carry their own corpus: only one of the seven is
 * `meta.fixable`, so six of them are absent from `casesByRule` entirely and the
 * fix channel's corpus cannot stand in for this one.
 */
const corpus = harvestFixtureCorpus();
const suggestionCasesByRule = new Map<string, InvalidCase[]>(
  suggestionRuleNames.map((rule) => [
    rule,
    (corpus.byRule.get(rule) || []).map((testCase) => ({
      code: testCase.code,
      filename: defaultFilenameFor(testCase),
      options: testCase.options,
      parserOptions: testCase.parserOptions,
      tester: testCase.tester,
      language: testCase.language,
      origin: `src/tests/${testCase.origin}`,
    })),
  ]),
);

function collectFindings(): Finding[] {
  const findings: Finding[] = [];
  for (const [rule, cases] of casesByRule) {
    for (const testCase of cases) compareCase(rule, testCase, findings);
  }
  for (const [rule, cases] of suggestionCasesByRule) {
    for (const testCase of cases) compareSuggestions(rule, testCase, findings);
  }
  return findings;
}

const findings = collectFindings();

/** Corpus size per language, so a language's absence is visible, not inferred. */
const casesByLanguage = [...casesByRule.values()].reduce((counts, cases) => {
  for (const testCase of cases) {
    counts[testCase.language] = (counts[testCase.language] || 0) + 1;
  }
  return counts;
}, {} as Record<string, number>);

/**
 * Printed, not merely asserted: the skip counts are how this guard loses a case
 * in silence, and a number nobody reads is a number nobody notices moving.
 */
console.log(
  [
    `[comment-fix-fidelity] corpus: ${stats.considered} case(s) over ` +
      `${casesByRule.size} rule(s); languages ` +
      `${[...languagesSeen]
        .sort()
        .map((language) => `${language}=${casesByLanguage[language] || 0}`)
        .join(' ')}`,
    `[comment-fix-fidelity] fix channel: ${stats.reported} reported, ` +
      `${stats.baselineFixed} fixed, ${stats.comparisons} comparison(s) over ` +
      `${stats.rulesCompared.size} rule(s), ` +
      `${stats.rejectedNonNeutral} perturbation(s) rejected as non-neutral; ` +
      `per language ` +
      `${Object.entries(stats.comparisonsByLanguage)
        .map(([language, count]) => `${language}=${count}`)
        .join(' ')}`,
    `[comment-fix-fidelity] skipped: ${stats.skippedFatal} fatal, ` +
      `${stats.skippedNoSignature} unsignable, ` +
      `${stats.skippedFatalSuggestion} fatal on the suggestion corpus, ` +
      `${stats.droppedSites} site(s) past the cap of ${SITE_CAP}`,
    `[comment-fix-fidelity] threw: ${stats.verifyThrew} verify, ` +
      `${stats.suggestionVerifyThrew} verify on the suggestion corpus, ` +
      `${stats.baseFixThrew} baseline fix, ${stats.variantFixThrew} variant fix; ` +
      `unsignable baseline output: ${stats.baseOutputUnsignable} fix, ` +
      `${stats.suggestionBaseOutputUnsignable} suggestion`,
  ].join('\n'),
);

/**
 * Printed per rule, not merely asserted in aggregate: a rule contributing zero
 * comparisons was not tested on this channel, and a total hides that.
 */
console.log(
  [
    `[comment-fix-fidelity] suggestion channel: ${stats.suggestionComparisons} ` +
      `(variant, suggestion) pair(s) compared, ` +
      `${stats.suggestionShapeMismatch} dropped for a mismatched suggestion list`,
    ...suggestionRuleNames.map(
      (rule) =>
        `    ${rule}: ${suggestionComparedByRule.get(rule) || 0} compared ` +
        `over ${(suggestionCasesByRule.get(rule) || []).length} case(s)`,
    ),
  ].join('\n'),
);
const groupKey = (finding: Finding) => `${finding.rule} :: ${finding.kind}`;

const observedGroups = new Set(findings.map(groupKey));

describe('a fixer does not write text it does not own', () => {
  it('produces the same transform with and without a neutral comment', () => {
    const unlisted = findings.filter(
      (finding) => !(groupKey(finding) in COMMENT_FIDELITY_BASELINE),
    );

    if (unlisted.length > 0) {
      const byGroup = new Map<string, Finding[]>();
      for (const finding of unlisted) {
        const key = groupKey(finding);
        byGroup.set(key, [...(byGroup.get(key) || []), finding]);
      }
      throw new Error(
        [
          `${byGroup.size} rule(s) change what they write when a comment is added:`,
          ...[...byGroup.entries()].map(([key, hits]) =>
            [
              `  ${key} (${hits.length} case(s), variant ${hits[0].variantKind})`,
              `    ${hits[0].origin} as ${hits[0].filename}`,
              `    --- fixed WITHOUT the comment ---`,
              hits[0].baseOutput.replace(/^/gm, '      '),
              `    --- the same input plus a comment, fixed ---`,
              hits[0].variantOutput.replace(/^/gm, '      '),
            ].join('\n'),
          ),
          '',
          'A comment carries no semantics, so stripping it must leave the',
          'transform identical. A fixer that rebuilds a span from its parts',
          'instead of editing the part it means to change fails here, because',
          'the comment lands in the span it re-emits — and so does every',
          'statement it silently drops (#1693, #1694, #1695).',
          'Edit the node you mean to change, decline when a rewrite would',
          'destroy a comment, or add the group to COMMENT_FIDELITY_BASELINE',
          'with a verified reason.',
        ].join('\n'),
      );
    }
    expect(unlisted).toEqual([]);
  });

  it('carries no stale baseline entry', () => {
    const stale = Object.keys(COMMENT_FIDELITY_BASELINE).filter(
      (group) => !observedGroups.has(group),
    );
    if (stale.length > 0) {
      throw new Error(
        [
          'COMMENT_FIDELITY_BASELINE lists group(s) this corpus no longer',
          'reproduces:',
          ...stale.map(
            (group) => `  ${group} — ${COMMENT_FIDELITY_BASELINE[group]}`,
          ),
          '',
          'Either the behaviour was fixed (delete the entry) or the fixture that',
          'reached it was edited away (restore coverage). A stale entry silently',
          'absorbs the next real regression.',
        ].join('\n'),
      );
    }
    expect(stale).toEqual([]);
  });
});

/**
 * Planted suggestion doubles, driven through `compareSuggestions` itself.
 *
 * Both polarities are needed and neither can be keyed to a shipped rule: every
 * live instance of this class is something the suite exists to eliminate, so a
 * control tied to one goes vacuous exactly when the plugin is healthiest.
 */
const CONTROL_REBUILD_SUGGESTER = 'control-rebuild-suggester';
const CONTROL_INPLACE_SUGGESTER = 'control-inplace-suggester';

linter.defineRule(PREFIX + CONTROL_REBUILD_SUGGESTER, {
  meta: {
    type: 'problem',
    hasSuggestions: true,
    schema: [],
    messages: { m: 'x', s: 'rebuild the call' },
  },
  create(context: never) {
    const ctx = context as unknown as {
      getSourceCode: () => { getText: (n?: unknown) => string };
      report: (d: unknown) => void;
    };
    const src = ctx.getSourceCode();
    return {
      CallExpression(node: never) {
        const call = node as unknown as {
          callee: { name?: string };
          arguments: unknown[];
        };
        if (call.callee.name !== 'rebuildMe') return;
        const args = call.arguments
          .map((argument) => src.getText(argument))
          .join(', ');
        ctx.report({
          node,
          messageId: 'm',
          suggest: [
            {
              messageId: 's',
              fix: (fixer: {
                replaceText: (n: unknown, t: string) => unknown;
              }) => fixer.replaceText(node, `rebuildMe(${args})`),
            },
          ],
        });
      },
    };
  },
} as never);

linter.defineRule(PREFIX + CONTROL_INPLACE_SUGGESTER, {
  meta: {
    type: 'problem',
    hasSuggestions: true,
    schema: [],
    messages: { m: 'x', s: 'rename the binding' },
  },
  create(context: never) {
    const ctx = context as unknown as { report: (d: unknown) => void };
    return {
      Identifier(node: never) {
        const id = node as unknown as { name: string };
        if (id.name !== 'renameMe') return;
        ctx.report({
          node,
          messageId: 'm',
          suggest: [
            {
              messageId: 's',
              fix: (fixer: {
                replaceText: (n: unknown, t: string) => unknown;
              }) => fixer.replaceText(node, 'renamed'),
            },
          ],
        });
      },
    };
  },
} as never);

/**
 * Anti-vacuity controls. This guard compares two fix outputs, so a bug that
 * makes both sides equal — or that makes every fix fail — reads exactly like a
 * clean corpus.
 */
describe('the comment fidelity guard is load-bearing', () => {
  it('harvests the suite without executing or losing it', () => {
    expect(harvested.failures).toEqual([]);
    expect(harvested.filesLoaded).toBeGreaterThanOrEqual(250);
  });

  /**
   * The comment-loss oracle is a presence test for `MARKER_TEXT`, so a fixture
   * carrying that token in its OWN source satisfies the check on the fixer's
   * behalf: the planted marker can be destroyed while the fixture's copy keeps
   * both gates green. `// fidelity` was such a fixture — the #1877 regression
   * case, written for the very bug this guard exists to catch. Statically
   * excluded here rather than left to the marker staying obscure.
   */
  it('guards the marker against fixture collision', () => {
    const colliding = [...corpus.byRule].flatMap(([rule, cases]) =>
      cases
        .filter((testCase) => testCase.code.includes(MARKER_TEXT))
        .map((testCase) => `${rule} :: ${testCase.origin}`),
    );
    expect([...new Set(colliding)]).toEqual([]);
  });

  it('covers the fixable rule population', () => {
    // Guards the denominator: a high ratio over a collapsed rule set would still
    // look healthy. 84 of the 194 registered rules ship `meta.fixable`.
    expect(FIXABLE_RULES.size).toBeGreaterThanOrEqual(80);
    /**
     * Closed by EQUALITY rather than by a floor. A fixable rule with no case —
     * or with cases that never reach a comparison — is unprobed while the run
     * reads as clean, which is precisely the state the two non-TypeScript rules
     * sat in for as long as the corpus was TypeScript-only (#1860, #1984). All
     * 84 contribute both.
     */
    expect(
      [...FIXABLE_RULES].filter(
        (rule) => !(casesByRule.get(rule) || []).length,
      ),
    ).toEqual([]);
    expect(
      [...FIXABLE_RULES].filter((rule) => !stats.rulesCompared.has(rule)),
    ).toEqual([]);
  });

  it('reaches enough reported fixtures, and actually fixes them', () => {
    // The floors sit just under the measurement — 4,617 considered, all 4,617
    // reporting, 3,539 fixed, 30,091 comparisons — rather than far below it.
    // The previous 1,500/1,200/1,000/5,000 had decayed to a third of the real
    // corpus, which is more slack than the entire loss this guard exists to
    // notice.
    expect(stats.considered).toBeGreaterThanOrEqual(4600);
    expect(stats.reported).toBeGreaterThanOrEqual(4550);
    // If the baseline never fixes anything there is no transform to compare.
    expect(stats.baselineFixed).toBeGreaterThanOrEqual(3500);
    expect(stats.comparisons).toBeGreaterThanOrEqual(29500);
  });

  it("carries every tester's language, not only TypeScript", () => {
    /**
     * Dropping the non-TS testers cost two registered rules their ENTIRE
     * corpus. Both ship `recommended: 'error'` with `fixable: 'code'`, so both
     * rewrite consumer code while contributing nothing to this axis (#1860).
     */
    expect([...languagesSeen].sort()).toEqual(['json', 'markdown', 'ts']);
    const nonTsRules = [
      'no-unpinned-dependencies',
      'enforce-typescript-markdown-code-blocks',
    ];
    expect(
      nonTsRules.filter((rule) => !(casesByRule.get(rule) || []).length),
    ).toEqual([]);
    // Cases alone prove nothing: a language whose every perturbation is
    // rejected, or whose rule never reports, contributes no COMPARISON and the
    // guard would pass over it exactly as it did when the corpus was TS-only.
    expect(nonTsRules.filter((rule) => !stats.rulesCompared.has(rule))).toEqual(
      [],
    );
    // 5 JSON cases yield 34 comparisons; 11 Markdown cases yield 24, the
    // trailing-marker variant of each being rejected as non-neutral because
    // Markdown has no inert inline comment.
    expect(stats.comparisonsByLanguage.json).toBeGreaterThanOrEqual(30);
    expect(stats.comparisonsByLanguage.markdown).toBeGreaterThanOrEqual(20);
  });

  it('loses no case to a filename or a parser the harness itself chose', () => {
    /**
     * A fatal parse is indistinguishable from silence once messages are filtered
     * by `ruleId`, so every case counted here contributed a false clean.
     * Deriving the extension from the TESTER did that to 14 fixtures holding
     * JSX under `ruleTesterTs`, and an oracle fixed at `jsx: true` dropped 25
     * more that hold an angle-bracket assertion. Asserting ZERO, not a ceiling,
     * is what makes the next such case a failure instead of a rounding error.
     */
    expect(stats.skippedFatal).toBe(0);
    expect(stats.skippedNoSignature).toBe(0);
    expect(stats.skippedFatalSuggestion).toBe(0);
    /**
     * A site past the cap is never perturbed, and an unprobed site reads exactly
     * like a faithful one — the same false clean as a fatal parse, arriving by
     * truncation instead. Asserting ZERO rather than a ceiling is what turns a
     * rule that starts reporting per-occurrence into a failure here instead of a
     * silent loss of coverage (#1996).
     */
    expect(stats.droppedSites).toBe(0);
  });

  /**
   * The drops that produced no verdict at all, held to the same ZERO as the
   * fatals above. Each of these sat behind a bare `return`/`continue` with no
   * counter, so a linter that started throwing — or a fixer whose own baseline
   * output stopped parsing — would remove cases from the comparison while the
   * floors above still passed on what remained (#1984, #2222).
   *
   * The fix channel's three are pinned at zero over a superset of these pairs by
   * `cross-comment-fidelity-closure`; the SUGGESTION channel has no cross twin
   * running this corpus, so its two are counted here or nowhere.
   */
  it('never lets a probe throw, or judge an unreadable baseline', () => {
    expect({
      verifyThrew: stats.verifyThrew,
      suggestionVerifyThrew: stats.suggestionVerifyThrew,
      baseFixThrew: stats.baseFixThrew,
      variantFixThrew: stats.variantFixThrew,
      baseOutputUnsignable: stats.baseOutputUnsignable,
      suggestionBaseOutputUnsignable: stats.suggestionBaseOutputUnsignable,
    }).toEqual({
      verifyThrew: 0,
      suggestionVerifyThrew: 0,
      baseFixThrew: 0,
      variantFixThrew: 0,
      baseOutputUnsignable: 0,
      suggestionBaseOutputUnsignable: 0,
    });
  });

  /**
   * Per-rule floor for the suggestion channel. Six of the seven suggestion
   * rules are not `meta.fixable`, so before #1733 none of them entered this
   * corpus at all; a rule with zero comparisons is untested here, and an
   * aggregate floor would let one prolific rule cover for it.
   */
  it('compares suggestions from every suggestion-bearing rule', () => {
    expect(suggestionRuleNames.length).toBeGreaterThanOrEqual(7);
    // None of the seven is type-aware, so each is reachable under this bare
    // Linter and none has a reason to be exempt.
    expect(
      suggestionRuleNames.filter(
        (rule) => (suggestionComparedByRule.get(rule) || 0) < 1,
      ),
    ).toEqual([]);
    // Measured: 1,928 comparisons. At the 500 this replaced, 74% of the
    // channel could vanish while the suite stayed green — proportionally more
    // slack than the floors that hid #1984 carried.
    expect(stats.suggestionComparisons).toBeGreaterThanOrEqual(1900);
    /**
     * The drop channel for a variant whose suggestion list stops lining up
     * with its base case's: each routed case is a comparison that silently
     * never happens, and the floor above absorbs the first 28 alone. The
     * variants are neutrality-checked, so a shape change is a finding, not
     * noise — zero today, and the next one must be a conscious bump.
     */
    expect(stats.suggestionShapeMismatch).toBe(0);
  });

  it('detects a suggestion that rebuilds a span (positive control)', () => {
    // The #1693 shape offered through `suggest`: `--fix` never applies it, so
    // the fix channel above cannot see this transform at all.
    const planted: InvalidCase = {
      code: 'rebuildMe(\n  1,\n);\n',
      filename: 'x.ts',
      tester: 'ruleTesterTs',
      language: 'ts',
      origin: 'planted control',
    };
    const found: Finding[] = [];
    compareSuggestions(CONTROL_REBUILD_SUGGESTER, planted, found);
    expect(found.map((finding) => finding.kind)).toContain(
      'SUGGESTION_COMMENT_LOST',
    );
  });

  it('stays silent on a suggestion that edits in place (negative control)', () => {
    const planted: InvalidCase = {
      code: 'const renameMe = 1;\n',
      filename: 'x.ts',
      tester: 'ruleTesterTs',
      language: 'ts',
      origin: 'planted control',
    };
    const before = stats.suggestionComparisons;
    const found: Finding[] = [];
    compareSuggestions(CONTROL_INPLACE_SUGGESTER, planted, found);
    // A control whose suggestion never reached the comparison would prove
    // nothing about either polarity.
    expect(stats.suggestionComparisons).toBeGreaterThan(before);
    expect(found).toEqual([]);
  });

  it('rejects perturbations that are not comment-only', () => {
    // The token guard is what separates this axis from noise; a marker landing
    // in a template literal or JSX text changes the code and must be discarded.
    expect(stats.rejectedNonNeutral).toBeGreaterThan(0);
    const inTemplate = 'const s = `\nhello\n`;';
    expect(tokenSignature(inTemplate, 'ts', 'x.ts')).not.toBe(
      tokenSignature(
        insertLineBefore(inTemplate, 2, BLOCK_MARKER) as string,
        'ts',
        'x.ts',
      ),
    );
    // Markdown has no inert inline comment: appending one to an opening fence
    // turns it into a language label, which is why the signature keeps the
    // residue rather than stripping comments wherever they appear.
    const fence = '```\nconst example = 1;\n```';
    expect(tokenSignature(fence, 'markdown', 'docs/example.md')).not.toBe(
      tokenSignature(
        appendTrailing(fence, 1, HTML_MARKER) as string,
        'markdown',
        'docs/example.md',
      ),
    );
    // And a whole-line one is inert, or the Markdown arm would compare nothing.
    expect(tokenSignature(fence, 'markdown', 'docs/example.md')).toBe(
      tokenSignature(
        insertLineBefore(fence, 1, HTML_MARKER) as string,
        'markdown',
        'docs/example.md',
      ),
    );
  });

  it('detects a fixer that rebuilds a span (positive control)', () => {
    // The #1693 shape: rebuild a call from its parts, which drops anything
    // written between them. Hard-coded so the detector stays proven even if
    // every real rule stops exhibiting it.
    linter.defineRule('__control__/rebuild', {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: never) {
        const ctx = context as unknown as {
          getSourceCode: () => { getText: (n?: unknown) => string };
          report: (d: unknown) => void;
        };
        const src = ctx.getSourceCode();
        return {
          CallExpression(node: never) {
            const call = node as unknown as {
              callee: { name?: string };
              arguments: unknown[];
            };
            if (call.callee.name !== 'rebuildMe') return;
            const args = call.arguments
              .map((argument) => src.getText(argument))
              .join(', ');
            ctx.report({
              node,
              messageId: 'm',
              fix: (fixer: {
                replaceText: (n: unknown, t: string) => unknown;
              }) => fixer.replaceText(node, `rebuildMe(${args})`),
            });
          },
        };
      },
    } as never);

    const planted: InvalidCase = {
      code: 'rebuildMe(\n  1,\n);\n',
      filename: 'x.ts',
      tester: 'ruleTesterTs',
      language: 'ts',
      origin: 'planted control',
    };
    const rules = { '__control__/rebuild': 'error' };
    const baseOut = linter.verifyAndFix(
      planted.code,
      configFor(rules, planted),
      { filename: planted.filename },
    );
    // Built from the constant, never a literal: hard-coding the marker let the
    // rename to `fidelityProbe` leave this asserting `not.toContain` about text
    // that never held the token, so the control passed whatever the fixer did.
    const variantIn = `rebuildMe(\n  ${BLOCK_MARKER} 1,\n);\n`;
    const variantOut = linter.verifyAndFix(
      variantIn,
      configFor(rules, planted),
      {
        filename: planted.filename,
      },
    );
    expect(baseOut.fixed).toBe(true);
    expect(variantOut.fixed).toBe(true);
    // The absence oracle below is only evidence of a DROP if the input carried
    // the token to begin with. Asserting that is what catches a marker rename
    // that misses this plant, which `not.toContain` cannot: it reads green both
    // when the fixer drops the marker and when there was never one to drop.
    expect(variantIn).toContain(MARKER_TEXT);
    // The marker sat between the parts, so the rebuild dropped it.
    expect(variantOut.output).not.toContain(MARKER_TEXT);
  });

  it('stays silent on a fixer that edits in place (negative control)', () => {
    // The same pipeline over a fixer that replaces only the node it means to
    // change, so a green run means the corpus is clean rather than that the
    // detector never fires.
    linter.defineRule('__control__/inplace', {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: never) {
        const ctx = context as unknown as { report: (d: unknown) => void };
        return {
          Identifier(node: never) {
            const id = node as unknown as { name: string };
            if (id.name !== 'renameMe') return;
            ctx.report({
              node,
              messageId: 'm',
              fix: (fixer: {
                replaceText: (n: unknown, t: string) => unknown;
              }) => fixer.replaceText(node, 'renamed'),
            });
          },
        };
      },
    } as never);

    const planted: InvalidCase = {
      code: 'const renameMe = 1;\n',
      filename: 'x.ts',
      tester: 'ruleTesterTs',
      language: 'ts',
      origin: 'planted control',
    };
    const rules = { '__control__/inplace': 'error' };
    const baseOut = linter.verifyAndFix(
      planted.code,
      configFor(rules, planted),
      { filename: planted.filename },
    );
    const variantOut = linter.verifyAndFix(
      `const renameMe = 1; ${LINE_MARKER}\n`,
      configFor(rules, planted),
      { filename: planted.filename },
    );
    expect(baseOut.fixed).toBe(true);
    expect(variantOut.output).toContain(MARKER_TEXT);
    expect(tokenSignature(variantOut.output, 'ts', planted.filename)).toBe(
      tokenSignature(baseOut.output, 'ts', planted.filename),
    );
  });
});

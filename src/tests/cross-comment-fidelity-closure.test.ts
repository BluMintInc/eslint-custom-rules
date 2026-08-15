/**
 * A fixer must not write text it does not own — asked of every fixer over every
 * fixture ANY rule reports on, not only over its own.
 *
 * `comment-fix-fidelity.test.ts` owns this oracle and pairs each fixer with
 * `corpus.byRule.get(rule)`: the fixtures written FOR that rule. Its three
 * sibling sweeps over the same corpus (`fix-core-violation-closure`,
 * `fix-orphan-binding-closure`, `fix-fixpoint-closure`) all pair the other way —
 * by which rule REPORTS on a fixture — because a rule's own suite is written to
 * the shapes its author already had in mind. The shapes that break a fixer are
 * the ones nobody wrote for it.
 *
 * Running the fidelity oracle under that pairing found two live bugs the
 * own-corpus guard was green through, both since fixed:
 *   - #2023 `logical-top-to-bottom-grouping` appended a relocated statement onto
 *     a line ending in a `//` comment, commenting the statement out of the
 *     program. Reached through `no-unnecessary-verb-suffix`'s fixtures.
 *   - #2024 `prefer-nullish-coalescing-boolean-props` deleted the comments
 *     stranded between the `||` operands it merged. Reached through
 *     `no-excessive-parent-chain`'s fixtures.
 * Neither rule's own suite contains a fixture that positions a comment there, so
 * neither was reachable from the own-corpus pairing at all.
 *
 * METHOD, unchanged from the guard this derives from: perturb a fixture in a
 * provably comment-only way (the non-comment token stream must be byte
 * identical) and re-run `--fix` with ONE rule enabled. Comments carry no
 * semantics, so the transform must be identical modulo the comment, and the
 * comment must survive as a comment. What changes is only which (fixer,
 * fixture) pairs are formed: every rule that reports on a fixture is driven over
 * it, whoever wrote it.
 *
 * THE BASELINE IS SHARED, AND RULE-GLOBAL. `COMMENT_FIDELITY_BASELINE` is keyed
 * `<rule> :: <kind>` and nothing else, so an entry verified against a rule's own
 * fixtures also excuses that rule's findings here. That is deliberate — the
 * reason a fixer legitimately consumes a comment is a property of the fixer —
 * but it is a real cost, and the documented one: a rule-global entry un-gates
 * every arm the rule participates in (#1839). Two things hold it honest. The
 * failure message prints the OWNER suite, the variant and a before/after diff,
 * so an entry can be audited against the arm reproducing it; and the groups this
 * sweep survives with were MEASURED against the current tree — 1,317 findings in
 * 12 `<rule> :: <kind>` groups (18 once split by arm), 819 of them cross, every
 * one already listed — not assumed from the own-corpus run.
 *
 * The IN-NODE reason carried by every `COMMENT_LOST` entry was then audited
 * against the CROSS population specifically, since that reason ("the marker sits
 * inside a node the fixer replaces wholesale") was originally verified only on
 * each rule's own fixtures. Tracking the marker's offset against the ranges the
 * fixer actually applied put 900 of 902 `COMMENT_LOST` cases inside an applied
 * range — including all 656 cross cases of `use-latest-callback`, the largest
 * group here. The 2 that scored outside are both `enforce-unique-cursor-headers`
 * and both benign on inspection: the marker is appended onto the `/**` line of
 * the DUPLICATE header, so it becomes part of the very comment that rule exists
 * to delete. So the shared entries are load-bearing for this arm too, by
 * measurement rather than by inheritance.
 *
 * Staleness is asserted by `comment-fix-fidelity.test.ts` against its own
 * corpus, deliberately not here: this pairing is a superset, so a group that
 * only this sweep reaches would keep an entry alive that the own-corpus guard
 * has retired, and the two guards would disagree about the same map.
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
} from '../utils/fixtureCorpus';
import type {
  FixtureBucket,
  FixtureCase,
  FixtureLanguage,
} from '../utils/fixtureCorpus';
import { COMMENT_FIDELITY_BASELINE } from './commentFidelityBaseline';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as {
  rules: Record<string, { meta?: { fixable?: string } }>;
  configs: { recommended: { rules: Record<string, unknown> } };
};
/* eslint-enable @typescript-eslint/no-var-requires */

const PREFIX = '@blumintinc/blumint/';

/**
 * Only a rule that rewrites text can destroy a comment.
 *
 * The exclusion is `silentWithoutProgramRuleNames` — rules MEASURED to report
 * nothing under a bare `Linter`, and so able to contribute only a false clean.
 * It is deliberately not "every rule that mentions `getParserServices`": that
 * premise is measured false (all 16 report, because the parser hands back an
 * ISOLATED single-file program even with no `project`), and dropping the 16 hid
 * a fixer deleting comments under `--fix` at `'error'` (#1859, #1877).
 */
const FIXABLE_RULES = new Set(
  Object.entries(plugin.rules)
    .filter(
      ([name, rule]) =>
        rule.meta?.fixable && !silentWithoutProgramRuleNames.has(name),
    )
    .map(([name]) => name),
);

/**
 * One rule is discounted BY NAME, at this guard's own level, exactly as
 * `fix-core-violation-closure` and `fix-orphan-binding-closure` do and for the
 * same measured reason: with no program every dependency reads as
 * `unknown`-typed, so `no-entire-object-hook-deps` deletes deps it would leave
 * alone in a consumer's CI (#1621), and anything downstream of those deletions
 * is an artefact of the missing program rather than of the fixer.
 *
 * It is NOT added to `silentWithoutProgramRuleNames` — that set means "reports
 * nothing here", and this rule reports too MUCH — and it is one name rather than
 * all 16 rules mentioning `getParserServices`, because discounting one measured
 * divergence never justified unprobing fifteen others (#1879).
 */
const DIVERGENT_WITHOUT_PROGRAM = new Set(['no-entire-object-hook-deps']);

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

const BLOCK_MARKER = '/* fidelity */';
const LINE_MARKER = '// fidelity';
const HTML_MARKER = '<!-- fidelity -->';
const MARKER_TEXT = 'fidelity';

/**
 * Both shapes are needed. A block comment is inert almost everywhere; a LINE
 * comment is the one that turns following code into a comment when a fixer joins
 * lines, which is the severe half of the class — and is exactly what #2023 did.
 */
type Variant = { kind: string; text: string };

/**
 * The marker must be a comment in the fixture's OWN language, or the probe stops
 * asking about comments. `// fidelity` in Markdown is a paragraph of literal
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
  /** Pairs where the fixer left the source alone; nothing to compare. */
  baseNoFix: 0,
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
  baseFixThrew: 0,
  variantFixThrew: 0,
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

const fixOf = (
  code: string,
  rules: Record<string, unknown>,
  testCase: ProbeCase,
  onThrow: () => void,
) => {
  try {
    return linter.verifyAndFix(code, configFor(rules, testCase), {
      filename: testCase.filename,
    });
  } catch {
    onThrow();
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
function compareCross(
  fixer: string,
  owner: string,
  testCase: ProbeCase,
  into: Finding[],
): void {
  const cross = fixer !== owner;
  const solo = { [PREFIX + fixer]: severityWithOptions(testCase) as unknown };

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
  // The screen ran the whole config; this rule alone may still say nothing, and
  // a rule that does not report cannot have produced a fix.
  if (base.length === 0) return;

  const baseFix = fixOf(testCase.code, solo, testCase, () => {
    stats.baseFixThrew++;
  });
  if (!baseFix) return;
  const baseSignature = tokenSignature(
    baseFix.output,
    testCase.language,
    testCase.filename,
  );
  if (baseSignature === null) {
    stats.baseOutputUnsignable++;
    return;
  }
  if (!baseFix.fixed) {
    stats.baseNoFix++;
    return;
  }
  stats.rewrites++;
  stats.fixersRewriting.add(fixer);
  if (cross) {
    stats.crossRewrites++;
    stats.crossFixersRewriting.add(fixer);
  }

  for (const variant of buildVariants(testCase, signature, base)) {
    const variantFix = fixOf(variant.text, solo, testCase, () => {
      stats.variantFixThrew++;
    });
    if (!variantFix) continue;
    stats.comparisons++;
    stats.comparisonsByLanguage[testCase.language]++;

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
        baseOutput: baseFix.output,
        variantOutput: variantFix.output,
      });

    const variantSignature = tokenSignature(
      variantFix.output,
      testCase.language,
      testCase.filename,
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
      commentsOf(variantFix.output, testCase.language, testCase.filename) || [];
    if (!comments.some((comment) => comment.includes(MARKER_TEXT))) {
      // Survives as text but is no longer a comment: it was absorbed into a
      // string or into another comment's body.
      record('COMMENT_LOST');
    }
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
    /**
     * A fixture's `options` belong to its OWNER. Handing them to a different
     * rule configures that rule with a schema it never declared, which is at
     * best ignored and at worst a config error that silences the rule entirely.
     */
    const crossCase: ProbeCase = { ...ownerCase, options: undefined };

    const ownerId = `${PREFIX}${owner}`;
    let screened: Linter.LintMessage[];
    try {
      screened = linter.verify(
        source,
        configFor(
          {
            ...RECOMMENDED,
            // The owner's rule may ship disabled, or be discounted above; when
            // it is enabled the recommended severity already carries it, and
            // overriding would drop the options its author wrote.
            ...(RECOMMENDED[ownerId] || DIVERGENT_WITHOUT_PROGRAM.has(owner)
              ? {}
              : { [ownerId]: severityWithOptions(fixture) }),
          },
          ownerCase,
        ),
        { filename },
      );
    } catch {
      stats.screenThrew++;
      continue;
    }
    if (screened.some((message) => message.fatal)) {
      stats.screenFatal++;
      continue;
    }

    const reporting = new Set(
      screened
        .map((message) => message.ruleId)
        .filter((id): id is string => !!id && id.startsWith(PREFIX))
        .map((id) => id.slice(PREFIX.length)),
    );
    for (const fixer of reporting) {
      if (DIVERGENT_WITHOUT_PROGRAM.has(fixer)) continue;
      if (!FIXABLE_RULES.has(fixer)) continue;
      stats.pairs++;
      if (fixer !== owner) stats.crossPairs++;
      compareCross(
        fixer,
        owner,
        fixer === owner ? ownerCase : crossCase,
        findings,
      );
    }
  }
}

/**
 * The sweep's numbers, frozen before any planted control runs. The controls
 * drive `compareCross` itself — which is the point of them — so they move the
 * live counters, and an assertion reading those would be reading the controls'
 * arithmetic as well as the corpus's.
 */
const SWEEP = {
  ...stats,
  fixersRewriting: stats.fixersRewriting.size,
  crossFixersRewriting: stats.crossFixersRewriting.size,
  /** Frozen by NAME too, so a named-rule assertion reads the sweep's own set. */
  crossFixerNames: new Set([...stats.crossFixersRewriting]),
  owners: stats.owners.size,
  comparisonsByLanguage: { ...stats.comparisonsByLanguage },
};

const groupKey = (finding: Finding) => `${finding.rule} :: ${finding.kind}`;

/**
 * Printed, not merely asserted: the skip counts are how this guard loses a pair
 * in silence, and a number nobody reads is a number nobody notices moving.
 */
console.log(
  [
    `[cross-comment-fidelity] corpus: ${SWEEP.fixtures} fixture(s) over ` +
      `${SWEEP.owners} owner(s); ${SWEEP.pairs} pair(s) formed ` +
      `(${SWEEP.crossPairs} cross)`,
    `[cross-comment-fidelity] rewrites: ${SWEEP.rewrites} ` +
      `(${SWEEP.crossRewrites} cross) by ${SWEEP.fixersRewriting} fixer(s) ` +
      `(${SWEEP.crossFixersRewriting} cross); ${SWEEP.baseNoFix} pair(s) left ` +
      `the source alone`,
    `[cross-comment-fidelity] comparisons: ${SWEEP.comparisons} ` +
      `(${Object.entries(SWEEP.comparisonsByLanguage)
        .map(([language, count]) => `${language}=${count}`)
        .join(' ')}); ` +
      `${SWEEP.rejectedNonNeutral} perturbation(s) rejected as non-neutral`,
    `[cross-comment-fidelity] dropped: ${SWEEP.screenFatal} screen-fatal, ` +
      `${SWEEP.screenThrew} screen-threw, ${SWEEP.skippedFatal} fatal, ` +
      `${SWEEP.skippedNoSignature} unsignable, ${SWEEP.droppedSites} site(s) ` +
      `past the cap of ${SITE_CAP}, ${SWEEP.verifyThrew} verify-threw, ` +
      `${SWEEP.baseFixThrew}/${SWEEP.variantFixThrew} fix-threw, ` +
      `${SWEEP.baseOutputUnsignable} unparseable fix output(s)`,
    `[cross-comment-fidelity] findings: ${findings.length} in ` +
      `${new Set(findings.map(groupKey)).size} group(s), ` +
      `${findings.filter((finding) => finding.cross).length} of them cross`,
  ].join('\n'),
);

const unlisted = findings.filter(
  (finding) => !(groupKey(finding) in COMMENT_FIDELITY_BASELINE),
);

const describeUnlisted = (hits: Finding[]) => {
  const byGroup = new Map<string, Finding[]>();
  for (const finding of hits) {
    const key = groupKey(finding);
    byGroup.set(key, [...(byGroup.get(key) || []), finding]);
  }
  return [
    `${byGroup.size} rule(s) change what they write when a comment is added:`,
    ...[...byGroup.entries()].map(([key, group]) =>
      [
        `  ${key} (${group.length} case(s), variant ${group[0].variantKind})`,
        `    owner suite src/tests/${group[0].origin} (${group[0].bucket} case)`,
        `    linted as ${group[0].filename}`,
        `    --- the fixture, plus a comment ---`,
        group[0].variant.replace(/^/gm, '      '),
        `    --- fixed WITHOUT the comment ---`,
        group[0].baseOutput.replace(/^/gm, '      '),
        `    --- the same input WITH the comment, fixed ---`,
        group[0].variantOutput.replace(/^/gm, '      '),
      ].join('\n'),
    ),
    '',
    'A comment carries no semantics, so stripping it must leave the transform',
    'identical. A fixer that rebuilds a span from its parts instead of editing',
    'the part it means to change fails here, because the comment lands in the',
    'span it re-emits — and so does every statement it silently drops.',
    'The fixture belongs to ANOTHER rule: that is the point of this sweep, and',
    'not a reason to discount the finding (#2023, #2024 were both found this',
    'way). Edit the node you mean to change, decline when a rewrite would',
    'destroy a comment, or add the group to COMMENT_FIDELITY_BASELINE in',
    'src/tests/commentFidelityBaseline.ts with a verified reason.',
  ].join('\n');
};

describe('a fixer does not write text it does not own, on any rule’s fixtures', () => {
  it('produces the same transform with and without a neutral comment', () => {
    if (unlisted.length > 0) throw new Error(describeUnlisted(unlisted));
    expect(unlisted).toEqual([]);
  });

  /**
   * The cross arm on its own. The aggregate above is dominated by pairs the
   * own-corpus guard already covers, so a regression reachable only through
   * another rule's fixtures could in principle be argued away as "the same
   * group that guard already sees" — asserting the arm separately makes the
   * distinction structural rather than a matter of reading.
   */
  it('holds on fixtures written for a DIFFERENT rule', () => {
    const crossUnlisted = unlisted.filter((finding) => finding.cross);
    if (crossUnlisted.length > 0)
      throw new Error(describeUnlisted(crossUnlisted));
    expect(crossUnlisted).toEqual([]);
  });

  it('never let a probe throw instead of producing a verdict', () => {
    expect(corpus.failures).toEqual([]);
    expect(SWEEP.screenThrew).toBe(0);
    expect(SWEEP.verifyThrew).toBe(0);
    expect(SWEEP.baseFixThrew).toBe(0);
    expect(SWEEP.variantFixThrew).toBe(0);
  });

  it('loses no case to a filename, a parser, or a cap the harness itself chose', () => {
    /**
     * A fatal parse is indistinguishable from silence once messages are filtered
     * by `ruleId`, so every case counted here would contribute a false clean.
     * Asserting ZERO, not a ceiling, is what makes the next one a failure
     * instead of a rounding error (#1984, #1859).
     */
    expect(SWEEP.screenFatal).toBe(0);
    expect(SWEEP.skippedFatal).toBe(0);
    expect(SWEEP.skippedNoSignature).toBe(0);
    /**
     * A site past the cap is never perturbed, which reads exactly like a site
     * that passed. The cap stays at its measured-clean value rather than being
     * raised out of reach: a ceiling far above the measurement stops measuring
     * anything (#2018).
     */
    expect(SWEEP.droppedSites).toBe(0);
    expect(SITE_CAP).toBe(8);
    /**
     * A fixer whose own output does not parse is `fixer-convergence`'s finding
     * rather than this one, so the pair is dropped here — but a dropped pair is
     * a comparison that never happened, and a counter no `expect` reads is how a
     * skip becomes invisible. Measured ZERO over 35,509 pairs, so the first one
     * fails here too and points at the convergence guard.
     */
    expect(SWEEP.baseOutputUnsignable).toBe(0);
  });

  /**
   * Non-vacuity. Every floor sits JUST under a measured value — 20,376
   * fixtures, 35,509 pairs (30,829 cross), 12,625 rewrites (9,106 cross) by 83
   * fixers (59 cross), 194 owners, 82,668 comparisons. Floors parked far below
   * the measurement are how #1984 hid 8,141 cases behind a 5,500 floor, so the
   * headroom here is a few percent and no more.
   */
  it('actually swept the corpus it claims to', () => {
    expect(SWEEP.fixtures).toBeGreaterThanOrEqual(20000);
    expect(SWEEP.owners).toBeGreaterThanOrEqual(190);
    expect(SWEEP.pairs).toBeGreaterThanOrEqual(34800);
    expect(SWEEP.comparisons).toBeGreaterThanOrEqual(81000);
    // A pair whose fixer never rewrites anything proves nothing about what a
    // fixer writes, so the rewrite counts are the load-bearing ones.
    expect(SWEEP.rewrites).toBeGreaterThanOrEqual(12300);
    expect(SWEEP.fixersRewriting).toBeGreaterThanOrEqual(81);
    // The sound saving this sweep takes: a fixer that leaves the source alone
    // has no transform to compare. Counted so the skip is visible rather than
    // absorbed into the runtime.
    expect(SWEEP.baseNoFix).toBeGreaterThanOrEqual(22000);
  });

  /**
   * The arm that does not exist in the guard this derives from. Without these
   * the whole sweep could collapse onto own-corpus pairs — which pass today —
   * and every aggregate floor above would still hold.
   */
  it('forms the CROSS pairs that are the point of this sweep', () => {
    expect(SWEEP.crossPairs).toBeGreaterThanOrEqual(30000);
    expect(SWEEP.crossRewrites).toBeGreaterThanOrEqual(8900);
    expect(SWEEP.crossFixersRewriting).toBeGreaterThanOrEqual(57);
    // #2023 and #2024 were each found through exactly one foreign suite, so the
    // breadth of owners a fixer is driven over is what makes that reachable.
    expect(SWEEP.crossPairs).toBeGreaterThan(SWEEP.pairs - SWEEP.crossPairs);
  });

  /**
   * The two rules this sweep exists because of, named.
   *
   * An aggregate cross floor is satisfied by 57 other rules while these two
   * quietly stop being driven over foreign fixtures — which is precisely the
   * state that hid #2023 and #2024, since each was reachable through exactly one
   * other rule's suite. Naming them turns "the coverage that found them was
   * deleted" into a failure instead of a smaller number nobody reads.
   */
  it('still drives the fixers that this pairing caught, over foreign fixtures', () => {
    expect(
      [
        'logical-top-to-bottom-grouping',
        'prefer-nullish-coalescing-boolean-props',
      ].filter((rule) => !SWEEP.crossFixerNames.has(rule)),
    ).toEqual([]);
  });

  it("carries every tester's language, not only TypeScript", () => {
    /**
     * Dropping the non-TS testers costs two registered rules their ENTIRE
     * corpus: `no-unpinned-dependencies` declares only under `ruleTesterJson`
     * and `enforce-typescript-markdown-code-blocks` only under
     * `ruleTesterMarkdown`, and both ship `recommended: 'error'` with
     * `fixable: 'code'` (#1860). Cases alone would prove nothing — a language
     * whose every perturbation is rejected contributes no COMPARISON — so the
     * floors are on comparisons.
     */
    expect(SWEEP.comparisonsByLanguage.ts).toBeGreaterThanOrEqual(81000);
    expect(SWEEP.comparisonsByLanguage.json).toBeGreaterThanOrEqual(20);
    expect(SWEEP.comparisonsByLanguage.markdown).toBeGreaterThanOrEqual(22);
  });

  it('rejects perturbations that are not comment-only', () => {
    // The token guard is what separates this axis from noise; a marker landing
    // in a template literal or JSX text changes the code and must be discarded.
    expect(SWEEP.rejectedNonNeutral).toBeGreaterThan(0);
    const inTemplate = 'const s = `\nhello\n`;';
    expect(tokenSignature(inTemplate, 'ts', 'file.ts')).not.toBe(
      tokenSignature(
        insertLineBefore(inTemplate, 2, BLOCK_MARKER) as string,
        'ts',
        'file.ts',
      ),
    );
  });
});

/**
 * Planted controls, driven through `compareCross` itself.
 *
 * Neither polarity can be keyed to a shipped rule: every live instance of this
 * class is something the axis exists to eliminate, so a control tied to one goes
 * vacuous exactly when the plugin is healthiest.
 */
const CONTROL_REBUILD = 'control-rebuild-fixer';
const CONTROL_INPLACE = 'control-inplace-fixer';

linter.defineRule(PREFIX + CONTROL_REBUILD, {
  meta: { type: 'problem', fixable: 'code', schema: [], messages: { m: 'x' } },
  create(context: never) {
    const ctx = context as unknown as {
      getSourceCode: () => { getText: (node?: unknown) => string };
      report: (descriptor: unknown) => void;
    };
    const source = ctx.getSourceCode();
    return {
      CallExpression(node: never) {
        const call = node as unknown as {
          callee: { name?: string };
          arguments: unknown[];
        };
        if (call.callee.name !== 'rebuildMe') return;
        const args = call.arguments
          .map((argument) => source.getText(argument))
          .join(', ');
        ctx.report({
          node,
          messageId: 'm',
          fix: (fixer: {
            replaceText: (node: unknown, text: string) => unknown;
          }) => fixer.replaceText(node, `rebuildMe(${args})`),
        });
      },
    };
  },
} as never);

linter.defineRule(PREFIX + CONTROL_INPLACE, {
  meta: { type: 'problem', fixable: 'code', schema: [], messages: { m: 'x' } },
  create(context: never) {
    const ctx = context as unknown as { report: (descriptor: unknown) => void };
    return {
      Identifier(node: never) {
        const identifier = node as unknown as { name: string };
        if (identifier.name !== 'renameMe') return;
        ctx.report({
          node,
          messageId: 'm',
          fix: (fixer: {
            replaceText: (node: unknown, text: string) => unknown;
          }) => fixer.replaceText(node, 'renamed'),
        });
      },
    };
  },
} as never);

const plantedCase = (code: string): ProbeCase => ({
  code,
  filename: 'file.ts',
  tester: 'ruleTesterTs',
  language: 'ts',
  origin: 'planted-control.test.ts',
  bucket: 'invalid',
});

describe('the cross-paired fidelity guard is load-bearing', () => {
  it('detects a fixer that rebuilds a span (positive control)', () => {
    // The #1693 shape: rebuild a call from its parts, dropping anything written
    // between them. Driven over a foreign owner, which is the pairing under
    // test — a detector that only worked on own-corpus pairs would pass the
    // sweep above forever.
    const found: Finding[] = [];
    compareCross(
      CONTROL_REBUILD,
      'some-other-rule',
      plantedCase('rebuildMe(\n  1,\n);\n'),
      found,
    );
    expect(found.map((finding) => finding.kind)).toContain('COMMENT_LOST');
    expect(found.every((finding) => finding.cross)).toBe(true);
    // And the group it produces is NOT in the shared baseline, so the
    // load-bearing assertion above would actually have failed on it.
    expect(
      found.filter((finding) => groupKey(finding) in COMMENT_FIDELITY_BASELINE),
    ).toEqual([]);
  });

  it('stays silent on a fixer that edits in place (negative control)', () => {
    const before = stats.comparisons;
    const found: Finding[] = [];
    compareCross(
      CONTROL_INPLACE,
      'some-other-rule',
      plantedCase('const renameMe = 1;\n'),
      found,
    );
    // A control whose fixer never reached a comparison would prove nothing
    // about either polarity.
    expect(stats.comparisons).toBeGreaterThan(before);
    expect(found).toEqual([]);
  });
});

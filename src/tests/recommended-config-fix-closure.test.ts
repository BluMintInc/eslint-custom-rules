import fs from 'fs';
import path from 'path';
import { Linter } from 'eslint';
import {
  defaultFilenameFor,
  defineCorpusParsers,
  FixtureCase,
  harvestFixtureCorpus,
  parserKeyFor,
  parserOptionsFor,
} from '../utils/fixtureCorpus';

// Using require to avoid test build-time ESM interop issues; the guard only
// needs the plugin object shape (rules, configs), not types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as {
  rules: Record<
    string,
    { meta?: { fixable?: string; hasSuggestions?: boolean } }
  >;
  configs: { recommended: { rules: Record<string, unknown> } };
};

const PREFIX = '@blumintinc/blumint/';
const DOCS_DIR = path.join(__dirname, '../../docs/rules');

/**
 * The recommended config must be closed under its own autofixes: running
 * `eslint --fix` with it must never leave behind a violation of another
 * recommended rule.
 *
 * A sweep over a consumer mainline (#1477) found 289 fix-induced violations,
 * every one of them NON-fixable — so `--fix` converted machine-resolvable work
 * into manual work. Nothing in the suite could see that. The autofix corruption
 * sweep only asks whether a *fixable* report survives the fix (it filters
 * `m.fix`), and ESLint's multi-pass fixing silently absorbs any newly-introduced
 * *fixable* violation, so a newly-introduced *unfixable* one is never counted.
 *
 * Method, matching that sweep: fix a snippet with one rule, then lint the
 * snippet and the fixed output with the SAME full recommended rule set and
 * fixing disabled. Any rule whose report count rises was introduced by the
 * fixer.
 *
 * A SUGGESTION is the same transform under a different delivery mechanism — an
 * editor applies it verbatim — so it can leave exactly the same wreckage, and
 * `meta.fixable` alone made every suggestion-only rule structurally invisible
 * here (#1601). Suggestions are carried through the identical count diff, with
 * one semantic difference that is load-bearing: `--fix` never applies them, so
 * each suggestion is applied ALONE to the untouched snippet. Composing two
 * suggestions, or running them through the fix loop, would judge the fixer
 * against a state no user can reach.
 *
 * Corpus, channel 1: every fenced code block in `docs/rules/<rule>.md`, fixed
 * by that rule alone. Polarity ("correct"/"incorrect") is deliberately NOT
 * consulted — a block the rule does not report on produces no fix and drops out
 * on its own, so taking every block costs nothing and roughly doubles the
 * corpus.
 *
 * Corpus, channel 2: harvested `RuleTester` fixtures, via the shared
 * `harvestFixtureCorpus`. The documented blocks are structurally OPTION-BLIND:
 * a docs snippet declares a non-default option only through an
 * `// eslint-options:` hint, which 7 of 194 pages carry, so 31 of the 35
 * optioned-and-fixable recommended rules were gated at their DEFAULTS and
 * nothing else (#2224). An option that redirects a fixer into emitting code
 * another recommended rule rejects was therefore invisible here — while
 * `option-liveness-closure` pins at least 19 options that change fix output and
 * ONLY fix output, which is precisely this guard's subject matter. Two of the
 * pairs below (`hashImport` pointing the injected import at a consumer-chosen
 * module) exist only under a non-default option and were unreachable until this
 * channel landed.
 *
 * Channel 2 is deliberately NOT every fixture. Admitting all 13,754
 * fixable-rule fixtures yields 4,654 pairs and 38 contradiction pairs beyond
 * FIX_INDUCED_BASELINE — a corpus-BREADTH question, and a different one from
 * this. Widening to it means triaging 38 pairs as fixer defects or design
 * deferrals, which is its own piece of work rather than a side effect of
 * carrying options. Admitted instead are the two sets the docs channel provably
 * cannot reach: every fixture carrying `options`, and every fixture of a
 * fixable rule the docs channel exercises not at all.
 *
 * The fixtures are harvested, never IMPORTED: `src/tests/*.test.ts` call
 * `RuleTester.run` and `describe`/`it` at module scope, so importing one
 * re-executes the entire suite inside this file (2350 tests, 2 minutes, 48
 * cross-file side-effect failures when measured). `harvestRuleTesterCases`
 * shadows `run` instead, which captures the real case OBJECTS — code, options,
 * filename, parserOptions together. Text-scraping the string literals out of
 * the same file, which this guard's suggestion channel used to do, drops every
 * one of those siblings on the floor and probes a snippet under a configuration
 * its author never wrote (#1732, #1984).
 */

/** Fence languages that hold TypeScript this harness can parse. */
const LINTABLE_LANGS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'typescript',
  'javascript',
  '',
]);

/**
 * Candidate filenames, tried in order until one produces a fix. Many rules key
 * off the path (cloud function entry points, test-file exemptions, component
 * directories), so a single hard-coded filename would leave those fixers
 * unexercised.
 */
const FILENAME_CANDIDATES = [
  'src/util/helper.ts',
  'functions/src/callable/handler.f.ts',
  'functions/src/util/helper.ts',
  'src/util/helper.test.ts',
  'src/components/Widget.tsx',
];

/**
 * Tried in ADDITION to the first matching candidate above, not as part of that
 * list. The candidate loop stops at the first filename that produces a fix, so
 * a `.dynamic` entry appended to it would never be reached for any rule whose
 * fixer already fires on `src/util/helper.ts` — the corpus would silently never
 * visit a `.dynamic` file, and every rule gated on that suffix
 * (`no-static-constants-in-dynamic-files` returns `{}` for any other filename)
 * would be structurally unreachable. That blind spot is why #1599's
 * `global-const-style -> no-static-constants-in-dynamic-files` pair reached a
 * consumer without this guard going red.
 */
const DYNAMIC_FILENAME_CANDIDATE = 'src/config/settings.dynamic.ts';

/** Path-segment matching needs a rooted path, not a relative one. */
const ROOT = '/repo/';
const anchor = (filePath: string) =>
  filePath.startsWith('/') ? filePath : ROOT + filePath;

/**
 * Libraries whose static import a shipped fixer emits. `enforce-dynamic-imports`
 * rejects any external import outside its ignore list, so every one of these
 * must be accepted there — the exact defect #1474 fixed after fixers injected
 * imports the default ignore list did not allow.
 *
 * Asserted to be reachable from the corpus below: if a doc edit stops a fixer
 * from firing, coverage of this axis would otherwise vanish silently.
 *
 * `safe-stable-stringify` (enforce-safe-stringify) is absent because that rule
 * ships no fixer, so no fix can introduce its import.
 */
const FIXER_INJECTED_LIBRARIES = [
  'use-latest-callback',
  '@blumintinc/typescript-memoize',
  '@blumintinc/use-deep-compare',
  '@blumintinc/microdiff',
  '@blumintinc/fast-deep-equal',
];

type Block = { lang: string; code: string; line: number };

/**
 * Pull every fenced code block out of a markdown document.
 *
 * Deliberately a local copy of the extractor in
 * `docs-examples-conformance.test.ts` rather than a shared import: that file
 * registers ~500 tests at module scope, so importing it would re-run them here.
 * Drift is caught by the corpus floor below, which fails loudly if extraction
 * stops finding blocks.
 */
export function extractBlocks(md: string): Block[] {
  const lines = md.split('\n');
  const blocks: Block[] = [];
  let fence: string | null = null;
  let buf: string[] = [];
  let lang = '';
  let startLine = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fenceMatch = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);

    if (fence) {
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence[0] &&
        fenceMatch[1].length >= fence.length
      ) {
        blocks.push({
          lang: lang.trim().toLowerCase(),
          code: buf.join('\n'),
          line: startLine,
        });
        fence = null;
        buf = [];
      } else {
        buf.push(line);
      }
      continue;
    }

    if (fenceMatch) {
      fence = fenceMatch[1];
      lang = fenceMatch[2] || '';
      startLine = i + 1;
      buf = [];
    }
  }
  return blocks;
}

/** Docs declare a path-sensitive snippet's context inside the snippet itself. */
export function filenameHint(code: string): string | null {
  const explicit = /^\s*(?:\/\/|\/\*)\s*File:\s*([^\s*]+)/im.exec(code);
  if (explicit) return anchor(explicit[1].replace(/^\.\//, ''));
  const firstLine = code.split('\n').find((l) => l.trim().length > 0) || '';
  const bare = /^\s*\/\/\s*((?:[\w.-]+\/)+[\w.-]+\.tsx?)\b/.exec(firstLine);
  return bare ? anchor(bare[1]) : null;
}

/**
 * A snippet that only holds under a non-default option declares it inline. The
 * hint is applied to BOTH the fix and the observation: judging a fix computed
 * under one configuration against a differently-configured observer manufactures
 * a finding that no consumer could ever hit.
 */
export function optionsHint(code: string): unknown | null {
  const match = /^\s*\/\/\s*eslint-options:\s*(\{.*\})\s*$/im.exec(code);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    throw new Error(`malformed // eslint-options: ${match[1]}`);
  }
}

const recommendedRuleNames = Object.keys(plugin.configs.recommended.rules)
  .filter((id) => id.startsWith(PREFIX))
  .map((id) => id.slice(PREFIX.length))
  .filter((name) => Boolean(plugin.rules[name]));

const fixableRuleNames = recommendedRuleNames.filter((name) =>
  Boolean(plugin.rules[name].meta?.fixable),
);

/**
 * Rules whose transform reaches a consumer as a suggestion. Kept separate from
 * `fixableRuleNames` rather than merged into it: the two are applied by
 * different machinery (the fix loop vs. a single editor-accepted edit) and are
 * baselined separately, so conflating them would let a fix-induced pair mask a
 * suggestion-induced one.
 */
const suggestionRuleNames = recommendedRuleNames.filter((name) =>
  Boolean(plugin.rules[name].meta?.hasSuggestions),
);

const linter = new Linter();
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}
/**
 * Registers `ts`, `json` and `markdown`, not TypeScript alone. A JSON or
 * Markdown fixture handed to `@typescript-eslint/parser` is a FATAL parse, and
 * every consumer below filters messages by `ruleId`, so that fatal is
 * indistinguishable from the rule staying silent (#1860). The `ts` key it
 * defines is `@typescript-eslint/parser`, which is what the documented blocks
 * were already parsed with.
 */
defineCorpusParsers(linter);

/**
 * The parser and parser options a snippet is linted under.
 *
 * A documented block is TypeScript by construction, so it keeps the harness's
 * own options. A harvested fixture carries its author's: `parserKeyFor` picks
 * the parser its tester declared, and `parserOptionsFor` merges what the case
 * itself asked for. Fixing that to `ts` would make every JSON and Markdown
 * fixture a fatal parse, and a fatal parse is indistinguishable from a silent
 * rule once messages are filtered by `ruleId`.
 */
const buildConfig = (
  filename: string,
  rules: Linter.Config['rules'],
  testCase?: FixtureCase,
): Linter.Config =>
  ({
    parser: testCase ? parserKeyFor(testCase) : 'ts',
    parserOptions: testCase
      ? parserOptionsFor(testCase)
      : {
          ecmaVersion: 2022,
          sourceType: 'module',
          ecmaFeatures: { jsx: filename.endsWith('.tsx') },
        },
    rules,
  } as unknown as Linter.Config);

/**
 * A rule's severity entry carrying the options a snippet was written for.
 *
 * Spelt out here rather than taken from `fixtureCorpus`'s `severityWithOptions`
 * because both channels feed it: a docs `// eslint-options:` hint is a single
 * object, a fixture's `options` is the RuleTester options ARRAY, and both end up
 * as `['error', ...options]`. Note what this is not: `severityWithOptions` is a
 * severity entry, not a rules object, so spreading it into one injects
 * `{"0":"e","1":"r",...}` and drops the options entirely.
 */
const severityFor = (options: readonly unknown[] | null) =>
  options && options.length ? ['error', ...options] : 'error';

/** The rule set a consumer actually runs, every rule at `error`. */
const OBSERVER_RULES: Record<string, 'error'> = Object.fromEntries(
  recommendedRuleNames.map((name) => [PREFIX + name, 'error' as const]),
);

export type Counts = Record<string, number>;

/**
 * Report counts per rule for `code`, with the whole recommended config enabled
 * and fixing off.
 *
 * Returns null when the snippet does not parse: an unparsed snippet ran no rule
 * at all, so counting zero for it would silently pass anything.
 */
export function observe(
  code: string,
  filename: string,
  scopedRule?: string,
  scopedOptions?: readonly unknown[] | null,
  testCase?: FixtureCase,
): Counts | null {
  const rules =
    scopedRule && scopedOptions && scopedOptions.length
      ? {
          ...OBSERVER_RULES,
          [PREFIX + scopedRule]: severityFor(scopedOptions),
        }
      : OBSERVER_RULES;

  let messages;
  try {
    messages = linter.verify(
      code,
      buildConfig(filename, rules as Linter.Config['rules'], testCase),
      { filename },
    );
  } catch {
    return null;
  }
  if (messages.some((message) => message.fatal)) return null;

  const counts: Counts = {};
  for (const message of messages) {
    if (!message.ruleId?.startsWith(PREFIX)) continue;
    const name = message.ruleId.slice(PREFIX.length);
    counts[name] = (counts[name] || 0) + 1;
  }
  return counts;
}

export type CorpusEntry = {
  rule: string;
  /**
   * How the transform reaches a consumer. `fix` is the output of the multi-pass
   * fix loop; `suggestion` is one editor-accepted edit applied alone.
   */
  kind: 'fix' | 'suggestion';
  line: number;
  /** Where the input came from, so a finding is reproducible by hand. */
  origin: string;
  filename: string;
  /**
   * The options the snippet was fixed AND observed under, as a RuleTester
   * options array. A docs `// eslint-options:` hint arrives as a one-element
   * array; a harvested fixture's own `options` arrives verbatim.
   */
  options: readonly unknown[] | null;
  /**
   * The harvested fixture this entry came from, when it came from one. It
   * carries the parser and parser options its author declared, which is what
   * keeps a non-TypeScript fixture from being observed as a fatal parse.
   */
  testCase?: FixtureCase;
  before: string;
  after: string;
};

/** Every documented snippet that the owning rule's fixer actually rewrites. */
function buildDocsCorpus(): CorpusEntry[] {
  const corpus: CorpusEntry[] = [];

  for (const rule of fixableRuleNames) {
    const docPath = path.join(DOCS_DIR, `${rule}.md`);
    if (!fs.existsSync(docPath)) continue;

    const blocks = extractBlocks(fs.readFileSync(docPath, 'utf8')).filter(
      (block) => LINTABLE_LANGS.has(block.lang),
    );

    for (const block of blocks) {
      const hint = optionsHint(block.code);
      const options = hint === null ? null : [hint];
      const rules = {
        [PREFIX + rule]: severityFor(options),
      } as Linter.Config['rules'];
      const jsxish = block.lang === 'tsx' || block.lang === 'jsx';
      const hinted = filenameHint(block.code);
      const candidates = hinted
        ? [hinted]
        : FILENAME_CANDIDATES.map((candidate) =>
            anchor(jsxish ? candidate.replace(/\.ts$/, '.tsx') : candidate),
          );

      for (const filename of candidates) {
        let result;
        try {
          result = linter.verifyAndFix(
            block.code,
            buildConfig(filename, rules),
            { filename },
          );
        } catch {
          // Rule crashes are a separate, already-guarded axis.
          continue;
        }
        if (!result.fixed || result.output === block.code) continue;
        corpus.push({
          rule,
          kind: 'fix',
          line: block.line,
          origin: `docs/rules/${rule}.md:${block.line}`,
          filename,
          options,
          before: block.code,
          after: result.output,
        });
        break;
      }

      // Always also fix under a `.dynamic` filename, whether or not a candidate
      // above already matched, so the suffix-gated rules stay reachable.
      if (!hinted && !jsxish) {
        const filename = anchor(DYNAMIC_FILENAME_CANDIDATE);
        try {
          const result = linter.verifyAndFix(
            block.code,
            buildConfig(filename, rules),
            { filename },
          );
          if (result.fixed && result.output !== block.code) {
            corpus.push({
              rule,
              kind: 'fix',
              line: block.line,
              origin: `docs/rules/${rule}.md:${block.line}`,
              filename,
              options,
              before: block.code,
              after: result.output,
            });
          }
        } catch {
          // Rule crashes are a separate, already-guarded axis.
        }
      }
    }
  }
  return corpus;
}

/** Every harvested `RuleTester` case, keyed by rule and carrying its options. */
const fixtureCorpus = harvestFixtureCorpus();

/** Non-vacuity accounting for the fixture channel; every field is asserted. */
const fixtureStats = {
  considered: 0,
  /** Cases whose owning rule's fixer rewrote them under the authentic name. */
  rewritten: 0,
  /** Cases the fan-out below rescued, i.e. rewritten only under another path. */
  rescuedByFanOut: 0,
  /** Cases that transformed nowhere. Silence here is a fact, not a defect. */
  inert: 0,
  /**
   * Cases the rule threw on. Counted and ASSERTED rather than swallowed: a skip
   * counter no expectation reads discards inputs in silence, which is how a
   * corpus shrinks without anything going red (#2222).
   */
  crashed: 0,
  /** Fixture-derived entries whose case declared non-default options. */
  optionedPairs: 0,
};

/**
 * Which filename a harvested fixture is probed under.
 *
 * Two independent questions supply a filename, and neither answer substitutes
 * for the other:
 *
 *   - `defaultFilenameFor` answers a question about the CODE. An extension
 *     fixes the TypeScript `ScriptKind`, and `ecmaFeatures.jsx` does NOT
 *     override it, so a fixture holding JSX under a `.ts` path is a FATAL
 *     parse — indistinguishable from a silent rule once messages are filtered
 *     by `ruleId`, and worth 106 valid cases across 7 rules the last time a
 *     guard took the tester's word for it (#1984).
 *   - `FILENAME_CANDIDATES` answers a question about the PATH. Rules keyed on
 *     cloud-function entry points, test-file exemptions, component directories
 *     and the `.dynamic` suffix are silent anywhere else, and a single
 *     hard-coded path leaves their fixers unexercised (#1599).
 *
 * So both are used, in this order. A fixture that DECLARES a filename keeps it
 * outright: its author chose the path the fixture is about, and overriding that
 * would probe a configuration nobody wrote. A fixture that declares none is
 * probed first under its authentic, code-derived name. The path fan-out is a
 * SECOND CHANCE only — and, following `fixtureCorpus`'s own measurement that
 * blanket re-probing costs 3.5x for zero extra rules covered, it is spent per
 * RULE rather than per case: a rule that transformed nothing at all anywhere is
 * exactly the case where the fan-out buys something. Each candidate's extension
 * follows the one the CODE picked, so the fan-out cannot reintroduce the fatal
 * parse it is layered on top of.
 */
const fanOutCandidates = (testCase: FixtureCase): string[] => {
  // A JSON or Markdown fixture re-probed under a TypeScript path is parsed as
  // TypeScript and reads as a rule that fell silent.
  if (testCase.filename || testCase.language !== 'ts') return [];
  const jsxish = defaultFilenameFor(testCase).endsWith('.tsx');
  return FILENAME_CANDIDATES.map((candidate) =>
    anchor(jsxish ? candidate.replace(/\.ts$/, '.tsx') : candidate),
  );
};

/**
 * Whether the `.dynamic` suffix is worth a SEPARATE pass for this fixture.
 *
 * Held apart from the candidate list because the two are consumed differently:
 * a candidate list is searched until one filename yields, whereas the suffix
 * pass runs in ADDITION to whatever the search found — `DYNAMIC_FILENAME_CANDIDATE`
 * documents why. A `.tsx` fixture is excluded because the suffix rules key on
 * `.dynamic.ts`.
 */
const wantsDynamicPass = (testCase: FixtureCase): boolean =>
  !testCase.filename &&
  testCase.language === 'ts' &&
  !defaultFilenameFor(testCase).endsWith('.tsx');

const fanOutFilenames = (testCase: FixtureCase): string[] => [
  ...fanOutCandidates(testCase),
  ...(wantsDynamicPass(testCase) ? [anchor(DYNAMIC_FILENAME_CANDIDATE)] : []),
];

/** The one entry a fixture yields under `filename`, or null if it is inert. */
function fixtureEntry(
  rule: string,
  testCase: FixtureCase,
  filename: string,
): CorpusEntry | null {
  const options = testCase.options?.length ? testCase.options : null;
  let result;
  try {
    result = linter.verifyAndFix(
      testCase.code,
      buildConfig(
        filename,
        { [PREFIX + rule]: severityFor(options) } as Linter.Config['rules'],
        testCase,
      ),
      { filename },
    );
  } catch {
    // Rule crashes are a separate, already-guarded axis.
    fixtureStats.crashed++;
    return null;
  }
  if (!result.fixed || result.output === testCase.code) return null;
  return {
    rule,
    kind: 'fix',
    line: 0,
    origin: `src/tests/${testCase.origin} (${testCase.bucket}) ${
      options ? `options ${JSON.stringify(options)}` : 'no options'
    }`,
    filename,
    options,
    testCase,
    before: testCase.code,
    after: result.output,
  };
}

/**
 * The fixture channel: the inputs the documented blocks provably cannot reach.
 *
 * `optioned` is the whole point of #2224 — a fixer's output can depend on an
 * option, and every option-dependent output was previously judged only at its
 * default. `unexercised` closes the reachability residue the docs channel
 * leaves: `prefer-params-over-parent-id` (a cloud-function-path rule, so the
 * `.f.ts` candidate above exists partly for it) contributed ZERO pairs, and
 * `no-unpinned-dependencies` and `enforce-typescript-markdown-code-blocks` are
 * unreachable from a TypeScript-only harness at all. All three ship
 * `recommended: 'error'` with a fixer.
 */
function buildFixtureCorpus(docsExercised: ReadonlySet<string>): CorpusEntry[] {
  const corpus: CorpusEntry[] = [];

  for (const rule of fixableRuleNames) {
    const wholeRule = !docsExercised.has(rule);
    const cases = (fixtureCorpus.byRule.get(rule) || []).filter(
      (testCase) => wholeRule || Boolean(testCase.options?.length),
    );

    const inert: FixtureCase[] = [];
    for (const testCase of cases) {
      fixtureStats.considered++;
      const entry = fixtureEntry(
        rule,
        testCase,
        testCase.filename || defaultFilenameFor(testCase),
      );
      if (!entry) {
        inert.push(testCase);
        continue;
      }
      fixtureStats.rewritten++;
      if (entry.options) fixtureStats.optionedPairs++;
      corpus.push(entry);
    }

    // Per RULE, not per case: see `fanOutFilenames`. This rescues ZERO cases as
    // measured — every fixable rule is already reached under an authentic
    // filename — and is kept because the cost is one pass over the rules that
    // transformed nothing, while the alternative is a silent hole the day a
    // path-keyed rule's fixtures stop declaring their own filename. The same
    // candidates are load-bearing on the suggestion channel, where they are
    // worth 15 of its 271 pairs.
    if (corpus.some((entry) => entry.rule === rule)) {
      fixtureStats.inert += inert.length;
      continue;
    }
    for (const testCase of inert) {
      const rescued = fanOutFilenames(testCase)
        .map((filename) => fixtureEntry(rule, testCase, filename))
        .find(Boolean);
      if (!rescued) {
        fixtureStats.inert++;
        continue;
      }
      fixtureStats.rescuedByFanOut++;
      if (rescued.options) fixtureStats.optionedPairs++;
      corpus.push(rescued);
    }
  }
  return corpus;
}

const applyEdit = (
  text: string,
  fix: { range: readonly number[]; text: string },
) => text.slice(0, fix.range[0]) + fix.text + text.slice(fix.range[1]);

/**
 * One output per emitted suggestion, each applied ALONE to `code`.
 *
 * Never composed and never looped: ESLint hands a suggestion to an editor one
 * at a time, so a state reached by stacking two of them — or by re-running the
 * rule on its own suggestion's output — is not a state a consumer can be in,
 * and a finding against one would be unactionable.
 */
function suggestionOutputs(
  code: string,
  filename: string,
  rules: Linter.Config['rules'],
  ruleId: string,
  testCase?: FixtureCase,
): string[] {
  let messages;
  try {
    messages = linter.verify(code, buildConfig(filename, rules, testCase), {
      filename,
    });
  } catch {
    // Rule crashes are a separate, already-guarded axis.
    return [];
  }
  if (messages.some((message) => message.fatal)) return [];

  const outputs: string[] = [];
  for (const message of messages) {
    if (message.ruleId !== ruleId) continue;
    for (const suggestion of message.suggestions || []) {
      if (!suggestion.fix) continue;
      const output = applyEdit(code, suggestion.fix);
      if (output !== code) outputs.push(output);
    }
  }
  return outputs;
}

/** Every snippet on which a suggestion-emitting rule offers an edit. */
function buildSuggestionCorpus(): CorpusEntry[] {
  const corpus: CorpusEntry[] = [];

  const collect = (
    rule: string,
    origin: string,
    line: number,
    code: string,
    options: readonly unknown[] | null,
    candidates: string[],
    dynamicPass: boolean,
    testCase?: FixtureCase,
  ) => {
    const rules = {
      [PREFIX + rule]: severityFor(options),
    } as Linter.Config['rules'];

    for (const filename of candidates) {
      const outputs = suggestionOutputs(
        code,
        filename,
        rules,
        PREFIX + rule,
        testCase,
      );
      if (!outputs.length) continue;
      for (const after of outputs) {
        corpus.push({
          rule,
          kind: 'suggestion',
          line,
          origin,
          filename,
          options,
          testCase,
          before: code,
          after,
        });
      }
      break;
    }

    // The suffix-gated rules stay reachable on the suggestion path too; see
    // DYNAMIC_FILENAME_CANDIDATE for why this is not a candidate-list entry.
    if (!dynamicPass) return;
    const filename = anchor(DYNAMIC_FILENAME_CANDIDATE);
    for (const after of suggestionOutputs(
      code,
      filename,
      rules,
      PREFIX + rule,
      testCase,
    )) {
      corpus.push({
        rule,
        kind: 'suggestion',
        line,
        origin,
        filename,
        options,
        testCase,
        before: code,
        after,
      });
    }
  };

  const asTs = FILENAME_CANDIDATES.map((candidate) => anchor(candidate));
  const asTsx = FILENAME_CANDIDATES.map((candidate) =>
    anchor(candidate.replace(/\.ts$/, '.tsx')),
  );

  for (const rule of suggestionRuleNames) {
    const docPath = path.join(DOCS_DIR, `${rule}.md`);
    if (fs.existsSync(docPath)) {
      const blocks = extractBlocks(fs.readFileSync(docPath, 'utf8')).filter(
        (block) => LINTABLE_LANGS.has(block.lang),
      );
      for (const block of blocks) {
        const jsxish = block.lang === 'tsx' || block.lang === 'jsx';
        const hinted = filenameHint(block.code);
        collect(
          rule,
          `docs/rules/${rule}.md:${block.line}`,
          block.line,
          block.code,
          (() => {
            const hint = optionsHint(block.code);
            return hint === null ? null : [hint];
          })(),
          hinted ? [hinted] : jsxish ? asTsx : asTs,
          !hinted && !jsxish,
        );
      }
    }

    /**
     * The fixture channel, in place of a text scrape of the same test file.
     *
     * The documented blocks cannot reach every suggestion — the whole
     * `react-memoize-literals` doc set produces reports whose suggestions the
     * rule declines, so a docs-only corpus left the very rule that motivated
     * #1601 at zero — and the previous stand-in read `src/tests/<rule>.test.ts`
     * as TEXT and kept its static string literals. That loses two things at
     * once: a case assembled by interpolation is invisible, and a case that
     * does survive arrives stripped of the `options`, `filename` and
     * `parserOptions` it was written for, so it is probed under a configuration
     * its author never wrote (#1732, #2224).
     *
     * The whole fixture set is taken, not just the optioned part: this replaces
     * a channel that already took every literal in the file, and the five
     * suggesting rules are small enough that narrowing it would only lose
     * coverage.
     *
     * Each case is probed under its AUTHENTIC name first — the parser follows
     * the code rather than the tester, which is the fatal-parse trap — and the
     * path candidates follow only as a second chance, exactly as on the fix
     * channel. Dropping the fan-out here instead cost 93 pairs against the
     * scrape it replaced: the path-keyed rules are reachable from a fixture
     * only under a path that matches them.
     */
    for (const testCase of fixtureCorpus.byRule.get(rule) || []) {
      const options = testCase.options?.length ? testCase.options : null;
      collect(
        rule,
        `src/tests/${testCase.origin} (${testCase.bucket}) ${
          options ? `options ${JSON.stringify(options)}` : 'no options'
        }`,
        0,
        testCase.code,
        options,
        [
          testCase.filename || defaultFilenameFor(testCase),
          ...fanOutCandidates(testCase),
        ],
        wantsDynamicPass(testCase),
        testCase,
      );
    }
  }
  return corpus;
}

export type Finding = {
  pair: string;
  rule: string;
  introduced: string;
  line: number;
  origin: string;
  filename: string;
  before: number;
  after: number;
  /** The transformed text, so a finding can be triaged without re-running. */
  emitted: string;
};

/** Diff per-rule counts across the fix; a rise means the fixer introduced it. */
export function findIntroduced(entries: readonly CorpusEntry[]): Finding[] {
  const findings: Finding[] = [];

  for (const entry of entries) {
    const before = observe(
      entry.before,
      entry.filename,
      entry.rule,
      entry.options,
      entry.testCase,
    );
    const after = observe(
      entry.after,
      entry.filename,
      entry.rule,
      entry.options,
      entry.testCase,
    );
    if (!before || !after) continue;

    for (const introduced of Object.keys(after)) {
      if ((after[introduced] || 0) <= (before[introduced] || 0)) continue;
      findings.push({
        // Suggestion pairs carry their own key so the two baselines cannot
        // absorb each other's regressions.
        pair:
          entry.kind === 'suggestion'
            ? `${entry.rule} (suggestion) -> ${introduced}`
            : `${entry.rule} -> ${introduced}`,
        rule: entry.rule,
        introduced,
        line: entry.line,
        origin: entry.origin,
        filename: entry.filename,
        before: before[introduced] || 0,
        after: after[introduced],
        emitted: entry.after,
      });
    }
  }
  return findings;
}

/**
 * Fixer -> introduced-rule pairs the shipped config produces today, keyed
 * `<fixer> -> <rule it makes report>`.
 *
 * EVERY ENTRY IS AN UNRESOLVED DESIGN QUESTION FROM #1477, NOT ACCEPTED
 * BEHAVIOUR. Resolving one is a product call — either the fixer declines the
 * rewrite, or the rule it upsets learns to accept the shape a fixer emits — so
 * they are recorded rather than guessed at. Anything NOT listed here fails this
 * suite, which is the point: the next #1474 (fixers injecting an import
 * `enforce-dynamic-imports` rejected, 129 consumer files) goes red at the commit
 * that introduces it.
 *
 * Do not add an entry to make a build green. An entry is a promise that someone
 * decided the contradiction is acceptable for now.
 */
export const FIX_INDUCED_BASELINE: Record<string, string> = {
  // --- The fix hoists or rewrites a declaration at module scope, and a rule
  // that polices module scope then objects. Root cause 2 in #1477 (55 consumer
  // hits). Open question: should the fixer keep the declaration scoped, or
  // should the module-scope rules exempt a declaration they did not previously
  // see?
  'no-empty-dependency-use-callbacks -> export-if-in-doubt':
    'the callback is hoisted to module scope, where export-if-in-doubt demands it be exported',
  'no-empty-dependency-use-callbacks -> vertically-group-related-functions':
    'the hoisted helper lands above its caller, which vertically-group-related-functions orders the other way',
  'enforce-global-constants -> export-if-in-doubt':
    'the constant is hoisted to module scope, where export-if-in-doubt demands it be exported',
  'prefer-union-from-const-array -> export-if-in-doubt':
    'the emitted const array and derived type are module-scope declarations export-if-in-doubt demands be exported',
  'prefer-type-over-interface -> export-if-in-doubt':
    'the interface becomes a module-scope type alias export-if-in-doubt demands be exported',
  'no-class-instance-destructuring -> export-if-in-doubt':
    'the destructure becomes a module-scope const export-if-in-doubt demands be exported',
  'no-class-instance-destructuring -> global-const-style':
    'the emitted module-scope const keeps its camelCase name, which global-const-style requires be UPPER_SNAKE_CASE',
  'no-unnecessary-destructuring -> export-if-in-doubt':
    'collapsing the rest pattern yields module-scope bindings export-if-in-doubt demands be exported',
  'no-useless-usememo-primitives -> global-const-style':
    'unwrapping the useMemo leaves a camelCase module-scope const, which global-const-style requires be UPPER_SNAKE_CASE',
  'require-memo -> export-if-in-doubt':
    'splitting `export function Panel` into an unexported `function PanelUnmemoized` plus `export const Panel = memo(...)` leaves the inner component a module-scope declaration export-if-in-doubt demands be exported. Reached only once the fixture channel landed (#2224); `--fix` under the full config does NOT clear it',

  // --- Unlike every other entry here, this one is NOT an open question. The
  // second rule's verdict is correct and its documented remedy converges: move
  // the constant to a non-dynamic module and import (or re-export) it, which
  // #1599 verified is silent AND idempotent under both rules. The pair is
  // recorded because the fix does move a snippet from silent to reporting, not
  // because anyone is deferring a decision. See the fixed-point test in
  // src/tests/no-static-constants-in-dynamic-files.test.ts.
  'prefer-union-from-const-array -> no-static-constants-in-dynamic-files':
    'the emitted module-scope `export const X = [...] as const` is genuinely static configuration living in a .dynamic file; the rule correctly says to move it out, and that remedy is a stable fixed point (#1599)',

  // --- The fix introduces a construct that a second rule then demands MORE of,
  // and the demand is a rename or an extra argument no fixer can supply. Same
  // shape as root cause 3 in #1477. Open question: should the fix decline
  // when it would trigger the second rule, or should the second rule ignore
  // fixer-introduced code?
  'enforce-assert-safe-object-key -> enforce-assert-throws':
    'the wrap makes the enclosing function a caller of an assert-prefixed helper, and enforce-assert-throws demands the function itself carry the assert prefix — a rename no fixer can supply. This is root cause 3 in #1477 (122 consumer hits), reachable from this corpus since the #1875 docs examples put bounded and unbounded lookups inside named functions',
  'prefer-map-over-conditional-dispatch -> enforce-assert-safe-object-key':
    'the emitted RECORD[key] lookup is exactly the dynamic key enforce-assert-safe-object-key requires be wrapped in assertSafe()',
  'require-memo -> memo-compare-deeply-complex-props':
    'wrapping the component in memo() makes memo-compare-deeply-complex-props demand a custom comparator for its complex props',
  'prefer-usecallback-over-usememo-for-functions -> no-empty-dependency-use-callbacks':
    'useMemo(() => fn, []) becomes useCallback(fn, []), and an empty dependency array is what no-empty-dependency-use-callbacks rejects',
  'enforce-early-destructuring -> react-memoize-literals':
    'the hoisted destructuring introduces an object literal recreated on every render',
  'require-hooks-default-params -> react-memoize-literals':
    'the `= {}` default parameter the fix adds is an object literal recreated on every render',

  // --- The fix changes what a pre-existing line comment sits above.
  // Open question: should a fixer relocate or rewrite comments it strands?
  //
  // The enforce-dynamic-firebase-imports entry that sat here is gone with
  // #1716: that fixer no longer rewrites the import in place, so no documented
  // snippet reaches prefer-block-comments-for-declarations through it.
  'prefer-usecallback-over-usememo-for-functions -> prefer-block-comments-for-declarations':
    'the rewritten call is a declaration, so a line comment above it now needs to be a block comment',

  // --- The fixer injects a STATIC import of a module the consumer named in an
  // option, and enforce-dynamic-imports rejects it. Filed as #2226: this is
  // root cause 1 of #1474 reintroduced through an OPTION rather than through a
  // new hardcoded specifier, which is why the allowlist guard in
  // src/tests/enforce-dynamic-imports.test.ts cannot see it — that guard
  // derives injected specifiers from the rule SOURCES, and a configured one is
  // not a literal there. Both defaults (`functions/src/util/hash/stableHash`)
  // are exempt via DEFAULT_INTERNAL_PREFIXES, so only a non-default source
  // reaches this, and only the fixture channel carries one (#2224). Measured:
  // `--fix` under the whole recommended config does NOT clear the report, and
  // the import feeds a useMemo call, so the dynamic form it asks for is not
  // available.
  'no-array-length-in-deps -> enforce-dynamic-imports':
    'the injected `import { makeHash } from <hashImport.source>` is an external static import under any source outside src/ or functions/, which enforce-dynamic-imports rejects and no fixer can make dynamic (#2226)',
  'enforce-stable-hash-spread-props -> enforce-dynamic-imports':
    'the injected `import { stableHashCustom } from <hashImport.source>` is an external static import under any source outside src/ or functions/, which enforce-dynamic-imports rejects and no fixer can make dynamic (#2226)',

  // --- Reached only once the fixture channel landed (#2224), because the
  // documented blocks produce no fix for this rule at all: it is keyed on the
  // cloud-function path in FILENAME_CANDIDATES and its docs snippets never
  // reach the fixer. Rewriting `change.after.ref.parent.id` to `params.userId`
  // both drops a declarator and moves what the surrounding declarations depend
  // on, which is what the three rules below notice.
  'prefer-params-over-parent-id -> prefer-destructuring-no-class':
    'substituting the params lookup leaves a destructuring pattern prefer-destructuring-no-class rejects; `--fix` under the whole config clears it in one converging pass',
  'prefer-params-over-parent-id -> logical-top-to-bottom-grouping':
    'the substituted binding no longer depends on the declaration above it, so logical-top-to-bottom-grouping orders the pair the other way; `--fix` under the whole config clears it in one converging pass',
  'prefer-params-over-parent-id -> extract-global-constants':
    "dropping the `change` declarator leaves `const tag = 'log'` alone in its statement, and a lone constant initialiser is what extract-global-constants demands be hoisted to module scope. Unlike its two siblings above, `--fix` under the whole config does NOT clear this one",

  // --- Option-dependent contradictions, invisible until the fixture channel
  // began carrying each fixture's own options (#2224). Both self-heal: `--fix`
  // under the whole recommended config ends with zero reports from the second
  // rule, so the only consumer who sees one is a consumer who does not run the
  // fixer to convergence.
  'no-explicit-return-type -> enforce-memoize-async':
    'under `allowVoidReturnTypes: false` the stripped annotation exposes an async method to enforce-memoize-async, which demands @Memoize(); that decorator is fixable and the file ends clean under `--fix`',
  'prefer-usecallback-over-usememo-for-functions -> use-latest-callback':
    'under `allowFunctionFactories: false` the emitted useCallback is what use-latest-callback rewrites to useLatestCallback; that rewrite is fixable and the file ends clean under `--fix`',
};

/**
 * The same contract for the suggestion path, keyed `<rule> (suggestion) ->
 * <rule it makes report>`.
 *
 * Held separately from `FIX_INDUCED_BASELINE` on purpose. A suggestion is not
 * applied by `--fix`, so the two deliveries have different remedies available:
 * a fixable follow-on violation self-heals on the fix path but is left standing
 * for whoever accepted the suggestion, and an entry here has to say which of
 * those it is. Both maps are subject to the same staleness check, so neither
 * can rot.
 */
export const SUGGESTION_INDUCED_BASELINE: Record<string, string> = {
  // --- #1478 shape 1 — a declaration hoisted to module scope, which the rules
  // policing module scope then object to — used to arrive here through
  // enforce-dynamic-firebase-imports' suggestion. #1716 removed the mechanism:
  // that suggestion no longer rewrites the import where it stands, so it emits
  // no module-scope const for global-const-style or export-if-in-doubt to
  // object to.

  // --- A second, unrelated mechanism reaches prefer-block-comments-for-
  // declarations through the same suggestion: removing the import deliberately
  // outlives its TRAILING comment (`import ...; // needed by run`), which then
  // stands alone on the line above the next declaration and becomes a leading
  // declaration comment. The pair was invisible while that rule attributed a
  // trailing comment to the declaration below it (#1779) — the report existed
  // before the suggestion too, so the count did not RISE. Correcting the
  // attribution is what exposed it.
  //
  // Resolved by design, not deferred, on the same ground as the entry below:
  // `--fix` under the full recommended config rewrites the stranded comment to
  // `/** needed by run */` in one converging pass and the file ends with zero
  // prefer-block-comments-for-declarations reports. Verified end to end with
  // verifyAndFix over the whole config for both filenames the corpus tries.
  'enforce-dynamic-firebase-imports (suggestion) -> prefer-block-comments-for-declarations':
    "the suggestion strands the removed import's trailing comment on its own line above the next declaration; that comment is fixable and the file ends clean under `--fix`",

  // --- A third mechanism, shared by the two entries below: relocating the
  // import into a concise-bodied async arrow means giving that arrow a block,
  // and both of these rules read a function's returned expression only out of a
  // BLOCK body. The object literal and the annotated `return` they object to
  // are written by the developer and unchanged by the suggestion — the block is
  // what makes an already-present violation visible to a reader that was
  // looking in the wrong place.
  //
  // Resolved by design, not deferred, on the same ground as the entry above:
  // `--fix` under the full recommended config appends the `as const` and drops
  // the redundant return annotation in one converging pass, and the file ends
  // with zero reports from either rule. Verified end to end with verifyAndFix
  // over the whole config for both filenames the corpus tries.
  'enforce-dynamic-firebase-imports (suggestion) -> enforce-object-literal-as-const':
    'the block the suggestion adds exposes the returned object literal to a rule that reads block bodies only; the missing `as const` is fixable and the file ends clean under `--fix`',
  'enforce-dynamic-firebase-imports (suggestion) -> no-type-assertion-returns':
    'the block the suggestion adds exposes the annotated `return` to a rule that reads block bodies only; the redundant annotation is fixable and the file ends clean under `--fix`',

  // --- Resolved by design, not deferred: `--fix` under the full recommended
  // config rewrites the emitted `useCallback(fn, deps)` into
  // `useLatestCallback(fn)` and the file ends with zero use-latest-callback
  // reports. Verified end to end with verifyAndFix over the whole config, so
  // the only consumer who ever sees this report is one who accepts the
  // suggestion and does not run the fixer.
  'react-memoize-literals (suggestion) -> use-latest-callback':
    'the suggestion emits useCallback, which use-latest-callback rewrites to useLatestCallback; that rewrite is fixable and the file ends clean under `--fix`',

  // --- The suggestion is deliberately incomplete. It injects a
  // `__TODO_MEMOIZATION_DEPENDENCIES__` placeholder precisely so the developer
  // cannot ship an accidental empty dependency array, and a comment-only array
  // is syntactically empty — which is exactly what enforce-global-constants
  // rejects. Supplying the real dependencies (`[delay]`) silences it, so the
  // report lives only for as long as the placeholder does. #1600 removed the
  // half of this pair where the literal closed over nothing and hoisting was
  // therefore the right advice; what remains closes over a value and cannot be
  // hoisted at all.
  'react-memoize-literals (suggestion) -> enforce-global-constants':
    "the emitted `[/* __TODO_MEMOIZATION_DEPENDENCIES__ */]` is a syntactically empty dependency array until the developer fills it in, which is the suggestion's stated contract; with real dependencies the report disappears",
};

const docsCorpus = buildDocsCorpus();
/**
 * Which fixable rules the documented blocks reach at all, computed BEFORE the
 * fixture channel runs: the fixture channel admits a rule's whole fixture set
 * precisely when the docs reach it not at all, so the two cannot be built in
 * the other order.
 */
const docsExercisedRules = new Set(docsCorpus.map((entry) => entry.rule));
const corpus = [...docsCorpus, ...buildFixtureCorpus(docsExercisedRules)];
const findings = findIntroduced(corpus);
const suggestionCorpus = buildSuggestionCorpus();
const suggestionFindings = findIntroduced(suggestionCorpus);
const observedPairs = new Set(
  [...findings, ...suggestionFindings].map((finding) => finding.pair),
);
const exercisedRules = new Set(corpus.map((entry) => entry.rule));
const suggestionExercisedRules = new Set(
  suggestionCorpus.map((entry) => entry.rule),
);

/**
 * Rules exercised under a NON-DEFAULT option, on either channel.
 *
 * Held apart from `exercisedRules` because the aggregate cannot see it: the
 * corpus was 828 pairs and 85 rules while carrying NINE optioned pairs across
 * TWO rules, and every floor in this file stayed green throughout (#2224). A
 * count of rules is the right denominator rather than a count of pairs, since
 * one rule with a large optioned fixture set would otherwise hold the total up
 * on its own.
 */
const optionedEntries = [...corpus, ...suggestionCorpus].filter(
  (entry) => entry.options !== null,
);
const optionedRules = new Set(optionedEntries.map((entry) => entry.rule));

/**
 * The transform-bearing rules that HAVE a non-default option to be probed
 * under, which is the denominator #2224 measured at 4 of 35. A rule with no
 * optioned fixture anywhere cannot be reached under one by any channel, so it
 * belongs outside the ratio rather than inside it as a permanent shortfall.
 */
const optionedAndFixable = fixableRuleNames.filter((rule) =>
  (fixtureCorpus.byRule.get(rule) || []).some(
    (testCase) => testCase.options?.length,
  ),
);
const optionedAndFixableReached = optionedAndFixable.filter((rule) =>
  optionedRules.has(rule),
);
const suggestionFixturePairs = suggestionCorpus.filter((entry) =>
  Boolean(entry.testCase),
).length;

describe('the recommended config is closed under its own autofixes', () => {
  it('introduces no fix-induced violation outside the documented baseline', () => {
    const unlisted = findings.filter(
      (finding) => !(finding.pair in FIX_INDUCED_BASELINE),
    );
    if (unlisted.length > 0) {
      const byPair = new Map<string, Finding[]>();
      for (const finding of unlisted) {
        byPair.set(finding.pair, [
          ...(byPair.get(finding.pair) || []),
          finding,
        ]);
      }
      throw new Error(
        [
          `${byPair.size} fixer(s) produce code the recommended config rejects:`,
          ...[...byPair.entries()].map(([pair, hits]) =>
            [
              `  ${pair} (${hits.length} documented snippet(s))`,
              ...hits.map(
                (hit) =>
                  `    ${hit.origin} as ${hit.filename}: ${hit.introduced} ${hit.before} -> ${hit.after}`,
              ),
            ].join('\n'),
          ),
          '',
          'Running `eslint --fix` now leaves a consumer with a violation the fix',
          'created. Make the fixer emit code the config accepts, or — if the',
          'contradiction needs a product decision — add the pair to',
          'FIX_INDUCED_BASELINE with the reason, referencing #1477.',
        ].join('\n'),
      );
    }
    expect(unlisted).toEqual([]);
  });

  it('carries no stale baseline entry', () => {
    const stale = Object.keys(FIX_INDUCED_BASELINE).filter(
      (pair) => !observedPairs.has(pair),
    );
    if (stale.length > 0) {
      throw new Error(
        [
          'FIX_INDUCED_BASELINE lists pair(s) this corpus no longer reproduces:',
          ...stale.map((pair) => `  ${pair} — ${FIX_INDUCED_BASELINE[pair]}`),
          '',
          'Either the contradiction was resolved (delete the entry) or the',
          'documented snippet that reached it was edited away (restore coverage).',
          'A stale entry silently absorbs the next real regression.',
        ].join('\n'),
      );
    }
    expect(stale).toEqual([]);
  });
});

describe('the recommended config is closed under its own suggestions', () => {
  it('introduces no suggestion-induced violation outside the documented baseline', () => {
    const unlisted = suggestionFindings.filter(
      (finding) => !(finding.pair in SUGGESTION_INDUCED_BASELINE),
    );
    if (unlisted.length > 0) {
      const byPair = new Map<string, Finding[]>();
      for (const finding of unlisted) {
        byPair.set(finding.pair, [
          ...(byPair.get(finding.pair) || []),
          finding,
        ]);
      }
      throw new Error(
        [
          `${byPair.size} suggestion(s) produce code the recommended config rejects:`,
          ...[...byPair.entries()].map(([pair, hits]) =>
            [
              `  ${pair} (${hits.length} snippet(s))`,
              ...hits
                .slice(0, 3)
                .map(
                  (hit) =>
                    `    ${hit.origin} as ${hit.filename}: ${hit.introduced} ${hit.before} -> ${hit.after}\n` +
                    `    emitted:\n${hit.emitted.replace(/^/gm, '      ')}`,
                ),
            ].join('\n'),
          ),
          '',
          'Accepting this suggestion in an editor now leaves a consumer with a',
          'violation the suggestion created — and unlike a fix, nothing re-ran',
          'the loop to clean up after it. Make the suggestion emit code the',
          'config accepts, or — if the contradiction needs a product decision —',
          'add the pair to SUGGESTION_INDUCED_BASELINE with the reason,',
          'referencing #1601.',
        ].join('\n'),
      );
    }
    expect(unlisted).toEqual([]);
  });

  it('carries no stale suggestion baseline entry', () => {
    const stale = Object.keys(SUGGESTION_INDUCED_BASELINE).filter(
      (pair) => !observedPairs.has(pair),
    );
    if (stale.length > 0) {
      throw new Error(
        [
          'SUGGESTION_INDUCED_BASELINE lists pair(s) this corpus no longer',
          'reproduces:',
          ...stale.map(
            (pair) => `  ${pair} — ${SUGGESTION_INDUCED_BASELINE[pair]}`,
          ),
          '',
          'Either the contradiction was resolved (delete the entry) or the',
          'documented snippet that reached it was edited away (restore coverage).',
          'A stale entry silently absorbs the next real regression.',
        ].join('\n'),
      );
    }
    expect(stale).toEqual([]);
  });
});

/**
 * Anti-vacuity controls. A closure guard over a corpus that trips no fixer
 * passes forever while asserting nothing, so the corpus is measured, the
 * observer is proven to report at all, and the detector is proven to catch a
 * planted regression.
 */
describe('the closure guard is load-bearing', () => {
  it('exercises most of the fixable rules in the recommended config', () => {
    // Guards the denominator: if rule registration broke, a high ratio over a
    // tiny rule set would still look healthy.
    expect(fixableRuleNames.length).toBeGreaterThanOrEqual(80);
    // 83 of 83 — EVERY fixable rule, where the documented blocks alone reached
    // 71. The three the docs channel cannot reach at all are named in their own
    // test below, so this total cannot go back to 80 without something going
    // red. Floors sit just under the measurement, per the floor-drift
    // discipline: the floors that hid #1984 sat at 5,500 against 8,141.
    expect(exercisedRules.size).toBeGreaterThanOrEqual(83);
    expect(corpus.length).toBeGreaterThanOrEqual(590);
    // The fixture channel is the half the documented blocks cannot supply;
    // floored separately so a regression to a docs-only corpus cannot hide
    // inside the total above.
    expect(corpus.length - docsCorpus.length).toBeGreaterThanOrEqual(170);
    expect(docsCorpus.length).toBeGreaterThanOrEqual(420);
  });

  /**
   * The option axis, floored SEPARATELY from the aggregate above.
   *
   * The aggregate cannot see this and never could: at 828 pairs over 85 rules
   * the corpus carried NINE optioned pairs across TWO rules, and every floor in
   * this file was green (#2224). A floor on optioned pairs alone would still be
   * satisfiable by one rule with a big fixture set, so the RULE count is floored
   * too, and both sit just under the measurement per the floor-drift discipline
   * — the floors that hid #1984 sat at 5,500 against an actual 8,141.
   */
  it('exercises the option-dependent fixers under their real options', () => {
    console.log(
      `[recommended-config-fix-closure] ${corpus.length} fix pairs ` +
        `(${docsCorpus.length} documented, ${
          corpus.length - docsCorpus.length
        } fixture) over ${exercisedRules.size}/${
          fixableRuleNames.length
        } fixable rules (${
          docsExercisedRules.size
        } reached by documented blocks alone); ${
          suggestionCorpus.length
        } suggestion pairs over ${suggestionExercisedRules.size}/${
          suggestionRuleNames.length
        } rules; ${optionedEntries.length} optioned pairs over ${
          optionedRules.size
        } rules; fixtures ` +
        `considered=${fixtureStats.considered} rewritten=${fixtureStats.rewritten} rescuedByFanOut=${fixtureStats.rescuedByFanOut} inert=${fixtureStats.inert} crashed=${fixtureStats.crashed}`,
    );

    // 156 optioned pairs over 34 rules, against NINE over TWO before #2224.
    expect(optionedEntries.length).toBeGreaterThanOrEqual(148);
    expect(optionedRules.size).toBeGreaterThanOrEqual(32);

    // Of the rules that are BOTH optioned and transform-bearing, how many are
    // reached under a real non-default option — the ratio #2224 measured at
    // 4 of 35. Floored as a RATIO rather than a count so that deleting an
    // optioned fixture cannot satisfy it by shrinking the denominator.
    expect(optionedAndFixable.length).toBeGreaterThanOrEqual(32);
    // 32 of 35, against the 4 of 35 #2224 measured.
    expect(optionedAndFixableReached.length).toBeGreaterThanOrEqual(32);
    // Named rather than floored, so a FOURTH rule dropping out goes red and so
    // does one of these three starting to produce a pair. Each is measured, and
    // none is a gap in this channel: the option either silences the rule
    // outright or the fixer declines, and a rule that emits no rewrite cannot
    // introduce a violation with one.
    //
    //   no-useless-usememo-primitives      27 optioned cases, 0 REPORT at all
    //   prefer-getter-over-parameterless-method  9 of 18 report, 0 rewritten
    //   no-usememo-for-pass-by-value        4 of 4 report, 0 rewritten
    expect(
      optionedAndFixable.filter((rule) => !optionedRules.has(rule)).sort(),
    ).toEqual([
      'no-useless-usememo-primitives',
      'no-usememo-for-pass-by-value',
      'prefer-getter-over-parameterless-method',
    ]);

    // Non-vacuity of the option channel itself: an entry's options must reach
    // the linter, not merely be recorded on the entry. `hashImport` names a
    // module that appears in NO default and in no documented block, so a pair
    // mentioning it can only exist if the fixture's own options were honoured.
    const optionDependentOutput = optionedEntries.filter(
      (entry) =>
        entry.after.includes('shared/hash') ||
        entry.after.includes('my/custom/hash/module') ||
        entry.after.includes('app/utils/stableHash'),
    );
    expect(optionDependentOutput.length).toBeGreaterThanOrEqual(4);
  });

  /**
   * Fixture accounting. Every counter the channel keeps is read by an
   * expectation here: a skip counter nothing asserts on discards its inputs in
   * silence, which is how a corpus shrinks with the build staying green
   * (#2222). `inert` is deliberately allowed to be large — a fixture the rule
   * does not rewrite is a fact about the fixture — but `crashed` is not, and
   * `considered` floors the whole channel.
   */
  it('accounts for every fixture it was handed', () => {
    // 694 considered, of which 178 rewritten and 516 inert.
    expect(fixtureStats.considered).toBeGreaterThanOrEqual(660);
    expect(
      fixtureStats.rewritten +
        fixtureStats.rescuedByFanOut +
        fixtureStats.inert +
        fixtureStats.crashed,
    ).toBe(fixtureStats.considered);
    expect(fixtureStats.crashed).toBe(0);
    expect(fixtureStats.rewritten).toBeGreaterThanOrEqual(170);
    // The harvest itself must not have silently collapsed. 13,754 cases over
    // the whole plugin is the pool this channel selects from; a floor here is
    // what separates "the filter admitted little" from "the harvest returned
    // nothing".
    expect(fixtureCorpus.failures).toEqual([]);
    expect(fixtureCorpus.totalCases).toBeGreaterThanOrEqual(13000);
  });

  /**
   * The three fixable rules the documented blocks reach not at all, and which
   * the fixture channel exists to recover.
   *
   * `prefer-params-over-parent-id` is the cloud-function-path rule the `.f.ts`
   * entry in FILENAME_CANDIDATES was added for, and it contributed zero pairs
   * from the docs channel for as long as this guard has existed. The other two
   * are unreachable from a TypeScript-only harness at all. All three ship
   * `recommended: 'error'` with a fixer.
   */
  it('reaches the fixable rules no documented block reaches', () => {
    const recovered = [
      'prefer-params-over-parent-id',
      'no-unpinned-dependencies',
      'enforce-typescript-markdown-code-blocks',
    ];
    expect(recovered.filter((rule) => docsExercisedRules.has(rule))).toEqual(
      [],
    );
    expect(recovered.filter((rule) => exercisedRules.has(rule))).toEqual(
      recovered,
    );
    // Both non-TypeScript languages are actually driven, not merely admitted.
    const languages = new Set(
      corpus
        .map((entry) => entry.testCase?.language)
        .filter((language): language is string => Boolean(language)),
    );
    expect([...languages].sort()).toEqual(['json', 'markdown', 'ts']);
  });

  it('reaches every library a shipped fixer statically imports', () => {
    // Direct coverage of the #1474 axis. Each of these must be newly present in
    // some fixed output, or a regression in `DEFAULT_IGNORED_LIBRARIES` would
    // go unnoticed for that library.
    const unreached = FIXER_INJECTED_LIBRARIES.filter(
      (library) =>
        !corpus.some(
          (entry) =>
            entry.after.includes(`'${library}'`) &&
            !entry.before.includes(`'${library}'`),
        ),
    );
    expect(unreached).toEqual([]);
  });

  it('observes reports at all (positive control)', () => {
    // A silently-empty observer would make every count diff zero and the whole
    // suite vacuously green.
    const counts = observe(
      'export const x = { a: 1 };\nexport const y = x.a === 1 ? 1 : 2;\n',
      '/repo/src/util/helper.ts',
    );
    expect(counts).not.toBeNull();
    expect(Object.keys(counts as Counts).length).toBeGreaterThan(0);
  });

  it('is deterministic, so a count diff means something', () => {
    for (const entry of corpus.slice(0, 20)) {
      const first = observe(
        entry.after,
        entry.filename,
        entry.rule,
        entry.options,
      );
      const second = observe(
        entry.after,
        entry.filename,
        entry.rule,
        entry.options,
      );
      expect(second).toEqual(first);
    }
  });

  it('treats an unparseable snippet as unobservable, not clean', () => {
    // Counting zero for a snippet no rule ran on would pass anything.
    expect(observe('const = ;', '/repo/src/util/helper.ts')).toBeNull();
  });

  it('detects a planted fix-induced violation (control)', () => {
    // Reproduces the #1474 shape without touching any rule: a "fix" that adds a
    // static import of a library `enforce-dynamic-imports` does not ignore.
    const planted: CorpusEntry = {
      rule: 'planted-fixer',
      kind: 'fix',
      line: 1,
      origin: 'planted control',
      filename: '/repo/src/util/helper.ts',
      options: null,
      before: 'export const value = 1;\n',
      after:
        "import helper from 'not-an-ignored-library';\nexport const value = helper;\n",
    };
    const planted_findings = findIntroduced([planted]);
    expect(planted_findings.map((finding) => finding.pair)).toContain(
      'planted-fixer -> enforce-dynamic-imports',
    );

    // The same detector must stay silent when the fix introduces nothing.
    const inert: CorpusEntry = {
      ...planted,
      after: 'export const value = 1;\n',
    };
    expect(findIntroduced([inert])).toEqual([]);
  });
});

/**
 * Anti-vacuity controls for the suggestion path (#1601). The fix-path controls
 * above prove nothing about it: a suggestion is reached through
 * `message.suggestions`, which `verifyAndFix` never touches, so the extraction
 * and the detection are both planted here end to end — from a real registered
 * rule emitting a real suggestion, not from a hand-written `after` string.
 */
const PLANTED_SUGGESTER = 'planted/suggests-static-import';
const PLANTED_INERT_SUGGESTER = 'planted/suggests-nothing-of-note';

/* eslint-disable @typescript-eslint/no-explicit-any */
const plantSuggestionRule = (id: string, replacement: string) =>
  linter.defineRule(id, {
    meta: {
      type: 'suggestion',
      hasSuggestions: true,
      schema: [],
      messages: { report: 'planted', suggest: 'planted suggestion' },
    },
    create(context: any) {
      return {
        VariableDeclarator(node: any) {
          if (node.id.type !== 'Identifier' || node.id.name !== 'value') return;
          context.report({
            node,
            messageId: 'report',
            suggest: [
              {
                messageId: 'suggest',
                fix: (fixer: any) =>
                  fixer.replaceTextRange(
                    [0, context.getSourceCode().getText().length],
                    replacement,
                  ),
              },
            ],
          });
        },
      };
    },
  } as never);
/* eslint-enable @typescript-eslint/no-explicit-any */

plantSuggestionRule(
  PLANTED_SUGGESTER,
  "import helper from 'not-an-ignored-library';\nexport const value = helper;\n",
);
plantSuggestionRule(PLANTED_INERT_SUGGESTER, 'export const value = 2;\n');

const plantedEntries = (id: string, rule: string): CorpusEntry[] => {
  const before = 'export const value = 1;\n';
  const filename = '/repo/src/util/helper.ts';
  return suggestionOutputs(
    before,
    filename,
    { [id]: 'error' } as Linter.Config['rules'],
    id,
  ).map((after) => ({
    rule,
    kind: 'suggestion' as const,
    line: 1,
    origin: 'planted control',
    filename,
    options: null,
    before,
    after,
  }));
};

describe('the suggestion closure guard is load-bearing', () => {
  it('extracts and applies a planted suggestion at all', () => {
    // `verifyAndFix` returns this snippet unchanged, so a harness that only
    // knows about fixes would build an empty suggestion corpus and pass forever.
    const entries = plantedEntries(PLANTED_SUGGESTER, 'planted-suggester');
    expect(entries).toHaveLength(1);
    expect(entries[0].after).not.toBe(entries[0].before);
  });

  it('detects a planted suggestion-induced violation (control)', () => {
    const findingsForPlanted = findIntroduced(
      plantedEntries(PLANTED_SUGGESTER, 'planted-suggester'),
    );
    expect(findingsForPlanted.map((finding) => finding.pair)).toContain(
      'planted-suggester (suggestion) -> enforce-dynamic-imports',
    );

    // The same detector must stay silent when the suggestion introduces
    // nothing, so a green run means the corpus is clean and not that the
    // detector fires on everything.
    expect(
      findIntroduced(plantedEntries(PLANTED_INERT_SUGGESTER, 'planted-inert')),
    ).toEqual([]);
  });

  it('exercises every suggestion-emitting rule in the recommended config', () => {
    expect(suggestionRuleNames.length).toBeGreaterThanOrEqual(5);
    /**
     * A per-rule floor, not a total: one rule contributing hundreds of
     * suggestions would hold a total up while another quietly stopped emitting
     * any and dropped out of every assertion above.
     */
    const emittedPerRule = Object.fromEntries(
      suggestionRuleNames.map((rule) => [
        rule,
        suggestionCorpus.filter((entry) => entry.rule === rule).length > 0,
      ]),
    );
    expect(emittedPerRule).toEqual(
      Object.fromEntries(suggestionRuleNames.map((rule) => [rule, true])),
    );
    expect(suggestionExercisedRules.size).toBe(suggestionRuleNames.length);
    // 271, against 349 under the string-literal scrape this channel replaced.
    // The drop is not lost coverage: the scrape's extra rows were describe
    // TITLES, `messages` templates and single-line FRAGMENTS split out of a
    // multi-line example, none of which is a fixture. Measured over the same
    // five rules, the scrape yielded 1,014 snippets and the harvest yields
    // 1,042 real cases, and every entry in SUGGESTION_INDUCED_BASELINE still
    // reproduces — which the staleness check above enforces.
    expect(suggestionCorpus.length).toBeGreaterThanOrEqual(258);
    // The fixture half specifically, so a regression to docs-only blocks —
    // which reach no suggestion for react-memoize-literals at all (#1601) —
    // cannot hide inside the total.
    expect(suggestionFixturePairs).toBeGreaterThanOrEqual(200);
  });
});

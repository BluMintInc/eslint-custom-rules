import fs from 'fs';
import path from 'path';
import { Linter } from 'eslint';
import { parse as estreeParse } from '@typescript-eslint/typescript-estree';
import {
  harvestRuleTesterCases,
  HarvestResult,
} from './harvestRuleTesterCases';

/**
 * The fixture corpus every fixer guard probes, keyed by RULE NAME.
 *
 * The guards used to build this by text-parsing `src/tests/<rule>.test.ts` and
 * keeping the static string literals, which loses two things at once. A case
 * assembled by interpolation is invisible — `no-usememo-for-pass-by-value`
 * prepends a shared `typedPrelude` to all 64 of its cases and yielded exactly
 * ONE snippet — and a snippet that does survive arrives stripped of the
 * `filename` and `options` it was written for, so it is probed under a
 * configuration its author never wrote (#1732).
 *
 * `harvestRuleTesterCases` loads each suite with `run` shadowed, so the real
 * case objects are captured: interpolated code, options, filename and
 * parserOptions together. This module is the adapter between that raw capture
 * and what a `Linter`-based guard needs.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as {
  rules: Record<string, { meta?: { hasSuggestions?: boolean } }>;
};
/* eslint-enable @typescript-eslint/no-var-requires */

const RULES_DIR = path.join(__dirname, '..', 'rules');

let rawHarvest: HarvestResult | null = null;

/**
 * The one harvest a module registry gets.
 *
 * A second `harvestRuleTesterCases()` call in the same registry returns ZERO
 * suites: the suite files are already in the require cache, so requiring them
 * again re-executes nothing and their `run` calls never fire, while
 * `filesLoaded` still counts every file. A guard that harvests twice therefore
 * runs its second corpus over nothing and reports a clean sweep. Every consumer
 * — including one that wants both the raw suites and the adapted corpus below —
 * goes through this.
 */
export function harvestOnce(): HarvestResult {
  if (!rawHarvest) rawHarvest = harvestRuleTesterCases();
  return rawHarvest;
}

/**
 * Which array a snippet came out of. A fixer must converge, type-check and
 * resolve its references identically whichever it is, so the bucket is carried
 * for reporting rather than for filtering — except that an `output` is by
 * construction an ALREADY-FIXED state, which makes it the cheapest available
 * probe of "does the fixer fire again on its own result".
 */
export type FixtureBucket = 'valid' | 'invalid' | 'output';

/**
 * The language a fixture is written in, which is what picks its parser and the
 * extension of the filename it is probed under.
 *
 * A fixture's language is a property of the TESTER that declared it, not of the
 * rule: `ruleTesterJson` fixes `jsonc-eslint-parser` and `ruleTesterMarkdown`
 * fixes `markdown-eslint-parser`, and a rule may declare suites under more than
 * one (`prefer-nullish-coalescing-boolean-props` declares both TS and JSON).
 */
export type FixtureLanguage = 'ts' | 'json' | 'markdown';

export type FixtureCase = {
  code: string;
  /** Only when the case declares one; a guard supplies its own default. */
  filename?: string;
  options?: readonly unknown[];
  parserOptions?: Record<string, unknown>;
  /** Which shared tester declared it, which fixes the parser. */
  tester: string;
  /** The tester's language, so a guard can select the matching parser. */
  language: FixtureLanguage;
  /** Declaring suite file, so a finding is reproducible by hand. */
  origin: string;
  bucket: FixtureBucket;
};

export type FixtureCorpus = {
  byRule: Map<string, FixtureCase[]>;
  /** Suites whose rule object is not in the plugin's map, `file::name`. */
  suitesDropped: string[];
  /** Suites harvested under a non-TypeScript parser, `file::name`. */
  suitesNonTs: string[];
  suitesUsed: number;
  totalCases: number;
  /** Non-vacuity accounting: a silent drop here would fake a clean sweep. */
  filesLoaded: number;
  failures: string[];
};

/** The testers whose parser is `@typescript-eslint/parser`. */
export const TS_TESTERS = new Set(['ruleTesterTs', 'ruleTesterJsx']);

/**
 * Every shared tester, mapped to the language its parser reads.
 *
 * The non-TS testers used to be DISCARDED here, which cost two registered rules
 * their entire corpus: `no-unpinned-dependencies` declares only under
 * `ruleTesterJson` and `enforce-typescript-markdown-code-blocks` only under
 * `ruleTesterMarkdown`, so both had zero fixtures while every harvest-based
 * guard iterated over them, found nothing to drive, and passed. Both ship
 * `recommended: 'error'` with `fixable: 'code'` — they autofix consumer code and
 * no repo-wide guard had ever exercised them (#1860).
 *
 * Carrying the language rather than dropping the case is what makes them
 * probeable without manufacturing noise: a JSON fixture handed to
 * `@typescript-eslint/parser` under a `.tsx` filename is a FATAL parse, and
 * since every consumer filters messages by `ruleId`, that fatal is
 * indistinguishable from the rule staying silent. A guard reads the language,
 * picks the parser with `parserKeyFor` and the extension with
 * `defaultFilenameFor`, and the fixture is linted as its author wrote it.
 *
 * `src/tests/fixture-corpus-accounting.test.ts` asserts this map covers every
 * tester `ruleTester.ts` exports, so adding a tester without a language here
 * fails the build instead of silently reinstating the drop.
 */
export const LANGUAGE_BY_TESTER: Record<string, FixtureLanguage> = {
  ruleTesterTs: 'ts',
  ruleTesterJsx: 'ts',
  ruleTesterJson: 'json',
  ruleTesterMarkdown: 'markdown',
};

/** The parser module each language is parsed with. */
export const PARSER_MODULE_BY_LANGUAGE: Record<FixtureLanguage, string> = {
  ts: '@typescript-eslint/parser',
  json: 'jsonc-eslint-parser',
  markdown: 'markdown-eslint-parser',
};

/**
 * The `Linter` parser key a case must be linted under. Guards register the
 * parsers with `defineCorpusParsers` and then pass this as `parser`, so a case
 * is never parsed by a parser for another language.
 */
export const parserKeyFor = (testCase: FixtureCase): FixtureLanguage =>
  testCase.language;

/**
 * Registers every corpus parser on a `Linter` under its language key.
 *
 * Required lazily so the published `lib/` does not pull the JSON and Markdown
 * parsers into a consumer's process: only guards call this.
 */
export function defineCorpusParsers(linter: Linter): void {
  for (const [language, moduleId] of Object.entries(
    PARSER_MODULE_BY_LANGUAGE,
  )) {
    /* eslint-disable @typescript-eslint/no-var-requires */
    linter.defineParser(language, require(moduleId));
    /* eslint-enable @typescript-eslint/no-var-requires */
  }
}

/**
 * Parser options that build a TypeScript PROGRAM. A guard driving a bare
 * `Linter` has none, and honouring these would make it spend seconds per case
 * constructing one from the repo's own tsconfig — or throw, since a fixture's
 * relative `project` is resolved against whatever cwd the runner happens to
 * have. Stripped rather than dropped: the snippet still exercises every
 * syntactic path of the rule.
 */
const PROGRAM_OPTIONS = new Set([
  'project',
  'projectService',
  'programs',
  'tsconfigRootDir',
  'EXPERIMENTAL_useProjectService',
]);

const withoutProgramOptions = (
  raw: unknown,
): Record<string, unknown> | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (PROGRAM_OPTIONS.has(key)) continue;
    out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
};

/**
 * Rules whose SOURCE mentions the checker API.
 *
 * This is a text fact about the implementation, and nothing more. It says a rule
 * asks the checker a question somewhere — possibly in a comment, a guarded
 * fallback, or a branch that only runs when a program exists. It does NOT say
 * the rule is undrivable without one: measured over their own fixtures under a
 * bare `Linter`, every one of these 16 reports (500+ reports, 0 crashes)
 * (#1859). Two reasons, and the second is the surprising one:
 *
 *   - the type query is usually one predicate inside a rule whose remaining
 *     paths are purely syntactic, so stripping it removes a filter, not the
 *     rule; and
 *   - `@typescript-eslint/parser` hands back parser services with a program even
 *     when no `project` is configured — it builds an ISOLATED single-file one.
 *     `services.program` is therefore never absent here, so the guard `if
 *     (!services?.program) return;` that rules use never fires. What is missing
 *     is cross-FILE resolution: an imported symbol's type comes back as `any`
 *     or an error type, which changes an answer rather than withholding it.
 *
 * Guards therefore must not exclude this set to avoid a "false clean" — use
 * `silentWithoutProgramRuleNames`, which is measured. This set survives because
 * it is still the right answer to a different question: which rules have a
 * behaviour a bare `Linter` cannot reproduce, and so may report DIFFERENTLY here
 * than in production. A guard that needs to discount such a divergence names the
 * rule explicitly rather than dropping all 16.
 *
 * Read from the rule sources rather than `String(rule.create)`, since
 * `createRule` wraps `create` and stringifying it matches nothing.
 */
export const typeAwareRuleNames = new Set(
  fs
    .readdirSync(RULES_DIR)
    .filter((file) => file.endsWith('.ts'))
    .filter((file) =>
      /getParserServices|getTypeChecker/.test(
        fs.readFileSync(path.join(RULES_DIR, file), 'utf8'),
      ),
    )
    .map((file) => path.basename(file, '.ts')),
);

/**
 * Rules a bare `Linter` genuinely cannot drive: over their own harvested
 * fixtures they produce ZERO reports, so a guard that counted them as "probed
 * and clean" would be manufacturing a false clean rather than a finding.
 *
 * MEASURED, not inferred. Each entry is a rule for which the corpus below yields
 * no report at all under this harness's own parser options, filenames and
 * options. `src/tests/type-aware-drivability.test.ts` accounts for the whole of
 * `typeAwareRuleNames` two ways — every member either reports measurably or is
 * listed here — so an entry that starts reporting FAILS that suite instead of
 * quietly holding an exemption open.
 *
 * Hard-coded rather than recomputed: measuring it costs a full lint of every
 * candidate rule's corpus, and a set derived at import time would pay that on
 * each of the twelve guards that consume it.
 *
 * EMPTY BY DESIGN. No such rule currently exists — all 16 members of
 * `typeAwareRuleNames` report. It is kept as the place an exemption must be
 * written, so that skipping a rule is a named, reviewable act with a measurement
 * behind it instead of a set membership nobody can see.
 *
 * An entry is a rule NAME plus the reason it produces nothing, e.g. a rule whose
 * every report site sits behind a cross-file symbol resolution the isolated
 * program cannot perform. Excluding a rule from ONE guard because its findings
 * there are artifacts is a different thing and does not belong here: keep those
 * at the (guard, rule) level in that guard's own baseline, since a rule-global
 * entry un-gates every other arm the rule participates in (#1839).
 */
export const silentWithoutProgramRuleNames = new Set<string>([]);

/**
 * Registered rules allowed to have NO fixture in the corpus, each with the
 * reason.
 *
 * A rule with no corpus is the worst possible state for a harvest-based guard:
 * seventeen of them iterate `byRule`, find nothing to drive, and pass. The rule
 * is counted as covered while asserting nothing, and nothing in the build says
 * so. That is exactly how `no-unpinned-dependencies` and
 * `enforce-typescript-markdown-code-blocks` — both `recommended: 'error'`, both
 * `fixable: 'code'` — went unexercised (#1860).
 *
 * EMPTY BY DESIGN. Every registered rule has fixtures. This is kept as the place
 * an exemption must be written so that a rule dropping out of the corpus is a
 * named, reviewable act rather than a silent absence.
 * `src/tests/fixture-corpus-accounting.test.ts` closes both directions: an
 * unlisted rule with no corpus fails, and a listed rule that HAS a corpus fails
 * as a stale entry.
 */
export const rulesWithoutCorpus = new Map<string, string>([]);

/**
 * Harvested suites whose `rule` object is not a registered plugin rule, each
 * with the reason it is not one.
 *
 * `suitesDropped` is otherwise a silent hole in the corpus: a suite whose rule
 * fails identity lookup contributes nothing, and a real rule that stopped being
 * exported from `src/index.ts` would land here and take its whole fixture set
 * out of every guard without failing anything. Every entry is an inline
 * throwaway rule object declared in the suite itself, which is legitimate — and
 * asserted, so a registered rule can never join them unnoticed.
 *
 * Keyed `<suite file>::<display name passed to run>`.
 */
export const suitesWithoutRegisteredRule = new Map<string, string>([
  [
    'no-restricted-properties-object-keys-values.test.ts::no-restricted-properties-object-keys-values',
    "declares an inline no-op rule to demonstrate a CORE rule's behaviour on Object.keys()/values(); nothing in this plugin is under test",
  ],
  [
    'rule-tester-parse-mode.test.ts::shared-tester-ts-parses-as-module',
    'declares an inline probe rule that asserts the shared tester parses as an ES module; it pins parser configuration, not a plugin rule',
  ],
  [
    'rule-tester-parse-mode.test.ts::shared-tester-ts-has-no-global-top-level-bindings',
    'declares an inline probe rule that asserts top-level bindings land in a module scope, not the global one',
  ],
  [
    'rule-tester-parse-mode.test.ts::shared-tester-jsx-parses-as-module',
    'the JSX tester arm of the same parse-mode probe',
  ],
  [
    'rule-tester-parse-mode.test.ts::shared-tester-jsx-has-no-global-top-level-bindings',
    'the JSX tester arm of the same scope-shape probe',
  ],
]);

/**
 * Rule name resolved by OBJECT IDENTITY, never by the display name `run`
 * received: ~100 of the ~310 suites pass a name that is not a rule name
 * (`requireMemo`, `prefer-next-dynamic (JSX scenarios)`), and name-keyed
 * matching silently drops every case they declare. Identity holds because the
 * suites and `../index` resolve to the same module instance under jest.
 */
export const ruleNameByIdentity = new Map<unknown, string>(
  Object.entries(plugin.rules).map(([name, rule]) => [rule, name]),
);

const parsesWithJsx = (code: string, jsx: boolean): boolean => {
  try {
    // `range`/`loc` are not optional in practice: without them any comment in
    // the snippet throws, which reads as an unparsable fixture.
    estreeParse(code, { jsx, range: true, loc: true });
    return true;
  } catch {
    return false;
  }
};

/** Decided once per snippet+preference; the corpus reprobes the same code. */
const extensionByCode = new Map<string, string>();

/**
 * `.ts` and `.tsx` are not ordered by permissiveness, so neither one can be the
 * blanket default: only `.ts` accepts the angle-bracket assertion `<T>expr`, and
 * only `.tsx` accepts JSX. The tester supplies a PREFERENCE, and the snippet
 * overrides it only when that preference cannot parse the snippet at all.
 *
 * Taking the tester's word for it instead makes a JSX fixture in a `ruleTesterTs`
 * suite a FATAL parse. Every consumer filters messages by `ruleId`, so the fatal
 * is indistinguishable from the rule staying silent — a false clean over 168
 * cases, four fifths of some rules' corpora. The converse costs one case: an
 * angle-bracket assertion declared in a `ruleTesterJsx` suite.
 *
 * Correcting only on a fatal is what keeps this from churning: a snippet legal
 * both ways stays on the extension it has always been probed under, so no
 * path-gated rule silently changes which fixtures reach it.
 */
const extensionFor = (code: string, preferred: string): string => {
  const key = `${preferred}\u0000${code}`;
  const cached = extensionByCode.get(key);
  if (cached) return cached;
  const alternate = preferred === '.tsx' ? '.ts' : '.tsx';
  // Only a `<` can make the two disagree, so the common case never parses.
  const extension =
    !code.includes('<') || parsesWithJsx(code, preferred === '.tsx')
      ? preferred
      : parsesWithJsx(code, alternate === '.tsx')
      ? alternate
      : preferred;
  extensionByCode.set(key, extension);
  return extension;
};

/**
 * The filename a case is probed under when it declares none.
 *
 * `RuleTester` passes `undefined` in that situation, which ESLint renders as
 * `<input>` — a name with no extension, under which every path-gated rule is
 * silent and contributes nothing. A bare `file`/`react` basename is the smallest
 * departure that keeps those rules reachable.
 */
export const defaultFilenameFor = (testCase: FixtureCase) => {
  if (testCase.filename) return testCase.filename;
  /**
   * A non-TS fixture gets the name its language is actually gated on rather
   * than an extension-corrected `.ts`: `no-unpinned-dependencies` reads a
   * dependency map, and `enforce-typescript-markdown-code-blocks` returns an
   * empty visitor for any path not ending `.md`, so a wrong extension makes the
   * rule silent on its own fixtures.
   */
  if (testCase.language === 'json') return 'package.json';
  if (testCase.language === 'markdown') return 'docs/example.md';
  const jsxTester = testCase.tester === 'ruleTesterJsx';
  const basename = jsxTester ? 'react' : 'file';
  return `${basename}${extensionFor(
    testCase.code,
    jsxTester ? '.tsx' : '.ts',
  )}`;
};

/**
 * Second-chance filenames, used ONLY for a rule that produced no probe at all
 * under the authentic one.
 *
 * Probing every case under every one of these is what the text-harvest guards
 * did, and it is 3.5x the work for zero extra rules covered (measured: 8,433
 * fix pairs over 81 rules with the fan-out, 2,652 over the same 81 without).
 * Spending that budget on the pairs a cap would otherwise drop is worth more
 * than re-probing the same snippet under a path its author never wrote — but a
 * rule that would otherwise be UNPROBED is the one case where the fan-out buys
 * something, so it is kept for exactly that.
 */
export const FALLBACK_FILENAMES = [
  '/repo/src/components/Widget.tsx',
  '/repo/src/util/helper.ts',
  '/repo/src/util/helper.test.ts',
  '/repo/src/__tests__/helper.test.ts',
  '/repo/functions/src/util/helper.test.ts',
  '/repo/functions/src/callable/handler.ts',
  '/repo/src/pages/index.tsx',
];

/**
 * The fan-out above is a list of TypeScript paths, so a JSON or Markdown case
 * re-probed under it would be parsed as TypeScript and read as a rule that fell
 * silent. Each non-TS language gets the paths its own rules are gated on.
 */
const FALLBACK_FILENAMES_BY_LANGUAGE: Record<FixtureLanguage, string[]> = {
  ts: FALLBACK_FILENAMES,
  json: ['/repo/package.json', '/repo/functions/package.json'],
  markdown: ['/repo/README.md', '/repo/docs/rules/example.md'],
};

export const fallbackFilenamesFor = (testCase: FixtureCase) =>
  FALLBACK_FILENAMES_BY_LANGUAGE[testCase.language];

/**
 * The parser options a case is probed under: the harness's own, overridden by
 * whatever the fixture declared, with `jsx` merged rather than replaced so a
 * case that declares an unrelated `ecmaFeatures` does not silently turn JSX
 * parsing off for itself.
 *
 * A non-TS case gets only what its own tester declares. `sourceType: 'module'`
 * and a JSX `ecmaFeatures` mean nothing to the JSON and Markdown parsers, and
 * the baseline `ecmaVersion` is the one `ruleTesterJson` itself sets.
 */
export const parserOptionsFor = (testCase: FixtureCase) => {
  const declared = testCase.parserOptions || {};
  if (testCase.language === 'json') return { ecmaVersion: 2020, ...declared };
  if (testCase.language === 'markdown') return { ...declared };
  const features = (declared.ecmaFeatures || {}) as Record<string, unknown>;
  return {
    ecmaVersion: 2022,
    sourceType: 'module',
    ...declared,
    ecmaFeatures: { jsx: true, ...features },
  };
};

/**
 * Rules that offer suggestions. `--fix` never applies one, so a guard driving
 * `verifyAndFix` (or reading a fixture's `output`) probes the fix channel
 * exclusively and every transform these rules emit stays unexamined (#1733).
 */
export const suggestionRuleNames = Object.entries(plugin.rules)
  .filter(([, rule]) => rule?.meta?.hasSuggestions)
  .map(([name]) => name)
  .sort();

export type SuggestionEdit = {
  /** Stable identity within one lint of one source, `<report>:<suggestion>`. */
  slot: string;
  /** Which rule offered it, so a multi-rule lint still names the culprit. */
  ruleId: string;
  messageId: string;
  desc: string;
  /** The source with THIS suggestion applied, and nothing else. */
  output: string;
};

const applyEdit = (
  text: string,
  fix: { range: readonly number[]; text: string },
) => text.slice(0, fix.range[0]) + fix.text + text.slice(fix.range[1]);

/**
 * Every state a user can reach by accepting ONE suggestion from `messages`.
 *
 * Three semantics are load-bearing, and each is a way the probe would otherwise
 * judge a suggestion against a state nobody can produce:
 *   - ALONE. Each edit lands on the untouched source. Accepting two suggestions
 *     from one report is not reachable — the first rewrite invalidates the
 *     second's ranges — and neither is feeding the result back through a fix
 *     loop, which is what `verifyAndFix` would do.
 *   - ONE STEP. The output is a single accepted suggestion, not a fixed point.
 *     A suggestion is an offer, so the contract is progress, not closure.
 *   - A `fix()` returning `null` is a DECLINE, not a defect. ESLint drops those
 *     silently before the message is built, so they never arrive here; an edit
 *     that changes nothing is discarded for the same reason.
 */
export function suggestionEditsOf(
  code: string,
  messages: readonly Linter.LintMessage[],
  /** Restricts to one rule; omitted, every reporting rule contributes. */
  ruleId?: string,
): SuggestionEdit[] {
  const edits: SuggestionEdit[] = [];
  messages.forEach((message, messageIndex) => {
    if (ruleId && message.ruleId !== ruleId) return;
    (message.suggestions || []).forEach((suggestion, suggestionIndex) => {
      if (!suggestion.fix) return;
      const output = applyEdit(code, suggestion.fix);
      if (output === code) return;
      edits.push({
        slot: `${messageIndex}:${suggestionIndex}`,
        ruleId: message.ruleId || '',
        messageId: message.messageId || message.message,
        desc: suggestion.desc,
        output,
      });
    });
  });
  return edits;
}

/** A case's options must reach the FIX pass, or the finding is a fabrication. */
export const severityWithOptions = (testCase: FixtureCase) =>
  testCase.options && testCase.options.length
    ? ['error', ...testCase.options]
    : 'error';

type RawCase = {
  code?: unknown;
  filename?: unknown;
  options?: unknown;
  parserOptions?: unknown;
  output?: unknown;
  errors?: unknown;
};

/** Already-fixed states a case declares: its `output`, and each suggestion's. */
const outputsOf = (testCase: RawCase): string[] => {
  const outputs: string[] = [];
  if (typeof testCase.output === 'string') outputs.push(testCase.output);
  if (!Array.isArray(testCase.errors)) return outputs;
  for (const error of testCase.errors) {
    const suggestions = (error as { suggestions?: unknown })?.suggestions;
    if (!Array.isArray(suggestions)) continue;
    for (const suggestion of suggestions) {
      const output = (suggestion as { output?: unknown })?.output;
      if (typeof output === 'string') outputs.push(output);
    }
  }
  return outputs;
};

let cached: FixtureCorpus | null = null;

/**
 * Harvested once per process. Loading ~270 suites is the dominant cost of every
 * consumer, and a second call would pay it again for a corpus that cannot have
 * changed.
 */
export function harvestFixtureCorpus(): FixtureCorpus {
  if (cached) return cached;

  const harvested = harvestOnce();
  const byRule = new Map<string, FixtureCase[]>();
  const suitesDropped: string[] = [];
  const suitesNonTs: string[] = [];
  let suitesUsed = 0;
  let totalCases = 0;

  for (const suite of harvested.suites) {
    const name = ruleNameByIdentity.get(suite.rule);
    if (!name) {
      suitesDropped.push(`${suite.file}::${suite.name}`);
      continue;
    }
    /**
     * Recorded, not skipped. A non-TS suite carries its language on every case
     * so a guard can lint it with the parser its author declared; discarding it
     * is what left two registered rules with no corpus at all (#1860).
     */
    const language = LANGUAGE_BY_TESTER[suite.tester] ?? 'ts';
    if (!TS_TESTERS.has(suite.tester)) {
      suitesNonTs.push(`${suite.file}::${suite.name}`);
    }
    suitesUsed++;

    const cases = byRule.get(name) || [];
    /**
     * Deduped on the whole configuration, not on the code: the same snippet
     * probed under different options is a different probe, and several suites
     * declare exactly that pair to pin an option's effect. The language is part
     * of the configuration — the same text is a different probe under a
     * different parser.
     */
    const keyOf = (testCase: FixtureCase) =>
      JSON.stringify([
        testCase.code,
        testCase.options,
        testCase.filename,
        testCase.parserOptions,
        testCase.language,
      ]);
    const seen = new Set(cases.map(keyOf));

    const push = (
      code: string,
      raw: RawCase,
      bucket: FixtureBucket,
      parserOptions: Record<string, unknown> | undefined,
    ) => {
      const testCase: FixtureCase = {
        code,
        filename: typeof raw.filename === 'string' ? raw.filename : undefined,
        options: Array.isArray(raw.options)
          ? (raw.options as readonly unknown[])
          : undefined,
        parserOptions,
        tester: suite.tester,
        language,
        origin: suite.file,
        bucket,
      };
      const key = keyOf(testCase);
      if (seen.has(key)) return;
      seen.add(key);
      cases.push(testCase);
      totalCases++;
    };

    const collect = (raw: unknown, bucket: 'valid' | 'invalid') => {
      const declared = (
        typeof raw === 'string' ? { code: raw } : raw
      ) as RawCase | null;
      if (!declared || typeof declared.code !== 'string') return;
      const parserOptions = withoutProgramOptions(declared.parserOptions);
      push(declared.code, declared, bucket, parserOptions);
      for (const output of outputsOf(declared)) {
        push(output, declared, 'output', parserOptions);
      }
    };

    for (const raw of suite.valid) collect(raw, 'valid');
    for (const raw of suite.invalid) collect(raw, 'invalid');
    byRule.set(name, cases);
  }

  cached = {
    byRule,
    suitesDropped,
    suitesNonTs,
    suitesUsed,
    totalCases,
    filesLoaded: harvested.filesLoaded,
    failures: harvested.failures,
  };
  return cached;
}

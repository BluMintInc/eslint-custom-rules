/**
 * No fixer may emit ESM-only syntax the consumer's CommonJS transform rejects.
 *
 * Generalizes #1716: `enforce-dynamic-firebase-imports` rewrote an
 * `ImportDeclaration` in place into `const { x } = await import('...')`. An
 * `ImportDeclaration` only ever sits at module scope, so the rewrite produced a
 * module-scope `await` — legal ESM, and a syntax error once the module is
 * compiled to CommonJS, which is exactly what agora's jest does
 * (`@babel/preset-env` targeting `node: 'current'`, no `modules: false`).
 *
 * Every other instrument in this repo is blind to the class by construction.
 * The RuleTester, the docs conformance suites and the real-code autofix sweeps
 * all validate output with `sourceType: 'module'`, where top-level `await`
 * parses cleanly. #1716 passed all of them and surfaced only through a
 * consumer's hand-written disable — its own fixture `output` had enshrined the
 * corruption as expected behaviour.
 *
 * Three corpora, because none covers the others:
 *
 *   A. DECLARED OUTPUTS — every `invalid` fixture's `output` string, and every
 *      `errors[].suggestions[].output` it declares. Pure text analysis, so it
 *      covers type-aware rules, which have no program here and would otherwise
 *      report nothing and manufacture a false clean.
 *   B. COMPOSED `--fix` — fixtures run through the whole recommended config, so
 *      a construct no single rule declares but the composition produces is
 *      still caught.
 *   C. ACCEPTED SUGGESTIONS — each suggestion applied alone to the fixture that
 *      triggered it. `--fix` never applies a suggestion, so corpus B cannot see
 *      this channel at all, and a fixture that declares no `suggestions` output
 *      keeps it out of corpus A too (#1733). It is the channel that most needs
 *      the check: `enforce-dynamic-firebase-imports`, the rule #1716 was filed
 *      against, is suggestion-bearing.
 *
 * `babel.transformSync` is NOT a usable oracle here: it happily emits the
 * `await` and only the evaluation step, inside the CommonJS module wrapper,
 * throws. The check is therefore syntactic, over the closed set of constructs
 * that require an ES module.
 *
 * All three corpora carry every tester's language and derive a fixture's
 * filename from its CODE, through `src/utils/fixtureCorpus`. Both are corpus
 * losses this guard has already paid for: dropping the non-TS testers cost two
 * `recommended: 'error'`, `fixable: 'code'` rules their entire corpus (#1860),
 * and a tester-derived `x.ts` made 41 fixtures a fatal parse that
 * `verifyAndFix` reported as an untouched file — indistinguishable from a
 * config that correctly changed nothing.
 */
import { Linter, Rule } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import {
  FixtureCase,
  FixtureLanguage,
  LANGUAGE_BY_TESTER,
  defaultFilenameFor,
  defineCorpusParsers,
  harvestFixtureCorpus,
  harvestOnce,
  parserKeyFor,
  parserOptionsFor,
  severityWithOptions,
  silentWithoutProgramRuleNames,
  suggestionEditsOf,
  suggestionRuleNames,
  typeAwareRuleNames,
} from '../utils/fixtureCorpus';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as {
  rules: Record<string, unknown>;
  configs: { recommended: { rules: Record<string, unknown> } };
};
/* eslint-enable @typescript-eslint/no-var-requires */

const PREFIX = '@blumintinc/blumint/';

const PARSE_OPTIONS = {
  ecmaVersion: 2022,
  sourceType: 'module',
  ecmaFeatures: { jsx: true },
  loc: true,
  range: true,
  tokens: true,
  comment: true,
} as const;

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The closed set of constructs a CommonJS module cannot host.
 *
 * `await` is judged by whether any enclosing *function* was entered, since that
 * is the only boundary that makes it legal. Class property initialisers and
 * static blocks are not function boundaries and cannot host an `await` either,
 * so treating only real functions as boundaries is the conservative reading.
 * `import.meta` is ESM-only at any depth — CommonJS has no meta property.
 */
function esmOnlyModuleScope(ast: any): string[] {
  const found: string[] = [];

  const walk = (node: any, insideFunction: boolean): void => {
    if (!node || typeof node.type !== 'string') return;

    if (!insideFunction) {
      if (node.type === 'AwaitExpression') {
        found.push(`top-level await@L${node.loc?.start?.line ?? 0}`);
      } else if (node.type === 'ForOfStatement' && node.await) {
        found.push(`top-level for-await@L${node.loc?.start?.line ?? 0}`);
      }
    }
    if (node.type === 'MetaProperty' && node.meta?.name === 'import') {
      found.push(`import.meta@L${node.loc?.start?.line ?? 0}`);
    }

    const nowInside = insideFunction || FUNCTION_TYPES.has(node.type);
    for (const key of Object.keys(node)) {
      if (key === 'parent' || key === 'loc' || key === 'range') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) walk(item, nowInside);
      } else if (child && typeof child.type === 'string') {
        walk(child, nowInside);
      }
    }
  };

  walk(ast, false);
  return found;
}

/**
 * `null` marks unparseable input, which is a different (already-guarded) axis.
 *
 * Both JSX modes are tried, because neither is more permissive than the other:
 * `ScriptKind.TSX` rejects the angle-bracket assertion `<T>expr` and
 * `ScriptKind.TS` rejects JSX. Judging a snippet by one mode alone turns every
 * fixture written in the other into a `null` the callers skip in silence, which
 * is the same false clean a tester-derived filename produces one layer down.
 */
function analyze(source: string): string[] | null {
  for (const jsx of [true, false]) {
    try {
      const { ast } = tsParser.parseForESLint(source, {
        ...PARSE_OPTIONS,
        ecmaFeatures: { jsx },
      } as any);
      return esmOnlyModuleScope(ast);
    } catch {
      continue;
    }
  }
  return null;
}

/** Rule name by OBJECT IDENTITY: ~100 suites pass a display name that is not a
 * rule name, and name-keyed matching silently drops every one of them. */
const ruleNameByIdentity = new Map<unknown, string>();
for (const [name, rule] of Object.entries(plugin.rules)) {
  ruleNameByIdentity.set(rule, name);
}

/**
 * Through the memoized accessor, because corpus C reads the adapted corpus from
 * the same harvest: a second raw harvest in this module registry would return
 * zero suites and empty whichever corpus asked for it second.
 */
const harvested = harvestOnce();

/**
 * A suite's language, from the tester that declared it.
 *
 * Every corpus below admits all three. Dropping the non-TS testers — which is
 * what this guard did, on the premise that "the TS parser cannot read them" —
 * cost two registered rules their ENTIRE corpus: `no-unpinned-dependencies`
 * declares only under `ruleTesterJson` and
 * `enforce-typescript-markdown-code-blocks` only under `ruleTesterMarkdown`, and
 * both ship `recommended: 'error'` with `fixable: 'code'`, so both rewrite
 * consumer code while contributing nothing here (#1860). The premise is also
 * false as stated: corpus A never parses under a rule's parser at all — it is
 * text analysis — and corpus B selects the parser per case, so neither needs the
 * drop.
 */
const languageOf = (tester: string): FixtureLanguage =>
  LANGUAGE_BY_TESTER[tester] ?? 'ts';

// ---------------------------------------------------------------------------
// Corpus A — declared fixture outputs
// ---------------------------------------------------------------------------
type DeclaredChannel = 'fix' | 'suggestion';

type OutputFinding = {
  rule: string;
  origin: string;
  channel: DeclaredChannel;
  constructs: string[];
  before: string;
  after: string;
};

const outputStats = {
  casesConsidered: 0,
  outputsAnalyzed: 0,
  suggestionOutputsAnalyzed: 0,
  rulesWithOutput: new Set<string>(),
  rulesWithSuggestionOutput: new Set<string>(),
  /**
   * Every skip is a fixture judged by nothing, so each is counted and pinned.
   * Split by language because the two are different facts: a TypeScript
   * fixture the detector cannot read is a hole, while a Markdown document that
   * is not also valid TypeScript is simply what Markdown is.
   */
  tsInputUnparseable: 0,
  nonTsInputUnparseable: 0,
  outputUnparseable: 0,
  /** The languages the corpus carries, asserted exactly rather than by floor. */
  languages: new Set<string>(),
  /**
   * What the non-TS testers contribute, which the tester drop cost entirely.
   * `nonTsOutputsAnalyzed` is the load-bearing half: an admitted fixture the
   * detector never reads is coverage on paper only.
   */
  nonTsOutputs: 0,
  nonTsOutputsAnalyzed: 0,
  nonTsRulesWithOutput: new Set<string>(),
};

const outputFindings: OutputFinding[] = [];

type DeclaredOutput = { text: string; channel: DeclaredChannel };

/**
 * Every already-fixed state a fixture declares: its `output` (a string, `null`,
 * or an array of passes) and the `output` of each suggestion its `errors` list.
 *
 * A suggestion output is the same kind of artefact as a fix output — a state
 * the rule promises to produce — so a construct enshrined in one is exactly as
 * corrupting as one enshrined in the other. `errors` is frequently a COUNT
 * rather than a list, which is not iterable.
 */
const outputsOf = (testCase: any): DeclaredOutput[] => {
  const outputs: DeclaredOutput[] = [];
  const out = testCase?.output;
  if (typeof out === 'string') outputs.push({ text: out, channel: 'fix' });
  if (Array.isArray(out)) {
    for (const one of out) {
      if (typeof one === 'string') outputs.push({ text: one, channel: 'fix' });
    }
  }
  if (!Array.isArray(testCase?.errors)) return outputs;
  for (const error of testCase.errors) {
    const suggestions = error?.suggestions;
    if (!Array.isArray(suggestions)) continue;
    for (const suggestion of suggestions) {
      if (typeof suggestion?.output === 'string') {
        outputs.push({ text: suggestion.output, channel: 'suggestion' });
      }
    }
  }
  return outputs;
};

for (const suite of harvested.suites) {
  const name = ruleNameByIdentity.get(suite.rule);
  if (!name) continue;
  const language = languageOf(suite.tester);

  for (const raw of suite.invalid) {
    const testCase = raw as any;
    if (!testCase || typeof testCase.code !== 'string') continue;
    outputStats.casesConsidered++;
    outputStats.languages.add(language);

    const outs = outputsOf(testCase);
    if (outs.length === 0) continue;
    if (language !== 'ts') {
      outputStats.nonTsOutputs += outs.length;
      outputStats.nonTsRulesWithOutput.add(name);
    }
    if (outs.some((one) => one.channel === 'fix')) {
      outputStats.rulesWithOutput.add(name);
    }
    if (outs.some((one) => one.channel === 'suggestion')) {
      outputStats.rulesWithSuggestionOutput.add(name);
    }

    const before = analyze(testCase.code);
    if (before === null) {
      if (language === 'ts') outputStats.tsInputUnparseable++;
      else outputStats.nonTsInputUnparseable++;
      continue;
    }

    for (const out of outs) {
      outputStats.outputsAnalyzed++;
      if (language !== 'ts') outputStats.nonTsOutputsAnalyzed++;
      if (out.channel === 'suggestion') outputStats.suggestionOutputsAnalyzed++;
      const after = analyze(out.text);
      if (after === null) {
        outputStats.outputUnparseable++;
        continue;
      }
      if (after.length > before.length) {
        outputFindings.push({
          rule: name,
          origin: `src/tests/${suite.file}`,
          channel: out.channel,
          constructs: after,
          before: testCase.code,
          after: out.text,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Corpus B — the recommended config's composed `--fix`
// ---------------------------------------------------------------------------
/**
 * The only exclusion is `silentWithoutProgramRuleNames` — rules MEASURED to
 * report nothing here, and so able to contribute only a false clean. This guard
 * previously dropped all 16 rules mentioning `getParserServices` with no stated
 * reason at all (#1879); measured, none of them emits CJS, so the set bought
 * nothing and cost fifteen rules' worth of coverage.
 */
const FIX_CONFIG: Record<string, unknown> = {};
for (const [id, severity] of Object.entries(plugin.configs.recommended.rules)) {
  if (!id.startsWith(PREFIX)) continue;
  const name = id.slice(PREFIX.length);
  if (!plugin.rules[name] || silentWithoutProgramRuleNames.has(name)) continue;
  FIX_CONFIG[id] = severity;
}

const linter = new Linter();
defineCorpusParsers(linter);
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}

/**
 * Stand-in culprit reproducing #1716's exact shape: rewrites a static import in
 * place into `const {...} = await import(...)`. An `ImportDeclaration` is always
 * module-scope, so the result is always a module-scope `await`.
 *
 * The control needs a fixer that provably emits the construct. Keying it to a
 * shipped rule would make the detector go vacuous the moment that rule is fixed
 * — which is the goal of this suite. Registered on the linter but kept out of
 * `FIX_CONFIG`, so it is invisible to the corpus scan.
 */
const CONTROL_DYNAMIC_ID = `${PREFIX}control-dynamic-importer`;
const controlDynamicImporter: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    schema: [],
    messages: { dynamic: 'Import "{{source}}" dynamically.' },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const source = String(node.source.value);
        if (!source.startsWith('control-target')) return;
        const named = node.specifiers.filter(
          (s) => s.type === 'ImportSpecifier',
        );
        if (named.length === 0) return;
        const bindings = named
          .map((s) => (s as any).local.name as string)
          .join(', ');
        context.report({
          node,
          messageId: 'dynamic',
          data: { source },
          fix: (fixer) =>
            fixer.replaceText(
              node,
              `const { ${bindings} } = await import('${source}');`,
            ),
        });
      },
    };
  },
};
linter.defineRule(CONTROL_DYNAMIC_ID, controlDynamicImporter);

/**
 * The same shape offered through `suggest` instead of `fix`, plus its opposite.
 *
 * Corpus C needs both polarities from a rule that cannot go quiet: a control
 * keyed to a shipped rule would stop proving anything the moment that rule is
 * fixed, and a detector only ever observed returning nothing is indistinguishable
 * from one that no longer works.
 */
const CONTROL_SUGGESTER_ID = `${PREFIX}control-dynamic-suggester`;
const CONTROL_SAFE_SUGGESTER_ID = `${PREFIX}control-safe-suggester`;

const suggestingRule = (
  marker: string,
  replacement: (bindings: string, source: string) => string,
): Rule.RuleModule => ({
  meta: {
    type: 'suggestion',
    hasSuggestions: true,
    schema: [],
    messages: {
      dynamic: 'Import "{{source}}" dynamically.',
      suggest: 'Convert to a dynamic import.',
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const source = String(node.source.value);
        if (!source.startsWith(marker)) return;
        const named = node.specifiers.filter(
          (specifier) => specifier.type === 'ImportSpecifier',
        );
        if (named.length === 0) return;
        const bindings = named
          .map((specifier) => (specifier as any).local.name as string)
          .join(', ');
        context.report({
          node,
          messageId: 'dynamic',
          data: { source },
          suggest: [
            {
              messageId: 'suggest',
              fix: (fixer) =>
                fixer.replaceText(node, replacement(bindings, source)),
            },
          ],
        });
      },
    };
  },
});

linter.defineRule(
  CONTROL_SUGGESTER_ID,
  suggestingRule(
    'control-target',
    (bindings, source) => `const { ${bindings} } = await import('${source}');`,
  ),
);
linter.defineRule(
  CONTROL_SAFE_SUGGESTER_ID,
  suggestingRule(
    'control-safe',
    (bindings, source) =>
      `const loadDeps = async () => {\n  const { ${bindings} } = await import('${source}');\n  return { ${bindings} };\n};`,
  ),
);

/**
 * The minimum a case must carry to be linted: enough to pick its parser.
 * `FixtureCase` satisfies it, so corpus B and corpus C share one config builder.
 */
type ProbedCase = {
  code: string;
  parserOptions?: Record<string, unknown>;
  tester: string;
  language: FixtureLanguage;
};

/**
 * The parser and its options are read from the CASE, never fixed to TypeScript:
 * a JSON or Markdown fixture handed to `@typescript-eslint/parser` is a fatal
 * parse, and this guard filters lint output by nothing but `fixed`/`ruleId`, so
 * that fatal is indistinguishable from every fixer leaving the file alone
 * (#1860).
 */
const configFor = (
  rules: Record<string, unknown>,
  testCase: ProbedCase,
): Linter.Config =>
  ({
    parser: parserKeyFor(testCase as FixtureCase),
    parserOptions: parserOptionsFor(testCase as FixtureCase),
    rules,
  } as unknown as Linter.Config);

type ComposedCase = ProbedCase & {
  filename: string;
  origin: string;
};

/**
 * Only fixtures that mention `import` or `await` can gain one of these
 * constructs, so restricting the composed corpus to them is strictly more
 * sensitive per case linted rather than a sampling compromise.
 */
const RELEVANT = /\bimport\b|\bawait\b/;

/**
 * Fixtures reaching the relevance filter, and the ones it admits, per language.
 *
 * Every fixture reaches this accounting, so "no JSON case is linted here" is a
 * measured consequence of the filter — no JSON fixture contains the token
 * `import` or `await` — rather than a tester drop nobody can see. A non-TS
 * fixture that does mention one is carried like any other.
 */
const composedSeen: Record<string, number> = {};
const composedCarried: Record<string, number> = {};

const composedCases: ComposedCase[] = [];
for (const suite of harvested.suites) {
  const name = ruleNameByIdentity.get(suite.rule);
  if (!name) continue;
  const language = languageOf(suite.tester);

  const push = (raw: unknown) => {
    const testCase = (typeof raw === 'string' ? { code: raw } : raw) as any;
    if (!testCase || typeof testCase.code !== 'string') return;
    composedSeen[language] = (composedSeen[language] || 0) + 1;
    if (!RELEVANT.test(testCase.code)) return;
    composedCarried[language] = (composedCarried[language] || 0) + 1;
    const probed: ProbedCase = {
      code: testCase.code,
      parserOptions: testCase.parserOptions,
      tester: suite.tester,
      language,
    };
    composedCases.push({
      ...probed,
      /**
       * `defaultFilenameFor`, not a tester-derived `x.ts`/`x.tsx`. A tester does
       * not determine the extension a fixture parses under: 39 fixtures in
       * `no-margin-properties` alone hold JSX under `ruleTesterTs`, and a `.ts`
       * name forces `ScriptKind.TS`, making each one a FATAL parse — measured at
       * 41 cases here, every one of which `verifyAndFix` reported as simply
       * unfixed and this guard counted as clean.
       */
      filename: testCase.filename || defaultFilenameFor(probed as FixtureCase),
      origin: `src/tests/${suite.file}`,
    });
  };
  for (const raw of suite.valid) push(raw);
  for (const raw of suite.invalid) push(raw);
}

type ComposedFinding = {
  origin: string;
  filename: string;
  constructs: string[];
  culprits: string[];
  before: string;
  after: string;
};

const composedStats = {
  considered: 0,
  rewritten: 0,
  /**
   * A case ESLint could not parse under the filename and parser this harness
   * chose for it. `verifyAndFix` reports it as `fixed: false` and an untouched
   * output — exactly what a config that legitimately changes nothing looks like
   * — so each one is a case judged by nothing and counted as clean. Asserted at
   * ZERO below, since a ceiling would let the next one hide inside it.
   */
  parseFatal: 0,
  /** Inputs and outputs the detector itself cannot read, likewise unjudged. */
  inputUnanalyzable: 0,
  outputUnanalyzable: 0,
};
const composedFindings: ComposedFinding[] = [];

/** Co-occurrence is not attribution: replay each fixer alone to name the culprit. */
function attributeCulprits(testCase: ComposedCase, baseline: number): string[] {
  const culprits: string[] = [];
  for (const [id, severity] of Object.entries(FIX_CONFIG)) {
    let alone;
    try {
      alone = linter.verifyAndFix(
        testCase.code,
        configFor({ [id]: severity }, testCase),
        { filename: testCase.filename },
      );
    } catch {
      continue;
    }
    if (!alone.fixed || alone.output === testCase.code) continue;
    const after = analyze(alone.output);
    if (after && after.length > baseline)
      culprits.push(id.slice(PREFIX.length));
  }
  return culprits;
}

/**
 * Whether ESLint can parse the case at all, under the very parser, options and
 * filename the fix pass uses. Run with no rules, so the answer is about the
 * input and nothing else — a fatal produced later by a fixer's own output is
 * `fixer-convergence`'s axis, not this one.
 */
const parsesUnderHarness = (testCase: ComposedCase): boolean => {
  try {
    return !linter
      .verify(testCase.code, configFor({}, testCase), {
        filename: testCase.filename,
      })
      .some((message) => message.fatal);
  } catch {
    return false;
  }
};

for (const testCase of composedCases) {
  composedStats.considered++;
  if (!parsesUnderHarness(testCase)) {
    composedStats.parseFatal++;
    continue;
  }
  const before = analyze(testCase.code);
  if (before === null) {
    composedStats.inputUnanalyzable++;
    continue;
  }

  let fixed;
  try {
    fixed = linter.verifyAndFix(
      testCase.code,
      configFor(FIX_CONFIG, testCase),
      { filename: testCase.filename },
    );
  } catch {
    continue;
  }
  if (!fixed.fixed || fixed.output === testCase.code) continue;
  composedStats.rewritten++;

  const after = analyze(fixed.output);
  if (after === null) {
    composedStats.outputUnanalyzable++;
    continue;
  }
  if (after.length <= before.length) continue;

  composedFindings.push({
    origin: testCase.origin,
    filename: testCase.filename,
    constructs: after,
    culprits: attributeCulprits(testCase, before.length),
    before: testCase.code,
    after: fixed.output,
  });
}

// ---------------------------------------------------------------------------
// Corpus C — one accepted suggestion
// ---------------------------------------------------------------------------
type SuggestionFinding = {
  rule: string;
  origin: string;
  filename: string;
  desc: string;
  constructs: string[];
  before: string;
  after: string;
};

/**
 * Corpus C's skip ledger, held to the same zero as the other two corpora: a
 * suggestion fixture that goes fatal or unanalyzable under the harness's own
 * filename leaves this corpus invisibly otherwise, since the per-rule floor
 * below only requires one survivor per rule. Its sibling in
 * comment-fix-fidelity (`skippedFatalSuggestion`) counts and pins exactly this.
 */
const suggestionSkips = { inputUnanalyzable: 0, fatal: 0, verifyThrew: 0 };

/**
 * The state a user reaches by accepting one suggestion, judged the same way a
 * fix output is.
 *
 * The suggestion is applied ALONE to the untouched fixture — never composed
 * with a sibling suggestion and never fed back through a fix loop, since
 * neither is a state an editor can produce. Composing them would also make the
 * emitted construct impossible to attribute to the suggestion that wrote it.
 */
function probeSuggestions(
  rule: string,
  testCase: FixtureCase,
  filename: string,
): { applied: number; findings: SuggestionFinding[] } {
  const id = PREFIX + rule;
  const before = analyze(testCase.code);
  if (before === null) {
    suggestionSkips.inputUnanalyzable++;
    return { applied: 0, findings: [] };
  }

  let messages: Linter.LintMessage[];
  try {
    messages = linter.verify(
      testCase.code,
      configFor({ [id]: severityWithOptions(testCase) }, testCase),
      { filename },
    );
  } catch {
    suggestionSkips.verifyThrew++;
    return { applied: 0, findings: [] };
  }
  if (messages.some((message) => message.fatal)) {
    suggestionSkips.fatal++;
    return { applied: 0, findings: [] };
  }

  const findings: SuggestionFinding[] = [];
  let applied = 0;
  for (const edit of suggestionEditsOf(testCase.code, messages, id)) {
    applied++;
    const after = analyze(edit.output);
    // Unparseable output is `fixer-convergence`'s axis, not this one.
    if (after === null) continue;
    if (after.length <= before.length) continue;
    findings.push({
      rule,
      origin: `src/tests/${testCase.origin}`,
      filename,
      desc: edit.desc,
      constructs: after,
      before: testCase.code,
      after: edit.output,
    });
  }
  return { applied, findings };
}

const corpus = harvestFixtureCorpus();
const suggestionStats = new Map<string, number>();
const suggestionFindings: SuggestionFinding[] = [];

for (const rule of suggestionRuleNames) {
  let applied = 0;
  for (const testCase of corpus.byRule.get(rule) || []) {
    const outcome = probeSuggestions(
      rule,
      testCase,
      defaultFilenameFor(testCase),
    );
    applied += outcome.applied;
    suggestionFindings.push(...outcome.findings);
  }
  suggestionStats.set(rule, applied);
}

const totalSuggestionsApplied = [...suggestionStats.values()].reduce(
  (total, count) => total + count,
  0,
);

/**
 * Printed per corpus and per rule, not merely asserted in aggregate: a corpus
 * that quietly shrank and a rule contributing zero accepted suggestions both
 * read as "clean" from the findings count alone.
 */
console.log(
  [
    `[cjs-emission] corpus A: ${outputStats.casesConsidered} invalid case(s), ` +
      `${outputStats.outputsAnalyzed} declared output(s) across ` +
      `${outputStats.rulesWithOutput.size} rule(s); ` +
      `${outputStats.nonTsOutputs} from non-TS testers; unparseable ` +
      `${outputStats.tsInputUnparseable} TS input(s)/` +
      `${outputStats.nonTsInputUnparseable} non-TS input(s)/` +
      `${outputStats.outputUnparseable} output(s); languages ` +
      `${[...outputStats.languages].sort().join('/')}`,
    `[cjs-emission] corpus B: ${composedStats.considered} considered, ` +
      `${composedStats.rewritten} rewritten, ${composedStats.parseFatal} fatal, ` +
      `${composedStats.inputUnanalyzable} input(s)/` +
      `${composedStats.outputUnanalyzable} output(s) unanalyzable; ` +
      `seen ${JSON.stringify(composedSeen)}, carried ` +
      `${JSON.stringify(composedCarried)}`,
    `[cjs-emission] suggestion channel: ${totalSuggestionsApplied} suggestion(s) ` +
      `applied across ${suggestionRuleNames.length} rule(s); skips ` +
      `${JSON.stringify(suggestionSkips)}`,
    ...suggestionRuleNames.map(
      (rule) => `    ${rule}: ${suggestionStats.get(rule) || 0} applied`,
    ),
    `  declared suggestion outputs analysed: ${outputStats.suggestionOutputsAnalyzed} ` +
      `across ${outputStats.rulesWithSuggestionOutput.size} rule(s)`,
  ].join('\n'),
);

// ---------------------------------------------------------------------------

const render = (
  header: string,
  rows: {
    origin: string;
    constructs: string[];
    before: string;
    after: string;
  }[],
) =>
  [
    header,
    ...rows
      .slice(0, 5)
      .map((row) =>
        [
          `  ${row.origin} — ${row.constructs.join(', ')}`,
          `    --- input ---`,
          row.before.replace(/^/gm, '      '),
          `    --- fixer output ---`,
          row.after.replace(/^/gm, '      '),
        ].join('\n'),
      ),
    '',
    'A module-scope `await` (or `import.meta`) parses as ESM but is a syntax',
    'error once the consumer compiles the file to CommonJS, which is what their',
    'jest does. An `ImportDeclaration` is always module-scope, so rewriting one',
    'in place into `await import(...)` can never be correct — relocate the',
    'dynamic import into the async function that uses it, or decline the fix.',
    'See #1716.',
  ].join('\n');

describe('no fixer emits ESM-only syntax a CommonJS transform rejects', () => {
  it('declares no fixture output carrying a module-scope await', () => {
    if (outputFindings.length > 0) {
      throw new Error(
        render(
          `${outputFindings.length} fixture output(s) introduce ESM-only module-scope syntax:`,
          outputFindings.map((f) => ({
            ...f,
            origin: `${f.rule} (${f.origin})`,
          })),
        ),
      );
    }
    expect(outputFindings).toEqual([]);
  });

  it("produces none through the recommended config's composed --fix", () => {
    if (composedFindings.length > 0) {
      throw new Error(
        render(
          `${composedFindings.length} composed fix(es) introduce ESM-only module-scope syntax:`,
          composedFindings.map((f) => ({
            ...f,
            origin: `${f.origin} as ${f.filename} [${
              f.culprits.join(', ') || 'INTERACTION ONLY'
            }]`,
          })),
        ),
      );
    }
    expect(composedFindings).toEqual([]);
  });

  it('produces none when a single suggestion is accepted', () => {
    if (suggestionFindings.length > 0) {
      throw new Error(
        render(
          `${suggestionFindings.length} accepted suggestion(s) introduce ESM-only module-scope syntax:`,
          suggestionFindings.map((f) => ({
            ...f,
            origin: `${f.rule} "${f.desc}" (${f.origin} as ${f.filename})`,
          })),
        ),
      );
    }
    expect(suggestionFindings).toEqual([]);
  });
});

/**
 * Anti-vacuity controls. A guard whose corpus trips nothing passes forever while
 * asserting nothing, so the harvest, both corpora and the detector are each
 * measured independently.
 */
describe('the CJS emission guard is load-bearing', () => {
  it('harvests the suite without losing it', () => {
    expect(harvested.filesLoaded).toBeGreaterThanOrEqual(250);
    // Measured: 190 rules compose. At the >100 this replaced, 89 could fall
    // out of the composed --fix while the suite stayed green.
    expect(Object.keys(FIX_CONFIG).length).toBeGreaterThanOrEqual(185);
    // The type-aware rules this guard once dropped for no stated reason must
    // now compose like any other, or the coverage the lift bought is silently
    // handed back. 15 of the 16 ship in recommended (`enforce-date-ttime` is
    // deliberately absent from it); a floor of 5 would readmit the drop for
    // 10 of them.
    const typeAwareInConfig = [...typeAwareRuleNames].filter(
      (name) => PREFIX + name in plugin.configs.recommended.rules,
    );
    expect(typeAwareInConfig.length).toBeGreaterThanOrEqual(15);
    expect(
      typeAwareInConfig.filter((name) => !(PREFIX + name in FIX_CONFIG)),
    ).toEqual([]);
  });

  it('analyses enough declared outputs across enough rules', () => {
    // Measured: 8,333 invalid cases and 3,724 declared outputs across 84 rules.
    // The floors sit just under that rather than far below it — the previous
    // 6,000/2,300/75 had decayed into 28% slack, which is more room than the
    // entire corpus loss this guard exists to notice would have needed to hide.
    expect(outputStats.casesConsidered).toBeGreaterThanOrEqual(8300);
    expect(outputStats.outputsAnalyzed).toBeGreaterThanOrEqual(3700);
    expect(outputStats.rulesWithOutput.size).toBeGreaterThanOrEqual(83);
    // Declared SUGGESTION outputs are their own population (139 across 6 rules
    // when this channel was added), and were read by nothing before #1733.
    expect(outputStats.suggestionOutputsAnalyzed).toBeGreaterThanOrEqual(135);
    expect(outputStats.rulesWithSuggestionOutput.size).toBeGreaterThanOrEqual(
      6,
    );
  });

  it("carries every tester's language, not only TypeScript", () => {
    /**
     * Dropping the non-TS testers cost two registered rules their ENTIRE
     * corpus. Both ship `recommended: 'error'` with `fixable: 'code'`, so both
     * rewrite consumer code while contributing nothing here (#1860).
     *
     * Corpus A never needed the drop in the first place: it is text analysis,
     * not a lint, so no parser is selected for a case and no filename is
     * invented for one. Measured, the two rules contribute 14 declared outputs,
     * of which the detector reads the 10 whose input is also valid TypeScript —
     * a Markdown document is often both, since a fenced block is a template
     * literal. Admission without that second number would be paper coverage.
     */
    expect([...outputStats.languages].sort()).toEqual([
      'json',
      'markdown',
      'ts',
    ]);
    expect([...outputStats.nonTsRulesWithOutput].sort()).toEqual([
      'enforce-typescript-markdown-code-blocks',
      'no-unpinned-dependencies',
    ]);
    expect(outputStats.nonTsOutputs).toBeGreaterThanOrEqual(14);
    expect(outputStats.nonTsOutputsAnalyzed).toBeGreaterThanOrEqual(10);
  });

  it("leaves no fixture unjudged by the harness's own filename or parse mode", () => {
    /**
     * A case ESLint cannot parse comes back from `verifyAndFix` as `fixed:
     * false` with its input unchanged — the same shape as a config that
     * correctly left the file alone — so every one of these was counted as
     * clean. Deriving the extension from the TESTER did that to 41 cases here
     * (39 of them `no-margin-properties` fixtures holding JSX under
     * `ruleTesterTs`, where a `.ts` name forces `ScriptKind.TS`). Asserting
     * ZERO, not a ceiling, is what makes the next one a failure rather than a
     * rounding error.
     */
    expect(composedStats.parseFatal).toBe(0);
    /**
     * The detector's own blind spot, held to the same standard: judging a
     * snippet under one JSX mode alone made 21 TypeScript fixtures `null` — the
     * state both corpora skip in silence — until `analyze` began trying both.
     */
    expect(composedStats.inputUnanalyzable).toBe(0);
    expect(outputStats.tsInputUnparseable).toBe(0);
    /**
     * The OUTPUT side of the same standard. `outputsAnalyzed` and `rewritten`
     * both increment BEFORE their `analyze` call, so their floors are
     * satisfiable by outputs the detector never read — these two counters are
     * the only record of that, and each was printed but read by no expect.
     */
    expect(outputStats.outputUnparseable).toBe(0);
    expect(composedStats.outputUnanalyzable).toBe(0);
    /**
     * The non-TS split, pinned exactly rather than at zero: a JSON or Markdown
     * fixture whose code is not also valid TypeScript is what those languages
     * are, not a hole. The 9 are the gap between the 22 non-TS declared
     * outputs and the 13 whose input the detector reads — exact, so the next
     * one is a conscious bump instead of quiet attrition. The bump from 4 came
     * with the CommonMark fence fixtures added to
     * `enforce-typescript-markdown-code-blocks`, whose indented, tilde-fenced
     * and multi-backtick documents are Markdown that no TypeScript parser
     * reads.
     */
    expect(outputStats.nonTsInputUnparseable).toBe(9);
    /**
     * Corpus C, held to the same zero: its early returns were the one place a
     * fixture could still leave a corpus uncounted, since the aggregate floor
     * below carries a few applications of headroom and the per-rule closure
     * only requires one survivor per rule.
     */
    expect(suggestionSkips).toEqual({
      inputUnanalyzable: 0,
      fatal: 0,
      verifyThrew: 0,
    });
  });

  it('accounts for every fixture the relevance filter withholds', () => {
    /**
     * `RELEVANT` is the only thing that keeps a fixture out of corpus B, and it
     * is a property of the CODE (does it mention `import` or `await`), not of
     * the tester that declared it. Asserting that all three languages reach the
     * filter is what distinguishes "no JSON fixture mentions `import`" —
     * measured, and the reason corpus B carries TypeScript only — from the
     * tester drop that used to produce the same number invisibly.
     */
    expect(Object.keys(composedSeen).sort()).toEqual([
      'json',
      'markdown',
      'ts',
    ]);
    // Measured: 7 JSON and 21 Markdown fixtures reach the filter, and none
    // mentions `import` or `await`, so corpus B carries TypeScript alone.
    expect(composedSeen.json).toBeGreaterThanOrEqual(7);
    expect(composedSeen.markdown).toBeGreaterThanOrEqual(20);
    // Nothing is lost between collection and linting.
    expect(
      Object.values(composedCarried).reduce((sum, count) => sum + count, 0),
    ).toBe(composedStats.considered);
  });

  /**
   * Per-rule floor for corpus C. A total would let one prolific rule stand in
   * for another that stopped emitting entirely, and a rule with zero applied
   * suggestions was not tested on this channel at all — which is precisely the
   * state #1733 records for all seven of them.
   */
  it('accepts at least one suggestion from every suggestion-bearing rule', () => {
    expect(suggestionRuleNames.length).toBeGreaterThanOrEqual(7);
    expect(
      Object.fromEntries(
        suggestionRuleNames.map((rule) => [
          rule,
          suggestionStats.get(rule) || 0,
        ]),
      ),
    ).toEqual({
      'enforce-dynamic-firebase-imports': expect.any(Number),
      'enforce-m3-sentence-case': expect.any(Number),
      'enforce-safe-stringify': expect.any(Number),
      'enforce-snapshot-state-narrowing': expect.any(Number),
      'no-excessive-parent-chain': expect.any(Number),
      'prefer-document-flattening': expect.any(Number),
      'react-memoize-literals': expect.any(Number),
    });
    // None of the seven is type-aware, so every one of them is reachable under
    // this bare Linter and none has a reason to be exempt.
    expect(
      suggestionRuleNames.filter(
        (rule) => (suggestionStats.get(rule) || 0) < 1,
      ),
    ).toEqual([]);
    // Measured: 299 applied. The floor sits just under it, and the skip
    // ledger pinned at zero above closes the headroom a dropped fixture
    // would otherwise hide in.
    expect(totalSuggestionsApplied).toBeGreaterThanOrEqual(295);
  });

  it('detects a module-scope await inside a SUGGESTION (positive control)', () => {
    // The #1716 shape offered through `suggest` rather than `fix`: `--fix`
    // never applies it, so corpus B is blind to it by construction.
    const planted: FixtureCase = {
      code: "import { getFirestore } from 'control-target/firestore';\nexport const db = getFirestore();\n",
      tester: 'ruleTesterTs',
      language: 'ts',
      origin: 'planted control',
      bucket: 'invalid',
    };
    const outcome = probeSuggestions(
      CONTROL_SUGGESTER_ID.slice(PREFIX.length),
      planted,
      'x.ts',
    );
    expect(outcome.applied).toBe(1);
    expect(outcome.findings.map((f) => f.constructs.length > 0)).toEqual([
      true,
    ]);
  });

  it('stays silent on a suggestion that keeps the await inside a function (negative control)', () => {
    // Same pipeline, same trigger, a suggestion that relocates the import into
    // an async function. A green corpus means nothing if the detector fires on
    // everything it is handed.
    const planted: FixtureCase = {
      code: "import { getFirestore } from 'control-safe/firestore';\nexport const db = getFirestore();\n",
      tester: 'ruleTesterTs',
      language: 'ts',
      origin: 'planted control',
      bucket: 'invalid',
    };
    const outcome = probeSuggestions(
      CONTROL_SAFE_SUGGESTER_ID.slice(PREFIX.length),
      planted,
      'x.ts',
    );
    expect(outcome.applied).toBe(1);
    expect(outcome.findings).toEqual([]);
  });

  it('actually rewrites a large share of the composed corpus', () => {
    // Step B is vacuous unless the config genuinely fixes these fixtures.
    // Measured: 4,970 considered and 2,573 rewritten. The previous 1,500/300
    // floors sat at a third and an eighth of that, enough slack to absorb the
    // corpus loss this guard exists to notice several times over.
    expect(composedStats.considered).toBeGreaterThanOrEqual(4900);
    expect(composedStats.rewritten).toBeGreaterThanOrEqual(2500);
  });

  it('detects a module-scope await (positive control)', () => {
    const planted: ComposedCase = {
      code: [
        "import { getFirestore } from 'control-target/firestore';",
        'export const db = getFirestore();',
      ].join('\n'),
      filename: 'x.ts',
      tester: 'ruleTesterTs',
      language: 'ts',
      origin: 'planted control',
    };

    expect(analyze(planted.code)).toEqual([]);

    const fixed = linter.verifyAndFix(
      planted.code,
      configFor({ ...FIX_CONFIG, [CONTROL_DYNAMIC_ID]: 'error' }, planted),
      { filename: planted.filename },
    );
    expect(fixed.output).toContain('await import(');
    const constructs = analyze(fixed.output);
    expect(constructs && constructs.length).toBeGreaterThan(0);
    expect(attributeCulprits(planted, 0)).toEqual([]);
  });

  it('holds the shipped config responsible for the same shape (control)', () => {
    // The other half: with only shipped rules, that snippet must survive
    // `--fix` with its static import intact. This is what makes the planted
    // culprit a statement about the detector rather than a way to skip the
    // config.
    const planted: ComposedCase = {
      code: [
        "import { getFirestore } from 'control-target/firestore';",
        'export const db = getFirestore();',
      ].join('\n'),
      filename: 'x.ts',
      tester: 'ruleTesterTs',
      language: 'ts',
      origin: 'planted control',
    };
    const fixed = linter.verifyAndFix(
      planted.code,
      configFor(FIX_CONFIG, planted),
      { filename: planted.filename },
    );
    expect(analyze(fixed.output)).toEqual([]);
  });

  it('stays silent on an await inside an async function (negative control)', () => {
    const inert = [
      'export const load = async () => {',
      "  const { getFirestore } = await import('firebase/firestore');",
      '  return getFirestore();',
      '};',
    ].join('\n');
    expect(analyze(inert)).toEqual([]);
  });

  it('stays silent on a for-await inside an async function (negative control)', () => {
    const inert = [
      'export const drain = async (stream: AsyncIterable<number>) => {',
      '  for await (const chunk of stream) {',
      '    console.log(chunk);',
      '  }',
      '};',
    ].join('\n');
    expect(analyze(inert)).toEqual([]);
  });

  it('detects a module-scope for-await and import.meta (detector controls)', () => {
    const topLevelForAwait = [
      'declare const stream: AsyncIterable<number>;',
      'for await (const chunk of stream) {',
      '  console.log(chunk);',
      '}',
    ].join('\n');
    expect((analyze(topLevelForAwait) || []).length).toBeGreaterThan(0);
    expect(
      (analyze('export const url = import.meta.url;') || []).length,
    ).toBeGreaterThan(0);
  });
});
/* eslint-enable @typescript-eslint/no-explicit-any */

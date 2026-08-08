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
 */
import { Linter, Rule } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import {
  FixtureCase,
  defaultFilenameFor,
  harvestFixtureCorpus,
  harvestOnce,
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

/** `null` marks unparseable input, which is a different (already-guarded) axis. */
function analyze(source: string): string[] | null {
  try {
    const { ast } = tsParser.parseForESLint(source, PARSE_OPTIONS as any);
    return esmOnlyModuleScope(ast);
  } catch {
    return null;
  }
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

/** JSON and markdown fixtures are a different language; the TS parser cannot read them. */
const TS_TESTERS = new Set(['ruleTesterTs', 'ruleTesterJsx']);

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
  inputUnparseable: 0,
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
  if (!TS_TESTERS.has(suite.tester)) continue;
  const name = ruleNameByIdentity.get(suite.rule);
  if (!name) continue;

  for (const raw of suite.invalid) {
    const testCase = raw as any;
    if (!testCase || typeof testCase.code !== 'string') continue;
    outputStats.casesConsidered++;

    const outs = outputsOf(testCase);
    if (outs.length === 0) continue;
    if (outs.some((one) => one.channel === 'fix')) {
      outputStats.rulesWithOutput.add(name);
    }
    if (outs.some((one) => one.channel === 'suggestion')) {
      outputStats.rulesWithSuggestionOutput.add(name);
    }

    const before = analyze(testCase.code);
    if (before === null) {
      outputStats.inputUnparseable++;
      continue;
    }

    for (const out of outs) {
      outputStats.outputsAnalyzed++;
      if (out.channel === 'suggestion') outputStats.suggestionOutputsAnalyzed++;
      const after = analyze(out.text);
      if (after === null) continue;
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
linter.defineParser('ts', tsParser as never);
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

const configFor = (
  rules: Record<string, unknown>,
  parserOptions?: unknown,
): Linter.Config =>
  ({
    parser: 'ts',
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
      ...(parserOptions as object | null),
    },
    rules,
  } as unknown as Linter.Config);

type ComposedCase = {
  code: string;
  filename: string;
  parserOptions?: unknown;
  origin: string;
};

/**
 * Only fixtures that mention `import` or `await` can gain one of these
 * constructs, so restricting the composed corpus to them is strictly more
 * sensitive per case linted rather than a sampling compromise.
 */
const RELEVANT = /\bimport\b|\bawait\b/;

const composedCases: ComposedCase[] = [];
for (const suite of harvested.suites) {
  if (!TS_TESTERS.has(suite.tester)) continue;
  const name = ruleNameByIdentity.get(suite.rule);
  if (!name) continue;

  const defaultFile = suite.tester === 'ruleTesterJsx' ? 'x.tsx' : 'x.ts';
  const push = (raw: unknown) => {
    const testCase = (typeof raw === 'string' ? { code: raw } : raw) as any;
    if (!testCase || typeof testCase.code !== 'string') return;
    if (!RELEVANT.test(testCase.code)) return;
    composedCases.push({
      code: testCase.code,
      filename: testCase.filename || defaultFile,
      parserOptions: testCase.parserOptions,
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

const composedStats = { considered: 0, rewritten: 0 };
const composedFindings: ComposedFinding[] = [];

/** Co-occurrence is not attribution: replay each fixer alone to name the culprit. */
function attributeCulprits(testCase: ComposedCase, baseline: number): string[] {
  const culprits: string[] = [];
  for (const [id, severity] of Object.entries(FIX_CONFIG)) {
    let alone;
    try {
      alone = linter.verifyAndFix(
        testCase.code,
        configFor({ [id]: severity }, testCase.parserOptions),
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

for (const testCase of composedCases) {
  composedStats.considered++;
  const before = analyze(testCase.code);
  if (before === null) continue;

  let fixed;
  try {
    fixed = linter.verifyAndFix(
      testCase.code,
      configFor(FIX_CONFIG, testCase.parserOptions),
      { filename: testCase.filename },
    );
  } catch {
    continue;
  }
  if (!fixed.fixed || fixed.output === testCase.code) continue;
  composedStats.rewritten++;

  const after = analyze(fixed.output);
  if (after === null) continue;
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
  if (before === null) return { applied: 0, findings: [] };

  let messages: Linter.LintMessage[];
  try {
    messages = linter.verify(
      testCase.code,
      configFor(
        { [id]: severityWithOptions(testCase) },
        testCase.parserOptions,
      ),
      { filename },
    );
  } catch {
    return { applied: 0, findings: [] };
  }
  if (messages.some((message) => message.fatal))
    return { applied: 0, findings: [] };

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
 * Printed per rule, not merely asserted in aggregate: a rule contributing zero
 * accepted suggestions was not tested on this channel, and a total hides that.
 */
console.log(
  [
    `[cjs-emission] suggestion channel: ${totalSuggestionsApplied} suggestion(s) ` +
      `applied across ${suggestionRuleNames.length} rule(s)`,
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
    expect(Object.keys(FIX_CONFIG).length).toBeGreaterThan(100);
    // The type-aware rules this guard once dropped for no stated reason must
    // now compose like any other, or the coverage the lift bought is silently
    // handed back.
    const typeAwareInConfig = [...typeAwareRuleNames].filter(
      (name) => PREFIX + name in plugin.configs.recommended.rules,
    );
    expect(typeAwareInConfig.length).toBeGreaterThan(5);
    expect(
      typeAwareInConfig.filter((name) => !(PREFIX + name in FIX_CONFIG)),
    ).toEqual([]);
  });

  it('analyses enough declared outputs across enough rules', () => {
    // 6,422 invalid cases and 2,560 declared outputs across 83 rules at the
    // time of writing; a collapsed corpus would still report zero findings.
    expect(outputStats.casesConsidered).toBeGreaterThanOrEqual(6000);
    expect(outputStats.outputsAnalyzed).toBeGreaterThanOrEqual(2300);
    expect(outputStats.rulesWithOutput.size).toBeGreaterThanOrEqual(75);
    // Declared SUGGESTION outputs are their own population (139 across 6 rules
    // when this channel was added), and were read by nothing before #1733.
    expect(outputStats.suggestionOutputsAnalyzed).toBeGreaterThanOrEqual(120);
    expect(outputStats.rulesWithSuggestionOutput.size).toBeGreaterThanOrEqual(
      5,
    );
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
    expect(totalSuggestionsApplied).toBeGreaterThanOrEqual(250);
  });

  it('detects a module-scope await inside a SUGGESTION (positive control)', () => {
    // The #1716 shape offered through `suggest` rather than `fix`: `--fix`
    // never applies it, so corpus B is blind to it by construction.
    const planted: FixtureCase = {
      code: "import { getFirestore } from 'control-target/firestore';\nexport const db = getFirestore();\n",
      tester: 'ruleTesterTs',
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
    expect(composedStats.considered).toBeGreaterThanOrEqual(1500);
    expect(composedStats.rewritten).toBeGreaterThanOrEqual(300);
  });

  it('detects a module-scope await (positive control)', () => {
    const planted = [
      "import { getFirestore } from 'control-target/firestore';",
      'export const db = getFirestore();',
    ].join('\n');

    expect(analyze(planted)).toEqual([]);

    const fixed = linter.verifyAndFix(
      planted,
      configFor({ ...FIX_CONFIG, [CONTROL_DYNAMIC_ID]: 'error' }),
      { filename: 'x.ts' },
    );
    expect(fixed.output).toContain('await import(');
    const constructs = analyze(fixed.output);
    expect(constructs && constructs.length).toBeGreaterThan(0);
    expect(
      attributeCulprits(
        { code: planted, filename: 'x.ts', origin: 'planted control' },
        0,
      ),
    ).toEqual([]);
  });

  it('holds the shipped config responsible for the same shape (control)', () => {
    // The other half: with only shipped rules, that snippet must survive
    // `--fix` with its static import intact. This is what makes the planted
    // culprit a statement about the detector rather than a way to skip the
    // config.
    const planted = [
      "import { getFirestore } from 'control-target/firestore';",
      'export const db = getFirestore();',
    ].join('\n');
    const fixed = linter.verifyAndFix(planted, configFor(FIX_CONFIG), {
      filename: 'x.ts',
    });
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

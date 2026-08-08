import fs from 'fs';
import path from 'path';
import { Linter } from 'eslint';
import {
  harvestFixtureCorpus,
  defaultFilenameFor,
  parserOptionsFor,
  silentWithoutProgramRuleNames,
  FixtureCase,
} from '../utils/fixtureCorpus';
import { compilePatternOption } from '../utils/compilePatternOption';

// Using require to avoid test build-time ESM interop issues; the guard only
// needs the plugin object shape (rules), not types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('../index') as { rules: Record<string, RuleShape> };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tsParser = require('@typescript-eslint/parser');

const PREFIX = '@blumintinc/blumint/';

/**
 * An option that is exercised and STILL cannot change any outcome.
 *
 * `rule-option-test-coverage` guards the layer above this one — that every
 * declared option appears in some `options:` payload — and says outright that it
 * "cannot prove an exercised option is live". That gap is where #1397
 * (`allowComplexBodies`), #1504 (`ignoreHocs`), #1505 (`guardFunctions`) and
 * #1507 (`allowedHashFunctions`) all lived: each was documented as a working
 * escape hatch, each shipped enabled at `'error'`, and a consumer setting one
 * got silence instead of the exemption the docs promised.
 *
 * Reading the source cannot close that gap either. #1505's read was
 * `void (options?.guardFunctions ?? DEFAULT_GUARD_FUNCTIONS);` — a discard that
 * satisfies every never-read check while doing nothing — and #1507's option was
 * read into a real condition that another check had already excluded. Only
 * varying the option and watching the output separates a live option from a
 * decorative one.
 *
 * So each option is driven to a set of contrasting values across the rule's
 * whole fixture corpus, and everything a consumer can observe is diffed. An
 * option that moves nothing, anywhere, is inert on everything the suite can
 * express.
 *
 * A CRASH is not one of those observations. Diffing a `'THREW'` sentinel
 * alongside the report keys made "the rule loaded" versus "the rule refused this
 * configuration" read as two working behaviours, so an option that could only
 * ever crash certified as live: a planted rule doing nothing but
 * `void (options.patterns || []).map((p) => new RegExp(p))` — #1505's discard
 * plus a compile step — passed (#1869). Crashes are therefore counted on their
 * own axis and asserted separately, because each of the two things a crash can
 * mean has its own remedy: an invalid probe value is the harness's bug, and a
 * crash on a value the rule can compile is the rule's.
 */

type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  minimum?: number;
  default?: unknown;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
};

type RuleShape = {
  meta?: { schema?: JsonSchema | JsonSchema[] };
  defaultOptions?: readonly unknown[];
};

/**
 * Options whose liveness the corpus cannot demonstrate, each blocked on a
 * product decision (wire it up, or delete it) rather than on a missing test.
 *
 * Shrink this; never extend it. An option that reaches this list is not a
 * documented feature — it is configuration a consumer can set and watch do
 * nothing. Checked BOTH ways below: an entry that has become live, or whose
 * option no longer exists, fails and must be deleted. Without that a stale
 * exemption silently absorbs the next real one, which is how the
 * docs-conformance guard came to hide 62 skipped pages (#1499).
 */
const BASELINE: Record<string, readonly string[]> = {
  // Its recognition check and the identifier check are mutually exclusive by
  // node type and both land on the same `continue`, so no dependency-array
  // element can reach it (#1507).
  'enforce-stable-hash-spread-props': ['allowedHashFunctions'],
  // Registering an HOC-wrapped component sets `returnsJsx: false`, so both the
  // configured and unconfigured paths skip (#1504).
  'no-unmemoized-memo-without-props': ['ignoreHocs'],
  // Merged into `config` and then never consulted by any condition, while the
  // docs describe it as a working skip. The void-return exemption it names is
  // instead applied unconditionally by `returnsValue` (#1855).
  'prefer-getter-over-parameterless-method': ['ignoreVoidReturn'],
  // `isFunctionFactory` matches only an ObjectExpression return while
  // `returnsFunction` matches only a function return, so the guard can never
  // suppress a report the rule would otherwise make. `allowComplexBodies` is the
  // same shape (#1397, #1856).
  'prefer-usecallback-over-usememo-for-functions': [
    'allowComplexBodies',
    'allowFunctionFactories',
  ],
};

/**
 * Options that are live in production and undrivable HERE, per (rule, option).
 *
 * Categorically different from `BASELINE`, which records options that do
 * nothing for anyone; these do something, and this harness is what cannot see
 * it. Folding them together would let a genuinely dead option retire under an
 * "artifact" label. Kept per option rather than per rule, so a rule's other
 * options stay gated (#1839).
 *
 * `harvestFixtureCorpus` strips `parserOptions.project`, leaving the isolated
 * single-file program the parser builds. That program has no lib types, so a
 * branch reached only through a resolved lib type is unreachable — which is a
 * fact about the probe, not about the option. Each entry must name the fixture
 * that proves liveness under the suite's own configuration.
 *
 * Asserted both ways below: an entry that becomes live here, or whose option
 * stops existing, must be deleted.
 */
const PROGRAM_ONLY_OPTIONS: Record<string, readonly string[]> = {
  // `ignoreCallExpressions` gates an early return on a syntactic
  // `containsCallExpression`, but flipping it only changes the verdict once the
  // classifier can type the call's result. Without lib types every call
  // classifies as non-primitive anyway, so both values are silent.
  // `ignoreSymbol` is consulted only under `TypeFlags.ESSymbol`
  // (`src/utils/tsTypeClassifier.ts`), which no untyped expression carries.
  // Both are live under `typedParserOptions`:
  // `no-useless-usememo-primitives.test.ts` asserts `uselessUseMemoPrimitive`
  // for `useMemo(() => computeLabel(status), [status])` with
  // `ignoreCallExpressions: false`, and for
  // `useMemo((): symbol => Symbol('tracked'), [])` with `ignoreSymbol: false`.
  'no-useless-usememo-primitives': ['ignoreCallExpressions', 'ignoreSymbol'],
};

/**
 * Options a probe value can still CRASH, pinned by name with the reason.
 *
 * A crash is not a verdict, so it cannot be left to fall out of the diff — it
 * has to be accounted for somewhere, and a bare count decays. Every entry here
 * is a regex-source option the filter below cannot recognise, because its rule
 * compiles the patterns itself instead of handing them to
 * `compilePatternOption`. That is exactly the shape the helper exists to
 * remove: the consumer gets an `Error while loading rule …: Invalid regular
 * expression` naming neither the option nor the value, and every other rule on
 * every other file goes down with it.
 *
 * Asserted both ways: a rule that starts crashing fails here rather than
 * certifying its option live off the crash, and an entry whose rule has been
 * routed through `compilePatternOption` fails as stale and must be deleted.
 */
const CRASHES_ON_UNCOMPILABLE_PATTERN: Record<string, string> = {
  // `sideEffectPatterns` is a regex source built with a bare
  // `new RegExp(pattern, 'i')` in `create`, so nothing declares it one and the
  // probe set still reaches it. Route it through `compilePatternOption` and
  // delete this entry.
  'parallelize-async-operations:sideEffectPatterns':
    'compiles its patterns with a bare `new RegExp` rather than `compilePatternOption`',
};

const RULES_DIR = path.join(__dirname, '..', 'rules');

/**
 * The `(rule, option)` pairs that are REGEX SOURCES, read off the
 * `compilePatternOption` call sites rather than guessed from a name.
 *
 * JSON Schema cannot say "this string must compile as a regex" — every one of
 * these options is declared as a bare `string[]` — so a schema-driven probe set
 * has no way to know that `'**'` is a configuration error rather than a
 * contrast. Feeding it one anyway is what produced the crashes #1869 was
 * laundering into liveness. The call sites are the only place that knowledge
 * exists, and they already spell out both names as literals, so reading them is
 * reuse rather than a second, drifting list of "options that look like
 * patterns" — a name-shaped heuristic would also swallow the GLOB options
 * (`allowFilePatterns`, matched with minimatch), for which `'**'` is the single
 * most meaningful value the probe set carries.
 */
const REGEX_SOURCE_CALL = /compilePatternOption\(\s*'([^']+)'\s*,\s*'([^']+)'/g;

const regexSourceOptions = new Set(
  fs
    .readdirSync(RULES_DIR)
    .filter((file) => file.endsWith('.ts'))
    .flatMap((file) =>
      [
        ...fs
          .readFileSync(path.join(RULES_DIR, file), 'utf8')
          .matchAll(REGEX_SOURCE_CALL),
      ].map(([, ruleName, optionName]) => `${ruleName}:${optionName}`),
    ),
);

/**
 * Admissible exactly when the rule would accept it: `compilePatternOption` is
 * the oracle, so the harness rejects precisely what the rule rejects instead of
 * re-deriving the rule's own admissibility check.
 */
const compilesAsRegexSource = (value: unknown): boolean => {
  if (typeof value !== 'string') return true;
  try {
    compilePatternOption('option-liveness-closure', 'probe', [value]);
    return true;
  } catch {
    return false;
  }
};

/**
 * The probe value actually fed, or `undefined` to drop it.
 *
 * Only regex-source options are narrowed, and only by removing the entries the
 * rule could not compile — the glob probe set collapses to the one member that
 * compiles, `.*`, which is a STRONGER contrast than the crash it replaces
 * because it matches every name in the fixture. Every other option keeps the
 * full probe set.
 */
const admissibleValue = (entry: string, value: unknown): unknown => {
  if (!regexSourceOptions.has(entry)) return value;
  if (Array.isArray(value)) return value.filter(compilesAsRegexSource);
  return compilesAsRegexSource(value) ? value : undefined;
};

type Probe = {
  /** Dotted for a nested option, e.g. `hashImport.source`. */
  key: string;
  /** The same key as a path, so the payload is rebuilt at the right depth. */
  path: string[];
  kind: string;
  enumValues: unknown[];
  defaultValue: unknown;
};

/**
 * Option names a schema declares that this guard has no way to drive, recorded
 * per rule rather than skipped in silence.
 *
 * A guard that quietly stops probing an option shape reports "0 inert" for it
 * forever. The count is asserted below, so widening a schema into a shape the
 * contrast builder cannot express fails here instead of vanishing.
 */
const unprobed: string[] = [];

const isStringArray = (spec: JsonSchema | undefined): boolean =>
  spec?.items?.type === 'string' ||
  (spec?.items?.anyOf || []).some((entry) => entry?.type === 'string');

const probesOf = (rule: RuleShape): Probe[] => {
  const schema = rule?.meta?.schema;
  if (!schema) return [];
  const arr = Array.isArray(schema) ? schema : [schema];
  const props = arr.length === 1 ? arr[0]?.properties : undefined;
  if (!props) {
    /**
     * A positional or non-object schema — `no-restricted-properties-fix` takes
     * an array of restriction entries as its whole payload. Driving one means
     * synthesizing entries rather than substituting a value, which the contrast
     * builder does not do.
     */
    for (const name of schemaOptionNames(schema)) unprobed.push(name);
    return [];
  }
  const declaredDefaults = (rule.defaultOptions?.[0] || {}) as Record<
    string,
    unknown
  >;

  const out: Probe[] = [];
  const collect = (
    props_: Record<string, JsonSchema>,
    path: string[],
    defaults: Record<string, unknown>,
  ) => {
    for (const [key, spec] of Object.entries(props_)) {
      const type = Array.isArray(spec?.type) ? spec.type[0] : spec?.type;
      const defaultValue = defaults?.[key] ?? spec?.default;
      const probe = (kind: string, enumValues: unknown[] = []) =>
        out.push({
          key: [...path, key].join('.'),
          path: [...path, key],
          kind,
          enumValues,
          defaultValue,
        });
      if (spec?.enum) probe('enum', spec.enum);
      else if (type === 'boolean') probe('boolean');
      else if (type === 'array' && spec?.items?.enum)
        probe('enumArray', spec.items.enum);
      else if (type === 'array' && isStringArray(spec)) probe('array');
      else if (type === 'number' || type === 'integer')
        probe('number', [
          typeof spec.minimum === 'number' ? spec.minimum : 0,
          40,
          999,
        ]);
      else if (type === 'string') probe('string');
      else if (type === 'object' && spec?.properties) {
        // One level of nesting, which is where `hashImport.source` lives — the
        // shape the coverage guard names and this one used to skip whole.
        collect(
          spec.properties,
          [...path, key],
          (defaults?.[key] || {}) as Record<string, unknown>,
        );
      } else unprobed.push([...path, key].join('.'));
    }
  };
  collect(props as Record<string, JsonSchema>, [], declaredDefaults);
  return out;
};

/** Every property name a schema declares, at any depth. */
function schemaOptionNames(schema: unknown, acc = new Set<string>()) {
  if (!schema || typeof schema !== 'object') return acc;
  if (Array.isArray(schema)) {
    schema.forEach((entry) => schemaOptionNames(entry, acc));
    return acc;
  }
  const node = schema as Record<string, unknown>;
  if (node.properties && typeof node.properties === 'object')
    for (const [key, sub] of Object.entries(node.properties)) {
      acc.add(key);
      schemaOptionNames(sub, acc);
    }
  for (const key of ['items', 'additionalProperties'])
    if (node[key] && typeof node[key] === 'object')
      schemaOptionNames(node[key], acc);
  for (const key of ['oneOf', 'anyOf', 'allOf'])
    if (Array.isArray(node[key])) schemaOptionNames(node[key], acc);
  return acc;
}

const identsOf = (code: string): string[] => {
  const names = new Set<string>();
  for (const match of code.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g))
    names.add(match[0]);
  return [...names].slice(0, 300);
};

const stringsOf = (code: string): string[] => {
  const out = new Set<string>();
  for (const match of code.matchAll(/['"]([^'"\n]{1,80})['"]/g))
    out.add(match[1]);
  return [...out].slice(0, 30);
};

/**
 * The values one option is driven to for one fixture.
 *
 * Three sources, and each covers a way the other two go blind:
 *
 *   - The fixture's OWN declared value. A suite that writes
 *     `options: [{ booleanPrefixes: ['can'] }]` beside an otherwise identical
 *     default-options fixture has already hand-built the differential pair that
 *     proves the option live. Overwriting that value instead of contrasting
 *     against it threw away the strongest evidence in the corpus and made three
 *     demonstrably-live options on `no-redundant-boolean-callback-props` read as
 *     dead.
 *   - The rule's OWN default. `stripPrefixes` strips `get`/`fetch` by default
 *     and every synthesized contrast happens to strip nothing, so comparing them
 *     only to each other makes an option that drives both the message and the
 *     fixer look dead.
 *   - Synthesized values, built per fixture. An allowlist can only be shown to
 *     work by handing it names the snippet in front of it actually contains, and
 *     a path option only by handing it that fixture's own filename.
 */
const valuesFor = (
  probe: Probe,
  code: string,
  filename: string,
  declared: unknown,
): unknown[] => {
  const base = filename.split('/').pop() || filename;
  const synthesized = (() => {
    switch (probe.kind) {
      case 'boolean':
        return [true, false];
      case 'enum':
        return probe.enumValues.slice(0, 5);
      case 'number':
        return probe.enumValues;
      /**
       * An ordered enum list (`groupOrder`). Reversing it is the contrast that
       * matters: a rule consuming the ORDER emits different fixer output for the
       * same members, which membership changes alone would not reveal.
       */
      case 'enumArray':
        return [
          probe.enumValues,
          [...probe.enumValues].reverse(),
          probe.enumValues.slice(0, 1),
        ];
      case 'array':
        return [
          [],
          identsOf(code),
          stringsOf(code),
          ['**', '**/*', '.*', '*'],
          [filename, base, `**/${base}`],
        ];
      default:
        return [
          '',
          '.*',
          '**/*',
          filename,
          base,
          ...stringsOf(code).slice(0, 8),
          ...identsOf(code).slice(0, 5),
        ];
    }
  })();
  const extra = [probe.defaultValue, declared].filter(
    (value) => value !== undefined,
  );
  return [...synthesized, ...extra];
};

const linter = new Linter();
linter.defineParser('@typescript-eslint/parser', tsParser);
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}

/**
 * Everything a consumer can observe, so an option cannot be live in a channel
 * the diff does not read.
 *
 * The rendered MESSAGE is keyed, not just the `messageId`: `requiredPrefix` on
 * `enforce-is-prefix-validators` decides nothing about which names are reported
 * and that rule has no fixer at all — the option only changes which rename the
 * message tells you to make. SUGGESTIONS are keyed for the same reason in the
 * other direction: `--fix` never applies one, so `guardImportSource`, which
 * reaches only the offered import text, moves neither the reports nor the fix
 * output. Keyed on `messageId`+position alone, both working options read as
 * defects.
 */
const reportKey = (messages: Linter.LintMessage[], id: string) =>
  JSON.stringify(
    messages
      .filter((message) => message.ruleId === id)
      .map((message) => [
        message.messageId || '',
        message.message,
        message.line,
        message.column,
        (message.suggestions || []).map((suggestion) => [
          suggestion.desc,
          suggestion.fix?.text,
          suggestion.fix?.range,
        ]),
      ])
      .sort(),
  );

type Verdict = 'live' | 'inert';

/**
 * One refusal by one rule, recorded instead of diffed.
 *
 * `compilable` is what splits the two meanings apart. A crash on a value the
 * rule could not have compiled is the harness handing a regex-source option a
 * glob; a crash on one it could is the RULE failing on configuration its own
 * schema accepts, which is a defect a consumer would hit in production.
 */
type Crash = {
  /** `<rule>:<option>`, so a finding names what to reconfigure. */
  entry: string;
  phase: 'verify' | 'fix';
  origin: string;
  /** The value fed, so the crash is reproducible by hand. */
  value: string;
  compilable: boolean;
  message: string;
};

type Classification = {
  verdict: Verdict;
  channel: string;
  origin: string;
  crashes: Crash[];
};

/**
 * The one classification path. The planted controls below run through THIS
 * function rather than a copy — a control exercising a parallel implementation
 * proves only that the copy works.
 */
const classify = (
  entry: string,
  ruleId: string,
  probe: Probe,
  cases: readonly FixtureCase[],
): Classification => {
  const crashes: Crash[] = [];
  for (const testCase of cases) {
    const declared =
      testCase.options && typeof testCase.options[0] === 'object'
        ? (testCase.options[0] as Record<string, unknown>)
        : {};
    const filename = defaultFilenameFor(testCase);
    const parserOptions = parserOptionsFor(testCase);

    /** Rebuilds the payload at the probe's depth, so a nested option is set
     * inside its parent object rather than as a bogus dotted top-level key. */
    const withValue = (value: unknown): Record<string, unknown> => {
      const [head, ...rest] = probe.path;
      if (!rest.length) return { ...declared, [head]: value };
      const parent = (declared[head] || {}) as Record<string, unknown>;
      return { ...declared, [head]: { ...parent, [rest.join('.')]: value } };
    };

    const configFor = (value: unknown) =>
      ({
        parser: '@typescript-eslint/parser',
        parserOptions,
        rules: { [ruleId]: ['error', withValue(value)] },
      } as never);

    /** The fixture's own value for THIS option, read at the probe's depth. */
    const declaredValue = probe.path.reduce<unknown>(
      (node, segment) =>
        node && typeof node === 'object'
          ? (node as Record<string, unknown>)[segment]
          : undefined,
      declared,
    );

    /**
     * Only what the linter actually returned. A crash contributes NOTHING here
     * — it is neither a report set nor a fix output, and counting it as one made
     * "this configuration is rejected" the second distinct outcome that
     * certified an option live (#1869).
     */
    const reports: string[] = [];
    const fixes: string[] = [];
    const record = (
      phase: 'verify' | 'fix',
      value: unknown,
      error: unknown,
    ) => {
      crashes.push({
        entry,
        phase,
        origin: testCase.origin,
        value: JSON.stringify(value)?.slice(0, 200) ?? String(value),
        compilable: (Array.isArray(value) ? value : [value]).every(
          compilesAsRegexSource,
        ),
        message: String((error as Error)?.message).slice(0, 200),
      });
    };

    for (const raw of valuesFor(
      probe,
      testCase.code,
      filename,
      declaredValue,
    )) {
      const value = admissibleValue(entry, raw);
      if (value === undefined) continue;
      try {
        reports.push(
          reportKey(
            linter.verify(testCase.code, configFor(value), { filename }),
            ruleId,
          ),
        );
      } catch (error) {
        record('verify', value, error);
      }
      try {
        fixes.push(
          linter.verifyAndFix(testCase.code, configFor(value), { filename })
            .output,
        );
      } catch (error) {
        record('fix', value, error);
      }
    }
    if (new Set(reports).size > 1)
      return {
        verdict: 'live',
        channel: 'report',
        origin: testCase.origin,
        crashes,
      };
    if (new Set(fixes).size > 1)
      return {
        verdict: 'live',
        channel: 'fix',
        origin: testCase.origin,
        crashes,
      };
  }
  return { verdict: 'inert', channel: '', origin: '', crashes };
};

const corpus = harvestFixtureCorpus();

const inert: string[] = [];
const live: string[] = [];
const liveViaFixOnly: string[] = [];
const undrivableSkipped: string[] = [];
const noCorpus: string[] = [];
const corpusCrashes: Crash[] = [];
let fixturesConsidered = 0;

for (const [name, rule] of Object.entries(plugin.rules)) {
  const probes = probesOf(rule);
  if (!probes.length) continue;
  /**
   * A rule that reports nothing at all here would read every one of its options
   * as inert — a manufactured finding rather than a missing one. That set is
   * measured and currently empty; it used to be "every rule whose source
   * mentions the checker", which withheld 16 rules on a premise that holds for
   * none of them (#1859). Counted out loud so the exclusion cannot quietly grow
   * to swallow the corpus.
   */
  if (silentWithoutProgramRuleNames.has(name)) {
    undrivableSkipped.push(name);
    continue;
  }
  const cases = corpus.byRule.get(name) || [];
  if (!cases.length) {
    noCorpus.push(name);
    continue;
  }
  fixturesConsidered += cases.length;

  for (const probe of probes) {
    const entry = `${name}:${probe.key}`;
    const result = classify(entry, PREFIX + name, probe, cases);
    corpusCrashes.push(...result.crashes);
    if (result.verdict === 'inert') inert.push(entry);
    else {
      live.push(entry);
      if (result.channel === 'fix') liveViaFixOnly.push(entry);
    }
  }
}

const baselined = new Set(
  Object.entries(BASELINE).flatMap(([rule, options]) =>
    options.map((option) => `${rule}:${option}`),
  ),
);

const programOnly = new Set(
  Object.entries(PROGRAM_ONLY_OPTIONS).flatMap(([rule, options]) =>
    options.map((option) => `${rule}:${option}`),
  ),
);

const CONTROL_CASE: FixtureCase = {
  code: 'const alpha = 1;\nconst beta = alpha + 1;\n',
  tester: 'ruleTesterTs',
  language: 'ts',
  origin: 'option-liveness-closure.test.ts',
  bucket: 'valid',
};

const controlProbe = (key: string): Probe => ({
  key,
  path: [key],
  kind: 'boolean',
  enumValues: [],
  defaultValue: undefined,
});

/**
 * A control on the STRING-ARRAY channel, which is the only one a crash can
 * reach.
 *
 * A boolean option's whole value space is `[true, false]` and neither value can
 * make a rule throw, so the boolean controls below are structurally incapable of
 * exercising the crash path — which is why the mutation audit shipped with
 * #1854/#1858 passed while a crash was still being diffed as an outcome
 * (#1869). The probe set for an array option carries `['**', …]`, so a rule that
 * compiles its patterns is driven straight into `new RegExp('**')`.
 */
const arrayControlProbe = (key: string): Probe => ({
  key,
  path: [key],
  kind: 'array',
  enumValues: [],
  defaultValue: undefined,
});

const patternControlRule = (create: unknown) =>
  ({
    meta: {
      type: 'problem',
      schema: [
        {
          type: 'object',
          properties: {
            patterns: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: false,
        },
      ],
      messages: { flagged: 'flagged' },
    },
    create,
  } as never);

type PatternContext = {
  options: { patterns?: string[] }[];
  report: (descriptor: unknown) => void;
};

describe('option liveness', () => {
  it('every declared option can change an outcome on its own corpus', () => {
    expect(
      inert.filter((entry) => !baselined.has(entry) && !programOnly.has(entry)),
    ).toEqual([]);
  });

  it('no baselined option has become live (shrink the baseline)', () => {
    const liveSet = new Set(live);
    expect([...baselined].filter((entry) => liveSet.has(entry))).toEqual([]);
  });

  it('no baselined option has disappeared (delete the stale entry)', () => {
    const known = new Set([...inert, ...live]);
    expect([...baselined].filter((entry) => !known.has(entry))).toEqual([]);
  });

  /**
   * Same contract on the program-only list. An entry that becomes drivable here
   * has had its reason retired and must be deleted, or it would absorb the next
   * genuinely dead option on the same rule.
   */
  it('no program-only option has become drivable or vanished', () => {
    const liveSet = new Set(live);
    const known = new Set([...inert, ...live]);
    expect([...programOnly].filter((entry) => liveSet.has(entry))).toEqual([]);
    expect([...programOnly].filter((entry) => !known.has(entry))).toEqual([]);
  });

  /**
   * Anti-vacuity. Each floor is one the guard would fall straight through if the
   * corpus stopped arriving: a harvest that silently returns nothing lints zero
   * fixtures, finds zero inert options, and passes every assertion above.
   */
  it('probed a real corpus', () => {
    expect(live.length).toBeGreaterThanOrEqual(135);
    expect(fixturesConsidered).toBeGreaterThanOrEqual(5000);
    expect(undrivableSkipped.length).toBeLessThanOrEqual(8);
    expect(noCorpus).toEqual([]);
  });

  /**
   * The options this guard cannot drive, pinned by NAME rather than by count.
   *
   * All five are `no-restricted-properties-fix`, whose whole payload is an array
   * of restriction entries — driving it means synthesizing entries, not
   * substituting a value. Pinning the names is what makes a schema that grows a
   * shape the contrast builder cannot express fail here, instead of silently
   * dropping out of the sweep and reporting "0 inert" for it forever.
   */
  it('leaves nothing unprobed but the known non-substitutable shape', () => {
    expect([...new Set(unprobed)].sort()).toEqual([
      'allowObjects',
      'message',
      'object',
      'property',
    ]);
  });

  /**
   * The fix channel is the half of the contract a report-only diff cannot see.
   * If this floor reaches zero the guard has quietly become report-only.
   */
  it('exercises the fix channel', () => {
    expect(liveViaFixOnly.length).toBeGreaterThanOrEqual(7);
  });

  it('classifies a planted live option as live', () => {
    const id = `${PREFIX}__control_live__`;
    linter.defineRule(id, {
      meta: {
        type: 'problem',
        schema: [
          {
            type: 'object',
            properties: { flagIdentifiers: { type: 'boolean' } },
            additionalProperties: false,
          },
        ],
        messages: { flagged: 'flagged' },
      },
      create(context: {
        options: { flagIdentifiers?: boolean }[];
        report: (descriptor: unknown) => void;
      }) {
        return {
          Identifier(node: unknown) {
            if (!context.options[0]?.flagIdentifiers) return;
            context.report({ node, messageId: 'flagged' });
          },
        };
      },
    } as never);
    expect(
      classify(
        '__control_live__:flagIdentifiers',
        id,
        controlProbe('flagIdentifiers'),
        [CONTROL_CASE],
      ).verdict,
    ).toBe('live');
  });

  it('classifies a planted decorative option as inert', () => {
    const id = `${PREFIX}__control_inert__`;
    linter.defineRule(id, {
      meta: {
        type: 'problem',
        schema: [
          {
            type: 'object',
            properties: { decorative: { type: 'boolean' } },
            additionalProperties: false,
          },
        ],
        messages: { flagged: 'flagged' },
      },
      create(context: {
        options: { decorative?: boolean }[];
        report: (descriptor: unknown) => void;
      }) {
        // Read exactly the way #1505 read its dead option: consumed, discarded.
        void context.options[0]?.decorative;
        return {
          Identifier(node: unknown) {
            context.report({ node, messageId: 'flagged' });
          },
        };
      },
    } as never);
    expect(
      classify('__control_inert__:decorative', id, controlProbe('decorative'), [
        CONTROL_CASE,
      ]).verdict,
    ).toBe('inert');
  });

  /**
   * #1869's exact repro, and the mutation proof for this guard: an option
   * consumed, COMPILED and discarded. It decides nothing, so it is decorative —
   * but compiling `'**'` throws, and while a crash counted as a distinct outcome
   * this read `live` on the report channel. Two assertions, because "inert" is
   * only meaningful once the crash is known to have happened: reinstate the
   * sentinel and the first fails, stop feeding the probe set and the second
   * does.
   */
  it('does not certify a decorative option live off the crash it causes', () => {
    const id = `${PREFIX}__control_inert_pattern_throws__`;
    linter.defineRule(
      id,
      patternControlRule((context: PatternContext) => {
        // #1505's discard, plus the compile step that turns a bad value into a
        // thrown configuration error rather than a silent one.
        void (context.options[0]?.patterns || []).map(
          (pattern) => new RegExp(pattern),
        );
        return {
          Identifier(node: unknown) {
            context.report({ node, messageId: 'flagged' });
          },
        };
      }),
    );
    const result = classify(
      '__control_inert_pattern_throws__:patterns',
      id,
      arrayControlProbe('patterns'),
      [CONTROL_CASE],
    );
    expect(result.verdict).toBe('inert');
    expect(result.crashes.length).toBeGreaterThan(0);
    expect(result.crashes.every((crash) => !crash.compilable)).toBe(true);
  });

  /**
   * The same decorative read WITHOUT a compile step, so no value in the probe
   * set can throw. It pins the other half: an array-typed option that is inert
   * reads inert on outcomes alone, not because a crash happened to be filtered
   * out of the diff.
   */
  it('classifies a decorative option that never throws as inert', () => {
    const id = `${PREFIX}__control_inert_pattern_compiles__`;
    linter.defineRule(
      id,
      patternControlRule((context: PatternContext) => {
        void (context.options[0]?.patterns || []).join('|');
        return {
          Identifier(node: unknown) {
            context.report({ node, messageId: 'flagged' });
          },
        };
      }),
    );
    const result = classify(
      '__control_inert_pattern_compiles__:patterns',
      id,
      arrayControlProbe('patterns'),
      [CONTROL_CASE],
    );
    expect(result.verdict).toBe('inert');
    expect(result.crashes).toEqual([]);
  });

  /**
   * The positive control on the same channel. Narrowing the values fed to a
   * regex-source option is a way to make EVERY array option read inert, so a
   * planted live one has to survive the narrowing.
   */
  it('classifies a planted live array option as live', () => {
    const id = `${PREFIX}__control_live_pattern__`;
    linter.defineRule(
      id,
      patternControlRule((context: PatternContext) => {
        const allowed = new Set(context.options[0]?.patterns || []);
        return {
          Identifier(node: { name?: string }) {
            if (allowed.has(node.name || '')) return;
            context.report({ node, messageId: 'flagged' });
          },
        };
      }),
    );
    expect(
      classify(
        '__control_live_pattern__:patterns',
        id,
        arrayControlProbe('patterns'),
        [CONTROL_CASE],
      ).verdict,
    ).toBe('live');
  });

  /**
   * A crash on a value the rule COULD have compiled is not a probe artifact —
   * it is a rule that rejects, with an unhandled exception, configuration its
   * own schema accepts. Since an exception raised while building a rule aborts
   * the whole lint run, every other rule on every other file goes down with it.
   */
  it('no rule crashes on a value it can compile', () => {
    expect(
      corpusCrashes
        .filter((crash) => crash.compilable)
        .map((crash) => `${crash.entry} ${crash.value}: ${crash.message}`),
    ).toEqual([]);
  });

  /**
   * The remaining crashes, pinned by NAME both ways and carrying the reason. A
   * count would let the next rule that crashes hide inside it, silence would let
   * one certify its option live off the crash all over again, and an entry with
   * no reason is the beginning of a list nobody can shrink.
   */
  it('crashes only where a rule bypasses compilePatternOption', () => {
    const explain = (entry: string) =>
      `${entry}: ${CRASHES_ON_UNCOMPILABLE_PATTERN[entry] || 'UNEXPLAINED'}`;
    expect(
      [...new Set(corpusCrashes.map((crash) => crash.entry))]
        .sort()
        .map(explain),
    ).toEqual(Object.keys(CRASHES_ON_UNCOMPILABLE_PATTERN).sort().map(explain));
  });

  /**
   * The registry that stops the crash, pinned by name. Read off the
   * `compilePatternOption` call sites, so a reformatted call site — or a rule
   * that stops using the helper — silently reinstates the crashes it prevents.
   */
  it('recognises every option declared a regex source', () => {
    expect([...regexSourceOptions].sort()).toEqual([
      'enforce-m3-sentence-case:ignorePatterns',
      'no-handler-suffix:allowPatterns',
      'no-render-function-components:allowNames',
      'no-separate-loading-state:patterns',
    ]);
  });
});

import { Linter } from 'eslint';
import {
  harvestFixtureCorpus,
  defaultFilenameFor,
  parserOptionsFor,
  typeAwareRuleNames,
  FixtureCase,
} from '../utils/fixtureCorpus';

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
 * The one classification path. The planted controls below run through THIS
 * function rather than a copy — a control exercising a parallel implementation
 * proves only that the copy works.
 */
const classify = (
  ruleId: string,
  probe: Probe,
  cases: readonly FixtureCase[],
): { verdict: Verdict; channel: string; origin: string } => {
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

    const reports: string[] = [];
    const fixes: string[] = [];
    for (const value of valuesFor(
      probe,
      testCase.code,
      filename,
      declaredValue,
    )) {
      try {
        reports.push(
          reportKey(
            linter.verify(testCase.code, configFor(value), { filename }),
            ruleId,
          ),
        );
      } catch {
        reports.push('THREW');
      }
      try {
        fixes.push(
          linter.verifyAndFix(testCase.code, configFor(value), { filename })
            .output,
        );
      } catch {
        fixes.push('THREW');
      }
    }
    if (new Set(reports).size > 1)
      return { verdict: 'live', channel: 'report', origin: testCase.origin };
    if (new Set(fixes).size > 1)
      return { verdict: 'live', channel: 'fix', origin: testCase.origin };
  }
  return { verdict: 'inert', channel: '', origin: '' };
};

const corpus = harvestFixtureCorpus();

const inert: string[] = [];
const live: string[] = [];
const liveViaFixOnly: string[] = [];
const typeAwareSkipped: string[] = [];
const noCorpus: string[] = [];
let fixturesConsidered = 0;

for (const [name, rule] of Object.entries(plugin.rules)) {
  const probes = probesOf(rule);
  if (!probes.length) continue;
  /**
   * A type-aware rule has no program under a bare `Linter`, so it reports
   * nothing and every one of its options would read as inert — a manufactured
   * finding rather than a missing one. Counted out loud so the exclusion cannot
   * quietly grow to swallow the corpus.
   */
  if (typeAwareRuleNames.has(name)) {
    typeAwareSkipped.push(name);
    continue;
  }
  const cases = corpus.byRule.get(name) || [];
  if (!cases.length) {
    noCorpus.push(name);
    continue;
  }
  fixturesConsidered += cases.length;

  for (const probe of probes) {
    const result = classify(PREFIX + name, probe, cases);
    const entry = `${name}:${probe.key}`;
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

const CONTROL_CASE: FixtureCase = {
  code: 'const alpha = 1;\nconst beta = alpha + 1;\n',
  tester: 'ruleTesterTs',
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

describe('option liveness', () => {
  it('every declared option can change an outcome on its own corpus', () => {
    expect(inert.filter((entry) => !baselined.has(entry))).toEqual([]);
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
   * Anti-vacuity. Each floor is one the guard would fall straight through if the
   * corpus stopped arriving: a harvest that silently returns nothing lints zero
   * fixtures, finds zero inert options, and passes every assertion above.
   */
  it('probed a real corpus', () => {
    expect(live.length).toBeGreaterThanOrEqual(135);
    expect(fixturesConsidered).toBeGreaterThanOrEqual(5000);
    expect(typeAwareSkipped.length).toBeLessThanOrEqual(8);
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
      classify(id, controlProbe('flagIdentifiers'), [CONTROL_CASE]).verdict,
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
      classify(id, controlProbe('decorative'), [CONTROL_CASE]).verdict,
    ).toBe('inert');
  });
});

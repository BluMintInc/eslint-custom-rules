import { Linter } from 'eslint';
import {
  harvestFixtureCorpus,
  defineCorpusParsers,
  parserKeyFor,
  parserOptionsFor,
  defaultFilenameFor,
  FixtureCase,
} from '../utils/fixtureCorpus';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as {
  rules: Record<string, any>;
};

/**
 * A bare `Linter` does NOT validate rule options against `meta.schema` — it
 * hands whatever it is given straight to the rule. Probing a payload real
 * ESLint would REJECT therefore manufactures a crash no consumer can reach:
 * measured, `['error', {}]` against `no-restricted-properties-fix`'s
 * array-typed schema produced 77 such "findings". The screen below is ESLint's
 * own validator, so only payloads a consumer could actually write survive.
 */
const eslintLib = require('path').dirname(require.resolve('eslint'));
const { getRuleOptionsSchema } = require(eslintLib +
  '/config/flat-config-helpers.js');
const ajvFactory = require(eslintLib + '/shared/ajv.js');
/* eslint-enable @typescript-eslint/no-var-requires */

/**
 * The cell `option-liveness-closure` and `rule-crash-robustness` leave open:
 * a NON-DEFAULT, schema-valid option payload driven over FOREIGN code.
 *
 * `option-liveness-closure` varies every declared option, but only across the
 * rule's OWN fixture corpus — code its author wrote knowing the option existed.
 * `rule-crash-robustness` does sweep unusual code, but over a hand-written
 * snippet corpus of a few hundred shapes, and predominantly at default options.
 * Neither drives `{ignoreX: true}` across the other 300 suites' 20k fixtures,
 * which is exactly where a consumer's configuration meets a consumer's code.
 *
 * The oracle is a THROW, not a report. That choice is what makes the sweep
 * meaningful on foreign fixtures: a rule that stays silent on another rule's
 * code has said nothing wrong, so a report-diff oracle would be almost entirely
 * noise here, while a throw is unambiguously the rule's defect — ESLint
 * surfaces it to the consumer as a hard lint failure naming the rule.
 *
 * The oracle's REACH is narrower than the raw pair count suggests, and the
 * difference is `createRule`. `ESLintUtils.RuleCreator` runs `applyDefault`,
 * which deep-merges the consumer's payload over `defaultOptions`, so for a rule
 * whose every schema property carries a default the payload `{}` arrives at
 * `create` already filled in — an unguarded read of it cannot throw, because no
 * consumer can make the value undefined. Measured at 1.20.161: 28 optioned
 * rules are neutralized that way and 31 have at least one schema property
 * absent from `defaultOptions`, which is the set where an unguarded read is
 * genuinely reachable. That set is asserted below, because a sweep of 218k
 * pairs whose reachable set had collapsed to zero would still read clean.
 *
 * Verified by mutation against a shipped rule rather than by planted controls
 * alone: restoring `enforce-dynamic-imports`'s `buildLibraryMatcher(libraries)`
 * to its pre-guard spelling (dropping `?? []`) fails this suite naming the rule,
 * the payload and the fixture. The same mutation applied to a rule in the
 * neutralized 28 does NOT fail it — correctly, since `applyDefault` makes that
 * spelling unreachable there.
 *
 * No rule is excluded. `silentWithoutProgramRuleNames` exists for guards whose
 * oracle is a REPORT, where a silent rule can only contribute a false clean; a
 * rule that stays silent cannot crash, so silence is a true negative here
 * rather than a withheld answer. The type-aware rules are probed for the same
 * measured reason the other corpus guards keep them: `@typescript-eslint/parser`
 * returns an isolated single-file program even with no `project`, so their
 * `if (!services?.program) return;` guard does not fire.
 */

const ajv = ajvFactory({ strictDefaults: true });

const validatorFor = (rule: any): ((options: unknown[]) => boolean) | null => {
  const schema = getRuleOptionsSchema(rule);
  if (!schema) return null;
  return ajv.compile(schema);
};

const PREFIX = '@blumintinc/blumint/';

/**
 * Fixtures probed per (payload, owning suite). Uncapped, one huge corpus would
 * dominate the sweep without adding shape diversity; at 2 every suite still
 * contributes and the run stays inside a normal test budget.
 */
const CAP = 2;

type Payload = { key: string; options: readonly unknown[]; source: string };

const schemaOf = (rule: any): any[] => {
  const schema = rule?.meta?.schema;
  if (!schema) return [];
  return Array.isArray(schema) ? schema : [schema];
};

/** Non-default values a property of this shape can legally take. */
const valuesFor = (prop: any): unknown[] => {
  if (!prop || typeof prop !== 'object') return [];
  if (Array.isArray(prop.enum)) return prop.enum.slice(0, 3);
  const type = Array.isArray(prop.type) ? prop.type[0] : prop.type;
  if (type === 'boolean') return [true, false];
  if (type === 'number' || type === 'integer') return [0, 1];
  if (type === 'string') return ['x'];
  if (type === 'array') {
    const itemType = Array.isArray(prop.items?.type)
      ? prop.items.type[0]
      : prop.items?.type;
    if (itemType === 'string') return [[], ['x']];
    if (itemType === 'number' || itemType === 'integer') return [[], [1]];
    if (itemType === 'object') return [[], [{}]];
    return [[]];
  }
  if (type === 'object') return [{}];
  return [];
};

/** Payloads to probe rule R under: fixture-declared ones plus synthesized. */
const payloadsFor = (rule: any, cases: FixtureCase[]): Payload[] => {
  const out: Payload[] = [];
  const seen = new Set<string>();
  const add = (options: readonly unknown[], source: string) => {
    const key = JSON.stringify(options);
    if (key === '[]' || seen.has(key)) return;
    seen.add(key);
    out.push({ key, options, source });
  };

  // 1. Every payload the rule's own author actually wrote.
  for (const testCase of cases) {
    if (testCase.options && testCase.options.length) {
      add(testCase.options, 'fixture');
    }
  }

  // 2. The empty object — legal against nearly every schema here, and the
  //    shape an unguarded destructuring read (`const [{ list }] = options`)
  //    crashes on.
  add([{}], 'empty-object');

  // 3. One payload per (property, legal value), plus an all-properties one.
  const schema = schemaOf(rule);
  const head = schema[0];
  const properties = head?.properties;
  if (properties && typeof properties === 'object') {
    const all: Record<string, unknown> = {};
    for (const [prop, propSchema] of Object.entries<any>(properties)) {
      for (const value of valuesFor(propSchema)) {
        add([{ [prop]: value }], 'prop:' + prop);
      }
      const first = valuesFor(propSchema)[0];
      if (first !== undefined) all[prop] = first;
    }
    if (Object.keys(all).length > 1) add([all], 'all-props');
  }
  // A non-object head schema (enum/string) takes its own values.
  if (head && !properties) {
    for (const value of valuesFor(head)) add([value], 'head');
  }
  return out;
};

type Finding = {
  rule: string;
  payload: string;
  payloadSource: string;
  owner: string;
  origin: string;
  bucket: string;
  filename: string;
  message: string;
  alsoCrashesAtDefault: boolean;
};

type Totals = {
  rulesProbed: number;
  payloadsBuilt: number;
  payloadsSchemaValid: number;
  payloadsRejected: number;
  crossPairs: number;
  crossPairsReporting: number;
  crossPairsPayloadChangedOutput: number;
  fatalParses: number;
  ownPairsSkipped: number;
  defaultArmCrashes: number;
  defaultOnlyCrashes: number;
};

const emptyTotals = (): Totals => ({
  rulesProbed: 0,
  payloadsBuilt: 0,
  payloadsSchemaValid: 0,
  payloadsRejected: 0,
  crossPairs: 0,
  crossPairsReporting: 0,
  crossPairsPayloadChangedOutput: 0,
  fatalParses: 0,
  ownPairsSkipped: 0,
  defaultArmCrashes: 0,
  defaultOnlyCrashes: 0,
});

const linterFor = (extraRules: Record<string, any> = {}) => {
  const linter = new Linter();
  defineCorpusParsers(linter);
  for (const [name, rule] of Object.entries(plugin.rules)) {
    linter.defineRule(PREFIX + name, rule);
  }
  for (const [name, rule] of Object.entries(extraRules)) {
    linter.defineRule(PREFIX + name, rule);
  }
  return linter;
};

const configFor = (
  testCase: FixtureCase,
  ruleId: string,
  options: readonly unknown[] | null,
) => ({
  parser: parserKeyFor(testCase),
  parserOptions: parserOptionsFor(testCase),
  rules: {
    [ruleId]: (options && options.length
      ? ['error', ...options]
      : 'error') as any,
  },
});

const signature = (messages: Linter.LintMessage[]) =>
  messages
    .map((m) => (m.messageId || m.message) + '@' + m.line + ':' + m.column)
    .join('|');

type OwnedCase = { owner: string; testCase: FixtureCase };

/**
 * One sweep pass. Factored out so the planted controls run through the SAME
 * machinery the real sweep does — a control validated against a bespoke inline
 * `Linter` proves only that ESLint throws, not that THIS harness's catch site,
 * schema screen and payload builder are wired to notice.
 */
const sweep = (
  rules: Record<string, any>,
  allCases: OwnedCase[],
  ownCasesOf: (name: string) => FixtureCase[],
): { totals: Totals; findings: Finding[] } => {
  const totals = emptyTotals();
  const findings: Finding[] = [];
  const linter = linterFor(rules === plugin.rules ? {} : rules);

  for (const [name, rule] of Object.entries(rules)) {
    if (!schemaOf(rule).length) continue;
    const ruleId = PREFIX + name;
    const payloads = payloadsFor(rule, ownCasesOf(name));
    totals.payloadsBuilt += payloads.length;

    // Screen each payload with ESLint's OWN option validator: a payload the
    // schema rejects is one no consumer can write, so a crash under it is a
    // fabrication rather than a defect.
    const validate = validatorFor(rule);
    const valid: Payload[] = [];
    for (const payload of payloads) {
      if (validate && !validate(payload.options as unknown[])) {
        totals.payloadsRejected++;
        continue;
      }
      valid.push(payload);
    }
    totals.payloadsSchemaValid += valid.length;
    if (!valid.length) continue;
    totals.rulesProbed++;

    // Cap per (payload, owner) so one huge corpus cannot dominate.
    const used = new Map<string, number>();

    for (const { owner, testCase } of allCases) {
      if (owner === name) {
        totals.ownPairsSkipped++;
        continue;
      }
      const filename = defaultFilenameFor(testCase);

      let defaultMessages: Linter.LintMessage[] | null = null;
      let defaultThrew = false;
      let defaultRan = false;
      let defaultCrashRecorded = false;
      let defaultCrashMessage = '';
      const runDefault = () => {
        if (defaultRan) return;
        defaultRan = true;
        try {
          defaultMessages = linter.verify(
            testCase.code,
            configFor(testCase, ruleId, null) as any,
            filename,
          );
        } catch (error) {
          defaultThrew = true;
          defaultCrashMessage = String((error as Error).message).split('\n')[0];
          defaultMessages = [];
        }
      };

      for (const payload of valid) {
        const capKey = payload.key + ' ' + owner;
        const count = used.get(capKey) || 0;
        if (count >= CAP) continue;
        used.set(capKey, count + 1);
        totals.crossPairs++;

        let messages: Linter.LintMessage[];
        try {
          messages = linter.verify(
            testCase.code,
            configFor(testCase, ruleId, payload.options) as any,
            filename,
          );
        } catch (error) {
          runDefault();
          if (defaultThrew) {
            totals.defaultArmCrashes++;
            // Already carried by this finding's `alsoCrashesAtDefault`.
            defaultCrashRecorded = true;
          }
          findings.push({
            rule: name,
            payload: payload.key,
            payloadSource: payload.source,
            owner,
            origin: testCase.origin,
            bucket: testCase.bucket,
            filename,
            message: String((error as Error).message).split('\n')[0],
            alsoCrashesAtDefault: defaultThrew,
          });
          continue;
        }

        /**
         * A fatal parse means the PARSER rejected the fixture, so the rule
         * never ran and the pair measured nothing. Counted rather than
         * dropped: a silent fatal-parse bucket is how 106 cases across 7
         * rules went unmeasured while the guard read clean (#1984), so the
         * count carries an assertion of its own below.
         */
        if (messages.some((m) => m.fatal)) {
          totals.fatalParses++;
          continue;
        }
        if (messages.length) totals.crossPairsReporting++;

        runDefault();
        /**
         * A crash under DEFAULT options on a foreign fixture is a finding in
         * its own right, and this sweep is where it surfaces: recorded once
         * per (rule, fixture) rather than once per payload, so one crash is
         * not counted N times.
         */
        if (defaultThrew && !defaultCrashRecorded) {
          defaultCrashRecorded = true;
          totals.defaultOnlyCrashes++;
          findings.push({
            rule: name,
            payload: 'DEFAULT',
            payloadSource: 'default-options',
            owner,
            origin: testCase.origin,
            bucket: testCase.bucket,
            filename,
            message: defaultCrashMessage,
            alsoCrashesAtDefault: true,
          });
        }
        if (
          !defaultThrew &&
          signature(messages) !== signature(defaultMessages || [])
        ) {
          totals.crossPairsPayloadChangedOutput++;
        }
      }
    }
  }
  return { totals, findings };
};

/**
 * Rules whose crash under a schema-valid payload is accepted, pinned by name
 * with the reason. Empty, and asserted empty-or-justified below: an entry here
 * un-gates that rule, so it must be added deliberately rather than to make a
 * red run green.
 */
const ACCEPTED_CRASHES: Record<string, string> = {};

const CONTROL_SCHEMA = [
  {
    type: 'object',
    properties: { list: { type: 'array', items: { type: 'string' } } },
    additionalProperties: false,
  },
];

/** Reads its option by destructuring, which throws on the legal payload `{}`. */
const CRASHING_CONTROL = {
  meta: {
    type: 'suggestion',
    schema: CONTROL_SCHEMA,
    messages: { m: 'x' },
  },
  create(context: any) {
    const [{ list }] = context.options as [{ list: string[] }];
    return {
      Identifier(node: any) {
        if (list.includes(node.name)) {
          context.report({ node, messageId: 'm' });
        }
      },
    };
  },
};

/** The same option, read defensively — the negative control. */
const SAFE_CONTROL = {
  meta: {
    type: 'suggestion',
    schema: CONTROL_SCHEMA,
    messages: { m: 'x' },
  },
  create(context: any) {
    const list: string[] = context.options?.[0]?.list ?? [];
    return {
      Identifier(node: any) {
        if (list.includes(node.name)) {
          context.report({ node, messageId: 'm' });
        }
      },
    };
  },
};

const corpus = harvestFixtureCorpus();
const allCases: OwnedCase[] = [];
for (const [owner, cases] of corpus.byRule) {
  for (const testCase of cases) allCases.push({ owner, testCase });
}

const optionedRuleNames = Object.keys(plugin.rules).filter(
  (name) => schemaOf(plugin.rules[name]).length > 0,
);

const result = sweep(
  plugin.rules,
  allCases,
  (name) => corpus.byRule.get(name) || [],
);
const { totals, findings } = result;

/**
 * Floors sit just under the values measured at 1.20.161, not at a round number
 * far below them: the floors that let #1984 through sat at 5,500 against an
 * actual 8,141, which is slack wide enough to hide a corpus that has silently
 * stopped being swept.
 */
const RULES_PROBED_FLOOR = 58; // measured 60
const PAYLOAD_FLOOR = 550; // measured 565
const CROSS_PAIR_FLOOR = 210_000; // measured 218,090
const REPORTING_FLOOR = 16_000; // measured 16,494
const PAYLOAD_CHANGED_FLOOR = 2_800; // measured 2,964
const OWN_SKIPPED_FLOOR = 6_500; // measured 6,878
const CASE_FLOOR = 20_000; // measured 20,446

describe('option payloads x foreign fixtures (crash oracle)', () => {
  it('no rule crashes on foreign code under a schema-valid payload', () => {
    const unaccepted = findings.filter((f) => !(f.rule in ACCEPTED_CRASHES));
    expect(
      unaccepted.map(
        (f) =>
          `${f.rule} ${f.payload} (${f.payloadSource}) on ${f.owner}/${f.bucket} ` +
          `[${f.origin}] -> ${f.message}`,
      ),
    ).toEqual([]);
  });

  it('every accepted crash still crashes, so a stale entry cannot linger', () => {
    const crashingRules = new Set(findings.map((f) => f.rule));
    const stale = Object.keys(ACCEPTED_CRASHES).filter(
      (name) => !crashingRules.has(name),
    );
    expect(stale).toEqual([]);
  });

  it('sweeps the corpus it claims to (non-vacuity)', () => {
    expect(corpus.failures).toEqual([]);
    expect(corpus.totalCases).toBeGreaterThanOrEqual(CASE_FLOOR);
    expect(allCases.length).toBeGreaterThanOrEqual(CASE_FLOOR);
    expect(totals.rulesProbed).toBeGreaterThanOrEqual(RULES_PROBED_FLOOR);
    expect(totals.payloadsSchemaValid).toBeGreaterThanOrEqual(PAYLOAD_FLOOR);
    expect(totals.crossPairs).toBeGreaterThanOrEqual(CROSS_PAIR_FLOOR);
    expect(totals.ownPairsSkipped).toBeGreaterThanOrEqual(OWN_SKIPPED_FLOOR);
  });

  it('the payloads actually reach the rules (a silent sweep proves nothing)', () => {
    // The rule fired at all on foreign code...
    expect(totals.crossPairsReporting).toBeGreaterThanOrEqual(REPORTING_FLOOR);
    // ...and the OPTION changed what it did, so the payloads are not inert
    // decoration riding along on a default-options sweep.
    expect(totals.crossPairsPayloadChangedOutput).toBeGreaterThanOrEqual(
      PAYLOAD_CHANGED_FLOOR,
    );
  });

  it('discards nothing to a fatal parse', () => {
    // Cut at the measured value, not at a tolerance: a ceiling of 200 over a
    // measured 0 silently readmits exactly the 106 cases of #1984.
    expect(totals.fatalParses).toBe(0);
  });

  it('the schema screen is LIVE (rejects what ESLint rejects)', () => {
    const arrayHead = validatorFor({
      meta: { schema: [{ type: 'array', items: { type: 'object' } }] },
    });
    expect(arrayHead).not.toBeNull();
    // The exact payload that manufactured 77 fake findings before the screen.
    expect(arrayHead!([{}])).toBe(false);
    expect(arrayHead!([[]])).toBe(true);

    const objectHead = validatorFor({
      meta: {
        schema: [{ type: 'object', properties: { list: { type: 'array' } } }],
      },
    });
    // `{}` IS legal against an all-optional object head — the real class.
    expect(objectHead!([{}])).toBe(true);
    expect(totals.payloadsRejected).toBeGreaterThan(0);
  });

  it('keeps a population the crash oracle can actually reach', () => {
    /**
     * A schema property absent from `defaultOptions` is one `applyDefault`
     * cannot fill in, so it reaches `create` undefined whenever the payload
     * omits it — the only shape in which an unguarded read throws. Floored so
     * the sweep cannot quietly become 218k pairs over a population where every
     * option is pre-filled and no crash is possible.
     */
    const reachable = optionedRuleNames.filter((name) => {
      const head = schemaOf(plugin.rules[name])[0];
      if (!head?.properties) return false;
      const defaults = plugin.rules[name].defaultOptions?.[0] ?? {};
      return Object.keys(head.properties).some((prop) => !(prop in defaults));
    });
    expect(reachable.length).toBeGreaterThanOrEqual(28); // measured 31
  });

  it('every optioned rule reached the sweep', () => {
    // A rule whose payloads are ALL schema-rejected drops out of `rulesProbed`
    // silently; naming the residue keeps that from reading as coverage.
    const unprobed = optionedRuleNames.length - totals.rulesProbed;
    expect(unprobed).toBe(0);
  });

  describe('planted controls run through the same machinery', () => {
    // A slice, so the controls stay fast; still large enough that the cap and
    // the owner-skip both engage.
    const slice = allCases.slice(0, 400);

    it('catches a planted unguarded option read (positive control)', () => {
      const control = sweep(
        { __control_crashing__: CRASHING_CONTROL },
        slice,
        () => [],
      );
      expect(control.totals.crossPairs).toBeGreaterThan(0);
      expect(control.findings.length).toBeGreaterThan(0);
      expect(
        control.findings.every((f) => f.rule === '__control_crashing__'),
      ).toBe(true);
      // It crashes on the EMPTY-OBJECT payload specifically, which is the
      // shape the builder must keep synthesizing for this axis to have teeth.
      expect(
        control.findings.some((f) => f.payloadSource === 'empty-object'),
      ).toBe(true);
    });

    it('leaves a defensively-read option alone (negative control)', () => {
      const control = sweep(
        { __control_safe__: SAFE_CONTROL },
        slice,
        () => [],
      );
      expect(control.totals.crossPairs).toBeGreaterThan(0);
      expect(control.totals.payloadsSchemaValid).toBeGreaterThan(0);
      expect(control.findings).toEqual([]);
    });
  });
});

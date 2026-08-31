import { Linter } from 'eslint';
import {
  harvestFixtureCorpus,
  defineCorpusParsers,
  parserKeyFor,
  parserOptionsFor,
  defaultFilenameFor,
  FixtureCase,
} from '../utils/fixtureCorpus';
import {
  OptionPayload,
  buildOptionPayloads,
  fixedWindow,
  optionSchemaOf,
  payloadScreenFor,
  rotatedWindow,
  screenPayloads,
  unexpressedProperties,
} from '../utils/syntheticRuleOptions';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as {
  rules: Record<string, any>;
};
/* eslint-enable @typescript-eslint/no-var-requires */

/**
 * The cell `option-liveness-closure` and `rule-crash-robustness` leave open:
 * a NON-DEFAULT, schema-valid option payload driven over FOREIGN code.
 *
 * `option-liveness-closure` varies every declared option, but only across the
 * rule's OWN fixture corpus — code its author wrote knowing the option existed.
 * `rule-crash-robustness` does sweep unusual code, but over a hand-written
 * snippet corpus of a few hundred shapes. Neither drives `{ignoreX: true}`
 * across the other suites' 23k fixtures, which is exactly where a consumer's
 * configuration meets a consumer's code.
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
 * consumer can make the value undefined. Measured at 1.20.198 over 71 optioned
 * rules: 41 have at least one schema property absent from `defaultOptions`,
 * which is the set where an unguarded read is genuinely reachable; 29 are
 * neutralized that way; and 1 declares a non-object head schema, to which the
 * question does not apply. The reachable set is asserted below, because a sweep
 * of 245k pairs whose reachable set had collapsed to zero would still read
 * clean.
 *
 * Verified by mutation against a shipped rule rather than by planted controls
 * alone: restoring `enforce-dynamic-imports`'s `buildLibraryMatcher(libraries)`
 * to its pre-guard spelling (dropping `?? []`) fails this suite naming the rule,
 * the payload and the fixture. The same mutation applied to a rule in the
 * neutralized 29 does NOT fail it — correctly, since `applyDefault` makes that
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

const PREFIX = '@blumintinc/blumint/';

/**
 * Fixtures probed per (payload, owner). Uncapped, one huge corpus would
 * dominate the sweep without adding shape diversity; at 2 every suite still
 * contributes and the run stays inside a normal test budget.
 *
 * The cap discards far more than it keeps — 14.86M of 15.11M (rule, payload,
 * fixture) triples — so WHICH two it keeps is the whole of the sweep's reach.
 * Taken in fixed corpus order, every payload of every rule spends its budget on
 * the same first two fixtures of each owner: 245k pairs landing on 388 distinct
 * fixtures, 1.6% of the corpus. The window is therefore offset by a hash of the
 * (rule, payload, owner) key, which leaves the pair count untouched and lifts
 * the distinct-fixture union to 23,487, 98% of the corpus. `capSkipped` and both
 * unions are counted and asserted below: a discard no `expect` reads is how a
 * sweep comes to measure 1.6% of what its header claims.
 */
const CAP = 2;

type Payload = OptionPayload;

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
  /** (rule, payload, fixture) triples the cap drops, the sweep's big discard. */
  capSkipped: number;
  /** Its denominator, so `crossPairs + capSkipped` is a closed account. */
  crossTriplesPossible: number;
  /** Distinct fixtures the rotated window actually lints. */
  distinctFixturesLinted: number;
  /** What the same cap would have reached in fixed corpus order. */
  distinctFixturesFixedOrder: number;
  /** Baseline lints run, the population `defaultOnlyCrashes` is drawn from. */
  defaultArmLints: number;
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
  capSkipped: 0,
  crossTriplesPossible: 0,
  distinctFixturesLinted: 0,
  distinctFixturesFixedOrder: 0,
  defaultArmLints: 0,
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
 * The default-options result for one (rule, fixture), computed once.
 *
 * Rotation makes a fixture reachable by many payloads of the same rule, so
 * without this cache the baseline arm would be re-linted per payload — the
 * comparison is against DEFAULT options, which cannot depend on the payload.
 */
type DefaultArm = {
  threw: boolean;
  message: string;
  signature: string;
  /** Whether this rule's default crash on this fixture is already reported. */
  crashRecorded: boolean;
};

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

  /**
   * Owner groups in corpus order. The cap is per (payload, owner), so what it
   * selects is a slice of ONE owner's fixtures; grouping makes that slice
   * addressable instead of leaving it implicit in a flat walk that can only
   * ever hand out the head of each group.
   */
  const byOwner = new Map<string, FixtureCase[]>();
  for (const { owner, testCase } of allCases) {
    const group = byOwner.get(owner);
    if (group) group.push(testCase);
    else byOwner.set(owner, [testCase]);
  }

  const linted = new Set<FixtureCase>();
  const lintedFixedOrder = new Set<FixtureCase>();

  for (const [name, rule] of Object.entries(rules)) {
    if (!optionSchemaOf(rule).length) continue;
    const ruleId = PREFIX + name;
    const declared = ownCasesOf(name)
      .map((testCase) => testCase.options)
      .filter((options): options is readonly unknown[] =>
        Boolean(options && options.length),
      );
    const payloads = buildOptionPayloads(rule, declared);
    totals.payloadsBuilt += payloads.length;

    // Screen each payload with ESLint's OWN option validator: a payload the
    // schema rejects is one no consumer can write, so a crash under it is a
    // fabrication rather than a defect.
    const screened = screenPayloads(rule, payloads);
    totals.payloadsRejected += screened.rejected.length;
    const valid: Payload[] = screened.valid;
    totals.payloadsSchemaValid += valid.length;
    if (!valid.length) continue;
    totals.rulesProbed++;

    const defaultArm = new Map<FixtureCase, DefaultArm>();
    const armFor = (testCase: FixtureCase, filename: string): DefaultArm => {
      const cached = defaultArm.get(testCase);
      if (cached) return cached;
      totals.defaultArmLints++;
      let arm: DefaultArm;
      try {
        const messages = linter.verify(
          testCase.code,
          configFor(testCase, ruleId, null) as any,
          filename,
        );
        arm = {
          threw: false,
          message: '',
          signature: signature(messages),
          crashRecorded: false,
        };
      } catch (error) {
        arm = {
          threw: true,
          message: String((error as Error).message).split('\n')[0],
          signature: '',
          crashRecorded: false,
        };
      }
      defaultArm.set(testCase, arm);
      return arm;
    };

    for (const [owner, ownerCases] of byOwner) {
      if (owner === name) {
        totals.ownPairsSkipped += ownerCases.length;
        continue;
      }
      for (const fixed of fixedWindow(ownerCases, CAP)) {
        lintedFixedOrder.add(fixed);
      }

      for (const payload of valid) {
        totals.crossTriplesPossible += ownerCases.length;
        const window = rotatedWindow(
          `${name} ${payload.key} ${owner}`,
          ownerCases,
          CAP,
        );
        totals.capSkipped += ownerCases.length - window.length;

        for (const testCase of window) {
          const filename = defaultFilenameFor(testCase);
          totals.crossPairs++;
          linted.add(testCase);

          let messages: Linter.LintMessage[];
          try {
            messages = linter.verify(
              testCase.code,
              configFor(testCase, ruleId, payload.options) as any,
              filename,
            );
          } catch (error) {
            const arm = armFor(testCase, filename);
            if (arm.threw) {
              totals.defaultArmCrashes++;
              // Already carried by this finding's `alsoCrashesAtDefault`.
              arm.crashRecorded = true;
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
              alsoCrashesAtDefault: arm.threw,
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

          const arm = armFor(testCase, filename);
          /**
           * A crash under DEFAULT options on a foreign fixture is a finding in
           * its own right, and this sweep is where it surfaces: recorded once
           * per (rule, fixture) rather than once per payload, so one crash is
           * not counted N times.
           */
          if (arm.threw && !arm.crashRecorded) {
            arm.crashRecorded = true;
            totals.defaultOnlyCrashes++;
            findings.push({
              rule: name,
              payload: 'DEFAULT',
              payloadSource: 'default-options',
              owner,
              origin: testCase.origin,
              bucket: testCase.bucket,
              filename,
              message: arm.message,
              alsoCrashesAtDefault: true,
            });
          }
          if (!arm.threw && signature(messages) !== arm.signature) {
            totals.crossPairsPayloadChangedOutput++;
          }
        }
      }
    }
  }

  totals.distinctFixturesLinted = linted.size;
  totals.distinctFixturesFixedOrder = lintedFixedOrder.size;
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

/**
 * Indexes into `options[0]`, which any payload supplies and the DEFAULT arm
 * does not — so it crashes on the baseline lint alone while every payload arm
 * succeeds. It is the only shape that drives `defaultOnlyCrashes` off zero, and
 * without it that counter's assertion could only ever confirm a value it had no
 * way to leave.
 */
const DEFAULT_ONLY_CRASHING_CONTROL = {
  meta: {
    type: 'suggestion',
    schema: CONTROL_SCHEMA,
    messages: { m: 'x' },
  },
  create(context: any) {
    const list: string[] = (context.options as any[])[0].list ?? [];
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
  (name) => optionSchemaOf(plugin.rules[name]).length > 0,
);

const result = sweep(
  plugin.rules,
  allCases,
  (name) => corpus.byRule.get(name) || [],
);
const { totals, findings } = result;

/**
 * Floors sit just under the values measured at 1.20.198, not at a round number
 * far below them: the floors that let #1984 through sat at 5,500 against an
 * actual 8,141, which is slack wide enough to hide a corpus that has silently
 * stopped being swept.
 */
const OPTIONED_RULE_FLOOR = 68; // measured 71
const PAYLOAD_FLOOR = 620; // measured 635
const PAYLOADS_BUILT_FLOOR = 650; // measured 670
const CROSS_PAIR_FLOOR = 240_000; // measured 245,110
const CAP_SKIPPED_FLOOR = 14_500_000; // measured 14,859,977
const DEFAULT_ARM_FLOOR = 200_000; // measured 204,105
const DISTINCT_FIXTURE_FLOOR = 23_000; // measured 23,487
const REPORTING_FLOOR = 19_000; // measured 19,474
const PAYLOAD_CHANGED_FLOOR = 4_000; // measured 4,124
const OWN_SKIPPED_FLOOR = 10_400; // measured 10,624
const CASE_FLOOR = 23_500; // measured 23,932
const REACHABLE_FLOOR = 40; // measured 41

/**
 * The rotation must buy an order of magnitude, or it is not worth the baseline
 * lints it costs. Cut as a RATIO against the fixed-order union the same cap
 * would have taken, so reverting the rotation (which makes the two equal) fails
 * here rather than passing with a smaller corpus.
 */
const ROTATION_GAIN = 10;

/** The share of the corpus the sweep must actually lint. */
const CORPUS_COVERAGE = 0.95;

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
    expect(optionedRuleNames.length).toBeGreaterThanOrEqual(
      OPTIONED_RULE_FLOOR,
    );
    expect(totals.payloadsSchemaValid).toBeGreaterThanOrEqual(PAYLOAD_FLOOR);
    expect(totals.crossPairs).toBeGreaterThanOrEqual(CROSS_PAIR_FLOOR);
    expect(totals.ownPairsSkipped).toBeGreaterThanOrEqual(OWN_SKIPPED_FLOOR);
  });

  it('accounts for every triple the cap discards', () => {
    // The cap drops ~98% of the possible triples. Left uncounted, that discard
    // is indistinguishable from a sweep that covered them — which is precisely
    // how a 245k-pair sweep came to touch 388 fixtures while its header claimed
    // the whole corpus.
    expect(totals.crossPairs + totals.capSkipped).toBe(
      totals.crossTriplesPossible,
    );
    expect(totals.capSkipped).toBeGreaterThanOrEqual(CAP_SKIPPED_FLOOR);
  });

  it('spreads the cap over the corpus rather than re-linting its head', () => {
    expect(totals.distinctFixturesLinted).toBeGreaterThanOrEqual(
      DISTINCT_FIXTURE_FLOOR,
    );
    expect(
      totals.distinctFixturesLinted / allCases.length,
    ).toBeGreaterThanOrEqual(CORPUS_COVERAGE);
    // A fixed-order cap hands every payload the same head of each owner group,
    // so this is what the sweep would reach without the rotation.
    expect(totals.distinctFixturesFixedOrder).toBeGreaterThan(0);
    expect(
      totals.distinctFixturesLinted /
        Math.max(1, totals.distinctFixturesFixedOrder),
    ).toBeGreaterThanOrEqual(ROTATION_GAIN);
  });

  it('accounts for every payload it builds', () => {
    expect(totals.payloadsBuilt).toBe(
      totals.payloadsSchemaValid + totals.payloadsRejected,
    );
    expect(totals.payloadsBuilt).toBeGreaterThanOrEqual(PAYLOADS_BUILT_FLOOR);
  });

  it('gives every option property a value some payload carries', () => {
    /**
     * A property the synthesizer can only produce as an empty container is
     * probed at a value the rule cannot tell from its default, so the branch
     * behind it is entered and never fed — a discard that reads exactly like a
     * rule with no option to drive. Named rather than counted: `sideEffectPatterns`
     * (`anyOf: [string, RegExp]`) collapsed to the empty list on every payload,
     * and a count would have said 1 without saying which.
     */
    const unexpressed = optionedRuleNames.flatMap((name) =>
      unexpressedProperties(plugin.rules[name]).map(
        (prop) => `${name}.${prop}`,
      ),
    );
    expect(unexpressed).toEqual([]);
  });

  it('accounts for the default arm it compares against', () => {
    // Every default-options crash and every "payload crashed and so does the
    // default" pair is carried by a finding, so the counters and the findings
    // are one account. A counter no `expect` reads cannot fail when it drifts.
    expect(totals.defaultArmLints).toBeGreaterThanOrEqual(DEFAULT_ARM_FLOOR);
    expect(totals.defaultOnlyCrashes).toBe(
      findings.filter((f) => f.payload === 'DEFAULT').length,
    );
    expect(totals.defaultArmCrashes).toBe(
      findings.filter((f) => f.payload !== 'DEFAULT' && f.alsoCrashesAtDefault)
        .length,
    );
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
    const arrayHead = payloadScreenFor({
      meta: { schema: [{ type: 'array', items: { type: 'object' } }] },
    });
    expect(arrayHead).not.toBeNull();
    // The exact payload that manufactured 77 fake findings before the screen.
    expect(arrayHead!([{}])).toBe(false);
    expect(arrayHead!([[]])).toBe(true);

    const objectHead = payloadScreenFor({
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
     * the sweep cannot quietly become 245k pairs over a population where every
     * option is pre-filled and no crash is possible.
     */
    const reachable = optionedRuleNames.filter((name) => {
      const head = optionSchemaOf(plugin.rules[name])[0];
      if (!head?.properties) return false;
      const defaults = plugin.rules[name].defaultOptions?.[0] ?? {};
      return Object.keys(head.properties).some((prop) => !(prop in defaults));
    });
    expect(reachable.length).toBeGreaterThanOrEqual(REACHABLE_FLOOR);
  });

  it('every optioned rule reached the sweep', () => {
    // A rule whose payloads are ALL schema-rejected drops out of `rulesProbed`
    // silently; the population itself carries the floor above, so this is an
    // equality rather than a second floor that could never fail beneath it.
    expect(totals.rulesProbed).toBe(optionedRuleNames.length);
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
      // This control throws on the default arm too, so it is what drives
      // `defaultArmCrashes` off zero and keeps its assertion honest.
      expect(control.totals.defaultArmCrashes).toBeGreaterThan(0);
      expect(control.totals.defaultArmCrashes).toBe(
        control.findings.filter(
          (f) => f.payload !== 'DEFAULT' && f.alsoCrashesAtDefault,
        ).length,
      );
      // The cap discards, and the discard is counted rather than dropped.
      expect(control.totals.capSkipped).toBeGreaterThan(0);
      expect(control.totals.crossPairs + control.totals.capSkipped).toBe(
        control.totals.crossTriplesPossible,
      );
    });

    it('catches a crash the payload arm hides (default-arm control)', () => {
      const control = sweep(
        { __control_default_only__: DEFAULT_ONLY_CRASHING_CONTROL },
        slice,
        () => [],
      );
      expect(control.totals.defaultArmLints).toBeGreaterThan(0);
      expect(control.totals.defaultOnlyCrashes).toBeGreaterThan(0);
      expect(control.findings.length).toBeGreaterThan(0);
      expect(control.findings.every((f) => f.payload === 'DEFAULT')).toBe(true);
      expect(control.totals.defaultOnlyCrashes).toBe(
        control.findings.filter((f) => f.payload === 'DEFAULT').length,
      );
      // The payload arm itself is clean, which is what makes this a crash the
      // payload sweep alone cannot see.
      expect(control.totals.defaultArmCrashes).toBe(0);
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

    it('rotates deterministically (the same commit selects the same pairs)', () => {
      // A guard is a build gate, so the selection must not vary between runs.
      const first = sweep({ __control_safe__: SAFE_CONTROL }, slice, () => []);
      const second = sweep({ __control_safe__: SAFE_CONTROL }, slice, () => []);
      expect(second.totals.distinctFixturesLinted).toBe(
        first.totals.distinctFixturesLinted,
      );
      expect(second.totals.crossPairs).toBe(first.totals.crossPairs);
      // And it is a rotation, not the identity: the fixed-order window over the
      // same slice reaches strictly fewer fixtures.
      expect(first.totals.distinctFixturesLinted).toBeGreaterThan(
        first.totals.distinctFixturesFixedOrder,
      );
    });
  });
});

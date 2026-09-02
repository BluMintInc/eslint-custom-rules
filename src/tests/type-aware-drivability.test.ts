/**
 * Two-way accounting for the type-aware exemption twelve repo-wide guards hold.
 *
 * `typeAwareRuleNames` is a source-text fact: a rule mentions `getParserServices`
 * or `getTypeChecker` somewhere. Twelve guards used to exclude that whole set,
 * justified by "a bare `Linter` has no program, so these rules report nothing and
 * would manufacture a false clean". Measured, that premise is false for ALL 16
 * members — they report 500+ times over their own fixtures under exactly the
 * bare `Linter` those guards build. The premise fails twice over: the type query
 * is normally one predicate inside a rule whose other paths are syntactic, and
 * `@typescript-eslint/parser` hands back an ISOLATED single-file program even
 * with no `project`, so `services.program` is present and the checker answers.
 * The exemption was hiding live coverage, not protecting against a false clean
 * (#1859).
 *
 * The exclusion now names `silentWithoutProgramRuleNames`, a hard-coded list.
 * A hard-coded measured list rots in exactly one direction — a rule listed as
 * undrivable starts being drivable, and its exemption stays open forever — so
 * this suite closes both directions:
 *
 *   - every member of `typeAwareRuleNames` either measurably REPORTS here, or
 *     appears in `silentWithoutProgramRuleNames`;
 *   - every member of `silentWithoutProgramRuleNames` measurably reports NOTHING.
 *     A stale entry FAILS rather than silently un-gating twelve guards.
 *
 * This is the shape `docs-options-schema` and `rules-anchor-at-eslint-cwd`
 * already use: the skipped set is asserted, not inherited.
 *
 * Non-vacuity is asserted three ways, because a harness that has stopped linting
 * would satisfy the second direction trivially and read as a clean sweep:
 * floors on rules considered and on total reports, and a planted positive AND
 * negative control proving this exact configuration can both report and stay
 * silent.
 */
import { Linter } from 'eslint';
import {
  harvestFixtureCorpus,
  defaultFilenameFor,
  defineCorpusParsers,
  parserKeyFor,
  parserOptionsFor,
  severityWithOptions,
  typeAwareRuleNames,
  silentWithoutProgramRuleNames,
  ruleNameByIdentity,
  FixtureCase,
} from '../utils/fixtureCorpus';

const ruleByName = new Map<string, unknown>(
  [...ruleNameByIdentity].map(([rule, name]) => [name, rule]),
);

const linter = new Linter();
defineCorpusParsers(linter);
for (const [name, rule] of ruleByName) {
  linter.defineRule(`b/${name}`, rule as never);
}

type Measurement = {
  rule: string;
  cases: number;
  reports: number;
  fatals: number;
  crashes: number;
  /** First reporting fixture, so a stale exemption is reproducible by hand. */
  witness?: { origin: string; bucket: string; code: string };
};

const lintOne = (id: string, testCase: FixtureCase) =>
  linter.verify(
    testCase.code,
    {
      // The fixture's own parser. Drivability is asked of every language the
      // corpus carries, and a JSON fixture read as TypeScript is a fatal that
      // this measurement would count as the rule staying silent (#1860).
      parser: parserKeyFor(testCase),
      parserOptions: parserOptionsFor(testCase),
      rules: { [id]: severityWithOptions(testCase) },
    },
    defaultFilenameFor(testCase),
  );

const measure = (rule: string, cases: FixtureCase[]): Measurement => {
  const id = `b/${rule}`;
  const measurement: Measurement = {
    rule,
    cases: cases.length,
    reports: 0,
    fatals: 0,
    crashes: 0,
  };
  for (const testCase of cases) {
    let messages;
    try {
      messages = lintOne(id, testCase);
    } catch {
      // A crash is undrivability of a different kind, counted rather than
      // swallowed: it must not read as "reported nothing".
      measurement.crashes++;
      continue;
    }
    for (const message of messages) {
      if (message.fatal) {
        measurement.fatals++;
        continue;
      }
      if (message.ruleId !== id) continue;
      measurement.reports++;
      if (!measurement.witness) {
        measurement.witness = {
          origin: testCase.origin,
          bucket: testCase.bucket,
          code: testCase.code.trim().slice(0, 200),
        };
      }
    }
  }
  return measurement;
};

const corpus = harvestFixtureCorpus();
const candidates = [...typeAwareRuleNames].sort();
const measurements = candidates.map((rule) =>
  measure(rule, corpus.byRule.get(rule) || []),
);
const byRule = new Map(measurements.map((m) => [m.rule, m]));

const reporting = measurements.filter((m) => m.reports > 0);
const silent = measurements.filter((m) => m.reports === 0);
const totalReports = measurements.reduce((sum, m) => sum + m.reports, 0);

/**
 * Floors chosen well under the measurement (16 candidates, 16 reporting, 500+
 * reports) so ordinary rule churn does not trip them, but far enough above zero
 * that a harness which stopped linting cannot pass.
 */
const MIN_CANDIDATES = 10; // measured 16
const MIN_REPORTING = 10; // measured 16
const MIN_REPORTS = 1102; // measured 1,247

const describeMeasurement = (m: Measurement) =>
  `${m.rule}: ${m.reports} reports over ${m.cases} cases` +
  `${m.fatals ? `, ${m.fatals} fatal` : ''}` +
  `${m.crashes ? `, ${m.crashes} crashes` : ''}` +
  `${m.witness ? ` — first at ${m.witness.origin} (${m.witness.bucket})` : ''}`;

describe('type-aware rules are drivable without a program', () => {
  beforeAll(() => {
    // The measurement itself, printed: a filter whose skipped set is invisible
    // becomes a permanent blind spot, which is the defect this suite closes.
    // eslint-disable-next-line no-console
    console.log(
      `[type-aware-drivability] ${reporting.length}/${candidates.length} ` +
        `candidates report, ${totalReports} reports; exempt: ` +
        `${[...silentWithoutProgramRuleNames].join(', ') || '(none)'}\n` +
        measurements
          .slice()
          .sort((a, b) => b.reports - a.reports)
          .map((m) => `  ${describeMeasurement(m)}`)
          .join('\n'),
    );
  });

  it('has a non-vacuous corpus and candidate set', () => {
    expect(corpus.totalCases).toBeGreaterThan(21500); // measured 23,980
    expect(candidates.length).toBeGreaterThanOrEqual(MIN_CANDIDATES);
    // Every candidate must be a registered rule, or its measurement is a
    // fabricated zero rather than a fact about the rule.
    expect(candidates.filter((name) => !ruleByName.has(name))).toEqual([]);
  });

  it('reports over its own fixtures under a bare Linter for most candidates', () => {
    expect(reporting.length).toBeGreaterThanOrEqual(MIN_REPORTING);
    expect(totalReports).toBeGreaterThanOrEqual(MIN_REPORTS);
  });

  it('accounts for every candidate: it reports, or it is a named exemption', () => {
    const unaccounted = silent
      .filter((m) => !silentWithoutProgramRuleNames.has(m.rule))
      .map(describeMeasurement);
    expect(unaccounted).toEqual([]);
  });

  it('holds no stale exemption: every listed rule is measurably silent', () => {
    const stale = [...silentWithoutProgramRuleNames]
      .map((rule) => byRule.get(rule))
      .filter((m): m is Measurement => !!m && m.reports > 0)
      .map(
        (m) =>
          `${describeMeasurement(m)} — remove it from ` +
          `silentWithoutProgramRuleNames and let the twelve guards probe it`,
      );
    expect(stale).toEqual([]);
  });

  it('lists only rules the candidate set contains', () => {
    // An entry outside `typeAwareRuleNames` is never measured by the two
    // assertions above, so it would be an exemption nothing can retire.
    const orphans = [...silentWithoutProgramRuleNames].filter(
      (rule) => !typeAwareRuleNames.has(rule),
    );
    expect(orphans).toEqual([]);
  });
});

describe('controls: this harness can both report and stay silent', () => {
  /**
   * A syntactic rule with no type dependence at all. If the positive control
   * goes quiet, every "0 reports" above is a harness failure being read as a
   * fact about a rule.
   */
  const CONTROL_RULE = 'prefer-fragment-shorthand';

  const asCase = (code: string): FixtureCase => ({
    code,
    tester: 'ruleTesterJsx',
    language: 'ts',
    origin: 'type-aware-drivability.test.ts',
    bucket: 'invalid',
  });

  it('reports on a planted violation', () => {
    const messages = lintOne(
      `b/${CONTROL_RULE}`,
      asCase('const A = () => <React.Fragment><div /></React.Fragment>;'),
    );
    expect(
      messages.filter((m) => m.ruleId === `b/${CONTROL_RULE}`).length,
    ).toBeGreaterThan(0);
  });

  it('stays silent on a planted clean input', () => {
    const messages = lintOne(
      `b/${CONTROL_RULE}`,
      asCase('const A = () => <><div /></>;'),
    );
    expect(messages.filter((m) => m.fatal)).toEqual([]);
    expect(messages.filter((m) => m.ruleId === `b/${CONTROL_RULE}`)).toEqual(
      [],
    );
  });
});

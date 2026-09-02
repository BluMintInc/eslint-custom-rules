/**
 * `CASES_ALLOWED_TO_SUPPRESS` must stay EXACT, not merely an upper bound.
 *
 * The runtime check in `assertValidCasesCanFail` fires only when a suite's
 * blanket-suppressed `valid` cases EXCEED its allowance (`suppressed <= allowed`
 * passes), so it enforces a ceiling. The map's own contract says "Counts are
 * exact — not a minimum — so a newly added inert case fails here instead of
 * shipping", and the ceiling alone cannot deliver that: the moment a suppressed
 * case is removed or rewritten, the freed slack silently absorbs the NEXT inert
 * case, which is precisely the regression the allowance exists to block. A
 * stale allowance is a stale baseline, and a stale baseline absorbs the next
 * real finding.
 *
 * This guard supplies the missing direction: the harvested corpus is measured
 * and every entry must match its allowance exactly, so an entry that can shrink
 * MUST shrink, in the same commit that made it shrinkable.
 *
 * Aggregation is by the DISPLAY name passed to `run()` — the same key the
 * runtime check uses, because that is the name `RuleTester` registers and a
 * fixture's directive suppresses. Where several suites run under one name, the
 * runtime check sees each call alone, so per-call ceilings can hide a doubled
 * total; the aggregate here is what pins it.
 */
import { harvestRuleTesterCases } from '../utils/harvestRuleTesterCases';
import {
  CASES_ALLOWED_TO_SUPPRESS,
  suppressesRuleUnderTest,
} from '../utils/validCaseFalsifiability';

const harvested = harvestRuleTesterCases();

const suppressedByRunName = new Map<string, number>();
for (const suite of harvested.suites) {
  let suppressed = 0;
  for (const raw of suite.valid) {
    const code =
      typeof raw === 'string' ? raw : (raw as { code?: string })?.code ?? '';
    if (suppressesRuleUnderTest(code, suite.name)) suppressed++;
  }
  if (suppressed > 0) {
    suppressedByRunName.set(
      suite.name,
      (suppressedByRunName.get(suite.name) || 0) + suppressed,
    );
  }
}

describe('valid-case suppression allowances', () => {
  it('holds no stale allowance: every entry matches its measured count', () => {
    const mismatched = Object.entries(CASES_ALLOWED_TO_SUPPRESS)
      .map(([name, allowed]) => ({
        name,
        allowed,
        actual: suppressedByRunName.get(name) ?? 0,
      }))
      .filter(({ allowed, actual }) => allowed !== actual);
    if (mismatched.length > 0) {
      throw new Error(
        [
          'CASES_ALLOWED_TO_SUPPRESS disagrees with the measured corpus:',
          ...mismatched.map(
            ({ name, allowed, actual }) =>
              `  ${name}: allows ${allowed}, corpus has ${actual}`,
          ),
          '',
          'An allowance above the real count is slack that silently absorbs',
          'the next inert case; lower it to the measured number. One below',
          'means a new blanket-suppressed case shipped; remove the directive',
          'or, if the suppression is the subject of the test (#1404), raise',
          'the entry deliberately. The map should only ever shrink (#1489).',
        ].join('\n'),
      );
    }
    expect(mismatched).toEqual([]);
  });

  it('finds no suppressed case outside the allowance map', () => {
    // The runtime ceiling already throws for these mid-`run()`; asserting it
    // here too means a bypassed or lazily-loaded suite still cannot slip one in.
    const unlisted = [...suppressedByRunName.keys()].filter(
      (name) => !(name in CASES_ALLOWED_TO_SUPPRESS),
    );
    expect(unlisted).toEqual([]);
  });

  it('measures a corpus large enough to mean anything', () => {
    // 338 suites and 10 allowance entries at the time of writing; a harvest
    // that collapsed would satisfy both closures above with zeroes.
    expect(harvested.suites.length).toBeGreaterThan(300); // measured 372
    expect(
      Object.keys(CASES_ALLOWED_TO_SUPPRESS).length,
    ).toBeGreaterThanOrEqual(10); // measured 10
    expect(
      [...suppressedByRunName.values()].reduce((a, b) => a + b, 0),
    ).toBeGreaterThanOrEqual(21); // measured 21
  });

  it('detects a suppressed case (positive control) and a clean one (negative)', () => {
    expect(
      suppressesRuleUnderTest(
        '/* eslint-disable my-rule */\nconst x = 1;',
        'my-rule',
      ),
    ).toBe(true);
    expect(
      suppressesRuleUnderTest('/* eslint-disable */\nconst x = 1;', 'my-rule'),
    ).toBe(true);
    // Line-scoped directives pin a location, so they stay falsifiable.
    expect(
      suppressesRuleUnderTest(
        '// eslint-disable-next-line my-rule\nconst x = 1;',
        'my-rule',
      ),
    ).toBe(false);
    expect(suppressesRuleUnderTest('const x = 1;', 'my-rule')).toBe(false);
  });
});

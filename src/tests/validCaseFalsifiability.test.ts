import {
  CASES_ALLOWED_TO_SUPPRESS,
  LINE_SCOPED_CASES_ALLOWED_TO_SUPPRESS,
  assertValidCasesCanFail,
  lineScopedCoverage,
  lineScopedDirectives,
  suppressesRuleUnderTest,
} from '../utils/validCaseFalsifiability';

// Using require to avoid test build-time ESM interop issues; only the rule
// name set is needed here.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as { rules: Record<string, unknown> };

const RULE = 'foo-bar';

describe('suppressesRuleUnderTest', () => {
  it('flags a bare block disable, which turns off every rule', () => {
    expect(
      suppressesRuleUnderTest('/* eslint-disable */\nconst a = 1;', RULE),
    ).toBe(true);
  });

  it('flags a block disable naming the rule under test', () => {
    expect(
      suppressesRuleUnderTest(
        '/* eslint-disable foo-bar */\nconst a = 1;',
        RULE,
      ),
    ).toBe(true);
  });

  it('flags the rule when listed among several', () => {
    expect(
      suppressesRuleUnderTest(
        '/* eslint-disable no-console, foo-bar */\nconst a = 1;',
        RULE,
      ),
    ).toBe(true);
  });

  it('flags a disable that is later re-enabled, since the covered region still lies', () => {
    const code =
      '/* eslint-disable foo-bar */\nconst a = 1;\n/* eslint-enable foo-bar */';
    expect(suppressesRuleUnderTest(code, RULE)).toBe(true);
  });

  it('flags a multi-line block disable', () => {
    expect(
      suppressesRuleUnderTest(
        '/* eslint-disable\n   foo-bar */\nconst a = 1;',
        RULE,
      ),
    ).toBe(true);
  });

  it('strips a -- justification before reading the rule list', () => {
    expect(
      suppressesRuleUnderTest(
        '/* eslint-disable foo-bar -- legacy module */\nconst a = 1;',
        RULE,
      ),
    ).toBe(true);
  });

  it('does not read a rule name out of the justification alone', () => {
    expect(
      suppressesRuleUnderTest(
        '/* eslint-disable no-console -- foo-bar is fine here */\nconst a = 1;',
        RULE,
      ),
    ).toBe(false);
  });

  it('ignores a block disable naming a different rule', () => {
    expect(
      suppressesRuleUnderTest(
        '/* eslint-disable no-console */\nconst a = 1;',
        RULE,
      ),
    ).toBe(false);
  });

  it('ignores a longer rule name that starts with this one', () => {
    expect(
      suppressesRuleUnderTest(
        '/* eslint-disable foo-bar-baz */\nconst a = 1;',
        RULE,
      ),
    ).toBe(false);
  });

  // Line-scoped directives pin the report to a line, so a rule that moved or
  // widened its report still escapes them and fails the case.
  it('ignores eslint-disable-next-line', () => {
    expect(
      suppressesRuleUnderTest(
        '/* eslint-disable-next-line foo-bar */\nconst a = 1;',
        RULE,
      ),
    ).toBe(false);
  });

  it('ignores eslint-disable-line', () => {
    expect(
      suppressesRuleUnderTest(
        'const a = 1; /* eslint-disable-line foo-bar */',
        RULE,
      ),
    ).toBe(false);
  });

  it('ignores the line-comment form, which ESLint does not treat as a directive', () => {
    expect(
      suppressesRuleUnderTest('// eslint-disable foo-bar\nconst a = 1;', RULE),
    ).toBe(false);
  });

  // RuleTester knows the rule only by its bare name, so a prefixed id suppresses
  // nothing and the case still has teeth.
  it('ignores a plugin-prefixed id', () => {
    expect(
      suppressesRuleUnderTest(
        '/* eslint-disable @blumintinc/blumint/foo-bar */\nconst a = 1;',
        RULE,
      ),
    ).toBe(false);
  });

  it('ignores a directive-like word that is not a directive', () => {
    expect(
      suppressesRuleUnderTest(
        '/* eslint-disabled foo-bar */\nconst a = 1;',
        RULE,
      ),
    ).toBe(false);
  });

  it('reports nothing for code with no comments', () => {
    expect(suppressesRuleUnderTest('const a = 1;', RULE)).toBe(false);
  });

  it('finds a directive that is not the first comment', () => {
    const code =
      '/* banner */\n// note\n/* eslint-disable foo-bar */\nconst a = 1;';
    expect(suppressesRuleUnderTest(code, RULE)).toBe(true);
  });

  it('scans every directive rather than stopping at the first', () => {
    const code =
      '/* eslint-disable no-console */\n/* eslint-disable foo-bar */';
    expect(suppressesRuleUnderTest(code, RULE)).toBe(true);
  });

  // The matcher is module-scope, so a stale lastIndex would make results depend
  // on call order.
  it('does not carry regex state between calls', () => {
    const code = '/* eslint-disable foo-bar */\nconst a = 1;';
    expect(suppressesRuleUnderTest(code, RULE)).toBe(true);
    expect(suppressesRuleUnderTest(code, RULE)).toBe(true);
    expect(suppressesRuleUnderTest(code, RULE)).toBe(true);
  });
});

describe('lineScopedDirectives', () => {
  it('reads eslint-disable-next-line as covering the following line', () => {
    expect(
      lineScopedDirectives('// eslint-disable-next-line foo-bar\nx;'),
    ).toEqual([{ kind: 'next-line', covers: 2, rules: new Set([RULE]) }]);
  });

  it('reads eslint-disable-line as covering its own line', () => {
    expect(
      lineScopedDirectives('x;\ny; // eslint-disable-line foo-bar'),
    ).toEqual([{ kind: 'line', covers: 2, rules: new Set([RULE]) }]);
  });

  it('reads the block spelling, which ESLint also honours', () => {
    expect(
      lineScopedDirectives('/* eslint-disable-next-line foo-bar */\nx;'),
    ).toEqual([{ kind: 'next-line', covers: 2, rules: new Set([RULE]) }]);
  });

  // The directive applies to the line after the comment ENDS, so a block form
  // spanning lines does not cover the line following its opening delimiter.
  it('counts from the end of a multi-line block directive', () => {
    expect(
      lineScopedDirectives('/* eslint-disable-next-line\n   foo-bar */\nx;'),
    ).toEqual([{ kind: 'next-line', covers: 3, rules: new Set([RULE]) }]);
  });

  it('carries a bare directive as null, since it disables every rule', () => {
    expect(lineScopedDirectives('// eslint-disable-next-line\nx;')).toEqual([
      { kind: 'next-line', covers: 2, rules: null },
    ]);
  });

  it('keeps every listed rule and drops the justification', () => {
    expect(
      lineScopedDirectives(
        '// eslint-disable-next-line no-console, foo-bar -- legacy\nx;',
      ),
    ).toEqual([
      { kind: 'next-line', covers: 2, rules: new Set(['no-console', RULE]) },
    ]);
  });

  it('ignores a block disable, which is not line-scoped', () => {
    expect(lineScopedDirectives('/* eslint-disable foo-bar */\nx;')).toEqual(
      [],
    );
  });

  it('finds every directive in the fixture, not just the first', () => {
    expect(
      lineScopedDirectives(
        '// eslint-disable-next-line foo-bar\na;\n// eslint-disable-next-line foo-bar\nb;',
      ).map((directive) => directive.covers),
    ).toEqual([2, 4]);
  });

  it('does not carry regex state between calls', () => {
    const code = '// eslint-disable-next-line foo-bar\nx;';
    expect(lineScopedDirectives(code)).toHaveLength(1);
    expect(lineScopedDirectives(code)).toHaveLength(1);
    expect(lineScopedDirectives(code)).toHaveLength(1);
  });
});

describe('lineScopedCoverage', () => {
  it('covers the line a directive naming the rule pins', () => {
    expect([
      ...lineScopedCoverage('// eslint-disable-next-line foo-bar\nx;', RULE),
    ]).toEqual([2]);
  });

  it('covers the line a BARE directive pins, which disables everything', () => {
    expect([
      ...lineScopedCoverage('// eslint-disable-next-line\nx;', RULE),
    ]).toEqual([2]);
  });

  it('covers nothing when the directive names another rule', () => {
    expect([
      ...lineScopedCoverage('// eslint-disable-next-line no-console\nx;', RULE),
    ]).toEqual([]);
  });

  // `RuleTester` registers the rule under its bare name, so the prefixed id
  // suppresses nothing and the case keeps its teeth.
  it('covers nothing for a plugin-prefixed id', () => {
    expect([
      ...lineScopedCoverage(
        '// eslint-disable-next-line @blumintinc/blumint/foo-bar\nx;',
        RULE,
      ),
    ]).toEqual([]);
  });

  it('covers nothing for a longer rule name starting with this one', () => {
    expect([
      ...lineScopedCoverage(
        '// eslint-disable-next-line foo-bar-baz\nx;',
        RULE,
      ),
    ]).toEqual([]);
  });

  it('unions the lines of several directives', () => {
    expect([
      ...lineScopedCoverage(
        'a; // eslint-disable-line foo-bar\n// eslint-disable-next-line foo-bar\nb;',
        RULE,
      ),
    ]).toEqual([1, 3]);
  });
});

describe('assertValidCasesCanFail', () => {
  it('accepts cases that carry no directive', () => {
    expect(() =>
      assertValidCasesCanFail(RULE, ['const a = 1;', { code: 'const b = 2;' }]),
    ).not.toThrow();
  });

  it('accepts an empty valid array', () => {
    expect(() => assertValidCasesCanFail(RULE, [])).not.toThrow();
  });

  it('throws on a suppressed string case', () => {
    expect(() =>
      assertValidCasesCanFail(RULE, ['/* eslint-disable */\nconst a = 1;']),
    ).toThrow(/blanket-disable the rule under test/);
  });

  it('throws on a suppressed object case', () => {
    expect(() =>
      assertValidCasesCanFail(RULE, [
        { code: '/* eslint-disable foo-bar */\nconst a = 1;' },
      ]),
    ).toThrow(/blanket-disable the rule under test/);
  });

  it('names the rule and quotes the offending case', () => {
    expect(() =>
      assertValidCasesCanFail(RULE, [
        '/* eslint-disable */ const offender = 1;',
      ]),
    ).toThrow(/foo-bar[\s\S]*const offender = 1;/);
  });

  it('counts every suppressed case, not just the first', () => {
    expect(() =>
      assertValidCasesCanFail(RULE, [
        '/* eslint-disable */\nconst a = 1;',
        '/* eslint-disable foo-bar */\nconst b = 2;',
      ]),
    ).toThrow(/2 valid case\(s\)/);
  });

  it('tolerates a case object with no code property', () => {
    expect(() => assertValidCasesCanFail(RULE, [{}])).not.toThrow();
  });
});

describe('CASES_ALLOWED_TO_SUPPRESS', () => {
  const allowlisted = Object.keys(CASES_ALLOWED_TO_SUPPRESS);

  // A misspelled key silently allows nothing (the real rule keeps failing), but
  // it also outlives the rule it was written for, so the map would never shrink
  // to empty even once #1489 is resolved.
  it('names only rules the plugin ships', () => {
    const shipped = new Set(Object.keys(plugin.rules));
    expect(allowlisted.filter((name) => !shipped.has(name))).toEqual([]);
  });

  it('allows no rule more suppressed cases than it has', () => {
    expect(
      allowlisted.filter((name) => CASES_ALLOWED_TO_SUPPRESS[name] < 1),
    ).toEqual([]);
  });

  it('permits exactly the allowed count for an allowlisted rule', () => {
    const [name] = allowlisted;
    const allowed = CASES_ALLOWED_TO_SUPPRESS[name];
    const cases = Array.from(
      { length: allowed },
      (_unused, index) => `/* eslint-disable */\nconst a${index} = 1;`,
    );
    expect(() => assertValidCasesCanFail(name, cases)).not.toThrow();
  });

  it('rejects one case beyond the allowance', () => {
    const [name] = allowlisted;
    const allowed = CASES_ALLOWED_TO_SUPPRESS[name];
    const cases = Array.from(
      { length: allowed + 1 },
      (_unused, index) => `/* eslint-disable */\nconst a${index} = 1;`,
    );
    expect(() => assertValidCasesCanFail(name, cases)).toThrow(
      new RegExp(`${allowed + 1} valid case\\(s\\)`),
    );
  });
});

describe('LINE_SCOPED_CASES_ALLOWED_TO_SUPPRESS', () => {
  const allowlisted = Object.keys(LINE_SCOPED_CASES_ALLOWED_TO_SUPPRESS);

  it('names only rules the plugin ships', () => {
    const shipped = new Set(Object.keys(plugin.rules));
    expect(allowlisted.filter((name) => !shipped.has(name))).toEqual([]);
  });

  it('holds no entry that allows nothing', () => {
    expect(
      allowlisted.filter(
        (name) => LINE_SCOPED_CASES_ALLOWED_TO_SUPPRESS[name] < 1,
      ),
    ).toEqual([]);
  });

  // The two maps answer the same question for two spellings of the directive.
  // A case cannot be in both — a fixture carrying a block disable is counted by
  // the block map — so an overlapping ENTRY would mean one of them is wrong
  // about which spelling it measures. `line-scoped-suppression-exactness`
  // asserts the case-level partition over the real corpus.
  it('is measured by its own suite, not by the RuleTester hot path', () => {
    // `assertValidCasesCanFail` deliberately does not read this map: deciding
    // inertness needs a lint of the fixture, which a per-`run()` check cannot
    // afford. An entry here therefore constrains nothing until that suite runs.
    expect(() =>
      assertValidCasesCanFail(allowlisted[0], [
        '// eslint-disable-next-line ' + allowlisted[0] + '\nconst a = 1;',
      ]),
    ).not.toThrow();
  });
});

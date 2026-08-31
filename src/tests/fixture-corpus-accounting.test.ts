/**
 * Two-way accounting for the shared fixture corpus seventeen guards probe.
 *
 * A guard built on `harvestFixtureCorpus()` iterates the rules the corpus knows
 * about. A rule the corpus does NOT know about is therefore not merely
 * under-probed — it is absent from every population, so all seventeen iterate
 * past it, find nothing to drive, and pass. The rule is counted as covered while
 * asserting nothing, and no build step says so.
 *
 * That is what happened to `no-unpinned-dependencies` (declares only under
 * `ruleTesterJson`) and `enforce-typescript-markdown-code-blocks` (only under
 * `ruleTesterMarkdown`): the corpus discarded every suite whose tester was not a
 * TypeScript one, so both had zero fixtures. Both ship `recommended: 'error'`
 * with `fixable: 'code'` — they are enabled and autofixing consumer code — and
 * no repo-wide guard had ever exercised them (#1860).
 *
 * Fixing the harvest is not enough on its own, because the same hole reopens
 * silently the next time a suite moves to a tester nobody mapped or a rule stops
 * being resolvable by identity. So this suite asserts the two closures the
 * corpus can rot through, in BOTH directions:
 *
 *   - `plugin.rules` == rules with a corpus ∪ `rulesWithoutCorpus`. A rule that
 *     has no fixtures fails; an exemption for a rule that DOES have fixtures
 *     fails as stale.
 *   - `corpus.suitesDropped` == `suitesWithoutRegisteredRule`. A suite whose
 *     rule object is unregistered must be named and explained; a named entry
 *     that stops being dropped fails as stale.
 *
 * This is the shape `docs-options-schema` and `type-aware-drivability` already
 * use: the skipped set is asserted, not inherited.
 *
 * Non-vacuity matters more here than usual, because both closures are satisfied
 * trivially by a harvest that collapsed to nothing — the require-cache collapse
 * that makes a second `harvestRuleTesterCases()` return zero suites would leave
 * every rule with no corpus, which is loud, but a corpus that silently stopped
 * PARSING would not be. So the counts are floored, every language is required to
 * be present, the two formerly-empty rules must measurably report, and planted
 * positive AND negative controls prove each non-TypeScript parser is live.
 */
import fs from 'fs';
import path from 'path';
import { Linter } from 'eslint';
import { IMPORTS_SHARED_TESTER } from '../utils/harvestRuleTesterCases';
import {
  harvestFixtureCorpus,
  harvestOnce,
  defaultFilenameFor,
  defineCorpusParsers,
  parserKeyFor,
  parserOptionsFor,
  severityWithOptions,
  ruleNameByIdentity,
  rulesWithoutCorpus,
  suitesWithoutRegisteredRule,
  LANGUAGE_BY_TESTER,
  FixtureCase,
  FixtureLanguage,
} from '../utils/fixtureCorpus';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as { rules: Record<string, unknown> };

/**
 * Reached by `require`, deliberately, and never by an `import ... from` of the
 * shared tester module.
 *
 * `harvestRuleTesterCases` admits a suite file by exactly that import text, so a
 * guard that harvests AND imports the tester gets loaded BY the harvest, whose
 * nested call then finds every suite already in the require cache and returns a
 * corpus two thirds gone. `harvestRuleTesterCases` throws on re-entry now, so
 * the mistake fails loudly rather than silently — but this guard still has no
 * business being harvested, so it stays out of the admission set.
 */
const sharedTesters = require('../utils/ruleTester') as Record<string, unknown>;
/* eslint-enable @typescript-eslint/no-var-requires */

const linter = new Linter();
defineCorpusParsers(linter);
for (const [rule, name] of ruleNameByIdentity) {
  linter.defineRule(`b/${name}`, rule as never);
}

const lintOne = (id: string, testCase: FixtureCase) =>
  linter.verify(
    testCase.code,
    {
      parser: parserKeyFor(testCase),
      parserOptions: parserOptionsFor(testCase),
      rules: { [id]: severityWithOptions(testCase) as never },
    },
    defaultFilenameFor(testCase),
  );

type Measurement = {
  rule: string;
  cases: number;
  reports: number;
  fatals: number;
  crashes: number;
};

const measure = (rule: string, cases: readonly FixtureCase[]): Measurement => {
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
      measurement.crashes++;
      continue;
    }
    for (const message of messages) {
      if (message.fatal) measurement.fatals++;
      else if (message.ruleId === id) measurement.reports++;
    }
  }
  return measurement;
};

const corpus = harvestFixtureCorpus();
const registered = Object.keys(plugin.rules).sort();
const withCorpus = new Set(corpus.byRule.keys());

/** The rules this issue found with no corpus; they must now be drivable. */
const RECOVERED_RULES = [
  'no-unpinned-dependencies',
  'enforce-typescript-markdown-code-blocks',
] as const;

const casesByLanguage = new Map<FixtureLanguage, number>();
for (const cases of corpus.byRule.values()) {
  for (const testCase of cases) {
    casesByLanguage.set(
      testCase.language,
      (casesByLanguage.get(testCase.language) || 0) + 1,
    );
  }
}

/**
 * Floors sit well under the measurement (194 rules, 17,343 cases, 316 suites) so
 * ordinary rule churn does not trip them, and far enough above zero that a
 * harvest which quietly stopped collecting cannot pass.
 */
const MIN_CASES = 15000;
const MIN_SUITES = 300;
const MIN_RULES = 150;

describe('fixture corpus accounting', () => {
  it('harvests a corpus big enough for the closures to mean anything', () => {
    expect(corpus.failures).toEqual([]);
    expect(corpus.totalCases).toBeGreaterThan(MIN_CASES);
    expect(corpus.suitesUsed).toBeGreaterThan(MIN_SUITES);
    expect(registered.length).toBeGreaterThan(MIN_RULES);
  });

  /**
   * The suite-FILE dimension, which the rule and dropped-suite dimensions above
   * cannot see.
   *
   * A suite the harvest never enumerates is indistinguishable from one that
   * declares nothing, and its rule's own top-level namesake keeps every
   * per-rule assertion green — so the gap reads as coverage from every angle
   * the other tests check. `src/tests/rules/` held three such suites (2,076
   * lines for two `recommended: 'error'` rules): the walk was non-recursive and
   * the admission pattern only matched a single `../`, so both the depth and
   * the import spelling excluded them, and two guards had baselined
   * `no-circular-references` as undrivable purely because of it.
   *
   * Equality, not a floor: every file on disk must be either loaded or
   * deliberately skipped, and the skip must be the documented one.
   */
  it('enumerates every suite file under the tests root, at any depth', () => {
    const testsRoot = path.join(__dirname);
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return entry.name.endsWith('.test.ts') ? [full] : [];
      });
    const onDisk = walk(testsRoot);
    const raw = harvestOnce();

    expect(raw.filesLoaded + raw.filesSkipped).toBe(onDisk.length);
    expect(raw.filesLoaded).toBe(
      onDisk.filter((file) =>
        IMPORTS_SHARED_TESTER.test(fs.readFileSync(file, 'utf8')),
      ).length,
    );

    // Non-vacuity: the equality above is satisfied trivially by a flat tree, so
    // the recursion is only actually asserted while a nested suite exists. If
    // the tree is ever legitimately flattened, replace this with a fixture
    // rather than deleting it — otherwise the walk can silently stop recursing.
    const nested = onDisk.filter((file) =>
      path.relative(testsRoot, file).includes(path.sep),
    );
    expect(nested.length).toBeGreaterThan(0);
  });

  it('accounts for every registered rule: it has a corpus, or it is a named exemption', () => {
    const unaccounted = registered
      .filter((name) => !withCorpus.has(name) && !rulesWithoutCorpus.has(name))
      .map(
        (name) =>
          `${name} has ZERO fixtures — every harvest-based guard passes over ` +
          `it asserting nothing. Give it a corpus, or add a named entry with a ` +
          `reason to rulesWithoutCorpus.`,
      );
    expect(unaccounted).toEqual([]);
  });

  it('holds no stale rule exemption: every listed rule really has no corpus', () => {
    const stale = [...rulesWithoutCorpus.keys()]
      .filter((name) => withCorpus.has(name))
      .map(
        (name) =>
          `${name} has ${
            corpus.byRule.get(name)?.length
          } fixtures — remove it from rulesWithoutCorpus and let the guards probe it`,
      );
    expect(stale).toEqual([]);
  });

  it('lists only registered rules as exemptions', () => {
    // An entry naming a rule that does not exist is never measured by either
    // assertion above, so it would be an exemption nothing can retire.
    const orphans = [...rulesWithoutCorpus.keys()].filter(
      (name) => !(name in plugin.rules),
    );
    expect(orphans).toEqual([]);
  });

  it('keys the corpus only by registered rule names', () => {
    const unknown = [...withCorpus].filter((name) => !(name in plugin.rules));
    expect(unknown).toEqual([]);
  });

  it('accounts for every dropped suite by name', () => {
    const unaccounted = corpus.suitesDropped.filter(
      (entry) => !suitesWithoutRegisteredRule.has(entry),
    );
    expect(unaccounted).toEqual([]);
  });

  it('holds no stale dropped-suite exemption', () => {
    const dropped = new Set(corpus.suitesDropped);
    const stale = [...suitesWithoutRegisteredRule.keys()].filter(
      (entry) => !dropped.has(entry),
    );
    expect(stale).toEqual([]);
  });

  it('explains every exemption it holds', () => {
    const unexplained = [
      ...rulesWithoutCorpus.entries(),
      ...suitesWithoutRegisteredRule.entries(),
    ]
      .filter(([, reason]) => reason.trim().length < 20)
      .map(([key]) => key);
    expect(unexplained).toEqual([]);
  });

  /**
   * No guard may be both a harvester and a harvest SUBJECT.
   *
   * Admission to the harvest is an ES `import` of the shared tester module by
   * its relative path — matched as TEXT, so even a comment quoting that import
   * admits the file. A guard that imports the shared tester is loaded BY the
   * harvest, and its
   * module scope then harvests again, into a require cache where every suite is
   * already loaded. Requiring a cached module re-executes nothing, so the nested
   * harvest returns only what the outer one has not reached yet. Measured while
   * writing this suite: 316 suites collapsing to 188 and then 128, with
   * `filesLoaded` still reporting 272 and `failures` empty — a corpus two thirds
   * gone that every downstream guard swept and called clean.
   *
   * `harvestRuleTesterCases` throws on re-entry now, so the mistake cannot
   * produce a partial corpus. This is the cheaper, earlier gate: a static fact
   * about the file, checked without running anything.
   */
  it('has no guard that both harvests and is harvested', () => {
    const testsDir = path.join(__dirname);
    const offenders = fs
      .readdirSync(testsDir)
      .filter((file) => file.endsWith('.test.ts'))
      .filter((file) => {
        const source = fs.readFileSync(path.join(testsDir, file), 'utf8');
        return (
          IMPORTS_SHARED_TESTER.test(source) &&
          /harvestFixtureCorpus|harvestOnce|harvestRuleTesterCases/.test(source)
        );
      })
      .map(
        (file) =>
          `${file} imports the shared tester AND harvests; reach the tester ` +
          `by require() instead, or the harvest loads this file and its nested ` +
          `harvest returns a partial corpus`,
      );
    expect(offenders).toEqual([]);
  });

  /**
   * The closures above certify the SHARED corpus, which is no protection for a
   * guard that harvests raw and builds its own. Four did, and each reproduced
   * both defects the helper exists to prevent: a local `TS_TESTERS` set that
   * dropped two `error`-severity fixable rules outright, and a filename derived
   * from the TESTER, under which 269 fixtures were a fatal parse read as silence
   * (#1984). Every one of the four imported `fixtureCorpus` — for other helpers
   * — so "does it import the helper?" certified them all clean. The check has to
   * be per CONCERN, and static, because the damage is invisible at runtime.
   */
  it('lets no harvesting guard hand-roll what fixtureCorpus owns', () => {
    const testsDir = path.join(__dirname);
    /**
     * Scanned against CODE, not prose: a guard that documents the spelling it
     * replaced would otherwise report itself forever. Block comments go, and
     * line comments only when they own the whole line — a `//` inside a string
     * literal must not truncate the code after it, which would hide a real
     * violation on that line.
     */
    const stripComments = (source: string) =>
      source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
    const BANNED = [
      {
        pattern: /const\s+TS_TESTERS\s*=\s*new Set/,
        why: 'declares a local TS_TESTERS instead of reading LANGUAGE_BY_TESTER, which silently drops every non-TypeScript suite',
      },
      {
        pattern: /'x\.tsx'\s*:\s*'x\.ts'|"x\.tsx"\s*:\s*"x\.ts"/,
        why: "derives a fixture's extension from its TESTER; use defaultFilenameFor, which derives it from the CODE",
      },
      {
        pattern: /\btester\s*!==\s*'ruleTesterTs'/,
        why: 'decides JSX-ness from the TESTER; a `.ts` path forces ScriptKind.TS and `ecmaFeatures.jsx` does not override it, so every JSX fixture under ruleTesterTs is a fatal parse',
      },
      {
        /**
         * The owner's entry skipped whenever the recommended set already holds
         * the rule, which is every enabled rule: the fixture is then screened at
         * DEFAULTS and its author's options never reach the rule. Four guards
         * carried this one conditional, and the comment above it claimed the
         * opposite (#2244, #2224, #1732). `composedRulesFor` sets the entry
         * unconditionally, gated only on the guard's own exclusion set.
         */
        pattern: /\w+\[\s*\w*[Oo]wner\w*\s*\][\s\S]{0,160}?\?\s*\{\s*\}/,
        why: "drops the owner fixture's options whenever the rule is in the recommended set; call composedRulesFor, which carries them unconditionally",
      },
    ];
    const scanned: string[] = [];
    const offenders = fs
      .readdirSync(testsDir)
      .filter((file) => file.endsWith('.test.ts'))
      // This guard names the banned spellings, so it necessarily contains them.
      .filter((file) => file !== path.basename(__filename))
      .flatMap((file) => {
        const source = fs.readFileSync(path.join(testsDir, file), 'utf8');
        if (
          !/harvestFixtureCorpus|harvestOnce|harvestRuleTesterCases/.test(
            source,
          )
        ) {
          return [];
        }
        scanned.push(file);
        return BANNED.filter(({ pattern }) =>
          pattern.test(stripComments(source)),
        ).map(({ why }) => `${file} ${why}`);
      });
    expect(offenders).toEqual([]);

    /**
     * The harvest-identifier filter selects what gets scanned, so it is itself a
     * silent-loss surface: rename the harvest helper and it matches nothing,
     * leaving this closure asserting `[] === []` over an empty set forever. 25
     * guards match at the time of writing; the floor holds well under that so
     * ordinary churn does not trip it, but a collapsed filter does. The four
     * that carried #1984 must each be covered by name — they are the reason
     * this exists, and a filter that stopped reaching them is the one failure
     * this test cannot be allowed to survive.
     */
    expect(scanned.length).toBeGreaterThanOrEqual(20);
    expect(
      [
        'exemption-composition-closure.test.ts',
        'comment-fix-fidelity.test.ts',
        'cjs-emission-closure.test.ts',
        'export-surface-integrity.test.ts',
      ].filter((file) => !scanned.includes(file)),
    ).toEqual([]);

    /**
     * Positive control: the detector must fire on the exact source it forbids.
     * Without it a typo'd regex reports zero offenders forever, which is the
     * same false clean this test exists to end.
     */
    const planted = [
      "const TS_TESTERS = new Set(['ruleTesterTs']);",
      "filename: f || (suite.tester === 'ruleTesterJsx' ? 'x.tsx' : 'x.ts'),",
      "const jsx = suite.tester !== 'ruleTesterTs';",
      // The #2244 spelling, across the lines it was written on.
      [
        '...(RECOMMENDED[ownerId] || DIVERGENT_WITHOUT_PROGRAM.has(owner)',
        '  ? {}',
        '  : { [ownerId]: severityWithOptions(testCase) }),',
      ].join('\n'),
    ];
    expect(
      planted.map(
        (source) => BANNED.filter(({ pattern }) => pattern.test(source)).length,
      ),
    ).toEqual([1, 1, 1, 1]);
    // Negative controls: correct usage must not trip any of them.
    expect(
      BANNED.filter(({ pattern }) =>
        pattern.test(
          'const filename = testCase.filename || defaultFilenameFor(testCase);',
        ),
      ),
    ).toEqual([]);
    expect(
      BANNED.filter(({ pattern }) =>
        pattern.test(
          'rules: composedRulesFor(RECOMMENDED, EXCLUDED, owner, testCase),',
        ),
      ),
    ).toEqual([]);
  });
});

describe('every declared tester contributes to the corpus', () => {
  const testerNames = Object.entries(sharedTesters)
    .filter(
      ([, value]) =>
        typeof (value as { run?: unknown } | undefined)?.run === 'function',
    )
    .map(([name]) => name)
    .sort();

  it('maps every shared tester to a language', () => {
    // An unmapped tester would silently fall back to TypeScript, which is how a
    // JSON suite becomes a fatal parse that reads as a silent rule.
    const unmapped = testerNames.filter((name) => !LANGUAGE_BY_TESTER[name]);
    expect(unmapped).toEqual([]);
    expect(testerNames.length).toBeGreaterThanOrEqual(4);
  });

  it('harvests fixtures in every language, not just TypeScript', () => {
    expect(casesByLanguage.get('ts')).toBeGreaterThan(MIN_CASES);
    expect(casesByLanguage.get('json')).toBeGreaterThan(0);
    expect(casesByLanguage.get('markdown')).toBeGreaterThan(0);
  });

  it('gives every non-TypeScript suite a corpus under its own language', () => {
    const empty = corpus.suitesNonTs.filter((entry) => {
      const file = entry.split('::')[0];
      return ![...corpus.byRule.values()]
        .flat()
        .some(
          (testCase) => testCase.origin === file && testCase.language !== 'ts',
        );
    });
    expect(empty).toEqual([]);
  });
});

describe('the recovered rules are measurably drivable over their own fixtures', () => {
  const measurements = RECOVERED_RULES.map((rule) =>
    measure(rule, corpus.byRule.get(rule) || []),
  );

  beforeAll(() => {
    // eslint-disable-next-line no-console
    console.log(
      `[fixture-corpus-accounting] ${corpus.byRule.size}/${registered.length} ` +
        `rules have a corpus, ${corpus.totalCases} cases ` +
        `(ts ${casesByLanguage.get('ts')}, json ${casesByLanguage.get(
          'json',
        )}, markdown ${casesByLanguage.get('markdown')})\n` +
        measurements
          .map(
            (m) =>
              `  ${m.rule}: ${m.reports} reports over ${m.cases} cases` +
              `${m.fatals ? `, ${m.fatals} fatal` : ''}` +
              `${m.crashes ? `, ${m.crashes} crashes` : ''}`,
          )
          .join('\n'),
    );
  });

  it.each(measurements)(
    'drives $rule without a fatal parse',
    (measurement: Measurement) => {
      expect(measurement.cases).toBeGreaterThan(0);
      // A fatal carries no `ruleId`, so a guard filtering by rule reads it as
      // silence. Zero is the only acceptable count.
      expect(measurement.fatals).toBe(0);
      expect(measurement.crashes).toBe(0);
      expect(measurement.reports).toBeGreaterThan(0);
    },
  );
});

describe('controls: each non-TypeScript parser can both report and stay silent', () => {
  const asCase = (
    code: string,
    tester: string,
    language: FixtureLanguage,
  ): FixtureCase => ({
    code,
    tester,
    language,
    origin: 'fixture-corpus-accounting.test.ts',
    bucket: 'invalid',
  });

  const reportsOf = (rule: string, testCase: FixtureCase) =>
    lintOne(`b/${rule}`, testCase);

  it('reports on a planted JSON violation', () => {
    const messages = reportsOf(
      'no-unpinned-dependencies',
      asCase(
        '{"dependencies": {"eslint": "^8.19.0"}}',
        'ruleTesterJson',
        'json',
      ),
    );
    expect(messages.filter((m) => m.fatal)).toEqual([]);
    expect(
      messages.filter((m) => m.ruleId === 'b/no-unpinned-dependencies').length,
    ).toBeGreaterThan(0);
  });

  it('stays silent on a planted clean JSON input', () => {
    const messages = reportsOf(
      'no-unpinned-dependencies',
      asCase(
        '{"dependencies": {"eslint": "8.19.0"}}',
        'ruleTesterJson',
        'json',
      ),
    );
    expect(messages.filter((m) => m.fatal)).toEqual([]);
    expect(
      messages.filter((m) => m.ruleId === 'b/no-unpinned-dependencies'),
    ).toEqual([]);
  });

  it('reports on a planted Markdown violation', () => {
    const messages = reportsOf(
      'enforce-typescript-markdown-code-blocks',
      asCase(
        ['```', 'const example = 1;', '```'].join('\n'),
        'ruleTesterMarkdown',
        'markdown',
      ),
    );
    expect(messages.filter((m) => m.fatal)).toEqual([]);
    expect(
      messages.filter(
        (m) => m.ruleId === 'b/enforce-typescript-markdown-code-blocks',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('stays silent on a planted clean Markdown input', () => {
    const messages = reportsOf(
      'enforce-typescript-markdown-code-blocks',
      asCase(
        ['```typescript', 'const example = 1;', '```'].join('\n'),
        'ruleTesterMarkdown',
        'markdown',
      ),
    );
    expect(messages.filter((m) => m.fatal)).toEqual([]);
    expect(
      messages.filter(
        (m) => m.ruleId === 'b/enforce-typescript-markdown-code-blocks',
      ),
    ).toEqual([]);
  });

  /**
   * The direction the corpus used to fail in: a non-TypeScript fixture handed to
   * the TypeScript parser is a FATAL parse, and since every consumer filters by
   * `ruleId` that fatal is indistinguishable from the rule staying silent. This
   * pins that `parserKeyFor` is what prevents it, rather than the fixtures
   * happening to be valid TypeScript.
   */
  it('would be a fatal parse under the TypeScript parser', () => {
    const jsonCase = asCase(
      '{"dependencies": {"eslint": "^8.19.0"}}',
      'ruleTesterJson',
      'json',
    );
    const messages = linter.verify(
      jsonCase.code,
      {
        parser: 'ts',
        parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: { 'b/no-unpinned-dependencies': 'error' },
      },
      'file.ts',
    );
    expect(messages.some((m) => m.fatal)).toBe(true);
    expect(
      messages.filter((m) => m.ruleId === 'b/no-unpinned-dependencies'),
    ).toEqual([]);
  });
});

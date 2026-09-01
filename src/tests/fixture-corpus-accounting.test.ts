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
 * Floors sit just under the measurement (194 rules, 23,932 cases across 367
 * suites, of which 23,824 are TypeScript) rather than at a round number far
 * below it: slack between a floor and its measurement is exactly the room a
 * harvest that quietly stopped collecting needs to pass.
 *
 * The TypeScript count gets its own constant. Sharing one with the total forces
 * whichever floor moves to be cut for the SMALLER population, which puts the
 * slack back into the larger one.
 */
const MIN_CASES = 23500; // measured 23,932
const MIN_TS_CASES = 23400; // measured 23,824
const MIN_SUITES = 360; // measured 367
const MIN_RULES = 190; // measured 194

const TESTS_ROOT = __dirname;

/**
 * Every suite file under the tests root, as a path relative to it.
 *
 * Recursive, and shared by every static scan below, because `src/tests/rules/`
 * exists: a `readdirSync` of the top directory alone certifies a tree it cannot
 * see, and the file it cannot see is precisely where a guard would be parked to
 * escape the certification. Paths stay relative rather than collapsing to a
 * basename so that two suites of the same name at different depths
 * (`no-circular-references.test.ts` is one) stay distinguishable.
 */
const suiteFilesUnder = (root: string): string[] => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.name.endsWith('.test.ts') ? [path.relative(root, full)] : [];
    });
  return walk(root).sort();
};

const SUITE_FILES = suiteFilesUnder(TESTS_ROOT);

const sourceOf = (file: string) =>
  fs.readFileSync(path.join(TESTS_ROOT, file), 'utf8');

/**
 * Scanned against CODE, not prose: a guard that documents the spelling it
 * replaced would otherwise report itself forever. Block comments go, and line
 * comments only when they own the whole line — a `//` inside a string literal
 * must not truncate the code after it, which would hide a real violation on
 * that line.
 */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const CODE_BY_FILE = new Map(
  SUITE_FILES.map((file) => [file, stripComments(sourceOf(file))]),
);

/** The sanctioned route into the fixture corpus. */
const NAMES_HARVEST = /harvestFixtureCorpus|harvestOnce|harvestRuleTesterCases/;

/** A `Linter` driven over text the guard supplies. */
const LINTS_TEXT = /\.verify(?:AndFix)?\s*\(/;

/**
 * Reads suite SOURCES off disk, which is the pre-harvest way to build a corpus:
 * parse `src/tests/<rule>.test.ts` and keep its string literals.
 */
const SCRAPES_SUITE_SOURCES =
  /(?:readdirSync|readFileSync|globSync)[\s\S]{0,400}?\.test\.ts|\.test\.ts[\s\S]{0,400}?(?:readdirSync|readFileSync|globSync)/;

/**
 * Does this file build a fixture corpus at all?
 *
 * Keying admission on the harvest IDENTIFIERS alone — the check this replaces —
 * exempts by construction the one guard that most needs checking: a corpus
 * assembled WITHOUT the helper matches none of those names, so it was never
 * read. The question is therefore asked about the BEHAVIOUR, in both of its
 * spellings: a file that names the harvest, or one that lints text it scraped
 * out of the suite sources itself.
 *
 * The scrape arm selects nobody on a clean tree, which is the point — it is the
 * arm that would have caught `rule-options-safety` before it swapped onto the
 * corpus. `PLANTED_HAND_ROLLED_HARVEST` keeps it non-vacuous, so an arm that
 * stopped matching cannot look identical to one that has nothing to match.
 */
const isCorpusConsumer = (code: string) =>
  NAMES_HARVEST.test(code) ||
  (LINTS_TEXT.test(code) && SCRAPES_SUITE_SOURCES.test(code));

const CORPUS_CONSUMERS = SUITE_FILES.filter(
  // This guard names every banned spelling, so it necessarily contains them.
  (file) =>
    file !== path.basename(__filename) &&
    isCorpusConsumer(CODE_BY_FILE.get(file) || ''),
);

const NESTED_SUITE_FILES = SUITE_FILES.filter((file) =>
  file.includes(path.sep),
);

/**
 * An extension pair — `.tsx` on one arm, `.ts` on the other — under any
 * basename and either quote style.
 *
 * The pair by itself is legitimate and common: four guards name a scratch
 * `ts.Program` file from `filename.endsWith('.tsx')`, which is a property of the
 * CODE and is exactly right. What condemns it is the expression that DECIDES,
 * so the pair is only an offence when a tester is what reaches it.
 */
const EXTENSION_PAIR =
  /(['"])[\w./-]*\.tsx\1\s*:\s*(['"])[\w./-]*\.ts\2|(['"])[\w./-]*\.ts\3\s*:\s*(['"])[\w./-]*\.tsx\4/;

/** `suite.tester`, `LANGUAGE_BY_TESTER`, `isJsxTester` — any of them. */
const TESTER_TOKEN = /tester/i;

/**
 * How far back a tester may sit and still be what selected the extension.
 *
 * Chosen from both margins rather than guessed. Defect side: a flag computed
 * from the tester and read by a ternary several statements later measures 312
 * characters apart, so a shorter window misses the shape entirely. Clean side:
 * the nearest correct pair in the tree sits 1,235 characters into its file, and
 * no tester is named before ANY of them — so this stays out of reach even of a
 * file that adds `LANGUAGE_BY_TESTER` to its import block, which the
 * routes-through-fixtureCorpus closure below actively encourages.
 */
const TESTER_LOOKBACK = 600;

const derivesExtensionFromTester = (code: string) => {
  const pattern = new RegExp(EXTENSION_PAIR.source, 'g');
  let match = pattern.exec(code);
  while (match !== null) {
    const governing = code.slice(
      Math.max(0, match.index - TESTER_LOOKBACK),
      match.index,
    );
    if (TESTER_TOKEN.test(governing)) return true;
    match = pattern.exec(code);
  }
  return false;
};

type BannedSpelling = {
  id: string;
  detect: (code: string) => boolean;
  why: string;
};

/**
 * Each entry is a CONCERN, matched by shape.
 *
 * A detector written from one spelling proves only that the spelling exists.
 * `'file.tsx':'file.ts'`, `!=` instead of `!==`, `=== 'ruleTesterJsx'` and an
 * imported `TS_TESTERS` all reproduce #1984 and #1860 verbatim while matching a
 * string-literal detector nowhere, so each concern is asked as a question about
 * the code's shape and every planted control below must be caught by these and
 * MISSED by the single spellings they were written from.
 */
const BANNED: BannedSpelling[] = [
  {
    id: 'ts-testers',
    detect: (code) => /\bTS_TESTERS\b/.test(code),
    why: 'partitions suites by TESTER — declared locally or imported from fixtureCorpus, and either spelling drops every JSON and Markdown suite; read the language fixtureCorpus already carries on the case',
  },
  {
    id: 'tester-name-comparison',
    detect: (code) =>
      /[!=]==?\s*(['"])ruleTester\w*\1/.test(code) ||
      /(['"])ruleTester\w*\1\s*[!=]==?/.test(code),
    why: 'branches on which TESTER declared a fixture; a `.ts` path forces ScriptKind.TS and `ecmaFeatures.jsx` does not override it, so every JSX fixture under ruleTesterTs is a fatal parse. Ask defaultFilenameFor and parserKeyFor, which read the CODE and the language',
  },
  {
    id: 'tester-name-membership',
    detect: (code) =>
      /new Set\(\s*\[[^\]]*(['"])ruleTester\w*\1/.test(code) ||
      /\[[^\]]*(['"])ruleTester\w*\1[^\]]*\]\s*\)?\s*\.\s*(?:has|includes)\b/.test(
        code,
      ),
    why: 'collects tester names to filter suites by, which is how two error-severity fixable rules lost their whole corpus (#1860); LANGUAGE_BY_TESTER maps every tester, the JSON and Markdown ones included',
  },
  {
    id: 'tester-derived-extension',
    detect: derivesExtensionFromTester,
    why: "picks a fixture's extension from its TESTER rather than from its CODE; use defaultFilenameFor, which overrides the preferred extension only when that extension cannot parse the snippet at all",
  },
  {
    /**
     * The owner's entry skipped whenever the recommended set already holds the
     * rule, which is every enabled rule: the fixture is then screened at
     * DEFAULTS and its author's options never reach the rule. Four guards
     * carried this one conditional, and the comment above it claimed the
     * opposite (#2244, #2224, #1732). `composedRulesFor` sets the entry
     * unconditionally, gated only on the guard's own exclusion set.
     */
    id: 'owner-options-dropped',
    detect: (code) =>
      /\w+\[\s*\w*[Oo]wner\w*\s*\][\s\S]{0,160}?\?\s*\{\s*\}/.test(code),
    why: "drops the owner fixture's options whenever the rule is in the recommended set; call composedRulesFor, which carries them unconditionally",
  },
];

const bannedIdsIn = (code: string) =>
  BANNED.filter(({ detect }) => detect(code)).map(({ id }) => id);

/**
 * The single spellings this scan was written from, kept as the class controls'
 * BASELINE rather than as a check.
 *
 * A positive control that plants the exact string a regex was written from
 * proves the regex matches itself, not the class. Every planted evasion below
 * must be caught by `BANNED` and missed by these, which is the only way to
 * assert the widening bought a class rather than a second string.
 */
const SINGLE_SPELLINGS: Array<(code: string) => boolean> = [
  (code) => /const\s+TS_TESTERS\s*=\s*new Set/.test(code),
  (code) => /'x\.tsx'\s*:\s*'x\.ts'|"x\.tsx"\s*:\s*"x\.ts"/.test(code),
  (code) => /\btester\s*!==\s*'ruleTesterTs'/.test(code),
];

/**
 * Whole planted files, one per CLASS of evasion, each written in a spelling the
 * single-string detectors above cannot see.
 */
const PLANTED_EVASIONS = [
  {
    id: 'ts-testers',
    source: [
      "import { harvestOnce, TS_TESTERS } from '../utils/fixtureCorpus';",
      'for (const suite of harvestOnce().suites) {',
      '  if (!TS_TESTERS.has(suite.tester)) continue;',
      '  linter.verify(suite.valid[0], config, filename);',
      '}',
    ].join('\n'),
  },
  {
    id: 'tester-name-comparison',
    source: [
      "import { harvestFixtureCorpus } from '../utils/fixtureCorpus';",
      'for (const testCase of harvestFixtureCorpus().byRule.get(rule)) {',
      "  const jsx = testCase.tester != 'ruleTesterTs';",
      "  linter.verify(testCase.code, config, jsx ? 'probe.tsx' : 'probe.ts');",
      '}',
    ].join('\n'),
  },
  {
    id: 'tester-name-membership',
    source: [
      "import { harvestOnce } from '../utils/fixtureCorpus';",
      'for (const suite of harvestOnce().suites) {',
      "  if (!['ruleTesterTs', 'ruleTesterJsx'].includes(suite.tester)) continue;",
      '  linter.verify(suite.valid[0], config, filename);',
      '}',
    ].join('\n'),
  },
  {
    id: 'tester-derived-extension',
    source: [
      "import { harvestOnce, LANGUAGE_BY_TESTER } from '../utils/fixtureCorpus';",
      'for (const suite of harvestOnce().suites) {',
      "  const jsx = LANGUAGE_BY_TESTER[suite.tester] !== 'ts';",
      "  const filename = jsx ? 'corpus.tsx' : 'corpus.ts';",
      '  linter.verify(suite.valid[0], config, filename);',
      '}',
    ].join('\n'),
  },
];

/**
 * The gate class, which no spelling can express: a corpus assembled by scraping
 * the suite SOURCES names no harvest helper, so a scan admitted by those
 * identifiers never reads the file at all. The banned spelling it carries is
 * incidental — the point is that the pre-hardening gate would not have looked.
 */
const PLANTED_HAND_ROLLED_HARVEST = [
  'const testFile = path.join(__dirname, ruleName + `.test.ts`);',
  "const ast = parseSource(fs.readFileSync(testFile, 'utf8'));",
  'for (const code of stringLiteralsOf(ast).slice(0, MAX_SNIPPETS)) {',
  "  const jsx = suite.tester != 'ruleTesterTs';",
  "  linter.verify(code, config, jsx ? 'probe.tsx' : 'probe.ts');",
  '}',
].join('\n');

/**
 * Corpus consumers that lint fixture text without routing through
 * `fixtureCorpus`'s filename and parser helpers, each with the MEASUREMENT of
 * what that costs. An entry without a measurement is an unreasoned skip.
 */
const CONSUMERS_WITHOUT_CORPUS_HELPERS = new Map<string, string>([
  [
    'message-negative-example.test.ts',
    'lints harvested `invalid` fixtures only as a REACHABILITY oracle for a ' +
      'remedy span, under the same CANDIDATES paths the span probe itself ' +
      'uses: the filename is the question being asked, so defaultFilenameFor ' +
      'would answer a different one. Measured cost: of its 9 negative-example ' +
      'spans, ZERO belong to any of the 3 rules that declare non-TypeScript ' +
      'fixtures (enforce-typescript-markdown-code-blocks, ' +
      'no-unpinned-dependencies, prefer-nullish-coalescing-boolean-props), so ' +
      'no fixture reaches the oracle under a parser that cannot read it. It ' +
      'fails CLOSED if that changes: an unreachable rule fails the suite by ' +
      'name rather than banking an unearned silent verdict.',
  ],
]);

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
    const raw = harvestOnce();

    expect(raw.filesLoaded + raw.filesSkipped).toBe(SUITE_FILES.length);
    expect(raw.filesLoaded).toBe(
      SUITE_FILES.filter((file) => IMPORTS_SHARED_TESTER.test(sourceOf(file)))
        .length,
    );

    // Non-vacuity: the equality above is satisfied trivially by a flat tree, so
    // the recursion is only actually asserted while a nested suite exists. If
    // the tree is ever legitimately flattened, replace this with a fixture
    // rather than deleting it — otherwise the walk can silently stop recursing.
    expect(NESTED_SUITE_FILES.length).toBeGreaterThan(0);
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
      ...CONSUMERS_WITHOUT_CORPUS_HELPERS.entries(),
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
    const offenders = SUITE_FILES.filter(
      (file) =>
        IMPORTS_SHARED_TESTER.test(sourceOf(file)) &&
        NAMES_HARVEST.test(CODE_BY_FILE.get(file) || ''),
    ).map(
      (file) =>
        `${file} imports the shared tester AND harvests; reach the tester ` +
        `by require() instead, or the harvest loads this file and its nested ` +
        `harvest returns a partial corpus`,
    );
    expect(offenders).toEqual([]);

    // Non-vacuity for the walk: a flat scan reads a strict subset of the tree,
    // and the file it cannot reach is where a guard would be parked to escape
    // this check. If the tree is ever legitimately flattened, replace this with
    // a fixture rather than deleting it.
    expect(SUITE_FILES.length).toBeGreaterThan(
      fs.readdirSync(TESTS_ROOT).filter((file) => file.endsWith('.test.ts'))
        .length,
    );
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
  it('lets no corpus consumer hand-roll what fixtureCorpus owns', () => {
    const offenders = CORPUS_CONSUMERS.flatMap((file) =>
      BANNED.filter(({ detect }) => detect(CODE_BY_FILE.get(file) || '')).map(
        ({ why }) => `${file} ${why}`,
      ),
    );
    expect(offenders).toEqual([]);

    /**
     * The admission filter selects what gets scanned, so it is itself a
     * silent-loss surface: narrow it and this closure asserts `[] === []` over
     * an empty set forever. 42 files qualify at the time of writing; the floor
     * holds just under that so ordinary churn does not trip it, but a collapsed
     * filter does. The four that carried #1984 must each be covered by name —
     * they are the reason this exists, and a filter that stopped reaching them
     * is the one failure this test cannot be allowed to survive.
     */
    expect(CORPUS_CONSUMERS.length).toBeGreaterThanOrEqual(40);
    expect(
      [
        'exemption-composition-closure.test.ts',
        'comment-fix-fidelity.test.ts',
        'cjs-emission-closure.test.ts',
        'export-surface-integrity.test.ts',
      ].filter((file) => !CORPUS_CONSUMERS.includes(file)),
    ).toEqual([]);
  });

  /**
   * Positive controls, one per CLASS rather than one per string.
   *
   * The control this replaces planted the three literals its own regexes were
   * written from, so it certified that each regex matches itself — which every
   * regex does, including one that matches nothing else. Each planted file here
   * is written in a spelling those literals cannot see, and the differential is
   * asserted in both directions: caught by the shape detectors, missed by the
   * single spellings.
   */
  it('catches each CLASS of evasion, not just the spelling it was written from', () => {
    expect(
      PLANTED_EVASIONS.map(({ id, source }) => [
        id,
        bannedIdsIn(source).includes(id),
        SINGLE_SPELLINGS.some((detect) => detect(source)),
      ]),
    ).toEqual(PLANTED_EVASIONS.map(({ id }) => [id, true, false]));

    /**
     * The #2244 spelling, across the lines it was written on. It is asserted as
     * a plain positive control rather than a differential: its detector is
     * unchanged, so the pre-hardening scan catches it too.
     */
    expect(
      bannedIdsIn(
        [
          '...(RECOMMENDED[ownerId] || DIVERGENT_WITHOUT_PROGRAM.has(owner)',
          '  ? {}',
          '  : { [ownerId]: severityWithOptions(testCase) }),',
        ].join('\n'),
      ),
    ).toEqual(['owner-options-dropped']);

    // The gate class: scraping the suite sources names no harvest helper, so
    // the pre-hardening admission filter never read such a file at all.
    expect(isCorpusConsumer(PLANTED_HAND_ROLLED_HARVEST)).toBe(true);
    expect(NAMES_HARVEST.test(PLANTED_HAND_ROLLED_HARVEST)).toBe(false);
    expect(bannedIdsIn(PLANTED_HAND_ROLLED_HARVEST)).toContain(
      'tester-name-comparison',
    );
  });

  /**
   * Negative controls, anchored to real files rather than to snippets alone.
   *
   * A shape detector earns its width only if it still clears correct code. The
   * four guards named here choose a scratch `ts.Program` filename from
   * `filename.endsWith('.tsx')` — a property of the CODE, which is the right
   * answer — and each is scanned, so a `.tsx`/`.ts` pair condemned on its shape
   * alone would take all four down with it.
   */
  it('clears correct usage', () => {
    const CORRECT_PAIR_USERS = [
      'composed-fix-type-safety-closure.test.ts',
      'cross-fixture-fixer-type-safety.test.ts',
      'cross-suggestion-type-safety.test.ts',
      'fix-spelling-asymmetry.test.ts',
    ];
    expect(
      CORRECT_PAIR_USERS.filter((file) => !CORPUS_CONSUMERS.includes(file)),
    ).toEqual([]);
    expect(
      CORRECT_PAIR_USERS.flatMap((file) =>
        bannedIdsIn(CODE_BY_FILE.get(file) || '').map((id) => `${file} ${id}`),
      ),
    ).toEqual([]);
    // Non-vacuity: the four clear the detector because they use the CODE, not
    // because the pair shape goes unmatched.
    expect(
      CORRECT_PAIR_USERS.filter((file) =>
        EXTENSION_PAIR.test(CODE_BY_FILE.get(file) || ''),
      ),
    ).toEqual(CORRECT_PAIR_USERS);

    /**
     * The lookback's own negative control: a tester named further away than
     * `TESTER_LOOKBACK` is not what chose the extension. Without this, widening
     * the window until it reached the whole file would still pass every
     * assertion above while condemning any guard that imports
     * `LANGUAGE_BY_TESTER` and picks a scratch filename later on.
     */
    const distantTester = [
      "import { LANGUAGE_BY_TESTER } from '../utils/fixtureCorpus';",
      'const unrelated = '.padEnd(TESTER_LOOKBACK, 'x') + ';',
      "const name = filename.endsWith('.tsx') ? 'corpus.tsx' : 'corpus.ts';",
    ].join('\n');
    expect(bannedIdsIn(distantTester)).toEqual([]);
    expect(EXTENSION_PAIR.test(distantTester)).toBe(true);

    expect(
      bannedIdsIn(
        'const filename = testCase.filename || defaultFilenameFor(testCase);',
      ),
    ).toEqual([]);
    expect(
      bannedIdsIn(
        'rules: composedRulesFor(RECOMMENDED, EXCLUDED, owner, testCase),',
      ),
    ).toEqual([]);
  });

  /**
   * The inverse of the banned spellings: what a corpus consumer must DO.
   *
   * A spelling scan can only forbid the shapes someone thought to write down,
   * and the hand-rolled corpus that prompted this carries none of them — it
   * scrapes string literals out of the suite sources and lints them under two
   * hard-coded paths, losing every fixture's declared `options` and `filename`
   * and every interpolated case, without ever spelling anything banned. So the
   * requirement runs the other way: a guard that lints fixture text must ask
   * `fixtureCorpus` for the filename and the parser, or be named here with the
   * measurement of what it costs instead.
   */
  it('routes every corpus consumer that lints through fixtureCorpus', () => {
    const USES_CORPUS_HELPERS =
      /defaultFilenameFor|parserKeyFor|LANGUAGE_BY_TESTER/;
    const linting = CORPUS_CONSUMERS.filter((file) =>
      LINTS_TEXT.test(CODE_BY_FILE.get(file) || ''),
    );
    const offenders = linting
      .filter((file) => !USES_CORPUS_HELPERS.test(CODE_BY_FILE.get(file) || ''))
      .filter((file) => !CONSUMERS_WITHOUT_CORPUS_HELPERS.has(file))
      .map(
        (file) =>
          `${file} lints fixture text without defaultFilenameFor, ` +
          `parserKeyFor or LANGUAGE_BY_TESTER, so its fixtures reach the rule ` +
          `under a path and a parser their author never wrote — a fatal parse ` +
          `there is indistinguishable from the rule staying silent`,
      );
    expect(offenders).toEqual([]);

    // Both directions: an entry that starts using the helpers, or stops linting
    // at all, is an exemption nothing can retire.
    const stale = [...CONSUMERS_WITHOUT_CORPUS_HELPERS.keys()].filter(
      (file) => {
        const code = CODE_BY_FILE.get(file);
        return (
          code === undefined ||
          !LINTS_TEXT.test(code) ||
          USES_CORPUS_HELPERS.test(code)
        );
      },
    );
    expect(stale).toEqual([]);

    // Non-vacuity: 41 of the 42 consumers lint at the time of writing, and a
    // requirement measured over none of them is satisfied by every guard.
    expect(linting.length).toBeGreaterThanOrEqual(38);
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
    expect(casesByLanguage.get('ts')).toBeGreaterThan(MIN_TS_CASES);
    // The two small populations are the entire corpus of two registered,
    // `error`-severity, autofixing rules (#1860), and are invisible inside the
    // TypeScript floor above — a bare `> 0` lets either fall to one case.
    expect(casesByLanguage.get('json')).toBeGreaterThanOrEqual(8); // measured 8
    expect(casesByLanguage.get('markdown')).toBeGreaterThanOrEqual(95); // measured 100
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

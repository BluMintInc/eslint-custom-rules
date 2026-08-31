/**
 * `LINE_SCOPED_CASES_ALLOWED_TO_SUPPRESS` must stay EXACT, the way
 * `valid-case-suppression-exactness` keeps the block-form map exact.
 *
 * `assertValidCasesCanFail` sees BLOCK disables only, by design: a line-scoped
 * directive pins suppression to one line, so a rule that moved or widened its
 * report escapes it and the case still fails. That reasoning holds right up
 * until the directives cover EVERY line a report could land on — at which point
 * the fixture is inert exactly like a blanket disable, passing for every
 * possible implementation, while both consumers of that check
 * (`installValidCaseGuard` and the block-form accounting) credit it as
 * falsifiable.
 *
 * The blind spot used to be reconciled in a comment: "two such cases exist",
 * against a `.claude/tmp/vacuous-sweep.sh` that no longer exists and a figure no
 * test asserted. Measured here, it is 20 cases across 9 rules — an order of
 * magnitude out, which is what a number nothing executes decays into (#2232).
 *
 * WHAT MAKES A CASE INERT. Whether a `valid` case can fail is not "does the
 * directive suppress something today" — it does for every case here, and that
 * question is answered identically by an inert fixture and a load-bearing one.
 * It is whether any DIFFERENT implementation could put a report on an uncovered
 * line. So, per case:
 *
 *   1. Lint it with `context.report` intercepted. Interception, not the returned
 *      messages: a report is recorded before ESLint's directive processing drops
 *      it, which is the only way to learn the site a covered report sits on. The
 *      rule is registered under a name the fixture's directives do not spell, so
 *      a named directive cannot hide a site either.
 *   2. Take the AST node TYPES those reports landed on.
 *   3. Walk the fixture for every node of those types. If one sits on a line no
 *      directive covers, a rule that moved or widened its report to that node
 *      would be caught here — the case is FALSIFIABLE. If none does, every
 *      report site the fixture can offer is already covered: INERT.
 *
 * Tokens and comments are excluded from that walk deliberately: `Program.tokens`
 * carries a token whose `type` is `Identifier` for every identifier in the file,
 * so walking them double-counts real nodes and, for a rule that reports on a
 * type sharing a token name, invents sites that are not AST nodes at all.
 *
 * BARE directives count. `// eslint-disable-next-line` with no rule list turns
 * off everything on its line, which suppresses the rule under test at least as
 * completely as one naming it; 8 of the 23 candidates here are that spelling.
 * Counting only the named form would leave the strongest version of the same
 * suppression outside the accounting, which is the shape of the defect this
 * guard exists to close.
 *
 * Corpus built through `fixtureCorpus` (filenames from `defaultFilenameFor`, so
 * a JSX fixture declared under `ruleTesterTs` is not a fatal parse read as
 * silence; languages from `LANGUAGE_BY_TESTER`), rules resolved by OBJECT
 * IDENTITY, and the display name kept alongside because that is the id
 * `RuleTester` registers and therefore the id a directive must spell.
 */
import { Linter, Rule } from 'eslint';
import {
  defaultFilenameFor,
  defineCorpusParsers,
  FixtureCase,
  FixtureLanguage,
  harvestOnce,
  LANGUAGE_BY_TESTER,
  parserKeyFor,
  parserOptionsFor,
  ruleNameByIdentity,
  severityWithOptions,
} from '../utils/fixtureCorpus';
import {
  LINE_SCOPED_CASES_ALLOWED_TO_SUPPRESS,
  lineScopedCoverage,
  lineScopedDirectives,
} from '../utils/validCaseFalsifiability';

/* eslint-disable @typescript-eslint/no-explicit-any */

type Probe = {
  /** The id `RuleTester` registers, which is what a directive has to name. */
  displayName: string;
  /** Resolved by identity; the display name is frequently not a rule name. */
  ruleName: string;
  rule: unknown;
  fixture: FixtureCase;
  filename: string;
  /** Lines a line-scoped directive silences the rule under test on. */
  covered: Set<number>;
  /** Where the fixture is declared, so a finding is reproducible by hand. */
  origin: string;
};

type Verdict =
  | 'inert'
  | 'falsifiable'
  /** The rule reports nothing at all, so there is no site to reason about. */
  | 'silent'
  /** A report carried no node, so its site has no type to match against. */
  | 'unclassifiable'
  | 'fatal'
  | 'crash';

type Classification = {
  verdict: Verdict;
  reportedTypes: string[];
  /** Report lines, for the cross-check that coverage agrees with ESLint. */
  reportLines: number[];
  /** Nodes of a reported type that no directive covers, `Type@line`. */
  escaping: string[];
  /** Messages ESLint kept once the fixture's own directives were applied. */
  survivingMessages: number;
};

const linter = new Linter();
defineCorpusParsers(linter);

/**
 * Registered under a name no fixture's directive spells, so a NAMED directive
 * cannot suppress the instrumented run. A bare one still can, which is why the
 * classification reads the intercepted sites rather than the messages.
 */
const PROBE_ID = 'line-scoped-probe';

type ReportSite = { type: string | null; line: number | null };

/**
 * The rule, with `context.report` recording the node it was handed.
 *
 * `Object.create(context)` rather than a `Proxy`: ESLint freezes the context, so
 * a proxy `get` trap that returns anything but the original `report` throws an
 * invariant violation on a non-configurable data property. Prototype delegation
 * leaves every other member — `options`, `sourceCode`, `getScope` — reaching the
 * real context untouched.
 */
const instrumented = (rule: unknown, sites: ReportSite[]) => {
  const module = rule as { create: (context: unknown) => unknown };
  return {
    ...(rule as Record<string, unknown>),
    create(context: any) {
      const recording = Object.create(context);
      Object.defineProperty(recording, 'report', {
        value: (descriptor: any) => {
          const node = descriptor?.node;
          const loc = descriptor?.loc;
          sites.push({
            type: typeof node?.type === 'string' ? node.type : null,
            line:
              node?.loc?.start?.line ?? loc?.start?.line ?? loc?.line ?? null,
          });
          return context.report(descriptor);
        },
      });
      return module.create(recording);
    },
  } as unknown as Rule.RuleModule;
};

/**
 * Every node in the tree, minus `tokens`/`comments` (whose entries carry a
 * `type` that collides with real node types) and `parent` (which cycles).
 */
const walkNodes = (root: unknown, visit: (node: any) => void) => {
  const seen = new Set<unknown>();
  const walk = (node: any) => {
    if (!node || typeof node.type !== 'string' || seen.has(node)) return;
    seen.add(node);
    visit(node);
    for (const key of Object.keys(node)) {
      if (key === 'parent' || key === 'tokens' || key === 'comments') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) walk(item);
      } else if (child && typeof child.type === 'string') {
        walk(child);
      }
    }
  };
  walk(root);
};

const configFor = (probe: Probe, rules: Record<string, unknown>) =>
  ({
    parser: parserKeyFor(probe.fixture),
    parserOptions: parserOptionsFor(probe.fixture),
    rules,
  } as unknown as Linter.Config);

function classify(probe: Probe): Classification {
  const sites: ReportSite[] = [];
  linter.defineRule(PROBE_ID, instrumented(probe.rule, sites));
  const severity = severityWithOptions(probe.fixture);
  const blank: Classification = {
    verdict: 'crash',
    reportedTypes: [],
    reportLines: [],
    escaping: [],
    survivingMessages: 0,
  };

  let messages;
  try {
    messages = linter.verify(
      probe.fixture.code,
      configFor(probe, { [PROBE_ID]: severity }),
      { filename: probe.filename },
    );
  } catch {
    return blank;
  }
  if (messages.some((message) => message.fatal)) {
    return { ...blank, verdict: 'fatal' };
  }
  const ast = linter.getSourceCode()?.ast;

  /**
   * The same fixture under the id its directives actually name. ESLint's own
   * directive processing then decides what survives, which cross-checks the
   * textual coverage computation against the implementation it models.
   */
  linter.defineRule(probe.displayName, probe.rule as never);
  let surviving: Linter.LintMessage[] = [];
  try {
    surviving = linter.verify(
      probe.fixture.code,
      configFor(probe, { [probe.displayName]: severity }),
      { filename: probe.filename },
    );
  } catch {
    return blank;
  }

  const reportLines = [
    ...new Set(
      sites
        .map((site) => site.line)
        .filter((line): line is number => typeof line === 'number'),
    ),
  ].sort((a, b) => a - b);
  const survivingMessages = surviving.length;

  if (sites.length === 0) {
    return { ...blank, verdict: 'silent', survivingMessages };
  }
  if (sites.some((site) => site.type === null)) {
    return {
      ...blank,
      verdict: 'unclassifiable',
      reportLines,
      survivingMessages,
    };
  }

  const reportedTypes = new Set(sites.map((site) => site.type as string));
  const escaping: string[] = [];
  walkNodes(ast, (node) => {
    if (!reportedTypes.has(node.type)) return;
    const line = node.loc?.start?.line;
    if (typeof line !== 'number' || probe.covered.has(line)) return;
    escaping.push(`${node.type}@${line}`);
  });

  return {
    verdict: escaping.length > 0 ? 'falsifiable' : 'inert',
    reportedTypes: [...reportedTypes],
    reportLines,
    escaping,
    survivingMessages,
  };
}

const harvested = harvestOnce();

/** Non-vacuity accounting; every counter here is read by an `expect` below. */
const stats = {
  suitesScanned: 0,
  suitesDropped: 0,
  validScanned: 0,
  directivesInValid: 0,
  directivesCoveringRule: 0,
  bareDirectives: 0,
  fatal: 0,
  crashed: 0,
  silent: 0,
  unclassifiable: 0,
  survivedSuppression: 0,
  reportLineUncovered: 0,
};

const candidates: Probe[] = [];

for (const suite of harvested.suites) {
  const ruleName = ruleNameByIdentity.get(suite.rule);
  if (!ruleName) {
    stats.suitesDropped++;
    continue;
  }
  stats.suitesScanned++;
  const language: FixtureLanguage = LANGUAGE_BY_TESTER[suite.tester] ?? 'ts';

  for (const raw of suite.valid) {
    const declared = (typeof raw === 'string' ? { code: raw } : raw) as {
      code?: unknown;
      filename?: unknown;
      options?: unknown;
      parserOptions?: unknown;
    } | null;
    if (!declared || typeof declared.code !== 'string') continue;
    stats.validScanned++;

    const directives = lineScopedDirectives(declared.code);
    if (directives.length === 0) continue;
    stats.directivesInValid += directives.length;
    stats.bareDirectives += directives.filter(
      (directive) => directive.rules === null,
    ).length;

    const covered = lineScopedCoverage(declared.code, suite.name);
    if (covered.size === 0) continue;
    stats.directivesCoveringRule += directives.filter(
      (directive) =>
        directive.rules === null || directive.rules.has(suite.name),
    ).length;

    const fixture: FixtureCase = {
      code: declared.code,
      filename:
        typeof declared.filename === 'string' ? declared.filename : undefined,
      options: Array.isArray(declared.options)
        ? (declared.options as readonly unknown[])
        : undefined,
      parserOptions: declared.parserOptions as
        | Record<string, unknown>
        | undefined,
      tester: suite.tester,
      language,
      origin: suite.file,
      bucket: 'valid',
    };
    candidates.push({
      displayName: suite.name,
      ruleName,
      rule: suite.rule,
      fixture,
      // From the CODE, never from the tester: a `.ts` path on a JSX fixture is
      // a fatal parse, indistinguishable from the rule staying silent.
      filename: defaultFilenameFor(fixture),
      covered,
      origin: `src/tests/${suite.file}`,
    });
  }
}

const classified = candidates.map((probe) => ({
  probe,
  ...classify(probe),
}));

for (const result of classified) {
  if (result.verdict === 'fatal') stats.fatal++;
  if (result.verdict === 'crash') stats.crashed++;
  if (result.verdict === 'silent') stats.silent++;
  if (result.verdict === 'unclassifiable') stats.unclassifiable++;
  if (result.survivingMessages > 0) stats.survivedSuppression++;
  if (result.reportLines.some((line) => !result.probe.covered.has(line))) {
    stats.reportLineUncovered++;
  }
}

/** Inert cases per DISPLAY name — the key the allowance map is written in. */
const inertCountsOf = (
  results: readonly { probe: Probe; verdict: Verdict }[],
) => {
  const counts = new Map<string, number>();
  for (const result of results) {
    if (result.verdict !== 'inert') continue;
    const key = result.probe.displayName;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
};

const mismatchesAgainstAllowance = (counts: Map<string, number>) => {
  const names = new Set([
    ...Object.keys(LINE_SCOPED_CASES_ALLOWED_TO_SUPPRESS),
    ...counts.keys(),
  ]);
  return [...names]
    .map((name) => ({
      name,
      allowed: LINE_SCOPED_CASES_ALLOWED_TO_SUPPRESS[name] ?? 0,
      actual: counts.get(name) ?? 0,
    }))
    .filter(({ allowed, actual }) => allowed !== actual)
    .sort((a, b) => a.name.localeCompare(b.name));
};

const inertCounts = inertCountsOf(classified);
const falsifiable = classified.filter(
  (result) => result.verdict === 'falsifiable',
);

console.log(
  [
    `[line-scoped-suppression] ${stats.validScanned} valid case(s) scanned, ` +
      `${stats.directivesInValid} line-scoped directive(s) (${stats.bareDirectives} bare), ` +
      `${stats.directivesCoveringRule} covering the rule under test`,
    `[line-scoped-suppression] ${candidates.length} candidate(s): ` +
      `${[...inertCounts.values()].reduce((a, b) => a + b, 0)} inert, ` +
      `${falsifiable.length} falsifiable, ${stats.silent} silent, ` +
      `${stats.unclassifiable} unclassifiable, ${stats.fatal} fatal, ` +
      `${stats.crashed} crashed`,
    ...falsifiable.map(
      (result) =>
        `    falsifiable: ${result.probe.displayName} (${result.probe.origin}) ` +
        `reports ${result.reportedTypes.join(',')}; escapes at ` +
        `${result.escaping.slice(0, 4).join(', ')}`,
    ),
  ].join('\n'),
);

describe('line-scoped suppression allowances', () => {
  it('holds no stale allowance: every entry matches its measured count', () => {
    const mismatched = mismatchesAgainstAllowance(inertCounts);
    if (mismatched.length > 0) {
      throw new Error(
        [
          'LINE_SCOPED_CASES_ALLOWED_TO_SUPPRESS disagrees with the measured',
          'corpus:',
          ...mismatched.map(
            ({ name, allowed, actual }) =>
              `  ${name}: allows ${allowed}, corpus has ${actual}`,
          ),
          '',
          'A `valid` case whose line-scoped directives cover every line the',
          'rule could report on passes for EVERY implementation, so it proves',
          'nothing while looking like false-positive protection. An allowance',
          'above the real count is slack that absorbs the next such case; one',
          'below means a new inert case shipped. Give the fixture a report site',
          'the directives do not cover (a second, unsuppressed occurrence is',
          'usually enough), or — if the suppression is the subject of the test',
          '(#1404) — raise the entry deliberately. Counts are exact (#2232).',
        ].join('\n'),
      );
    }
    expect(mismatched).toEqual([]);
  });

  it('classifies every candidate, skipping none in silence', () => {
    // Each of these is a case whose falsifiability went UNDECIDED, which is
    // indistinguishable from a clean one once only the verdicts are counted.
    expect({
      fatal: stats.fatal,
      crashed: stats.crashed,
      silent: stats.silent,
      unclassifiable: stats.unclassifiable,
    }).toEqual({ fatal: 0, crashed: 0, silent: 0, unclassifiable: 0 });
  });

  it('agrees with ESLint about what the directives silence', () => {
    /**
     * Coverage is computed from the fixture's TEXT, so it models ESLint's
     * directive processing rather than performing it. Two facts keep the model
     * honest, and both are properties of the corpus rather than of the code:
     * every candidate is silent once its own directives are applied under the
     * name `RuleTester` registers, and every line the rule reports on is a line
     * the computed coverage contains.
     */
    expect(stats.survivedSuppression).toBe(0);
    expect(stats.reportLineUncovered).toBe(0);
  });

  it('measures a corpus large enough to mean anything', () => {
    // 372 suites, 9412 valid cases, 81 line-scoped directives, 23 candidates.
    // The floors sit just under the measurement: a harvest that collapsed, or a
    // scan that stopped matching directives, satisfies the closure above with
    // zeroes and reports a clean sweep.
    expect(harvested.failures).toEqual([]);
    expect(harvested.filesLoaded).toBeGreaterThanOrEqual(270);
    expect(stats.suitesScanned).toBeGreaterThanOrEqual(360);
    expect(stats.suitesDropped).toBeLessThanOrEqual(8);
    expect(stats.validScanned).toBeGreaterThanOrEqual(9000);
    expect(stats.directivesInValid).toBeGreaterThanOrEqual(75);
    expect(stats.bareDirectives).toBeGreaterThanOrEqual(8);
    // 34 of the 81 cover the rule under test; the rest name a core or
    // `@typescript-eslint` rule and cannot make a case inert.
    expect(stats.directivesCoveringRule).toBeGreaterThanOrEqual(30);
    expect(candidates.length).toBeGreaterThanOrEqual(20);
  });

  it('does not overlap the block-form accounting', () => {
    /**
     * The two maps must partition the suppressed cases, not double-count them.
     * A candidate carrying a block disable as well would be counted by both, and
     * `valid-case-suppression-exactness` would then be enforcing an allowance
     * for a case this guard also holds an allowance for.
     */
    const alsoBlockDisabled = candidates.filter((probe) =>
      /\/\*\s*eslint-disable(?!-next-line\b|-line\b)/.test(probe.fixture.code),
    );
    expect(alsoBlockDisabled.map((probe) => probe.origin)).toEqual([]);
  });

  it('names only rules the plugin ships', () => {
    const shipped = new Set(ruleNameByIdentity.values());
    expect(
      Object.keys(LINE_SCOPED_CASES_ALLOWED_TO_SUPPRESS).filter(
        (name) => !shipped.has(name),
      ),
    ).toEqual([]);
    /**
     * Which holds only while every candidate's DISPLAY name is also a rule
     * name. A directive can suppress nothing but the id `RuleTester` registers,
     * so a suite running under a display name (`requireMemo`,
     * `prefer-next-dynamic (JSX scenarios)`) would have to be keyed here under
     * that name — and the closure above would then reject it. None does today;
     * the day one contributes a candidate, the two assertions contradict each
     * other on purpose, so the choice of key is made deliberately rather than
     * by whichever test fails first.
     */
    expect(
      candidates
        .filter((probe) => probe.displayName !== probe.ruleName)
        .map((probe) => `${probe.origin}: ${probe.displayName}`),
    ).toEqual([]);
  });
});

/**
 * Controls. The classification is a lint plus an AST walk, so it can go wrong in
 * both directions at once: a walk that finds nothing calls every case inert, and
 * one that matches too much calls every case falsifiable. Each polarity is
 * planted, and each is driven through the SAME `classify` and the same
 * aggregation the corpus scan uses.
 */
describe('the line-scoped accounting is load-bearing', () => {
  const probeOf = (displayName: string, code: string): Probe => {
    const rule = [...ruleNameByIdentity.entries()].find(
      ([, name]) => name === displayName,
    )?.[0];
    const fixture: FixtureCase = {
      code,
      tester: 'ruleTesterJsx',
      language: 'ts',
      origin: 'planted control',
      bucket: 'valid',
    };
    return {
      displayName,
      ruleName: displayName,
      rule,
      fixture,
      filename: defaultFilenameFor(fixture),
      covered: lineScopedCoverage(code, displayName),
      origin: 'planted control',
    };
  };

  /** Every report site covered: the shape the allowance map exists to count. */
  const PLANTED_INERT = probeOf(
    'no-array-length-in-deps',
    [
      'const Planted = ({ items }) => {',
      '  // eslint-disable-next-line no-array-length-in-deps',
      '  useEffect(() => { console.log(items); }, [items.length]);',
      '  return null;',
      '};',
      '',
    ].join('\n'),
  );

  /** Same rule, same directive, one more node of the reported type outside it. */
  const PLANTED_FALSIFIABLE = probeOf(
    'no-array-length-in-deps',
    [
      'const Planted = ({ items }) => {',
      '  // eslint-disable-next-line no-array-length-in-deps',
      '  useEffect(() => { console.log(items); }, [items.length]);',
      '  const spare = [items];',
      '  return spare;',
      '};',
      '',
    ].join('\n'),
  );

  it('counts a planted inert fixture, and the accounting then fails', () => {
    const planted = classify(PLANTED_INERT);
    expect(planted.verdict).toBe('inert');
    // The verdict alone is not the claim: an inert case must reach the map and
    // break its exactness, or the classification is a number nobody enforces.
    const withPlanted = inertCountsOf([
      ...classified,
      { probe: PLANTED_INERT, verdict: planted.verdict },
    ]);
    expect(mismatchesAgainstAllowance(withPlanted)).toEqual([
      {
        name: 'no-array-length-in-deps',
        allowed:
          LINE_SCOPED_CASES_ALLOWED_TO_SUPPRESS['no-array-length-in-deps'],
        actual:
          LINE_SCOPED_CASES_ALLOWED_TO_SUPPRESS['no-array-length-in-deps'] + 1,
      },
    ]);
  });

  it('leaves a fixture with an uncovered report site falsifiable (negative control)', () => {
    const planted = classify(PLANTED_FALSIFIABLE);
    expect(planted.verdict).toBe('falsifiable');
    expect(planted.escaping).toContain('ArrayExpression@4');
    // The directive must still be doing its job, or the two controls differ in
    // whether the rule reports at all rather than in where it could report.
    expect(planted.survivingMessages).toBe(0);
    expect(
      mismatchesAgainstAllowance(
        inertCountsOf([
          ...classified,
          { probe: PLANTED_FALSIFIABLE, verdict: planted.verdict },
        ]),
      ),
    ).toEqual([]);
  });

  it("keeps prefer-clone-deep's fixture falsifiable (corpus negative control)", () => {
    /**
     * The one corpus case that survives on its own merits: the directive covers
     * the outer object literal, and the nested `ObjectExpression` two lines
     * down is a report site no directive reaches. It is deliberately absent
     * from the allowance map, so a classifier that drifted toward calling
     * everything inert fails the exactness closure through this case.
     */
    const cloneDeep = classified.filter(
      (result) => result.probe.displayName === 'prefer-clone-deep',
    );
    expect(cloneDeep.length).toBe(1);
    expect(cloneDeep[0].verdict).toBe('falsifiable');
    expect(cloneDeep[0].reportedTypes).toEqual(['ObjectExpression']);
  });

  it('keeps an Identifier-reporting fixture falsifiable (corpus control)', () => {
    /**
     * `enforce-assert-safe-object-key` reports on the key IDENTIFIER, and both
     * of its line-scoped fixtures hold identifiers on uncovered lines — the
     * declaration of the key among them, which is exactly where a rule that
     * resolved a binding and reported its declaration site would land. Absent
     * from the allowance map for that reason.
     */
    const identifierReports = classified.filter(
      (result) => result.probe.displayName === 'enforce-assert-safe-object-key',
    );
    expect(identifierReports.length).toBe(2);
    expect(identifierReports.map((result) => result.verdict)).toEqual([
      'falsifiable',
      'falsifiable',
    ]);
  });

  it('finds real falsifiable cases in the corpus, not only planted ones', () => {
    // A corpus in which nothing survives would make the exactness closure a
    // statement about the classifier's floor rather than about the fixtures.
    expect(falsifiable.length).toBeGreaterThanOrEqual(3);
  });
});

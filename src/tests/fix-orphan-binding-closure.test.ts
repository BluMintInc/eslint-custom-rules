/**
 * A fixer must not leave a binding UNREFERENCED.
 *
 * The mirror image of the corruption question every other fix guard asks. Those
 * ask whether a fix leaves a REFERENCE UNBOUND — scope analysis sees that
 * immediately, and the agora `fix: true` sweep checks it over thousands of real
 * files. A binding left unreferenced is invisible to all of it: the output
 * parses, every reference resolves, and the fix loop converges. Only a rule that
 * counts USES can see it, which in practice means the consumer's CI — agora runs
 * `@typescript-eslint/no-unused-vars` as an error and builds with
 * `noUnusedLocals`, so this class turns a clean file red on their machine and
 * stays green on ours.
 *
 * It has shipped four times, each fixed one rule at a time: #1652 (a deleted
 * dependency array orphaned a hoisted `useMemo` binding), #1653 (a stripped
 * parameter annotation orphaned its type import), #1654 (the same for return
 * annotations) and #1670 (`no-redundant-param-types` stranding an import shared
 * by two annotations).
 *
 * WHAT THIS ADDS THAT THE NEIGHBOURING GUARDS DO NOT.
 *
 *   - `fix-closure-core-rules.test.ts` asks exactly this question with exactly
 *     this instrument, over FIVE HAND-WRITTEN FIXTURES. It is the reason the
 *     class is known; it is not a sweep. Eleven rules were orphaning bindings
 *     while it was green.
 *   - `recommended-config-fix-closure.test.ts` filters to `@blumintinc/blumint/*`
 *     message ids, so an unused binding is dropped before it is counted, and its
 *     corpus is docs fences.
 *   - `fix-fixpoint-closure.test.ts` composes the whole config over this same
 *     corpus, but asks about CONVERGENCE. An orphaned binding converges fine.
 *   - The agora `fix: true` sweep returned 0 findings over 8,707 files in the
 *     same cycle #1670 was live: the shape it needs — two strippable sites in
 *     one file sharing one binding — is simply rare in real code. A corpus of
 *     minimal adversarial fixtures is the instrument that finds it.
 *
 * METHOD, per harvested fixture:
 *
 *   1. Lint the input with core `no-unused-vars` and record the NAME each
 *      message quotes. A fixture may already carry unused bindings; only names
 *      that are new after the fix count, compared as a MULTISET so a file with
 *      two pre-existing orphans cannot absorb a third.
 *   2. Lint with the whole recommended config, fixing OFF, to learn which rules
 *      actually report. Only those can have produced a fix, so only those are
 *      retried — that is what keeps a per-rule sweep affordable.
 *   3. Fix with each reporting rule ALONE and re-diff. Attribution has to be
 *      solo: under the full config an orphan is frequently fixer INTERACTION,
 *      which belongs to neither rule and cannot be fixed in either.
 *
 * THE ORACLE TOOK TWO CORRECTIONS, both from the same direction, and both are
 * pinned by controls below. Keyed on message TEXT, a fixer that merely renames a
 * binding reads as orphaning it, because the message quotes the identifier —
 * 2,294 findings. Keyed on the NAME, the same rename still reads as orphaning,
 * because the name is what changed — 1,593 for `global-const-style` alone. What
 * survives is the name diff GATED on the unused-binding COUNT rising, which no
 * rename can do. See `newlyOrphaned`.
 */
import { Linter, Rule } from 'eslint';
import {
  harvestFixtureCorpus,
  defaultFilenameFor,
  defineCorpusParsers,
  parserKeyFor,
  parserOptionsFor,
  severityWithOptions,
  ruleNameByIdentity,
  silentWithoutProgramRuleNames,
  FixtureBucket,
} from '../utils/fixtureCorpus';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as {
  rules: Record<string, unknown>;
  configs: { recommended: { rules: Record<string, unknown> } };
};
/* eslint-enable @typescript-eslint/no-var-requires */

const PREFIX = '@blumintinc/blumint/';

/**
 * One rule is discounted BY NAME, at this guard's own level, exactly as
 * `fix-closure-core-rules` does and for the same measured reason: with no
 * program every dependency reads as `unknown`-typed, so `no-entire-object-hook-deps`
 * deletes deps it would leave alone in a consumer's CI (#1621). The orphans that
 * follow those deletions are artefacts of the missing program, not of the fixer.
 *
 * It is NOT added to `silentWithoutProgramRuleNames` — that set means "reports
 * nothing here", and this rule reports too MUCH — and it is one name rather than
 * all 16 rules mentioning `getParserServices`, because discounting one measured
 * divergence never justified unprobing fifteen others (#1879).
 */
const DIVERGENT_WITHOUT_PROGRAM = new Set(['no-entire-object-hook-deps']);

/**
 * Rules MEASURED to orphan a binding today, each with the issue that tracks it.
 * The set is asserted EXACTLY: a new entry fails as a regression, and a stale
 * one fails as a fix that nobody removed the baseline for.
 */
const ORPHAN_BASELINE = new Map<string, string>([
  ['no-redundant-usecallback-wrapper', '#1895'],
  ['no-usememo-for-pass-by-value', '#1896'],
  ['no-empty-dependency-use-callbacks', '#1897'],
  ['use-latest-callback', '#1898'],
  ['prefer-params-over-parent-id', '#1899'],
  ['enforce-centralized-mock-firestore', '#1900'],
  ['enforce-firestore-set-merge', '#1901'],
  ['no-explicit-return-type', '#1902'],
  ['key-only-outermost-element', '#1904'],
]);

/**
 * `enforce-microdiff` (#1903) is deliberately NOT baselined. It is a real defect
 * — it rewrites an import that the reported call does not resolve to, because it
 * matches the callee by identifier TEXT and so counts a shadowing local as a use
 * of the import — but its damage is count-neutral: the file already carried one
 * unused import (the shadowed one) and carries one afterwards (the rewritten
 * one). The count gate above cannot see it, and a baseline entry asserting it
 * orphans would fail immediately. It is tracked by its own issue instead.
 */

const linter = new Linter();
defineCorpusParsers(linter);
for (const [rule, name] of ruleNameByIdentity) {
  linter.defineRule(`${PREFIX}${name}`, rule as never);
}

/**
 * `no-undef` is deliberately absent: with no `env` every ambient global reads as
 * undefined, an artefact rather than a finding. `no-unused-vars` is the whole
 * instrument here — it is the one core rule that counts USES.
 */
const CORE_RULES = {
  'no-unused-vars': ['error', { args: 'none', ignoreRestSiblings: true }],
};

const RECOMMENDED: Record<string, unknown> = {};
for (const [id, severity] of Object.entries(plugin.configs.recommended.rules)) {
  if (!id.startsWith(PREFIX)) continue;
  if (severity === 'off' || severity === 0) continue;
  const name = id.slice(PREFIX.length);
  if (silentWithoutProgramRuleNames.has(name)) continue;
  if (DIVERGENT_WITHOUT_PROGRAM.has(name)) continue;
  RECOMMENDED[id] = severity;
}

const BUCKETS = new Set<FixtureBucket>(['valid', 'output', 'invalid']);

/**
 * Fixtures write `// eslint-disable-next-line <rule>` with a BARE name, because
 * that is what `RuleTester` registers. Under the real prefixed ids a bare
 * directive matches nothing and the rule fixes anyway, so the snippet would be
 * probed in a state its author explicitly suppressed.
 */
const BARE = [...ruleNameByIdentity.values()].sort(
  (a, b) => b.length - a.length,
);
const DIRECTIVE =
  /(eslint-disable(?:-next-line|-line)?|eslint-enable)([^\n*]*)/g;
const prefixDirectives = (code: string) =>
  code.replace(DIRECTIVE, (_whole, keyword: string, tail: string) => {
    let out = tail;
    for (const name of BARE) {
      out = out.replace(
        new RegExp(`(^|[\\s,])${name}(?![\\w/-])`, 'g'),
        `$1${PREFIX}${name}`,
      );
    }
    return `${keyword}${out}`;
  });

/**
 * The binding NAME each `no-unused-vars` message quotes. Using ESLint's own rule
 * rather than a hand-rolled predicate also sidesteps the aliasing trap: for
 * `import { a as b }` it reports the local binding `b`, where a text scan for
 * `a` would read every aliased import as orphaned.
 */
const unusedNames = (messages: Linter.LintMessage[]) => {
  const names: string[] = [];
  for (const message of messages) {
    if (message.ruleId !== 'no-unused-vars') continue;
    const match = /^'([^']+)'/.exec(message.message);
    if (match) names.push(match[1]);
  }
  return names;
};

/**
 * Names unused AFTER that were not unused BEFORE — but only once the COUNT of
 * unused bindings has actually risen.
 *
 * The count gate is what makes this rename-immune, and it is not optional. A
 * renaming fixer (`global-const-style`, `consistent-callback-naming`,
 * `enforce-react-type-naming`, `no-unnecessary-verb-suffix`,
 * `enforce-mui-rounded-icons`) rewrites the identifier itself, so an
 * ALREADY-unused `const foo` becomes an already-unused `const FOO` and the name
 * diff reports `FOO` as newly orphaned. Nothing was orphaned; a name changed.
 * Ungated, that artefact produced 1,593 findings for `global-const-style`
 * alone against ~240 real ones repo-wide.
 *
 * Gating on the count trades away one shape: a fixer that orphans one binding
 * while cleaning up another in the same pass nets zero and goes unreported. That
 * is the right direction to err — this guard exists to stop `--fix` from making
 * a consumer's build worse, and a pass that leaves the unused-binding count flat
 * has not.
 */
const newlyOrphaned = (before: string[], after: string[]) => {
  if (after.length <= before.length) return [];
  const pool = [...before];
  const orphaned: string[] = [];
  for (const name of after) {
    const at = pool.indexOf(name);
    if (at === -1) orphaned.push(name);
    else pool.splice(at, 1);
  }
  return orphaned;
};

type OrphanOutcome = {
  rewritten: boolean;
  fatal: boolean;
  orphaned: string[];
};

/**
 * The classification, in one function so the controls exercise the REAL code
 * path rather than a copy of it.
 */
function classifyOrphans(
  source: string,
  filename: string,
  coreConfig: unknown,
  fixConfig: unknown,
): OrphanOutcome {
  const coreBefore = linter.verify(source, coreConfig as never, filename);
  if (coreBefore.some((message) => message.fatal)) {
    return { rewritten: false, fatal: true, orphaned: [] };
  }
  const fixed = linter.verifyAndFix(source, fixConfig as never, filename);
  if (fixed.output === source) {
    return { rewritten: false, fatal: false, orphaned: [] };
  }
  const coreAfter = linter.verify(fixed.output, coreConfig as never, filename);
  if (coreAfter.some((message) => message.fatal)) {
    // A fixed output that no longer parses is `fix-fixpoint-closure`'s finding,
    // not this one. Counted so it cannot read as silence here.
    return { rewritten: true, fatal: true, orphaned: [] };
  }
  return {
    rewritten: true,
    fatal: false,
    orphaned: newlyOrphaned(unusedNames(coreBefore), unusedNames(coreAfter)),
  };
}

type Finding = {
  rule: string;
  owner: string;
  origin: string;
  bucket: FixtureBucket;
  filename: string;
  orphaned: string[];
};

const corpus = harvestFixtureCorpus();

const stats = {
  considered: 0,
  probed: 0,
  soloFixes: 0,
  rewritten: 0,
  inputFatal: 0,
  outputFatal: 0,
  rulesFixed: new Set<string>(),
  owners: new Set<string>(),
  threw: [] as string[],
};

const findings: Finding[] = [];

for (const [owner, cases] of corpus.byRule) {
  for (const testCase of cases) {
    if (!BUCKETS.has(testCase.bucket)) continue;
    // Core `no-unused-vars` is a JavaScript/TypeScript instrument; a JSON or
    // Markdown fixture read through it measures nothing.
    if (testCase.language !== 'ts') continue;
    stats.considered++;

    const filename = defaultFilenameFor(testCase);
    const source = prefixDirectives(testCase.code);
    const coreConfig = {
      parser: parserKeyFor(testCase),
      parserOptions: parserOptionsFor(testCase),
      rules: CORE_RULES,
    } as unknown as Linter.Config;

    try {
      if (
        linter
          .verify(source, coreConfig, filename)
          .some((message) => message.fatal)
      ) {
        stats.inputFatal++;
        continue;
      }
      stats.probed++;
      stats.owners.add(owner);

      // Only a rule that REPORTS can have produced a fix, so the solo retries
      // are confined to those. Sweeping every fixable rule against every
      // fixture is ~1.4M fix passes and buys nothing.
      const ownerId = `${PREFIX}${owner}`;
      const reporting = new Set(
        linter
          .verify(
            source,
            {
              parser: parserKeyFor(testCase),
              parserOptions: parserOptionsFor(testCase),
              rules: {
                ...RECOMMENDED,
                ...(RECOMMENDED[ownerId] || DIVERGENT_WITHOUT_PROGRAM.has(owner)
                  ? {}
                  : { [ownerId]: severityWithOptions(testCase) }),
              },
            } as unknown as Linter.Config,
            filename,
          )
          .map((message) => message.ruleId)
          .filter((id): id is string => Boolean(id) && id.startsWith(PREFIX)),
      );

      for (const id of reporting) {
        const name = id.slice(PREFIX.length);
        if (DIVERGENT_WITHOUT_PROGRAM.has(name)) continue;
        stats.soloFixes++;
        const outcome = classifyOrphans(source, filename, coreConfig, {
          parser: parserKeyFor(testCase),
          parserOptions: parserOptionsFor(testCase),
          // The owner's entry carries the OPTIONS its author wrote; without
          // them the fixture is fixed under a configuration nobody declared.
          rules: {
            [id]: name === owner ? severityWithOptions(testCase) : 'error',
          },
        } as unknown as Linter.Config);

        if (outcome.rewritten) {
          stats.rewritten++;
          stats.rulesFixed.add(name);
        }
        if (outcome.fatal) stats.outputFatal++;
        if (outcome.orphaned.length) {
          findings.push({
            rule: name,
            owner,
            origin: testCase.origin,
            bucket: testCase.bucket,
            filename,
            orphaned: outcome.orphaned,
          });
        }
      }
    } catch (error) {
      stats.threw.push(`${owner} ${testCase.origin}: ${String(error)}`);
    }
  }
}

const offenders = new Map<string, Finding[]>();
for (const finding of findings) {
  const list = offenders.get(finding.rule) || [];
  list.push(finding);
  offenders.set(finding.rule, list);
}

const describeFinding = (finding: Finding) =>
  `${finding.rule}: fixing ${finding.origin} (${finding.bucket}, as ${
    finding.filename
  }) leaves [${finding.orphaned.join(', ')}] unreferenced`;

/** A rule that orphans a binding and is not already tracked by an issue. */
const REGRESSIONS = [...offenders.keys()]
  .filter((rule) => !ORPHAN_BASELINE.has(rule))
  .sort();

/** A baseline entry whose rule no longer orphans anything. */
const STALE = [...ORPHAN_BASELINE.keys()]
  .filter((rule) => !offenders.has(rule))
  .sort();

describe('a fixer must not leave a binding unreferenced', () => {
  it('introduces no orphaned binding outside the tracked baseline', () => {
    if (REGRESSIONS.length) {
      // eslint-disable-next-line no-console
      console.error(
        REGRESSIONS.flatMap((rule) =>
          (offenders.get(rule) || []).slice(0, 3).map(describeFinding),
        ).join('\n'),
      );
    }
    expect(REGRESSIONS).toEqual([]);
  });

  it('has no stale baseline entry', () => {
    expect(STALE).toEqual([]);
  });

  it('never let a probe throw instead of producing a verdict', () => {
    expect(stats.threw).toEqual([]);
    expect(corpus.failures).toEqual([]);
  });

  /**
   * Non-vacuity. Every number below is a floor under a MEASURED value, so the
   * sweep cannot quietly stop doing work and keep passing: a corpus that fails
   * to load, a filename that stops matching, or a harvest that returns a
   * partial registry all show up here rather than as a clean run.
   */
  it('actually swept the corpus it claims to', () => {
    expect(stats.probed).toBeGreaterThan(15000);
    expect(stats.soloFixes).toBeGreaterThan(8000);
    expect(stats.rewritten).toBeGreaterThan(1000);
    expect(stats.owners.size).toBeGreaterThan(150);
    expect(stats.rulesFixed.size).toBeGreaterThan(50);
  });

  it('still measures every baselined rule as orphaning', () => {
    for (const [rule, issue] of ORPHAN_BASELINE) {
      expect({
        rule,
        issue,
        findings: (offenders.get(rule) || []).length,
      }).toEqual({ rule, issue, findings: expect.any(Number) });
      expect((offenders.get(rule) || []).length).toBeGreaterThan(0);
    }
  });

  /**
   * Planted controls, run through `classifyOrphans` itself. Without them a
   * predicate that silently stopped detecting anything would pass this file
   * forever, and the baseline assertions above would fail as "stale" — which
   * reads as good news.
   */
  const controlCore = {
    parser: 'ts',
    parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: CORE_RULES,
  };

  it('detects a planted fixer that orphans an import (positive control)', () => {
    const orphaner: Rule.RuleModule = {
      meta: { fixable: 'code', schema: [], type: 'problem', messages: {} },
      create(context) {
        return {
          CallExpression(node: never) {
            const call = node as unknown as { callee: { name?: string } };
            if (call.callee.name !== 'diff') return;
            context.report({
              node: node as never,
              message: 'rewrite',
              fix: (fixer) => fixer.replaceText(node as never, '0'),
            });
          },
        };
      },
    };
    linter.defineRule('control/orphaner', orphaner);

    const outcome = classifyOrphans(
      "import diff from 'microdiff';\nexport const n = diff(1, 2);\n",
      'control.ts',
      controlCore,
      { ...controlCore, rules: { 'control/orphaner': 'error' } },
    );
    expect({
      rewritten: outcome.rewritten,
      orphaned: outcome.orphaned,
    }).toEqual({ rewritten: true, orphaned: ['diff'] });
  });

  it('stays silent on a fix that orphans nothing (negative control)', () => {
    const tidy: Rule.RuleModule = {
      meta: { fixable: 'code', schema: [], type: 'problem', messages: {} },
      create(context) {
        return {
          CallExpression(node: never) {
            const call = node as unknown as {
              callee: { name?: string };
              range: [number, number];
            };
            if (call.callee.name !== 'diff') return;
            context.report({
              node: node as never,
              message: 'rewrite',
              fix: (fixer) => fixer.replaceText(node as never, 'diff(2, 1)'),
            });
          },
        };
      },
    };
    linter.defineRule('control/tidy', tidy);

    const outcome = classifyOrphans(
      "import diff from 'microdiff';\nexport const n = diff(1, 2);\n",
      'control.ts',
      controlCore,
      { ...controlCore, rules: { 'control/tidy': 'error' } },
    );
    expect({
      rewritten: outcome.rewritten,
      orphaned: outcome.orphaned,
    }).toEqual({ rewritten: true, orphaned: [] });
  });

  it('does not count a binding that was ALREADY unused (negative control)', () => {
    const outcome = classifyOrphans(
      "import diff from 'microdiff';\nimport unusedAlready from 'x';\nexport const n = diff(1, 2);\n",
      'control.ts',
      controlCore,
      { ...controlCore, rules: { 'control/tidy': 'error' } },
    );
    expect(outcome.orphaned).toEqual([]);
  });

  it('reads neither artefact as an orphan (oracle controls)', () => {
    // Message text changed, name did not: 2,294 findings before the fix.
    expect(newlyOrphaned(['foo'], ['foo'])).toEqual([]);
    // Name changed by a rename, count did not: 1,593 for global-const-style.
    expect(newlyOrphaned(['foo'], ['FOO'])).toEqual([]);
    // A rename that ALSO orphans is still caught.
    expect(newlyOrphaned(['foo'], ['FOO', 'diff'])).toEqual(['FOO', 'diff']);
    // And the plain case.
    expect(newlyOrphaned([], ['diff'])).toEqual(['diff']);
  });
});

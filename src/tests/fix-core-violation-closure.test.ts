/**
 * A fixer must not introduce a CORE eslint violation, swept over the whole
 * harvested fixture corpus.
 *
 * `fix-closure-core-rules.test.ts` asks exactly this question with exactly this
 * instrument — `no-dupe-keys`, `no-unreachable`, `no-const-assign`,
 * `no-self-assign` — over THREE HAND-WRITTEN FIXTURES. It is the reason the
 * class is known; it is not a sweep. Running its four non-`no-unused-vars` core
 * rules over the ~19.5k-case corpus found #1963 while it was green:
 * `no-usememo-for-pass-by-value` folded a carried multi-line block comment
 * between `return` and the expression it inlined, and because a MultiLineComment
 * containing a line terminator IS a LineTerminator to the syntactic grammar, ASI
 * split the statement — silently turning a returned `null` into `undefined` and
 * stranding the value as unreachable code.
 *
 * WHAT THIS ADDS THAT THE NEIGHBOURING GUARDS DO NOT.
 *
 *   - `fix-orphan-binding-closure.test.ts` sweeps this same corpus with the same
 *     shape, but its instrument is `no-unused-vars` ALONE — the one core rule
 *     that counts USES. It is deliberately not repeated here; these four are the
 *     complement, and nothing had ever run them over the corpus.
 *   - `recommended-config-fix-closure.test.ts` drops any message whose `ruleId`
 *     is not `@blumintinc/blumint/*`, so a core violation is discarded before it
 *     is counted, and its corpus is docs fences.
 *   - `fix-fixpoint-closure.test.ts` composes the whole config over this corpus
 *     but asks about CONVERGENCE. ASI-split dead code converges fine.
 *   - `fixture-corpus-parsability.test.ts` asks whether the output PARSES. The
 *     #1963 output parses; it just means something else.
 *
 * SCOPE — what this does NOT see, so the next reader treats it as a to-do:
 *
 *   - A restricted-production breach that `@typescript-eslint/parser` ACCEPTS is
 *     invisible here and to every other parse-based guard in this repo. #1964 was
 *     `no-explicit-return-type` emitting `() /**…*\/ => 1`, which V8 rejects as a
 *     SyntaxError while the TS parser reads it as clean. Only a V8 oracle
 *     (`node --check`) or a structural restricted-production checker sees that
 *     class; it is checked per-fixture inside `no-explicit-return-type.test.ts`
 *     and has no corpus-wide sweep.
 *   - Attribution is SOLO, so damage that only appears when two fixers compose
 *     belongs to neither rule and is not reported.
 *
 * METHOD, per harvested fixture: lint with the core rules to record a per-rule
 * message COUNT, fix with each REPORTING rule alone, and re-count. A finding is
 * a rule whose count ROSE. Gating on a count rise rather than on message text is
 * what makes it immune to a fixer that merely renames or moves an identifier the
 * message happens to quote, and lets a fixture carry its own pre-existing
 * violations without absorbing a new one.
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
 * EMPTY, and kept as the place an exclusion must be written.
 *
 * Its one entry was `no-entire-object-hook-deps`, discounted because with no
 * program every dependency reads as `unknown`-typed, so the rule reports and
 * deletes deps a consumer's CI would leave alone (#1621). That rationale is
 * about which dependencies get REPORTED. What this guard asks is what the fixer
 * then WRITES, which is range arithmetic and entirely syntactic — so the
 * exclusion was broader than its own reason, and no oracle had ever been
 * pointed at the hole it left. Three defects came out of it once one was:
 * #2208, a removal span anchored on a neighbouring element that swallowed the
 * comment between them; #2209 and #2210, a removal that stranded its binding.
 *
 * Dropping the name is MEASURED, not asserted: with the rule composed here the
 * suite is green, and it is driven non-vacuously rather than merely admitted.
 * The #1621 divergence itself is untouched and still real; it simply never
 * showed up as the thing this guard asks about.
 *
 * An entry here is one NAME rather than all 16 rules mentioning
 * `getParserServices` — discounting one measured divergence never justified
 * unprobing fifteen others (#1879) — and never belongs in
 * `silentWithoutProgramRuleNames`, which means "reports nothing here", nor at
 * rule-global scope, which un-gates every other arm at once (#1839).
 */
const DIVERGENT_WITHOUT_PROGRAM = new Set([]);

const linter = new Linter();
defineCorpusParsers(linter);
for (const [rule, name] of ruleNameByIdentity) {
  linter.defineRule(`${PREFIX}${name}`, rule as never);
}

/**
 * `no-undef` is deliberately absent: with no `env` every ambient global reads as
 * undefined, an artefact rather than a finding. `no-unused-vars` is absent
 * because `fix-orphan-binding-closure` owns it over this same corpus, with a
 * rename-immune oracle these four do not need.
 */
const CORE_RULES = {
  'no-dupe-keys': 'error',
  'no-unreachable': 'error',
  'no-const-assign': 'error',
  'no-self-assign': 'error',
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

const countByRule = (messages: Linter.LintMessage[]) => {
  const counts = new Map<string, number>();
  for (const message of messages) {
    if (!message.ruleId || !(message.ruleId in CORE_RULES)) continue;
    counts.set(message.ruleId, (counts.get(message.ruleId) || 0) + 1);
  }
  return counts;
};

/**
 * The core rules whose message count ROSE across the fix.
 *
 * Counting rather than diffing message text is what keeps this rename-immune: a
 * fixer that rewrites the identifier a message quotes changes the text without
 * changing how many violations exist. It also lets a fixture carry its own
 * pre-existing violations — only the increment is this guard's business.
 */
export const introducedRules = (
  before: Linter.LintMessage[],
  after: Linter.LintMessage[],
) => {
  const start = countByRule(before);
  const end = countByRule(after);
  return [...end.entries()]
    .filter(([id, count]) => count > (start.get(id) || 0))
    .map(([id]) => id)
    .sort();
};

type Outcome = {
  rewritten: boolean;
  fatal: boolean;
  introduced: string[];
  messages: string[];
};

/**
 * The classification, in one function so the controls exercise the REAL code
 * path rather than a copy of it.
 */
function classifyCoreViolations(
  source: string,
  filename: string,
  coreConfig: unknown,
  fixConfig: unknown,
): Outcome {
  const quiet = { introduced: [] as string[], messages: [] as string[] };
  const before = linter.verify(source, coreConfig as never, filename);
  if (before.some((message) => message.fatal)) {
    return { rewritten: false, fatal: true, ...quiet };
  }
  const fixed = linter.verifyAndFix(source, fixConfig as never, filename);
  if (fixed.output === source) {
    return { rewritten: false, fatal: false, ...quiet };
  }
  const after = linter.verify(fixed.output, coreConfig as never, filename);
  if (after.some((message) => message.fatal)) {
    // A fixed output that no longer parses is `fix-fixpoint-closure`'s finding,
    // not this one. Counted so it cannot read as silence here.
    return { rewritten: true, fatal: true, ...quiet };
  }
  const introduced = introducedRules(before, after);
  return {
    rewritten: true,
    fatal: false,
    introduced,
    messages: after
      .filter(
        (message) => message.ruleId && introduced.includes(message.ruleId),
      )
      .map((message) => `${message.ruleId}: ${message.message}`),
  };
}

type Finding = {
  rule: string;
  origin: string;
  bucket: FixtureBucket;
  filename: string;
  messages: string[];
};

const corpus = harvestFixtureCorpus();

const stats = {
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
    // These are JavaScript/TypeScript instruments; a JSON or Markdown fixture
    // read through them measures nothing.
    if (testCase.language !== 'ts') continue;

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
      // fixture buys nothing and costs orders of magnitude more.
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
        const outcome = classifyCoreViolations(source, filename, coreConfig, {
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
        if (outcome.introduced.length) {
          findings.push({
            rule: name,
            origin: testCase.origin,
            bucket: testCase.bucket,
            filename,
            messages: outcome.messages,
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

/**
 * Rules MEASURED to introduce a core violation today, each with the issue that
 * tracks it. The set is asserted EXACTLY: a new entry fails as a regression, and
 * a stale one fails as a fix nobody removed the baseline for.
 */
const CORE_VIOLATION_BASELINE = new Map<string, string>([]);

const REGRESSIONS = [...offenders.keys()]
  .filter((rule) => !CORE_VIOLATION_BASELINE.has(rule))
  .sort();

const STALE = [...CORE_VIOLATION_BASELINE.keys()]
  .filter((rule) => !offenders.has(rule))
  .sort();

describe('a fixer must not introduce a core eslint violation', () => {
  it('introduces no core violation outside the tracked baseline', () => {
    if (REGRESSIONS.length) {
      // eslint-disable-next-line no-console
      console.error(
        REGRESSIONS.flatMap((rule) =>
          (offenders.get(rule) || [])
            .slice(0, 3)
            .map(
              (finding) =>
                `${rule}: fixing ${finding.origin} (${finding.bucket}, as ${
                  finding.filename
                }) introduces ${finding.messages.join('; ')}`,
            ),
        ).join('\n'),
      );
    }
    expect(REGRESSIONS).toEqual([]);
  });

  it('has no stale baseline entry', () => {
    expect(STALE).toEqual([]);
  });

  it('still measures every baselined rule as offending', () => {
    for (const rule of CORE_VIOLATION_BASELINE.keys()) {
      expect((offenders.get(rule) || []).length).toBeGreaterThan(0);
    }
  });

  it('never let a probe throw instead of producing a verdict', () => {
    expect(stats.threw).toEqual([]);
    expect(corpus.failures).toEqual([]);
  });

  /**
   * Non-vacuity. Every number is a floor under a MEASURED value, so the sweep
   * cannot quietly stop doing work and keep passing: a corpus that fails to
   * load, a filename that stops matching, or a harvest that returns a partial
   * registry all show up here rather than as a clean run.
   */
  it('actually swept the corpus it claims to', () => {
    expect(stats.probed).toBeGreaterThan(19000);
    expect(stats.soloFixes).toBeGreaterThan(55000);
    expect(stats.rewritten).toBeGreaterThan(12000);
    expect(stats.owners.size).toBeGreaterThan(150);
    expect(stats.rulesFixed.size).toBeGreaterThan(75);
  });

  /**
   * Planted controls, run through `classifyCoreViolations` itself. Without them
   * a predicate that silently stopped detecting anything would pass forever, and
   * the baseline assertions above would fail as "stale" — which reads as good
   * news.
   */
  const controlCore = {
    parser: 'ts',
    parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: CORE_RULES,
  };

  it('detects a planted fixer that strands unreachable code (positive control)', () => {
    // The #1963 shape exactly: a line terminator folded in after `return`.
    const asiSplitter: Rule.RuleModule = {
      meta: { fixable: 'code', schema: [], type: 'problem', messages: {} },
      create(context) {
        return {
          ReturnStatement(node: never) {
            const statement = node as unknown as {
              argument: { range: [number, number] } | null;
            };
            if (!statement.argument) return;
            context.report({
              node: node as never,
              message: 'split',
              fix: (fixer) =>
                fixer.insertTextBeforeRange(
                  statement.argument!.range,
                  '/**\n * doc\n */ ',
                ),
            });
          },
        };
      },
    };
    linter.defineRule('control/asi-splitter', asiSplitter);

    const outcome = classifyCoreViolations(
      'export function f() {\n  return null;\n}\n',
      'control.ts',
      controlCore,
      { ...controlCore, rules: { 'control/asi-splitter': 'error' } },
    );
    expect({
      rewritten: outcome.rewritten,
      introduced: outcome.introduced,
    }).toEqual({ rewritten: true, introduced: ['no-unreachable'] });
  });

  it('stays silent on a fix that introduces nothing (negative control)', () => {
    const tidy: Rule.RuleModule = {
      meta: { fixable: 'code', schema: [], type: 'problem', messages: {} },
      create(context) {
        return {
          Literal(node: never) {
            const literal = node as unknown as { value: unknown };
            if (literal.value !== 1) return;
            context.report({
              node: node as never,
              message: 'rewrite',
              fix: (fixer) => fixer.replaceText(node as never, '2'),
            });
          },
        };
      },
    };
    linter.defineRule('control/tidy', tidy);

    const outcome = classifyCoreViolations(
      'export const n = 1;\n',
      'control.ts',
      controlCore,
      { ...controlCore, rules: { 'control/tidy': 'error' } },
    );
    expect({
      rewritten: outcome.rewritten,
      introduced: outcome.introduced,
    }).toEqual({ rewritten: true, introduced: [] });
  });

  it('does not count a violation that was ALREADY there (negative control)', () => {
    const outcome = classifyCoreViolations(
      'export function f() {\n  return 1;\n  const dead = 3;\n}\n',
      'control.ts',
      controlCore,
      { ...controlCore, rules: { 'control/tidy': 'error' } },
    );
    expect({
      rewritten: outcome.rewritten,
      introduced: outcome.introduced,
    }).toEqual({ rewritten: true, introduced: [] });
  });

  it('reads a count rise, not a text change (oracle controls)', () => {
    const message = (ruleId: string) =>
      ({ ruleId } as unknown as Linter.LintMessage);
    // Same count, so a fixer that merely reworded or moved the site is not a
    // finding.
    expect(
      introducedRules([message('no-self-assign')], [message('no-self-assign')]),
    ).toEqual([]);
    // A genuine increment is.
    expect(
      introducedRules(
        [message('no-self-assign')],
        [message('no-self-assign'), message('no-self-assign')],
      ),
    ).toEqual(['no-self-assign']);
    // And a violation of a different core rule appearing from nothing.
    expect(introducedRules([], [message('no-unreachable')])).toEqual([
      'no-unreachable',
    ]);
    // A rule whose count FELL is not a finding either.
    expect(
      introducedRules([message('no-dupe-keys'), message('no-dupe-keys')], []),
    ).toEqual([]);
  });
});

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
 *
 * TWO ARMS, because that count gate has a measured blind spot.
 *
 * The gate is right about renames and wrong about EXCHANGES: a pass that strands
 * one binding while cleaning up another nets zero, so the count never rises and
 * the whole population is discarded before the name diff is consulted. Sweeping
 * the corpus for exactly that shape — the unused-binding multiset changing while
 * the count does not rise — returned 2,076 rows at v1.20.195: 2,069 belonging to
 * the five renaming fixers the gate exists to absorb, 2 to
 * `enforce-centralized-mock-firestore` swapping one unreferenced binding for
 * another, and 5 to `no-unused-usestate` stranding its `useState` import while
 * removing two other unused bindings, so the count FELL. Those 5 were real,
 * shipped, and filed as #2228 — a true-positive floor the count arm is
 * structurally unable to reach. On this corpus, with that rule reverted to its
 * pre-#2228 source, the same population is 11 rows against 1 the count arm can
 * see.
 *
 * The second arm keys on the REFERENCE-COUNT TRANSITION of a declaration instead
 * of on the multiset size: a name unused after the fix is flagged only when a
 * same-named declaration had at least one read reference BEFORE it (refs > 0 →
 * refs == 0). That absorbs every rename artefact without needing a count gate —
 * a renamed already-unused binding had no reference on either side, and the new
 * name has none before it by construction — while seeing the exchange class,
 * because `useState` held one reference before the fix and none after.
 *
 * Both arms ship, and neither subsumes the other. The count arm still owns a
 * fixer that INSERTS an unreferenced binding, where no declaration of that name
 * existed before and so no transition can be observed; the transition arm owns
 * everything count-neutral. The one shape neither sees is a fixer that renames a
 * USED binding and deletes all of its references in the same pass, of which no
 * instance is measured. See `newlyOrphaned` and `strandedByTransition`.
 */
import { Linter, Rule, Scope } from 'eslint';
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
import {
  OptionCarriage,
  composedRulesFor,
  noteOptionCarriage,
} from '../utils/composedFixConfig';

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

const EXCLUDED = new Set<string>([
  ...silentWithoutProgramRuleNames,
  ...DIVERGENT_WITHOUT_PROGRAM,
]);

/**
 * Rules MEASURED to orphan a binding today, each with the issue that tracks it.
 * The set is asserted EXACTLY: a new entry fails as a regression, and a stale
 * one fails as a fix that nobody removed the baseline for.
 */
const ORPHAN_BASELINE = new Map<string, string>([]);

/**
 * The transition arm's baseline, asserted as an EXACT census rather than as a
 * membership test: the recorded finding COUNT must match, so a baselined rule
 * that starts stranding a SECOND binding fails here instead of hiding behind an
 * entry that only says "this rule is known". EMPTY, and measured empty.
 *
 * `enforce-centralized-mock-firestore` is deliberately NOT baselined, and the
 * reason is a measurement rather than a judgement call. Its two count-neutral
 * exchanges hoist a dynamic `await import('.../mockFirestore')` that destructures
 * into an unused alias:
 *
 *   const { mockFirestore: mockFirebase } = await import('...');   // unused
 *   -> import { mockFirestore } from '...';                        // unused
 *
 * so the file carries one unreferenced binding before and one after, and NO
 * declaration lost a reference: `mockFirestore` did not exist as a binding
 * before the fix, exactly as a renamed identifier does not. The transition arm
 * therefore reads it the same way it reads the 2,093 rename rows — silence — and
 * an entry here asserting it strands would fail immediately. The input is
 * already red and the output equally red (#1903 tracks the underlying
 * text-matching defect), which is the adjudicated disposition.
 */
const STRAND_BASELINE = new Map<string, { issue: string; findings: number }>(
  [],
);

/**
 * The five fixers that rewrite an identifier, and so are the entire reason the
 * count arm carries a gate. They are the transition arm's negative control on
 * REAL data: each must be driven over count-neutral exchanges, and none may
 * produce a finding from one.
 */
const RENAMING_FIXERS = [
  'global-const-style',
  'no-unnecessary-verb-suffix',
  'consistent-callback-naming',
  'enforce-react-type-naming',
  'enforce-mui-rounded-icons',
];

/**
 * Floors under MEASURED values, so the transition arm cannot fall silent by
 * examining nothing. Measured on this corpus with #2228's fix in place: 23,818
 * fixtures, 70,462 solo fix passes, 15,269 rewrites, 2,095 count-neutral
 * exchanges, of which 1,970 are `global-const-style`.
 *
 * Held just under the measurement rather than at a round number well below it:
 * a floor with room to spare is a floor that keeps passing while the sweep
 * quietly stops doing most of its work.
 *
 * The arm's true-positive evidence is not a finding here — with #2228 fixed
 * there are none — but the REVERT. Restoring `no-unused-usestate` to its
 * pre-#2228 source turns this arm red with 12 rows, of which the count arm sees
 * exactly ONE (the single fixture where the unused-binding count rose, quoting
 * `[useState, initial]`). The other 11 are the count-neutral exchanges this arm
 * exists for, and they are why the silence above is a verdict rather than an
 * empty sweep.
 */
const EXCHANGE_FLOOR = 2050;
const RENAME_CALIBRATION_FLOOR = 1930;

const linter = new Linter();
defineCorpusParsers(linter);
for (const [rule, name] of ruleNameByIdentity) {
  linter.defineRule(`${PREFIX}${name}`, rule as never);
}

/**
 * The scope manager of the most recent core verify, or `null` when
 * `Program:exit` never fired — which for this harness means the source did not
 * parse.
 *
 * The transition arm needs the reference count of every binding, and
 * `no-unused-vars` cannot supply it: the rule reports the bindings that have NO
 * reference and says nothing whatever about the rest, so a name absent from its
 * output could have one reference or fifty. Scope analysis is the only source.
 *
 * Captured off the core verify rather than bought with a second one. The sweep
 * already parses each source twice per solo fix pass (~137,000 parses); a
 * dedicated verify for the reference counts would double that for a fact the
 * existing parse has already computed.
 */
let capturedScopes: Scope.Scope[] | null = null;

const scopeProbe: Rule.RuleModule = {
  meta: { schema: [], type: 'problem', messages: {} },
  create(context) {
    return {
      'Program:exit'() {
        capturedScopes = context.getSourceCode().scopeManager?.scopes ?? [];
      },
    };
  },
};
linter.defineRule('probe/capture-scopes', scopeProbe);

/**
 * `no-undef` is deliberately absent: with no `env` every ambient global reads as
 * undefined, an artefact rather than a finding. `no-unused-vars` is the whole
 * instrument here — it is the one core rule that counts USES.
 *
 * `probe/capture-scopes` reports nothing; it rides along to hand back the scope
 * manager of the same parse.
 */
const CORE_RULES = {
  'no-unused-vars': ['error', { args: 'none', ignoreRestSiblings: true }],
  'probe/capture-scopes': 'error',
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
 * Read references per binding NAME, summed over every scope.
 *
 * Summed by name rather than tracked per declaration because the unused-name
 * diff below is itself keyed on names: `no-unused-vars` hands back an
 * identifier, not a declaration. Summing is the conservative direction — a name
 * declared twice, once used and once not, reports a positive count and so is
 * excluded from the diff by the multiset subtraction before the transition test
 * ever sees it.
 */
const readReferenceCounts = (scopes: Scope.Scope[]) => {
  const counts = new Map<string, number>();
  for (const scope of scopes) {
    for (const variable of scope.variables) {
      let reads = 0;
      for (const reference of variable.references) {
        if (reference.isRead()) reads++;
      }
      counts.set(variable.name, (counts.get(variable.name) ?? 0) + reads);
    }
  }
  return counts;
};

type CoreRead = {
  messages: Linter.LintMessage[];
  refCounts: Map<string, number>;
  /** No scope manager came back from a source that parsed: a silent loss. */
  scopesMissing: boolean;
};

/** One core lint, plus the scope facts of the same parse. */
const verifyCore = (
  code: string,
  config: unknown,
  filename: string,
): CoreRead => {
  capturedScopes = null;
  const messages = linter.verify(code, config as never, filename);
  const scopes = capturedScopes;
  capturedScopes = null;
  return {
    messages,
    refCounts: scopes ? readReferenceCounts(scopes) : new Map(),
    scopesMissing: scopes === null,
  };
};

/**
 * Names unused AFTER that were not unused BEFORE, as a MULTISET difference and
 * with no gate at all. Both arms start here and differ only in what they then
 * require of a name.
 *
 * The multiset is what keeps a file with two pre-existing orphans from absorbing
 * a third, and — for the transition arm — what cancels a name that is unused on
 * both sides because it is declared twice in different scopes.
 */
const appearedUnused = (before: string[], after: string[]) => {
  const pool = [...before];
  const appeared: string[] = [];
  for (const name of after) {
    const at = pool.indexOf(name);
    if (at === -1) appeared.push(name);
    else pool.splice(at, 1);
  }
  return appeared;
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
 * shape is real and measured — `no-unused-usestate` shipped it (#2228) — so it
 * is covered by `strandedByTransition` rather than left uncovered. This arm
 * keeps its gate because it still owns the converse: a fixer that INSERTS an
 * unreferenced binding raises the count without any declaration having lost a
 * reference, and no transition test can see that.
 */
const newlyOrphaned = (before: string[], after: string[]) =>
  after.length <= before.length ? [] : appearedUnused(before, after);

/**
 * Names that went from REFERENCED to unreferenced, with no count gate.
 *
 * This is the rename-immunity the count gate was standing in for, obtained from
 * the property that actually distinguishes the two cases. A rename moves an
 * already-unused `const foo` to an already-unused `const FOO`: `FOO` appears in
 * the diff, but no declaration named `FOO` existed before the fix, so its
 * before-count is zero and it is dropped. Measured against the calibration
 * corpus that produced 1,593 rename artefacts under the ungated name diff, this
 * predicate returns none of them.
 *
 * What it catches is the exchange: `useState` held one reference before the fix
 * removed the call, and none afterwards, while two other unused bindings went
 * away in the same pass and left the count FALLING.
 *
 * The one shape neither arm sees is a fixer that renames a binding that WAS used
 * and deletes every reference to it in the same pass. The new name has no
 * before-references by construction, so no transition is recorded. No instance
 * of it is measured over 23,818 fixtures; it is documented rather than guessed
 * at.
 */
const strandedByTransition = (
  before: string[],
  after: string[],
  refCountsBefore: Map<string, number>,
) =>
  appearedUnused(before, after).filter(
    (name) => (refCountsBefore.get(name) ?? 0) > 0,
  );

type OrphanOutcome = {
  rewritten: boolean;
  fatal: boolean;
  orphaned: string[];
  stranded: string[];
  /**
   * The unused-binding multiset changed while the count did NOT rise — the
   * population the count arm is structurally blind to, counted so the transition
   * arm's silence can be shown to be a verdict rather than an empty sweep.
   */
  exchange: boolean;
  scopesMissing: boolean;
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
  const quiet = {
    orphaned: [] as string[],
    stranded: [] as string[],
    exchange: false,
  };
  const before = verifyCore(source, coreConfig, filename);
  if (before.messages.some((message) => message.fatal)) {
    return { rewritten: false, fatal: true, scopesMissing: false, ...quiet };
  }
  const fixed = linter.verifyAndFix(source, fixConfig as never, filename);
  if (fixed.output === source) {
    return {
      rewritten: false,
      fatal: false,
      scopesMissing: before.scopesMissing,
      ...quiet,
    };
  }
  const after = verifyCore(fixed.output, coreConfig, filename);
  if (after.messages.some((message) => message.fatal)) {
    // A fixed output that no longer parses is `fix-fixpoint-closure`'s finding,
    // not this one. Counted so it cannot read as silence here.
    return { rewritten: true, fatal: true, scopesMissing: false, ...quiet };
  }
  const namesBefore = unusedNames(before.messages);
  const namesAfter = unusedNames(after.messages);
  return {
    rewritten: true,
    fatal: false,
    orphaned: newlyOrphaned(namesBefore, namesAfter),
    stranded: strandedByTransition(namesBefore, namesAfter, before.refCounts),
    exchange:
      namesAfter.length <= namesBefore.length &&
      appearedUnused(namesBefore, namesAfter).length > 0,
    scopesMissing: before.scopesMissing || after.scopesMissing,
  };
}

type Finding = {
  rule: string;
  owner: string;
  origin: string;
  bucket: FixtureBucket;
  filename: string;
  /** The binding names the fix left unreferenced, per the arm that found it. */
  names: string[];
};

const corpus = harvestFixtureCorpus();

const stats = {
  considered: 0,
  probed: 0,
  soloFixes: 0,
  rewritten: 0,
  inputFatal: 0,
  outputFatal: 0,
  /** Rewrites whose unused-binding multiset moved without the count rising. */
  exchanges: 0,
  /** The same population per rule, so a calibration corpus can be named. */
  exchangesByRule: new Map<string, number>(),
  /** A parse that produced no scope manager: the transition arm went blind. */
  scopesMissing: 0,
  rulesFixed: new Set<string>(),
  owners: new Set<string>(),
  threw: [] as string[],
};

const findings: Finding[] = [];
const strandFindings: Finding[] = [];

const carriage: OptionCarriage = { carried: 0, witness: null };

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
      /**
       * The owner's own entry carries the OPTIONS its author declared,
       * overriding the recommended severity that carries none. A screen run at
       * defaults answers a question about a configuration nobody wrote: an
       * option-gated report is unreachable, so the owner reads as silent on its
       * own fixture and its fixer is never retried (#1732, #2244).
       */
      const screenConfig = {
        parser: parserKeyFor(testCase),
        parserOptions: parserOptionsFor(testCase),
        rules: composedRulesFor(RECOMMENDED, EXCLUDED, owner, testCase),
      } as unknown as Linter.Config;
      const screened = linter.verify(source, screenConfig, filename);
      const reporting = new Set(
        screened
          .map((message) => message.ruleId)
          .filter((id): id is string => Boolean(id) && id.startsWith(PREFIX)),
      );
      /**
       * Read back out of the config that was LINTED, not out of a second call to
       * the builder: a screen rewritten to drop the owner's options would
       * otherwise leave this counter reading a configuration nobody ran.
       */
      noteOptionCarriage(
        carriage,
        screenConfig.rules as Record<string, unknown>,
        owner,
        testCase,
        reporting.has(ownerId),
        () =>
          linter
            .verify(
              source,
              {
                parser: parserKeyFor(testCase),
                parserOptions: parserOptionsFor(testCase),
                rules: { [ownerId]: 'error' },
              } as unknown as Linter.Config,
              filename,
            )
            .some((message) => message.ruleId === ownerId),
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
        if (outcome.scopesMissing) stats.scopesMissing++;
        if (outcome.exchange) {
          stats.exchanges++;
          stats.exchangesByRule.set(
            name,
            (stats.exchangesByRule.get(name) ?? 0) + 1,
          );
        }
        const record = (names: string[]): Finding => ({
          rule: name,
          owner,
          origin: testCase.origin,
          bucket: testCase.bucket,
          filename,
          names,
        });
        if (outcome.orphaned.length) findings.push(record(outcome.orphaned));
        if (outcome.stranded.length) {
          strandFindings.push(record(outcome.stranded));
        }
      }
    } catch (error) {
      stats.threw.push(`${owner} ${testCase.origin}: ${String(error)}`);
    }
  }
}

const groupByRule = (list: Finding[]) => {
  const byRule = new Map<string, Finding[]>();
  for (const finding of list) {
    const bucket = byRule.get(finding.rule) || [];
    bucket.push(finding);
    byRule.set(finding.rule, bucket);
  }
  return byRule;
};

const offenders = groupByRule(findings);
const strandOffenders = groupByRule(strandFindings);

const describeFinding = (finding: Finding) =>
  `${finding.rule}: fixing ${finding.origin} (${finding.bucket}, as ${
    finding.filename
  }) leaves [${finding.names.join(', ')}] unreferenced`;

/** A rule that orphans a binding and is not already tracked by an issue. */
const REGRESSIONS = [...offenders.keys()]
  .filter((rule) => !ORPHAN_BASELINE.has(rule))
  .sort();

/** A baseline entry whose rule no longer orphans anything. */
const STALE = [...ORPHAN_BASELINE.keys()]
  .filter((rule) => !offenders.has(rule))
  .sort();

/**
 * The transition arm's census, as `rule -> finding count`. Compared to the
 * baseline as a whole object so one assertion closes all three directions at
 * once: an unbaselined rule, a baselined rule that stopped, and a baselined rule
 * whose count moved.
 */
const strandCensus = Object.fromEntries(
  [...strandOffenders]
    .map(([rule, list]) => [rule, list.length] as const)
    .sort(([a], [b]) => a.localeCompare(b)),
);

const strandExpected = Object.fromEntries(
  [...STRAND_BASELINE]
    .map(([rule, entry]) => [rule, entry.findings] as const)
    .sort(([a], [b]) => a.localeCompare(b)),
);

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

  /**
   * The transition arm, asserted as an EXACT census. A rule appearing here is a
   * regression, a baselined rule disappearing is a fix nobody removed the entry
   * for, and a baselined rule whose count moved is a second defect hiding behind
   * the first — the repo's contract is a match, not an upper bound.
   */
  it('strands no referenced binding outside the exact baseline', () => {
    const unexpected = [...strandOffenders.keys()]
      .filter((rule) => !STRAND_BASELINE.has(rule))
      .sort();
    if (unexpected.length) {
      // eslint-disable-next-line no-console
      console.error(
        unexpected
          .flatMap((rule) =>
            (strandOffenders.get(rule) || []).slice(0, 3).map(describeFinding),
          )
          .join('\n'),
      );
    }
    expect(strandCensus).toEqual(strandExpected);
  });

  it('never let a probe throw instead of producing a verdict', () => {
    expect(stats.threw).toEqual([]);
    expect(corpus.failures).toEqual([]);
  });

  /**
   * Non-vacuity. Every number below sits JUST under its measured value, so the
   * sweep cannot quietly stop doing work and keep passing: a corpus that fails
   * to load, a filename that stops matching, or a harvest that returns a
   * partial registry all show up here rather than as a clean run.
   *
   * Measured (printed above, so a recalibration reads the numbers rather than
   * guessing them): probed 23,824, soloFixes 70,588, rewritten 15,320, owners
   * 192, rulesFixed 82, optionCarrying 783. A floor left far below its
   * measurement is the failure mode these guard against — the previous soloFixes
   * floor sat at 8,000 and the rewritten floor at 1,000, so either could have
   * lost 85% of the sweep and still reported a clean run.
   */
  it('actually swept the corpus it claims to', () => {
    // eslint-disable-next-line no-console
    console.log(
      `[fix-orphan-binding-closure] probed=${stats.probed} ` +
        `soloFixes=${stats.soloFixes} rewritten=${stats.rewritten} ` +
        `owners=${stats.owners.size} rulesFixed=${stats.rulesFixed.size} ` +
        `exchanges=${stats.exchanges} optionCarrying=${carriage.carried}`,
    );
    expect(stats.probed).toBeGreaterThan(23500);
    expect(stats.soloFixes).toBeGreaterThan(69000);
    expect(stats.rewritten).toBeGreaterThan(15000);
    expect(stats.owners.size).toBeGreaterThan(185);
    expect(stats.rulesFixed.size).toBeGreaterThan(78);
    /**
     * What the sweep DISCARDS, held at its measured zero. A fatal parse is
     * indistinguishable from the rule staying silent, because every consumer
     * filters messages by `ruleId` — so these two counters are the only
     * record that the corpus is being read rather than dropped, and both
     * were incremented and read by nothing.
     */
    expect(stats.inputFatal).toBe(0);
    expect(stats.outputFatal).toBe(0);
    /**
     * A source that parsed but handed back no scope manager would leave the
     * transition arm reading every reference count as zero — which is exactly
     * the answer that suppresses a finding. Held at its measured zero rather
     * than merely printed.
     */
    expect(stats.scopesMissing).toBe(0);
  });

  /**
   * The screen runs each fixture under the configuration its AUTHOR declared.
   *
   * Both halves are needed. The population says the composed config keeps
   * carrying options at all; the witness says those options still decide an
   * answer. A screen that reverted to defaults would sweep the same corpus and
   * report the same clean result, because an option-gated report never arrives
   * and reads as a silent rule (#1732, #2244).
   */
  it('screens every fixture under the options its author declared', () => {
    expect(carriage.carried).toBeGreaterThan(750); // measured 783
    const witness = carriage.witness;
    expect(witness).not.toBeNull();
    expect(witness?.ownerEntry).toEqual(['error', ...(witness?.options || [])]);
  });

  /**
   * The transition arm's own non-vacuity, and its negative control ON REAL DATA.
   *
   * The arm's value is entirely in the population the count arm cannot see, so
   * "no findings" is only meaningful if that population is large and non-empty.
   * `global-const-style` is the calibration corpus: it is the fixer that
   * produced 1,593 artefacts under the ungated name diff, it contributes the
   * bulk of the exchanges below, and it must contribute zero findings.
   */
  it('examined a real population of count-neutral exchanges', () => {
    expect(stats.exchanges).toBeGreaterThan(EXCHANGE_FLOOR);
    expect(
      stats.exchangesByRule.get('global-const-style') ?? 0,
    ).toBeGreaterThan(RENAME_CALIBRATION_FLOOR);
    // Every renaming fixer must be DRIVEN over exchanges here...
    expect(
      RENAMING_FIXERS.filter(
        (rule) => (stats.exchangesByRule.get(rule) ?? 0) < 1,
      ),
    ).toEqual([]);
    // ...and none of them may produce a finding from one.
    expect(RENAMING_FIXERS.filter((rule) => strandOffenders.has(rule))).toEqual(
      [],
    );
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

  /**
   * The #2228 shape, planted: one pass that strands a REFERENCED import while
   * cleaning an unrelated unused binding, so the unused-binding count comes out
   * flat. This is the control that fails if the transition arm is removed — the
   * count arm is asserted silent on the very same outcome, which is the whole
   * claim the arm rests on.
   */
  it('detects a count-neutral exchange the count gate cannot see (positive control)', () => {
    const exchanger: Rule.RuleModule = {
      meta: { fixable: 'code', schema: [], type: 'problem', messages: {} },
      create(context) {
        return {
          CallExpression(node: never) {
            const call = node as unknown as { callee: { name?: string } };
            if (call.callee.name !== 'diff') return;
            context.report({
              node: node as never,
              message: 'drop the call, keep the import',
              fix: (fixer) => fixer.replaceText(node as never, '0'),
            });
          },
          ImportDeclaration(node: never) {
            const declaration = node as unknown as {
              source: { value?: unknown };
            };
            if (declaration.source.value !== 'stale') return;
            context.report({
              node: node as never,
              message: 'tidy an unrelated unused import',
              fix: (fixer) => fixer.remove(node as never),
            });
          },
        };
      },
    };
    linter.defineRule('control/exchanger', exchanger);

    const outcome = classifyOrphans(
      [
        "import diff from 'microdiff';",
        "import stale from 'stale';",
        'export const n = diff(1, 2);',
        '',
      ].join('\n'),
      'control.ts',
      controlCore,
      { ...controlCore, rules: { 'control/exchanger': 'error' } },
    );
    expect({
      rewritten: outcome.rewritten,
      exchange: outcome.exchange,
      orphaned: outcome.orphaned,
      stranded: outcome.stranded,
    }).toEqual({
      rewritten: true,
      exchange: true,
      // The count arm is BLIND to this: one unused binding in, one out.
      orphaned: [],
      stranded: ['diff'],
    });
  });

  /**
   * The artefact the count gate was standing in for, planted: a fixer that
   * renames a binding that was ALREADY unused. The ungated name diff reports the
   * new name, and the transition arm must not — this is the 1,593-artefact shape
   * in miniature, and it is what makes dropping the count gate here safe.
   */
  it('examines a rename of an already-unused binding and stays silent (negative control)', () => {
    const renamer: Rule.RuleModule = {
      meta: { fixable: 'code', schema: [], type: 'problem', messages: {} },
      create(context) {
        return {
          VariableDeclarator(node: never) {
            const declarator = node as unknown as {
              id: { name?: string; range: [number, number] };
            };
            if (declarator.id.name !== 'unusedAlready') return;
            context.report({
              node: node as never,
              message: 'rename',
              fix: (fixer) =>
                fixer.replaceTextRange(declarator.id.range, 'UNUSED_ALREADY'),
            });
          },
        };
      },
    };
    linter.defineRule('control/renamer', renamer);

    const outcome = classifyOrphans(
      'const unusedAlready = 1;\nexport const n = 2;\n',
      'control.ts',
      controlCore,
      { ...controlCore, rules: { 'control/renamer': 'error' } },
    );
    expect({
      rewritten: outcome.rewritten,
      exchange: outcome.exchange,
      stranded: outcome.stranded,
    }).toEqual({
      rewritten: true,
      // The name diff DID move — this row is inside the population the arm
      // examines, not skipped before reaching it.
      exchange: true,
      stranded: [],
    });
  });

  it('keys the transition on before-references, not on the count (oracle controls)', () => {
    const referenced = new Map([['diff', 1]]);
    const unreferenced = new Map([['foo', 0]]);
    // The exchange: referenced before, unused after, count FLAT.
    expect(strandedByTransition(['a'], ['diff'], referenced)).toEqual(['diff']);
    // The rename: no declaration of `FOO` existed before, so no transition.
    expect(strandedByTransition(['foo'], ['FOO'], unreferenced)).toEqual([]);
    // A name unused on BOTH sides cancels in the multiset, whatever its count.
    expect(strandedByTransition(['diff'], ['diff'], referenced)).toEqual([]);
    // And the plain orphan, which both arms see.
    expect(strandedByTransition([], ['diff'], referenced)).toEqual(['diff']);
  });

  it('counts read references per name from real scope analysis', () => {
    const read = verifyCore(
      [
        "import diff from 'microdiff';",
        "import stale from 'stale';",
        'export const n = diff(diff(1, 2), 3);',
        '',
      ].join('\n'),
      controlCore,
      'control.ts',
    );
    expect(read.scopesMissing).toBe(false);
    expect(read.refCounts.get('diff')).toBe(2);
    expect(read.refCounts.get('stale')).toBe(0);
    expect(unusedNames(read.messages)).toEqual(['stale']);
  });
});

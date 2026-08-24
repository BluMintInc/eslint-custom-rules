/**
 * `eslint --fix` with the WHOLE recommended config must reach a FIXPOINT on the
 * fixture corpus.
 *
 * When it does not, ESLint stops at its ten-pass cap and writes an arbitrary
 * intermediate state to disk with `fixed: true` and no signal to the caller.
 * That is the plugin corrupting a consumer's source — the worst failure mode
 * this plugin has — and #1846 shipped for months because nothing asked the
 * question: `enforce-react-type-naming` and `global-const-style` traded one
 * identifier back and forth until `const e_LEMENT` landed in the file.
 *
 * WHAT THIS ADDS THAT THE NEIGHBOURING GUARDS DO NOT. Each of them answers a
 * different question, and none of them can see this class:
 *
 *   - `recommended-config-fix-closure.test.ts` asks "did a fix INTRODUCE a
 *     violation of another recommended rule", by fixing with ONE rule and
 *     diffing report counts, over DOCS FENCES. A count diff cannot see an
 *     oscillation: the two rules' reports are present before and after.
 *   - `fix-closure-core-rules.test.ts` asks the same introduce-a-violation
 *     question for CORE eslint rules, over hand-written fixtures.
 *   - `fixer-convergence.test.ts` asks whether ONE rule clears its own trigger.
 *     An oscillation is a property of a PAIR: each rule converges alone.
 *   - `crossrule-contradiction-closure.test.ts` (#1848) does run this exact
 *     convergence question, but only over the 137 DOCUMENTED pairs (rule A's
 *     source names rule B) and with exactly those TWO rules enabled. The corpus
 *     holds ~1,834 reporting pairs; the other ~1,700 were dismissed as
 *     fixture-domain artifacts BY JUDGMENT, never by measurement — and a
 *     three-rule cycle is invisible to a two-rule config no matter which pairs
 *     are enumerated.
 *
 * This file composes all 188 enabled rules at once over the whole corpus, so an
 * oscillation between any two (or three) of them fails the build whether or not
 * anyone documented that they interact. Oscillation needs no judgment call: a
 * fix still pending when `--fix` stops is a defect whoever the rules are.
 *
 * THE DETECTOR — `refixed.fixed`, NOT `output !== output`.
 *
 * #1846's cycle has length TWO and ESLint's cap is an EVEN ten, so re-fixing a
 * capped output runs another even number of flips and lands on IDENTICAL text.
 * `verifyAndFix(output).output !== output` is therefore FALSE for the very
 * defect this file exists to catch, and the obvious text-inequality test scores
 * it a no-op — a false clean that has already been written once. `fixed` is the
 * sound signal because `verifyAndFix`'s loop exits only when a whole pass
 * applies nothing: a re-fix that applies anything at all proves the first call
 * stopped with movement pending. `refixMovesText` is still recorded, and the
 * positive control asserts it is FALSE, so the strengthening cannot be quietly
 * undone.
 *
 * The first conjunct — a residual report that still CARRIES a fix — is equally
 * load-bearing in the other direction. `fixed: true` plus some report remaining
 * is ordinary (an unrelated unfixable report survives an unrelated fix); it
 * describes 3,768 of the 3,771 fixtures `--fix` rewrote here, and the loose test
 * calls every one of them an oscillation.
 *
 * A fix that emits UNPARSABLE text is counted on its own axis and never folded
 * into convergence: a fatal carries no `ruleId`, so a rule-keyed residual filter
 * reads corruption as silence. The corpus holds none — the one this sweep found
 * on its first run was `prefer-type-over-interface` rewriting a default-exported
 * interface into `export default type X = …`, fixed in #1850 — and
 * `KNOWN_FATAL_OUTPUTS` is the empty allowlist that keeps the next one visible.
 *
 * SCOPE, stated rather than sampled: the WHOLE corpus, all three buckets. No
 * fixture is dropped for being slow, big or awkward, and the last test below
 * prints any bucket left out with its size, so an omission cannot read as
 * coverage.
 *
 * The `invalid` bucket earns its place rather than merely fitting: it is where
 * fixers actually RUN. Adding it took the corpus 10,050 -> 17,297 but the
 * rewritten count 3,771 -> 8,194, so it more than doubles the text this gate
 * ever sees a fixer produce. The prior boundary excluded it as "written to be
 * rewritten", which is a sound reason to expect a residual REPORT and no reason
 * at all to expect a parsable one — and parsability is the axis that matters
 * here. #1850 is the proof: `prefer-type-over-interface` emitted unparsable
 * `export default type X = …`, its own suite declared no `export default` case,
 * and the fixture that caught it was a DIFFERENT rule's `output`. A violation
 * is also what a consumer's source actually holds when they reach for `--fix`,
 * which makes this bucket the closer model of that source, not the further one.
 *
 * NON-VACUITY IS PER-OWNER (#1863). `owners > 150` against 194 and `rewritten >
 * 6000` against 8,211 are global sums, so 44 rules and 2,200 rewrites can
 * disappear into them — and because they are sums, the loss concentrates in
 * whatever regressed. Both are closed per rule below: the swept set must EQUAL
 * the corpus's rule set, and every rule whose fixtures `--fix` never touched is
 * named with a measured cause that fails when it goes stale.
 *
 * RUNTIME, the deliberate call: ~190s (17,297 fixtures x 188 rules x the
 * multi-pass fix loop), kept PER-PR rather than on a schedule. The class it
 * catches is the plugin's own autofix corrupting a consumer's source, and a
 * scheduled sweep finds that after the release that shipped it — which is
 * exactly how #1846 reached agora. The one honest saving is taken and documented
 * at `classifyFixpoint`: a fixture `--fix` never touched cannot need re-linting.
 * That is 6,279 of the 10,050 second lints, measured at 131s -> 97s (-26%), and
 * it costs no coverage — the skipped lint is provably identical to one already
 * performed. Nothing else was cut; sampling the corpus was rejected outright,
 * since a partial sweep that reads as complete is worse than no sweep.
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
  FixtureBucket,
} from '../utils/fixtureCorpus';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as {
  rules: Record<string, unknown>;
  configs: { recommended: { rules: Record<string, unknown> } };
};
/* eslint-enable @typescript-eslint/no-var-requires */

const PREFIX = '@blumintinc/blumint/';

const linter = new Linter();
defineCorpusParsers(linter);
for (const [rule, name] of ruleNameByIdentity) {
  linter.defineRule(`${PREFIX}${name}`, rule as never);
}

/**
 * The config a consumer actually runs, minus anything shipped `off`: a rule the
 * consumer never runs cannot participate in an oscillation on their machine.
 */
const RECOMMENDED: Record<string, unknown> = {};
for (const [id, severity] of Object.entries(plugin.configs.recommended.rules)) {
  if (!id.startsWith(PREFIX)) continue;
  if (severity === 'off' || severity === 0) continue;
  RECOMMENDED[id] = severity;
}

/**
 * Which buckets are swept. See SCOPE above — this is the whole of the exclusion,
 * in one place, rather than a filter buried in the loop.
 */
const BUCKETS = new Set<FixtureBucket>(['valid', 'output', 'invalid']);

/**
 * Fixtures write `// eslint-disable-next-line <rule>` with a BARE name, because
 * that is what `RuleTester` registers. Under the real `@blumintinc/blumint/`
 * ids a bare directive matches nothing and the rule reports (and fixes) anyway,
 * so the snippet is probed in a state its author explicitly suppressed. It is
 * NOT solved by registering bare ids instead: that breaks every directive that
 * does name the prefixed id. Carried verbatim from the #1848 harness, where it
 * was 26 of 37 self-control failures.
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

type FixpointVerdict = 'CONVERGED' | 'NO-OP' | 'OSCILLATED' | 'FATAL';

type FixpointOutcome = {
  verdict: FixpointVerdict;
  /** `--fix` changed the text, floored so the sweep cannot be idle. */
  rewritten: boolean;
  /** `verifyAndFix` applied a fix somewhere — the LOOSE and wrong signal. */
  fixed: boolean;
  /** Whether the second lint was paid for; see the fast path below. */
  relinted: boolean;
  /** `rule:messageId` for every report the fixed output still draws. */
  residual: string[];
  /** The subset of those that still carry a FIX: the pass-cap tell. */
  pending: string[];
  /** THE signal: the fix loop had not reached a fixpoint when it stopped. */
  refixAppliesAFix: boolean;
  /** The literal "text moved again" test, kept to prove it is insufficient. */
  refixMovesText: boolean;
  /** A lint of the OUTPUT that no longer parses; reads as silence if ignored. */
  fatal: string | null;
  output: string;
};

const labelOf = (message: Linter.LintMessage) =>
  `${String(message.ruleId).slice(PREFIX.length)}:${
    message.messageId || message.message
  }`;

/**
 * The classification, in one function so the controls exercise the REAL code
 * path rather than a copy of it.
 *
 *   CONVERGED   the fixed output re-lints clean.
 *   NO-OP       reports remain but nothing pending would move the text. That is
 *               ordinary: a rule may report violations it cannot fix.
 *   OSCILLATED  a residual report still carries a fix AND re-fixing applies one,
 *               i.e. `--fix` stopped at the ten-pass cap with movement pending
 *               and what landed on disk is an arbitrary intermediate state.
 *   FATAL       the output does not parse. Counted separately and never folded
 *               into CONVERGED: a fatal carries no `ruleId`, so a residual
 *               filter keyed on rules reads corruption as silence.
 *
 * THE ONE SAVING, and why it costs no coverage: when `verifyAndFix` reports
 * `fixed: false` it applied nothing on any pass, so `output === source` and the
 * one lint it already performed IS the lint of the output. Re-linting would
 * reproduce those messages verbatim. Skipping that duplicate for the 6,279
 * untouched fixtures took the sweep from 131s to 97s; the other 3,771 take the
 * full two-lint path, so the re-lint arm stays exercised on thousands of real
 * fixtures (floored below) rather than by the controls alone. This rests on the
 * documented meaning of `fixed`, not on `verifyAndFix` internals, and the
 * contract test below pins it so an ESLint upgrade cannot make it silently
 * blind.
 */
function classifyFixpoint(
  source: string,
  filename: string,
  config: unknown,
): FixpointOutcome {
  const first = linter.verifyAndFix(source, config as never, filename);
  const rewritten = first.output !== source;
  const relinted = first.fixed;
  const after = relinted
    ? linter.verify(first.output, config as never, filename)
    : first.messages;

  const fatal = after.find((message) => message.fatal);
  const reported = after.filter((message) => message.ruleId);
  const pendingMessages = reported.filter((message) => message.fix);

  // Paid for only when a fix is STILL pending after the loop stopped, which is
  // the cap signature and no corpus fixture's today, so the sweep never pays it.
  let refixAppliesAFix = false;
  let refixMovesText = false;
  if (pendingMessages.length) {
    const refixed = linter.verifyAndFix(
      first.output,
      config as never,
      filename,
    );
    refixAppliesAFix = refixed.fixed;
    refixMovesText = refixed.output !== first.output;
  }

  const verdict: FixpointVerdict = fatal
    ? 'FATAL'
    : refixAppliesAFix
    ? 'OSCILLATED'
    : reported.length
    ? 'NO-OP'
    : 'CONVERGED';

  return {
    verdict,
    rewritten,
    fixed: first.fixed,
    relinted,
    residual: [...new Set(reported.map(labelOf))].sort(),
    pending: [...new Set(pendingMessages.map(labelOf))].sort(),
    refixAppliesAFix,
    refixMovesText,
    fatal: fatal ? fatal.message : null,
    output: first.output,
  };
}

type Finding = {
  owner: string;
  origin: string;
  bucket: FixtureBucket;
  filename: string;
  outcome: FixpointOutcome;
  before: string;
};

const corpus = harvestFixtureCorpus();

const stats = {
  considered: 0,
  probed: 0,
  rewritten: 0,
  relinted: 0,
  residualReported: 0,
  pendingAfterFix: 0,
  /** `fixed: true` with something still reporting — what the LOOSE test flags. */
  looseOscillations: 0,
  owners: new Set<string>(),
  threw: [] as string[],
};

const oscillating: Finding[] = [];
const fatals: Finding[] = [];

/**
 * The sweep's counters, per owner.
 *
 * The aggregates below answer "did the sweep do some work"; only these answer
 * "did it do work for THIS rule". A floor of 150 owners against 194, and of
 * 6,000 rewrites against 8,211, is exactly how much coverage can vanish before
 * anyone hears — and because both are global sums, the loss concentrates in
 * whatever regressed (#1863).
 */
const perOwner = new Map<
  string,
  { probed: number; rewritten: number; relinted: number }
>();

for (const [owner, cases] of corpus.byRule) {
  for (const testCase of cases) {
    if (!BUCKETS.has(testCase.bucket)) continue;
    stats.considered++;
    const filename = defaultFilenameFor(testCase);
    const before = prefixDirectives(testCase.code);
    // The owner's own entry carries the OPTIONS its author wrote; without them
    // the fixture is probed under a configuration nobody declared (#1732).
    const config = {
      // The fixture's own parser. A JSON or Markdown fixture read as TypeScript
      // is a fatal that this sweep would record as `--fix` corrupting a file,
      // when nothing had been fixed at all (#1860).
      parser: parserKeyFor(testCase),
      parserOptions: parserOptionsFor(testCase),
      rules: {
        ...RECOMMENDED,
        [`${PREFIX}${owner}`]: severityWithOptions(testCase),
      },
    };

    let outcome: FixpointOutcome;
    try {
      outcome = classifyFixpoint(before, filename, config);
    } catch (error) {
      // A throw is a broken probe, not a verdict, so it is never counted as
      // convergence.
      stats.threw.push(
        `${owner} <- ${testCase.origin} [${filename}]: ${
          (error as Error)?.message
        }`,
      );
      continue;
    }

    stats.probed++;
    stats.owners.add(owner);
    const row = perOwner.get(owner) || {
      probed: 0,
      rewritten: 0,
      relinted: 0,
    };
    row.probed++;
    if (outcome.rewritten) row.rewritten++;
    if (outcome.relinted) row.relinted++;
    perOwner.set(owner, row);
    if (outcome.rewritten) stats.rewritten++;
    if (outcome.relinted) stats.relinted++;
    if (outcome.residual.length) stats.residualReported++;
    if (outcome.pending.length) stats.pendingAfterFix++;
    if (outcome.fixed && outcome.residual.length) stats.looseOscillations++;

    const finding: Finding = {
      owner,
      origin: testCase.origin,
      bucket: testCase.bucket,
      filename,
      outcome,
      before,
    };
    if (outcome.verdict === 'OSCILLATED') oscillating.push(finding);
    if (outcome.verdict === 'FATAL') fatals.push(finding);
  }
}

const snippet = (code: string) =>
  code.length > 300 ? `${code.slice(0, 300)}...` : code;

const describeFinding = (finding: Finding) =>
  [
    `  ${finding.owner} <- ${finding.origin} [${finding.bucket}, ${finding.filename}]`,
    `    pending: ${finding.outcome.pending.join(', ') || '(none)'}`,
    `    before:  ${JSON.stringify(snippet(finding.before))}`,
    `    after:   ${JSON.stringify(snippet(finding.outcome.output))}`,
  ].join('\n');

type KnownFatal = {
  reason: string;
  /**
   * Whether `--fix` CAUSED the fatal (as opposed to a fixture that arrived
   * unparsable). Asserted against the measurement, so an entry cannot quietly
   * describe the harmless case while the fixer starts corrupting files.
   */
  causedByFix: boolean;
};

/**
 * Fixtures whose FIXED output no longer parses, keyed `owner <- origin`.
 *
 * SHIPS EMPTY, and an entry is not a way to make a build green. Each would
 * record a fixture whose lint-after-fix is fatal, with the issue that owns it. A
 * `causedByFix` entry is live source corruption: it belongs here only so the
 * sweep's OTHER findings stay visible while the cited issue is drained, never as
 * an acceptance. The sole entry this sweep ever carried — `prefer-type-over-
 * interface` rewriting `export default interface Opts {…}` into the unparsable
 * `export default type Opts = {…}` — was deleted when #1850 made that rule
 * decline the fix, which is the intended lifetime of an entry.
 *
 * Asserted exactly, in three directions: a new fatal fails, an entry whose
 * fixture stopped going fatal fails (a dead exemption is what masks the next
 * regression, #1839), and a `causedByFix` flag that no longer matches the
 * measurement fails.
 */
const KNOWN_FATAL_OUTPUTS: Record<string, KnownFatal> = {};

/**
 * Why an owner's fixtures could never have exercised the fix loop, read off the
 * counters rather than asserted by hand.
 */
const UNREWRITTEN_CAUSES = {
  noCorpus:
    'the harvest holds no fixture for it, so nothing of its was ever fixed',
  everyProbeThrew:
    'every probe of its fixtures threw instead of producing a verdict, so no fix pass completed',
  noEnabledRuleFixesIt:
    'no rule in the recommended config emits a fix on any of its fixtures, so `--fix` leaves every one byte-identical and convergence is trivially true',
} as const;
type UnrewrittenCause = keyof typeof UNREWRITTEN_CAUSES;

const unrewrittenCauseOf = (owner: string): UnrewrittenCause | null => {
  const row = perOwner.get(owner);
  if (!corpus.byRule.has(owner)) return 'noCorpus';
  if (!row || row.probed === 0) return 'everyProbeThrew';
  return row.rewritten === 0 ? 'noEnabledRuleFixesIt' : null;
};

const measuredUnrewritten: Record<string, UnrewrittenCause> =
  Object.fromEntries(
    [...corpus.byRule.keys()]
      .sort()
      .map((owner) => [owner, unrewrittenCauseOf(owner)] as const)
      .filter(
        (entry): entry is readonly [string, UnrewrittenCause] => !!entry[1],
      ),
  );

/**
 * Owners whose fixtures the composed `--fix` never rewrote, each with the
 * measured cause.
 *
 * A fixture `--fix` never touches converges trivially, so an owner appearing
 * here contributes nothing to the question this file asks — its 45 fixtures are
 * swept and answer "converged" without a fixer ever having run. That is
 * legitimate for a rule that declares no fixer and whose fixtures happen to trip
 * no other enabled rule's, and it is a defect for anything else, which is why
 * the row below additionally asserts that every entry names a rule with neither
 * `meta.fixable` nor `meta.hasSuggestions`. A fixable rule landing here would be
 * #1871's shape — a declared fix channel that its own corpus never exercises —
 * and must not be absorbed by an exemption written for inert rules.
 */
const UNREWRITTEN_OWNERS: Record<string, UnrewrittenCause> = {
  'array-methods-this-context': 'noEnabledRuleFixesIt',
  'enforce-f-extension-for-entry-points': 'noEnabledRuleFixesIt',
  'enforce-firestore-path-utils': 'noEnabledRuleFixesIt',
  'enforce-realtimedb-path-utils': 'noEnabledRuleFixesIt',
  'no-async-array-filter': 'noEnabledRuleFixesIt',
  'no-async-foreach': 'noEnabledRuleFixesIt',
  'no-filter-without-return': 'noEnabledRuleFixesIt',
  'no-memoize-on-static': 'noEnabledRuleFixesIt',
  'no-misused-switch-case': 'noEnabledRuleFixesIt',
  'no-separate-loading-state': 'noEnabledRuleFixesIt',
  'no-try-catch-already-exists-in-transaction': 'noEnabledRuleFixesIt',
  'prefer-use-theme': 'noEnabledRuleFixesIt',
  'require-https-error': 'noEnabledRuleFixesIt',
};

const rewritingMeta = (owner: string) => {
  const meta = (
    plugin.rules[owner] as {
      meta?: { fixable?: unknown; hasSuggestions?: unknown };
    }
  )?.meta;
  return Boolean(meta?.fixable || meta?.hasSuggestions);
};

describe("the recommended config's --fix reaches a fixpoint", () => {
  it('leaves no fixture with a fix still pending when --fix stops', () => {
    if (oscillating.length) {
      const byPending = new Map<string, number>();
      for (const finding of oscillating) {
        for (const entry of finding.outcome.pending) {
          byPending.set(entry, (byPending.get(entry) || 0) + 1);
        }
      }
      throw new Error(
        [
          `${oscillating.length} fixture(s) do not reach a fixpoint under the`,
          'recommended config. ESLint stopped at its ten-pass cap with a fix',
          'still pending, so the text below is an arbitrary intermediate state',
          "that `--fix` would write to a consumer's file.",
          '',
          'pending fixes, by rule:messageId:',
          ...[...byPending]
            .sort((a, b) => b[1] - a[1])
            .map(([entry, count]) => `  ${String(count).padStart(4)} ${entry}`),
          '',
          ...oscillating.slice(0, 10).map(describeFinding),
        ].join('\n'),
      );
    }
    // Exactly zero, never a threshold: "the autofix converges" does not decay as
    // rules are added, whereas a tuned number would.
    expect(oscillating).toEqual([]);
  });

  it('accounts for every fixture whose fixed output no longer parses', () => {
    const seen = new Map<string, Finding>();
    for (const finding of fatals) {
      seen.set(`${finding.owner} <- ${finding.origin}`, finding);
    }
    const unexplained = [...seen]
      .filter(([key]) => !(key in KNOWN_FATAL_OUTPUTS))
      .map(
        ([key, finding]) =>
          `${key} [${finding.bucket}, ${finding.filename}] rewritten=${finding.outcome.rewritten}: ${finding.outcome.fatal}`,
      );
    // A fatal carries no `ruleId`, so a rule-keyed residual filter reads it as
    // silence: a fix that starts emitting unparsable text would otherwise hide
    // here as CONVERGED.
    expect(unexplained).toEqual([]);
    // And the other direction: an entry whose fixture no longer goes fatal is a
    // dead exemption and must be deleted, not left to mask the next one.
    expect(
      Object.keys(KNOWN_FATAL_OUTPUTS).filter((key) => !seen.has(key)),
    ).toEqual([]);
    // Third direction: WHICH of the two kinds each one is. A fixture that merely
    // arrived unparsable is inert; a fixture `--fix` broke is live corruption,
    // and the flag flipping either way means the entry's reason no longer
    // describes what is happening.
    expect(
      Object.fromEntries(
        [...seen].map(([key, finding]) => [key, finding.outcome.rewritten]),
      ),
    ).toEqual(
      Object.fromEntries(
        Object.entries(KNOWN_FATAL_OUTPUTS).map(([key, known]) => [
          key,
          known.causedByFix,
        ]),
      ),
    );
  });

  // The allowlist above silences a LIVE corruption finding, so growing it is
  // meant to cost a second, deliberate edit rather than happen quietly. Pinning
  // the empty state is what makes that cost real; with the map empty, the two
  // staleness directions asserted above have nothing to bite on.
  it('ships with an empty allowlist, so every fatal output is a failure', () => {
    expect(Object.keys(KNOWN_FATAL_OUTPUTS)).toEqual([]);
  });

  it('never let a probe throw instead of producing a verdict', () => {
    expect(stats.threw).toEqual([]);
  });

  /**
   * The rule dimension, closed rather than floored. Every rule with a corpus
   * must have been swept, and every rule whose fixtures the fix pass never
   * touched must be named with its cause — otherwise a rule going dark is
   * indistinguishable from a rule whose fixtures all converge.
   */
  it('sweeps every rule that has a corpus', () => {
    expect([...stats.owners].sort()).toEqual([...corpus.byRule.keys()].sort());
  });

  it('accounts for every owner the fix pass never rewrote', () => {
    expect(measuredUnrewritten).toEqual(UNREWRITTEN_OWNERS);
    expect(
      Object.values(UNREWRITTEN_OWNERS).filter(
        (cause) => !UNREWRITTEN_CAUSES[cause],
      ),
    ).toEqual([]);
    // A rule that CAN rewrite and never did is #1871's shape, not an inert
    // rule, and must not retire into a list written for inert ones.
    expect(Object.keys(UNREWRITTEN_OWNERS).filter(rewritingMeta)).toEqual([]);
    // An entry naming a rule with no corpus is an exemption nothing can retire.
    expect(
      Object.keys(UNREWRITTEN_OWNERS).filter(
        (owner) => !corpus.byRule.has(owner),
      ),
    ).toEqual([]);
  });

  /**
   * Per rule, as its own row: a green row over a rule whose fixtures `--fix`
   * never touched names the rule in the jest output and reads as evidence it
   * was checked (#1861).
   */
  it.each(
    [...corpus.byRule.keys()]
      .sort()
      .filter((owner) => !(owner in UNREWRITTEN_OWNERS)),
  )('drove the fix loop over %s', (owner) => {
    expect(perOwner.get(owner)?.rewritten || 0).toBeGreaterThan(0);
  });

  it('actually fixed the corpus it swept (non-vacuity)', () => {
    // eslint-disable-next-line no-console
    console.log(
      `[fixpoint] considered=${stats.considered} probed=${stats.probed} ` +
        `rewritten=${stats.rewritten} relinted=${stats.relinted} ` +
        `residual=${stats.residualReported} pendingAfterFix=${stats.pendingAfterFix} ` +
        `fatalAfter=${fatals.length} nonConvergent=${oscillating.length} ` +
        `owners=${stats.owners.size} ` +
        `(${stats.looseOscillations} would fail the loose test)`,
    );

    // Measured 17,297 probed / 8,194 rewritten at 1.20.132. Each floor is
    // separate because each fails differently: a probe count with nothing
    // rewritten means the fix pass never ran (the parser, filename or options
    // plumbing lost), and a corpus that reaches few owners says nothing about
    // the rest of the config however many snippets it holds.
    expect(stats.probed).toBeGreaterThan(12000);
    expect(stats.rewritten).toBeGreaterThan(6000);
    expect(stats.owners.size).toBeGreaterThan(150);
    expect(corpus.failures).toEqual([]);
    // The skipped-re-lint fast path must not have swallowed the slow path: the
    // full two-lint treatment has to still run on thousands of real fixtures.
    expect(stats.relinted).toBeGreaterThan(1000);
    // The sharpening is live on REAL fixtures, not only in the controls: the
    // loose "`fixed: true` and something still reports" test fires on 3,768 of
    // these, every one ordinary. If this reaches zero the two tests have stopped
    // differing here and the sharp one is unexercised.
    expect(stats.looseOscillations).toBeGreaterThan(1000);
  });

  it('catches two fixers that never reach a fixpoint (positive control)', () => {
    // The corpus cannot exercise the OSCILLATED branch — it is zero by design
    // and #1846's own input is fixed — so the branch is proved on a plant driven
    // through the SAME `classifyFixpoint` the sweep uses.
    const renamer = (from: string, to: string): Rule.RuleModule => ({
      meta: {
        type: 'problem',
        schema: [],
        fixable: 'code',
        messages: { rename: `rename ${from}` },
      },
      create: (context) => ({
        Identifier(node) {
          if ((node as { name?: string }).name !== from) return;
          context.report({
            node,
            messageId: 'rename',
            fix: (fixer) => fixer.replaceText(node, to),
          });
        },
      }),
    });
    const configFor = (ids: string[]) => ({
      parser: 'ts',
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: Object.fromEntries(ids.map((id) => [id, 'error'])),
    });

    // TWO-CYCLE — #1846's exact shape, `a` -> `b` -> `a`. ESLint's cap is an
    // EVEN ten passes, so the text lands back where it started: asserting
    // `refixMovesText: false` here is the point of the control, because the
    // obvious text-inequality detector is blind to the very defect that
    // motivated this file.
    const UP = `${PREFIX}control-fixpoint-up`;
    const DOWN = `${PREFIX}control-fixpoint-down`;
    linter.defineRule(UP, renamer('oscillate', 'OSCILLATE'));
    linter.defineRule(DOWN, renamer('OSCILLATE', 'oscillate'));
    const twoCycle = classifyFixpoint(
      'const oscillate = 1;\n',
      'file.ts',
      configFor([UP, DOWN]),
    );
    expect({
      verdict: twoCycle.verdict,
      output: twoCycle.output,
      refixMovesText: twoCycle.refixMovesText,
      refixAppliesAFix: twoCycle.refixAppliesAFix,
    }).toEqual({
      verdict: 'OSCILLATED',
      output: 'const oscillate = 1;\n',
      refixMovesText: false,
      refixAppliesAFix: true,
    });

    // THREE-CYCLE (`a` -> `b` -> `c` -> `a`), where ten passes do NOT return to
    // the start. Kept so the detector is shown to catch a cycle of either
    // parity, since only the even one hides from the text test.
    const FORWARD = `${PREFIX}control-fixpoint-forward`;
    const BACKWARD = `${PREFIX}control-fixpoint-backward`;
    linter.defineRule(FORWARD, {
      meta: {
        type: 'problem',
        schema: [],
        fixable: 'code',
        messages: { rename: 'rename' },
      },
      create: (context) => ({
        Identifier(node) {
          const name = (node as { name?: string }).name;
          const next = name === 'aaa' ? 'bbb' : name === 'ccc' ? 'aaa' : null;
          if (!next) return;
          context.report({
            node,
            messageId: 'rename',
            fix: (fixer) => fixer.replaceText(node, next),
          });
        },
      }),
    });
    linter.defineRule(BACKWARD, renamer('bbb', 'ccc'));
    const threeCycle = classifyFixpoint(
      'const aaa = 1;\n',
      'file.ts',
      configFor([FORWARD, BACKWARD]),
    );
    expect({
      verdict: threeCycle.verdict,
      refixMovesText: threeCycle.refixMovesText,
      refixAppliesAFix: threeCycle.refixAppliesAFix,
    }).toEqual({
      verdict: 'OSCILLATED',
      refixMovesText: true,
      refixAppliesAFix: true,
    });
  });

  it('calls an unfixable residual a NO-OP, not an oscillation (negative control)', () => {
    // The sharpness half. A fixture where `--fix` DID rewrite something while an
    // unrelated, unfixable report remains is ordinary — 3,768 corpus fixtures
    // are exactly this — and the loose test calls every one an oscillation.
    const FIXES = `${PREFIX}control-fixpoint-fixes-once`;
    const UNFIXABLE = `${PREFIX}control-fixpoint-unfixable`;
    const QUIET = `${PREFIX}control-fixpoint-quiet`;
    linter.defineRule(FIXES, {
      meta: {
        type: 'problem',
        schema: [],
        fixable: 'code',
        messages: { rename: 'rename' },
      },
      create: (context) => ({
        Identifier(node) {
          if ((node as { name?: string }).name !== 'stale') return;
          context.report({
            node,
            messageId: 'rename',
            fix: (fixer) => fixer.replaceText(node, 'fresh'),
          });
        },
      }),
    });
    linter.defineRule(UNFIXABLE, {
      meta: { type: 'problem', schema: [], messages: { saw: 'hand-edit me' } },
      create: (context) => ({
        VariableDeclaration(node) {
          context.report({ node, messageId: 'saw' });
        },
      }),
    });
    linter.defineRule(QUIET, {
      meta: { type: 'problem', schema: [], messages: { saw: 'saw a class' } },
      create: (context) => ({
        ClassDeclaration(node) {
          context.report({ node, messageId: 'saw' });
        },
      }),
    });
    const configFor = (ids: string[]) => ({
      parser: 'ts',
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: Object.fromEntries(ids.map((id) => [id, 'error'])),
    });

    const noop = classifyFixpoint(
      'const stale = 1;\n',
      'file.ts',
      configFor([FIXES, UNFIXABLE]),
    );
    expect({
      verdict: noop.verdict,
      rewritten: noop.rewritten,
      // What the LOOSE test sees, spelled out: a fix applied and something
      // still reports. Sharpness is these two expectations disagreeing.
      looseWouldFail: noop.fixed && noop.residual.length > 0,
    }).toEqual({ verdict: 'NO-OP', rewritten: true, looseWouldFail: true });

    // And the classifier can still say CONVERGED, so NO-OP is a finding about
    // the input rather than the only answer it knows.
    const converged = classifyFixpoint(
      'const stale = 1;\n',
      'file.ts',
      configFor([FIXES, QUIET]),
    );
    expect({ verdict: converged.verdict, output: converged.output }).toEqual({
      verdict: 'CONVERGED',
      output: 'const fresh = 1;\n',
    });

    // A fixer that emits unparsable text is FATAL, never CONVERGED — the arm
    // the corpus's own fatals must be distinguishable from.
    const BREAKS = `${PREFIX}control-fixpoint-breaks-syntax`;
    linter.defineRule(BREAKS, {
      meta: {
        type: 'problem',
        schema: [],
        fixable: 'code',
        messages: { broke: 'break it' },
      },
      create: (context) => ({
        Identifier(node) {
          if ((node as { name?: string }).name !== 'stale') return;
          context.report({
            node,
            messageId: 'broke',
            fix: (fixer) => fixer.replaceText(node, '('),
          });
        },
      }),
    });
    const broken = classifyFixpoint(
      'const stale = 1;\n',
      'file.ts',
      configFor([BREAKS]),
    );
    expect({ verdict: broken.verdict, rewritten: broken.rewritten }).toEqual({
      verdict: 'FATAL',
      rewritten: true,
    });
  });

  it('pins the verifyAndFix contract the skipped re-lint depends on', () => {
    // The fast path skips the second lint when `fixed` is false. That is only
    // sound while `fixed: false` means "no pass applied anything", so the output
    // is the input and the messages already in hand are the output's messages.
    // An ESLint upgrade that changed either would make the sweep silently
    // blinder; this fails loudly instead.
    const IDLE = `${PREFIX}control-fixpoint-idle`;
    linter.defineRule(IDLE, {
      meta: { type: 'problem', schema: [], messages: { saw: 'hand-edit me' } },
      create: (context) => ({
        VariableDeclaration(node) {
          context.report({ node, messageId: 'saw' });
        },
      }),
    });
    const config = {
      parser: 'ts',
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: { [IDLE]: 'error' },
    } as never;

    const source = 'const untouched = 1;\n';
    const result = linter.verifyAndFix(source, config, 'file.ts');
    const relinted = linter.verify(result.output, config, 'file.ts');
    expect({
      fixed: result.fixed,
      outputUnchanged: result.output === source,
      messagesMatchRelint: result.messages.map(labelOf).join('|'),
      relintLabels: relinted.map(labelOf).join('|'),
      anyCarriesAFix: result.messages.some((message) => message.fix),
    }).toEqual({
      fixed: false,
      outputUnchanged: true,
      messagesMatchRelint: `${IDLE.slice(PREFIX.length)}:saw`,
      relintLabels: `${IDLE.slice(PREFIX.length)}:saw`,
      anyCarriesAFix: false,
    });
  });

  it('swept the buckets it claims to and no others', () => {
    // Nothing is outside `BUCKETS`, but anything that ever falls outside is
    // named here with its size, so nobody has to read the loop to learn what is
    // not covered.
    const byBucket = new Map<FixtureBucket, number>();
    for (const cases of corpus.byRule.values()) {
      for (const testCase of cases) {
        byBucket.set(testCase.bucket, (byBucket.get(testCase.bucket) || 0) + 1);
      }
    }
    const swept = [...byBucket]
      .filter(([bucket]) => BUCKETS.has(bucket))
      .reduce((total, [, count]) => total + count, 0);
    const skipped = [...byBucket]
      .filter(([bucket]) => !BUCKETS.has(bucket))
      .map(([bucket, count]) => `${bucket}=${count}`)
      .sort();

    // eslint-disable-next-line no-console
    console.log(
      `[fixpoint] swept ${swept} fixture(s) of bucket(s) ` +
        `${[...BUCKETS].sort().join(', ')}; NOT swept: ${
          skipped.join(', ') || '(nothing)'
        }`,
    );

    // Every fixture inside the boundary is probed, or a "complete sweep" is a
    // partial one wearing its name.
    expect(stats.considered).toBe(swept);
    expect(stats.probed).toBe(swept);
    expect(skipped).toEqual([]);

    // An empty `skipped` is also what a bucket VANISHING from the harvest looks
    // like, so name each one and floor it. Without this the strongest assertion
    // in the file is the one most easily satisfied by a broken corpus.
    expect([...byBucket.keys()].sort()).toEqual(['invalid', 'output', 'valid']);
    expect(byBucket.get('valid')).toBeGreaterThan(5000);
    expect(byBucket.get('invalid')).toBeGreaterThan(5000);
    expect(byBucket.get('output')).toBeGreaterThan(1000);
  });
});

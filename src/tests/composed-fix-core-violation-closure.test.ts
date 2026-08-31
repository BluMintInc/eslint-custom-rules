/**
 * The COMPOSED `--fix` must not introduce a CORE eslint violation.
 *
 * `fix-core-violation-closure.test.ts` asks this question with this instrument
 * over this corpus, and its own SCOPE paragraph states the residue verbatim:
 * "Attribution is SOLO, so damage that only appears when two fixers compose
 * belongs to neither rule and is not reported." That residue is what this file
 * sweeps. Because the solo sweep is GREEN, every rise measured here is
 * composition-only by construction — and it is not left at that: each finding is
 * re-attributed by ABLATION below, so "no single rule reproduces it" is a
 * measurement rather than an inference.
 *
 * WHAT THIS ADDS THAT THE NEIGHBOURING GUARDS DO NOT.
 *
 *   - `fix-core-violation-closure.test.ts` fixes with ONE rule at a time. A pair
 *     that only corrupts together is invisible to it, whichever rule you blame.
 *   - `fix-orphan-binding-closure.test.ts` owns `no-unused-vars` over this same
 *     corpus, also SOLO. That rule is carried here as a fifth core oracle
 *     precisely because under composition it had never been run at all.
 *   - `fix-fixpoint-closure.test.ts` composes the whole config over this corpus
 *     and already holds the composed output in hand — but only asks whether the
 *     fix loop CONVERGED. A duplicated object key, dead code after a `return`
 *     and an orphaned import all converge perfectly.
 *   - `recommended-config-fix-closure.test.ts` composes too, but drops every
 *     message whose `ruleId` is not `@blumintinc/blumint/*` — a core violation
 *     is discarded before it is counted — and its corpus is docs fences.
 *   - `crossrule-contradiction-closure.test.ts` composes exactly TWO rules, and
 *     only the ~177 pairs one rule's source names. A three-rule interaction is
 *     invisible to it however the pairs are enumerated.
 *   - `exemption-composition-closure.test.ts` composes the whole config but asks
 *     whether a rule's own EXEMPTION was destroyed, i.e. it reads
 *     `@blumintinc/blumint` reports, never core ones.
 *
 * THE RESTRICTED-PRODUCTION ARM IS A NARROWING, NOT A NEW CHANNEL. Say so
 * plainly: `restricted-production-closure.test.ts` already has a
 * `FULL_CONFIG_FIX` channel over this corpus. It differs from this one in three
 * measured ways, each of which changes what the fix pass does, so the two are
 * not redundant: it enables EVERY plugin rule at a flat `'error'` (not the
 * shipped recommended severities, and not the rules shipped `off`), the owner's
 * declared OPTIONS therefore never reach its fix pass (#1732 — options that miss
 * the fix pass faked 3 of 15 findings in an earlier probe), and it does not
 * prefix the corpus's bare `eslint-disable` directives, so a snippet is fixed in
 * a state its author suppressed. This arm runs the same shipped checker under
 * the config a consumer actually has.
 *
 * METHOD, per harvested fixture:
 *
 *   1. Lint the INPUT with the core oracle and record a per-rule message COUNT.
 *   2. `--fix` with the FULL recommended config, exactly as `fix-fixpoint-
 *      closure` builds it (shipped severities, `off` skipped, owner's options).
 *   3. Lint the composed OUTPUT with the same oracle and re-count.
 *   4. A FINDING is a core rule whose count ROSE, or a restricted-production
 *      breach count that rose.
 *
 * Gating on a count RISE rather than on message text is copied from
 * `fix-core-violation-closure` and is what makes this immune to a fixer that
 * renames or moves the identifier a message quotes (2,294 phantom findings in
 * #1652's first cut, 1,593 for `global-const-style` alone), while still letting
 * a fixture carry its own pre-existing violations without absorbing a new one.
 *
 * ATTRIBUTION IS MEASURED, per finding, by ablation over the composed config:
 * every rule reporting on the input or on the output is re-fixed ALONE, then the
 * candidate set is minimised greedily. A finding a single rule reproduces is
 * NOT a composition finding — it would be a `fix-core-violation-closure`
 * baseline question — and is recorded as such rather than reported here.
 *
 * SCOPE — what this does NOT see, written as a to-do for the next reader:
 *
 *   - `no-entire-object-hook-deps` used to be held OUT of the composed config by
 *     name, which left every composition it participates in unswept. A
 *     program-backed replication of this oracle over the whole corpus settled
 *     what that hid: the rule fires on 264 fixtures, 159 of them owned by other
 *     suites, and exactly one oracle rose — a stranded binding that ablation
 *     attributed to the rule ALONE and that reproduced in the typed and
 *     isolated arms alike (#2210). The exclusion is gone and the rule is
 *     composed here like any other; the #1621 reporting divergence it cited is
 *     untouched and simply is not what this guard asks about.
 *   - The oracle is five core rules plus two restricted productions. Everything
 *     else core is unswept — `no-undef` deliberately (with no `env` every
 *     ambient global reads as undefined, an artefact), the rest simply because
 *     nobody has measured them. Adding one is a one-line change and a re-run.
 *   - A count gate cannot see a NET-ZERO exchange: a composed fix that
 *     introduces one violation while removing another is silent to it. For the
 *     four non-`no-unused-vars` oracles that remains the deliberate direction to
 *     err — a pass that leaves the count flat has not made a consumer's build
 *     worse. For `no-unused-vars` it no longer is: #2231 gave
 *     `fix-orphan-binding-closure` a second arm keyed on a per-binding reference
 *     TRANSITION, because the count gate is structurally unable to reach the
 *     exchange shape, and that guard defers composed orphans HERE as fixer
 *     interaction it cannot attribute solo. So this file carries the transition
 *     arm too. Measured over the whole corpus: 11,781 rewrites, 2,171 rows where
 *     the unused multiset moved without the count rising — the population the
 *     count arm drops — and ZERO of them strand a previously-referenced binding.
 *     The arm is a regression detector driven by 2,147 candidate rows, not a
 *     vacuous one: the shape it watches for ships (#2228).
 *   - JSON and Markdown fixtures are excluded: these instruments are
 *     JavaScript/TypeScript ones and measure nothing through the other parsers.
 *     `no-unpinned-dependencies` and `enforce-typescript-markdown-code-blocks`
 *     are `error`-severity and `fixable`, so a core-equivalent oracle for their
 *     languages is an open to-do.
 *   - Attribution names a MINIMAL culprit set, not the only one. A different
 *     minimisation order can name a different equally-minimal set, and a rule
 *     that reports only on an intermediate pass state (absent from both the
 *     input's and the output's report sets) falls out of the candidate set — the
 *     ablation then falls back to the whole config, so the finding still stands
 *     but its naming is coarser.
 *   - `--fix` never applies a SUGGESTION, so every transform a suggestion-only
 *     rule offers is outside this sweep (#1733).
 *   - Cross-FILE type resolution is absent under a bare `Linter`, so a rule
 *     whose fix depends on an imported symbol's real type composes here on an
 *     `any`. That changes an answer rather than withholding one.
 *   - The corpus is minimal adversarial fixtures, not real files. A composition
 *     that needs two violations far apart in a large file is not represented.
 */
import fs from 'fs';
import path from 'path';
import { Linter, Rule, Scope } from 'eslint';
import {
  harvestFixtureCorpus,
  defaultFilenameFor,
  defineCorpusParsers,
  parserKeyFor,
  parserOptionsFor,
  ruleNameByIdentity,
  silentWithoutProgramRuleNames,
  FixtureBucket,
  FixtureCase,
} from '../utils/fixtureCorpus';
import { restrictedProductionBreaches } from '../utils/restrictedProductions';
import {
  PLUGIN_PREFIX as PREFIX,
  composedRulesFor as composedRulesWith,
  recommendedRulesExcluding,
  subsetInConfigOrder,
} from '../utils/composedFixConfig';

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

const EXCLUDED = new Set([
  ...silentWithoutProgramRuleNames,
  ...DIVERGENT_WITHOUT_PROGRAM,
]);

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
 * The transition arm below needs the reference count of every binding, and
 * `no-unused-vars` cannot supply it: the rule reports the bindings that have NO
 * reference and says nothing about the rest, so a name absent from its output
 * could have one reference or fifty. Scope analysis is the only source.
 *
 * Captured off the core verify this file already performs rather than bought
 * with a second one, exactly as `fix-orphan-binding-closure` does.
 */
let capturedScopes: Scope.Scope[] | null = null;

const SCOPE_PROBE = 'probe/capture-scopes';

linter.defineRule(SCOPE_PROBE, {
  meta: { schema: [], type: 'problem', messages: {} },
  create(context) {
    return {
      'Program:exit'() {
        capturedScopes = context.getSourceCode().scopeManager?.scopes ?? [];
      },
    };
  },
} as Rule.RuleModule);

/**
 * `no-undef` is deliberately absent: with no `env` every ambient global reads as
 * undefined, an artefact rather than a finding. `no-unused-vars` carries the
 * options `fix-orphan-binding-closure` calibrated for it — an unnamed parameter
 * and a rest-sibling omission are idioms, not orphans.
 */
const CORE_RULES: Record<string, unknown> = {
  'no-dupe-keys': 'error',
  'no-unreachable': 'error',
  'no-const-assign': 'error',
  'no-self-assign': 'error',
  'no-unused-vars': ['error', { args: 'none', ignoreRestSiblings: true }],
};

/**
 * The structural oracle, reported as though it were a sixth core rule so one
 * count-rise gate covers both. It is not an eslint rule: `@typescript-eslint/
 * parser` ACCEPTS a line terminator between an arrow's signature and its `=>`,
 * and after `throw`, so no lint-based or parse-based instrument can see the
 * breach — only this shipped, calibrated checker can (#1964, #1969).
 */
const RESTRICTED = 'restricted-production';

/**
 * The config a consumer actually runs, minus anything shipped `off`: a rule the
 * consumer never runs cannot participate in a composition on their machine.
 */
const RECOMMENDED = recommendedRulesExcluding(EXCLUDED);

const BUCKETS = new Set<FixtureBucket>(['valid', 'output', 'invalid']);

/**
 * Fixtures write `// eslint-disable-next-line <rule>` with a BARE name, because
 * that is what `RuleTester` registers. Under the real prefixed ids a bare
 * directive matches nothing and the rule fixes anyway, so the snippet would be
 * probed in a state its author explicitly suppressed. Carried verbatim from the
 * #1848 harness, where it was 26 of 37 self-control failures.
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
    // Filtered by `ruleId` FIRST: a rule-not-found error reads as both silence
    // and inflation if it reaches the counter.
    if (!message.ruleId || !(message.ruleId in CORE_RULES)) continue;
    counts.set(message.ruleId, (counts.get(message.ruleId) || 0) + 1);
  }
  return counts;
};

/**
 * The oracles whose count ROSE across the composed fix.
 *
 * Counting rather than diffing message text is what keeps this rename-immune: a
 * fixer that rewrites the identifier a message quotes changes the text without
 * changing how many violations exist. It also lets a fixture carry its own
 * pre-existing violations — only the increment is this guard's business.
 */
export const risenOracles = (
  before: Linter.LintMessage[],
  after: Linter.LintMessage[],
  /** Breach counts; `null` where the checker could not parse that side. */
  breachesBefore: number | null,
  breachesAfter: number | null,
) => {
  const start = countByRule(before);
  const end = countByRule(after);
  const risen = [...end.entries()]
    .filter(([id, count]) => count > (start.get(id) || 0))
    .map(([id]) => id);
  if (
    breachesBefore !== null &&
    breachesAfter !== null &&
    breachesAfter > breachesBefore
  ) {
    risen.push(RESTRICTED);
  }
  return risen.sort();
};

/**
 * The NAME each `no-unused-vars` message quotes.
 *
 * Read off the message rather than off the AST because the rule already decides
 * what counts as unused under this file's options, and it reports the LOCAL
 * binding — for `import { a as b }` it names `b`, where a text scan for `a`
 * would read every aliased import as orphaned.
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
 * diff is itself keyed on names: `no-unused-vars` hands back an identifier, not
 * a declaration. Summing errs conservative — a name declared twice, once used
 * and once not, reports a positive count and so is cancelled by the multiset
 * subtraction before the transition test sees it.
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

/**
 * Names unused AFTER that were not unused BEFORE, as a MULTISET difference and
 * with no gate at all. The multiset is what keeps a fixture already carrying two
 * orphans from absorbing a third, and what cancels a name unused on both sides
 * because it is declared twice in different scopes.
 */
export const appearedUnused = (before: string[], after: string[]) => {
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
 * Names that went from REFERENCED to unreferenced across the composed fix.
 *
 * This is the count gate's blind spot, addressed with the property that actually
 * separates the two cases. A renaming fixer moves an already-unused `const foo`
 * to an already-unused `const FOO`: `FOO` appears in the multiset diff, but no
 * declaration named `FOO` existed before the fix, so its before-count is zero
 * and it is dropped. That is what makes this safe to run UNGATED over a
 * population the count arm discards — measured at 2,171 rows here, no single
 * fixture owner supplying more than ~7% of them, so the shape is a broad
 * property of the composed pass rather than a few renaming rules' artefact.
 */
export const strandedByTransition = (
  before: string[],
  after: string[],
  refCountsBefore: Map<string, number>,
) =>
  appearedUnused(before, after).filter(
    (name) => (refCountsBefore.get(name) ?? 0) > 0,
  );

type Outcome = {
  rewritten: boolean;
  /** Either side failed to parse; never folded into a clean verdict. */
  fatal: boolean;
  risen: string[];
  detail: string[];
  output: string;
  /**
   * The unused-binding multiset changed while the COUNT did not rise — the
   * population the count arm is structurally blind to, counted so the
   * transition arm's silence reads as a verdict rather than an empty sweep.
   */
  exchange: boolean;
  /** Bindings that lost their last reference across the composed fix. */
  stranded: string[];
  /** A source that parsed but yielded no scope manager: a silent loss. */
  scopesMissing: boolean;
};

/**
 * The classification, in one function so the controls exercise the REAL code
 * path rather than a copy of it.
 */
function classifyComposed(
  source: string,
  filename: string,
  coreConfig: unknown,
  fixConfig: unknown,
): Outcome {
  const quiet = {
    risen: [] as string[],
    detail: [] as string[],
    exchange: false,
    stranded: [] as string[],
    scopesMissing: false,
  };
  capturedScopes = null;
  const before = linter.verify(source, coreConfig as never, filename);
  const scopesBefore = capturedScopes;
  capturedScopes = null;
  if (before.some((message) => message.fatal)) {
    return { rewritten: false, fatal: true, ...quiet, output: source };
  }
  const fixed = linter.verifyAndFix(source, fixConfig as never, filename);
  if (fixed.output === source) {
    return { rewritten: false, fatal: false, ...quiet, output: source };
  }
  const after = linter.verify(fixed.output, coreConfig as never, filename);
  if (after.some((message) => message.fatal)) {
    // A fixed output that no longer parses is `fix-fixpoint-closure`'s finding,
    // not this one. Counted so it cannot read as silence here.
    return { rewritten: true, fatal: true, ...quiet, output: fixed.output };
  }
  // `null` on either side means the structural checker could not parse it; the
  // arm then abstains rather than reading "no breaches" off an absent parse.
  const breachesBefore = restrictedProductionBreaches(source);
  const breachesAfter = restrictedProductionBreaches(fixed.output);
  if (breachesBefore === null || breachesAfter === null)
    stats.breachAbstained++;
  const risen = risenOracles(
    before,
    after,
    breachesBefore && breachesBefore.length,
    breachesAfter && breachesAfter.length,
  );
  /**
   * The transition arm covers exactly what the count gate discards, so it is
   * evaluated only where `no-unused-vars` did NOT rise. A row the count arm
   * already reports needs no second channel; a row it drops is this arm's whole
   * subject.
   */
  const unusedBefore = unusedNames(before);
  const unusedAfter = unusedNames(after);
  const countRose = risen.includes('no-unused-vars');
  const appeared = appearedUnused(unusedBefore, unusedAfter);
  const refCountsBefore = scopesBefore
    ? readReferenceCounts(scopesBefore)
    : new Map<string, number>();
  return {
    rewritten: true,
    fatal: false,
    risen,
    exchange: appeared.length > 0 && !countRose,
    stranded: countRose
      ? []
      : strandedByTransition(unusedBefore, unusedAfter, refCountsBefore),
    scopesMissing: scopesBefore === null,
    detail: [
      ...after
        .filter((message) => message.ruleId && risen.includes(message.ruleId))
        .map((message) => `${message.ruleId}: ${message.message}`),
      ...(risen.includes(RESTRICTED)
        ? (breachesAfter || []).map(
            (breach) =>
              `${RESTRICTED}: ${breach.production} gap at line ${breach.line}`,
          )
        : []),
    ],
    output: fixed.output,
  };
}

type Finding = {
  /** Which oracle rose: a core rule id, or `restricted-production`. */
  oracle: string;
  /** The rule whose suite supplied the fixture; NOT a culprit. */
  fixtureRule: string;
  bucket: FixtureBucket;
  origin: string;
  filename: string;
  source: string;
  output: string;
  detail: string[];
  /** Carried by reference so attribution re-fixes the case as declared. */
  testCase: FixtureCase;
  /** Filled by the attribution pass below. */
  soloReproducers: string[];
  culprits: string[];
  candidatesSufficed: boolean;
  /** The whole composed config, re-run: the ablation's own starting point. */
  fullReproduces: boolean;
};

const corpus = harvestFixtureCorpus();

const stats = {
  considered: 0,
  probed: 0,
  rewritten: 0,
  /** Read by a real `expect`: a skip counter nothing asserts loses cases. */
  skippedFatalInput: 0,
  skippedFatalOutput: 0,
  /** The structural checker abstained because a side did not parse. */
  breachAbstained: 0,
  nonTsSkipped: 0,
  /**
   * The count arm's blind population: the unused-binding multiset moved while
   * the count did not rise. Floored below so the transition arm cannot fall
   * silent by sweeping nothing.
   */
  exchange: 0,
  /** A fixture that parsed but handed back no scope manager. */
  scopesMissing: 0,
  owners: new Set<string>(),
  attributionFixes: 0,
  threw: [] as string[],
};

const findings: Finding[] = [];

/**
 * A binding the COMPOSED fix left unreferenced without raising the unused
 * count — the exchange shape, which `fix-orphan-binding-closure` measured the
 * count gate cannot reach and which it explicitly defers here as fixer
 * INTERACTION (`fix-orphan-binding-closure.test.ts:45-47`).
 */
type Stranded = {
  fixtureRule: string;
  origin: string;
  bucket: FixtureBucket;
  filename: string;
  stranded: string[];
  source: string;
  output: string;
};

const stranded: Stranded[] = [];

const coreConfigFor = (testCase: FixtureCase) =>
  ({
    parser: parserKeyFor(testCase),
    parserOptions: parserOptionsFor(testCase),
    // The probe is spread in here rather than added to CORE_RULES so it cannot
    // become a counted oracle: `countByRule` keys on membership of CORE_RULES.
    rules: { ...CORE_RULES, [SCOPE_PROBE]: 'error' },
  } as unknown as Linter.Config);

/**
 * The composed rule set, built exactly as `fix-fixpoint-closure` builds it: the
 * shipped recommended severities, plus the owner's own entry carrying the
 * OPTIONS its author wrote. Without those options the fixture is fixed under a
 * configuration nobody declared (#1732).
 */
const composedRulesFor = (owner: string, testCase: FixtureCase) =>
  composedRulesWith(RECOMMENDED, EXCLUDED, owner, testCase);

for (const [owner, cases] of corpus.byRule) {
  for (const testCase of cases) {
    if (!BUCKETS.has(testCase.bucket)) continue;
    // These are JavaScript/TypeScript instruments; a JSON or Markdown fixture
    // read through them measures nothing.
    if (testCase.language !== 'ts') {
      stats.nonTsSkipped++;
      continue;
    }
    stats.considered++;

    const filename = defaultFilenameFor(testCase);
    const source = prefixDirectives(testCase.code);
    const coreConfig = coreConfigFor(testCase);

    try {
      const outcome = classifyComposed(source, filename, coreConfig, {
        parser: parserKeyFor(testCase),
        parserOptions: parserOptionsFor(testCase),
        rules: composedRulesFor(owner, testCase),
      } as unknown as Linter.Config);

      if (outcome.fatal) {
        if (outcome.rewritten) stats.skippedFatalOutput++;
        else stats.skippedFatalInput++;
        continue;
      }
      stats.probed++;
      stats.owners.add(owner);
      if (outcome.rewritten) stats.rewritten++;
      if (outcome.exchange) stats.exchange++;
      if (outcome.scopesMissing) stats.scopesMissing++;
      if (outcome.stranded.length) {
        stranded.push({
          fixtureRule: owner,
          origin: testCase.origin,
          bucket: testCase.bucket,
          filename,
          stranded: outcome.stranded,
          source,
          output: outcome.output,
        });
      }
      if (!outcome.risen.length) continue;

      for (const oracle of outcome.risen) {
        findings.push({
          oracle,
          fixtureRule: owner,
          bucket: testCase.bucket,
          origin: testCase.origin,
          filename,
          source,
          output: outcome.output,
          detail: outcome.detail.filter((entry) => entry.startsWith(oracle)),
          testCase,
          soloReproducers: [],
          culprits: [],
          candidatesSufficed: true,
          fullReproduces: false,
        });
      }
    } catch (error) {
      stats.threw.push(`${owner} ${testCase.origin}: ${String(error)}`);
    }
  }
}

/**
 * ATTRIBUTION, findings only.
 *
 * "The solo sweep is green, so this must be composition-only" is an inference,
 * and inferences are how a guard reports the wrong rule. Each finding is
 * re-fixed with every candidate rule ALONE — a rule that reproduces the rise by
 * itself belongs to `fix-core-violation-closure`'s baseline, not here — and then
 * the candidate set is ablated down to a minimal one that still reproduces.
 *
 * The candidate set is the rules reporting on the INPUT plus those reporting on
 * the composed OUTPUT, which is a superset of the rules that can have fixed
 * anything at either end but not of those reporting only mid-loop
 * (`extract-global-constants` is one: it reports on neither end of the
 * `use-latest-callback` finding and is still required to reproduce it). When the
 * candidates fail to reproduce the rise, the ablation falls back to the whole
 * composed config — the finding is unaffected, only the naming is coarser.
 *
 * THE RULE ORDER IS LOAD-BEARING, and every subset here is built by FILTERING
 * the composed config's own key order rather than by sorting. Two rules whose
 * fixes compete for the same range are resolved by the order their messages
 * arrive, which follows the order the rules sit in the config object — so an
 * ablation that sorts the ids alphabetically is probing a config the consumer
 * does not have. Measured on the `use-latest-callback` finding: the full set in
 * config order reproduces the rise and the SAME set sorted does not, which made
 * every ablation step fail and named all 187 rules as culprits. `fullReproduces`
 * below is asserted for every finding precisely so that failure mode cannot
 * return silently.
 */
function attribute(finding: Finding): void {
  const { testCase } = finding;
  const coreConfig = coreConfigFor(testCase);
  const composed = composedRulesFor(finding.fixtureRule, testCase);
  const fixConfigFor = (ids: string[]) =>
    ({
      parser: parserKeyFor(testCase),
      parserOptions: parserOptionsFor(testCase),
      rules: Object.fromEntries(ids.map((id) => [id, composed[id]])),
    } as unknown as Linter.Config);

  const reproduces = (ids: string[]) => {
    stats.attributionFixes++;
    const outcome = classifyComposed(
      finding.source,
      finding.filename,
      coreConfig,
      fixConfigFor(ids),
    );
    return outcome.risen.includes(finding.oracle);
  };

  const reportingIn = (code: string) =>
    linter
      .verify(
        code,
        {
          parser: parserKeyFor(testCase),
          parserOptions: parserOptionsFor(testCase),
          rules: composed,
        } as unknown as Linter.Config,
        finding.filename,
      )
      .map((message) => message.ruleId)
      .filter((id): id is string => Boolean(id) && String(id) in composed);

  const order = Object.keys(composed);
  const inConfigOrder = (ids: Iterable<string>) =>
    subsetInConfigOrder(order, ids);

  finding.fullReproduces = reproduces(order);

  const candidates = inConfigOrder([
    ...reportingIn(finding.source),
    ...reportingIn(finding.output),
  ]);

  finding.soloReproducers = candidates
    .filter((id) => reproduces([id]))
    .map((id) => id.slice(PREFIX.length));

  const sufficed = candidates.length > 0 && reproduces(candidates);
  finding.candidatesSufficed = sufficed;
  let current = sufficed ? candidates : order;
  for (const id of [...current]) {
    const trial = current.filter((entry) => entry !== id);
    if (trial.length && reproduces(trial)) current = trial;
  }
  // Sorted for the baseline KEY only; the probing above never sorts.
  finding.culprits = current.map((id) => id.slice(PREFIX.length)).sort();
}

/**
 * Attribution is per FIXTURE, so a case that produced several findings is
 * located once. Findings are few by construction; if that ever stops being true
 * the cap below keeps the run bounded and the assertion under it fails, rather
 * than the sweep quietly attributing a prefix of its own findings.
 */
const ATTRIBUTION_CAP = 400;
const attributed = findings.slice(0, ATTRIBUTION_CAP);
for (const finding of attributed) {
  try {
    attribute(finding);
  } catch (error) {
    stats.threw.push(`attribution ${finding.origin}: ${String(error)}`);
  }
}

/** A finding a single rule reproduces is the SOLO guard's, not this one's. */
const composition = attributed.filter(
  (finding) => finding.soloReproducers.length === 0,
);
const soloExplained = attributed.filter(
  (finding) => finding.soloReproducers.length > 0,
);

const signatureOf = (finding: Finding) =>
  `${finding.culprits.join('+')} -> ${finding.oracle}`;

const bySignature = new Map<string, Finding[]>();
for (const finding of composition) {
  const list = bySignature.get(signatureOf(finding)) || [];
  list.push(finding);
  bySignature.set(signatureOf(finding), list);
}

/**
 * The raw findings, for a reader who has to reproduce one by hand. Written
 * best-effort: a guard that fails because a scratch directory is missing is
 * reporting on the filesystem, not on the plugin.
 */
try {
  const dump = path.join(__dirname, '..', '..', '.claude', 'tmp');
  fs.mkdirSync(dump, { recursive: true });
  fs.writeFileSync(
    path.join(dump, 'composed-core-findings.json'),
    JSON.stringify(
      {
        stats: {
          ...stats,
          owners: stats.owners.size,
          threw: stats.threw.length,
        },
        findings: attributed.map((finding) => ({
          oracle: finding.oracle,
          fixtureRule: finding.fixtureRule,
          bucket: finding.bucket,
          origin: finding.origin,
          filename: finding.filename,
          culprits: finding.culprits,
          soloReproducers: finding.soloReproducers,
          candidatesSufficed: finding.candidatesSufficed,
          fullReproduces: finding.fullReproduces,
          detail: finding.detail,
          input: finding.source,
          composedOutput: finding.output,
        })),
      },
      null,
      2,
    ),
  );
} catch {
  // A dump is a convenience; the assertions below are the guard.
}

/**
 * Compositions MEASURED to introduce a core violation today, keyed
 * `culprits -> oracle`, each with the issue that tracks it.
 *
 * Asserted EXACTLY, in both directions: a new signature fails as a regression,
 * and a stale one fails as a fix nobody deleted the baseline for. Keyed on the
 * culprit SET rather than on a rule name, because a rule-keyed entry would
 * un-gate every other composition that rule takes part in — the granularity
 * mistake that cost #1839.
 */
const COMPOSITION_BASELINE = new Map<string, string>([
  // Each fixer removes a DIFFERENT reference to the same import, each sees the
  // other's reference surviving its own edit, so neither deletes the import and
  // the composed pass strands it. Solo, every one of these rules cleans up
  // correctly — the residue is `orphanedBindings`' stated conservatism ("a USE
  // that survives this edit keeps the binding alive, whatever another edit might
  // later do to it", `importRemoval.ts`), which no rule can escape alone.
  [
    'no-empty-dependency-use-callbacks+no-redundant-usecallback-wrapper -> no-unused-vars',
    '#1994',
  ],
  [
    'no-empty-dependency-use-callbacks+no-redundant-usecallback-wrapper+use-latest-callback -> no-unused-vars',
    '#1994',
  ],
  [
    'no-explicit-return-type+no-redundant-param-types -> no-unused-vars',
    '#1994',
  ],
]);

const REGRESSIONS = [...bySignature.keys()]
  .filter((signature) => !COMPOSITION_BASELINE.has(signature))
  .sort();

const STALE = [...COMPOSITION_BASELINE.keys()]
  .filter((signature) => !bySignature.has(signature))
  .sort();

const snippet = (code: string) =>
  code.length > 400 ? `${code.slice(0, 400)}...` : code;

const describeFinding = (finding: Finding) =>
  [
    `  ${signatureOf(finding)}`,
    `    fixture: ${finding.origin} [${finding.bucket}, ${finding.fixtureRule}, as ${finding.filename}]`,
    `    solo reproducers: ${finding.soloReproducers.join(', ') || '(none)'}`,
    `    ${finding.detail.join('; ')}`,
    '    --- input ---',
    snippet(finding.source).replace(/^/gm, '      '),
    '    --- composed output ---',
    snippet(finding.output).replace(/^/gm, '      '),
  ].join('\n');

describe('the composed --fix must not introduce a core violation', () => {
  it('introduces no core violation outside the tracked baseline', () => {
    if (REGRESSIONS.length) {
      throw new Error(
        [
          `${REGRESSIONS.length} composition(s) of the recommended config's`,
          '`--fix` introduce a CORE eslint violation that no single rule',
          'introduces alone. Each is source damage `--fix` would write to a',
          "consumer's file, and it belongs to the PAIR, so neither rule's own",
          'suite can see it.',
          '',
          ...REGRESSIONS.flatMap((signature) =>
            (bySignature.get(signature) || []).slice(0, 2).map(describeFinding),
          ),
        ].join('\n'),
      );
    }
    expect(REGRESSIONS).toEqual([]);
  });

  it('has no stale baseline entry', () => {
    expect(STALE).toEqual([]);
  });

  it('still measures every baselined composition as offending', () => {
    for (const signature of COMPOSITION_BASELINE.keys()) {
      expect((bySignature.get(signature) || []).length).toBeGreaterThan(0);
    }
  });

  it('never let a probe throw instead of producing a verdict', () => {
    expect(stats.threw).toEqual([]);
    expect(corpus.failures).toEqual([]);
  });

  it('attributed every finding it recorded', () => {
    // A cap that silently truncates would attribute a prefix and report the
    // rest as composition findings with an empty culprit set.
    expect(findings.length).toBeLessThanOrEqual(ATTRIBUTION_CAP);
    expect(
      composition.filter((finding) => finding.culprits.length === 0),
    ).toEqual([]);
    /**
     * The ablation is only meaningful if its STARTING point reproduces the rise.
     * When it does not, every removal fails, nothing shrinks, and the guard
     * names every enabled rule as a culprit — which is what an alphabetically
     * sorted rule set produced before the order fix above. A finding here means
     * the attribution is measuring a different configuration from the sweep.
     */
    expect(
      attributed
        .filter((finding) => !finding.fullReproduces)
        .map((finding) => `${finding.oracle} <- ${finding.origin}`),
    ).toEqual([]);
    // And the culprit set must be a real minimisation, not the whole config
    // wearing the word "culprit".
    expect(
      composition
        .filter((finding) => finding.culprits.length > 12)
        .map((finding) => `${finding.origin}: ${finding.culprits.length}`),
    ).toEqual([]);
  });

  /**
   * Non-vacuity. Each number is a floor just under a MEASURED value, so the
   * sweep cannot quietly stop doing work and keep passing: a corpus that fails
   * to load, a filename that stops matching, or a harvest that returns a partial
   * registry all show up here rather than as a clean run. The floors that hid
   * #1984 sat at 5,500 against an actual 8,141.
   */
  it('actually swept and fixed the corpus it claims to', () => {
    // eslint-disable-next-line no-console
    console.log(
      `[composed-core] considered=${stats.considered} probed=${stats.probed} ` +
        `rewritten=${stats.rewritten} owners=${stats.owners.size} ` +
        `fatalInput=${stats.skippedFatalInput} fatalOutput=${stats.skippedFatalOutput} ` +
        `breachAbstained=${stats.breachAbstained} nonTs=${stats.nonTsSkipped} ` +
        `findings=${findings.length} composition=${composition.length} ` +
        `soloExplained=${soloExplained.length} attributionFixes=${stats.attributionFixes}`,
    );
    // Measured at 1.20.148: 19,882 considered / 19,882 probed / 9,741
    // rewritten / 192 owners. Each floor sits just under its own measurement,
    // and each fails differently: a probe count with nothing rewritten means the
    // fix pass never ran (the parser, filename or options plumbing lost), and a
    // corpus that reaches few owners says nothing about the rest of the config
    // however many snippets it holds.
    expect(stats.considered).toBeGreaterThan(19500);
    expect(stats.probed).toBeGreaterThan(19500);
    expect(stats.rewritten).toBeGreaterThan(9400);
    expect(stats.owners.size).toBeGreaterThan(185);
  });

  /**
   * The skip counters, read by a real `expect`. A fatal-parse counter nothing
   * asserts discards cases in silence, which is exactly how 106 of them went
   * unnoticed (#1984): every consumer filters messages by `ruleId`, so a fatal
   * parse is indistinguishable from the rule staying silent.
   */
  it('accounts for every case it skipped as a fatal parse', () => {
    // ZERO, not a threshold. Every TypeScript fixture parses under the parser,
    // filename and options its author declared, and every composed output still
    // parses — so a nonzero count here is a case that left the sweep in silence,
    // which is indistinguishable from a clean one. An output fatal is
    // `fix-fixpoint-closure`'s finding; an input fatal means the filename or
    // parser plumbing regressed.
    expect({
      input: stats.skippedFatalInput,
      output: stats.skippedFatalOutput,
    }).toEqual({ input: 0, output: 0 });

    /**
     * The structural checker parses with its OWN options, so it can abstain on
     * a fixture the lint pass handled fine — and an abstention is a silent hole
     * in the restricted-production arm, not a clean result. Zero today; a rise
     * means naming the fixture and deciding, not raising a threshold.
     */
    expect(stats.breachAbstained).toBe(0);

    /**
     * The non-TypeScript exclusion, closed rather than floored: it must equal
     * the corpus's own count of JSON and Markdown cases in the swept buckets, so
     * a TypeScript fixture cannot quietly join them.
     */
    let nonTs = 0;
    for (const cases of corpus.byRule.values()) {
      for (const testCase of cases) {
        if (!BUCKETS.has(testCase.bucket)) continue;
        if (testCase.language !== 'ts') nonTs++;
      }
    }
    expect(stats.nonTsSkipped).toBe(nonTs);
    expect(nonTs).toBeGreaterThan(0);
  });

  /**
   * The rule dimension, closed rather than floored (#1863). A floor of 150
   * owners against 192 is exactly how much coverage can vanish before anyone
   * hears, and because it is a global sum the loss concentrates in whatever
   * regressed.
   */
  it('sweeps every rule with a TypeScript corpus', () => {
    const expected = new Set<string>();
    for (const [owner, cases] of corpus.byRule) {
      for (const testCase of cases) {
        if (!BUCKETS.has(testCase.bucket)) continue;
        if (testCase.language === 'ts') expected.add(owner);
      }
    }
    expect([...stats.owners].sort()).toEqual([...expected].sort());
  });

  /**
   * Planted controls, run through `classifyComposed` itself. Without them a
   * predicate that silently stopped detecting anything would pass forever, and
   * the baseline assertions above would fail as "stale" — which reads as good
   * news.
   */
  const controlCore = {
    parser: 'ts',
    parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: CORE_RULES,
  };
  const controlFix = (ids: string[]) => ({
    ...controlCore,
    rules: Object.fromEntries(ids.map((id) => [id, 'error'])),
  });

  /** Renames one object-literal KEY, and nothing else. */
  const keyRenamer = (from: string, to: string): Rule.RuleModule => ({
    meta: {
      type: 'problem',
      schema: [],
      fixable: 'code',
      messages: { rename: 'rename' },
    },
    create: (context) => ({
      Property(node) {
        const key = (node as { key?: { name?: string } }).key;
        if (key?.name !== from) return;
        context.report({
          node: node as never,
          messageId: 'rename',
          fix: (fixer) => fixer.replaceText(key as never, to),
        });
      },
    }),
  });

  it('detects a violation that only exists under COMPOSITION (positive control)', () => {
    // Neither rename duplicates a key alone; together they collide on `x`.
    // This is the shape the whole file exists for, and the shape
    // `fix-core-violation-closure`'s solo attribution provably cannot see.
    linter.defineRule('control/rename-aa', keyRenamer('aa', 'x'));
    linter.defineRule('control/rename-ab', keyRenamer('ab', 'x'));
    const source = 'export const o = { aa: 1, ab: 2 };\n';

    const composed = classifyComposed(
      source,
      'control.ts',
      controlCore,
      controlFix(['control/rename-aa', 'control/rename-ab']),
    );
    expect({ rewritten: composed.rewritten, risen: composed.risen }).toEqual({
      rewritten: true,
      risen: ['no-dupe-keys'],
    });

    // And the SOLO arms stay silent, which is what makes it composition-only
    // rather than a finding the neighbouring guard already owns.
    for (const id of ['control/rename-aa', 'control/rename-ab']) {
      const solo = classifyComposed(
        source,
        'control.ts',
        controlCore,
        controlFix([id]),
      );
      expect({ id, rewritten: solo.rewritten, risen: solo.risen }).toEqual({
        id,
        rewritten: true,
        risen: [],
      });
    }
  });

  it('detects a composed restricted-production breach (positive control)', () => {
    // A LineTerminator between an arrow's signature and its `=>` is text no
    // engine will run, and `@typescript-eslint/parser` accepts it — so no
    // parse-based oracle in this repo can see it (#1964).
    //
    // Composition-only by construction: planting the comment BEFORE the
    // annotation is legal, and stripping the annotation from a source with no
    // comment is legal. Only both leave the comment stranded in the gap.
    linter.defineRule('control/comment-before-annotation', {
      meta: {
        type: 'problem',
        schema: [],
        fixable: 'code',
        messages: { plant: 'plant' },
      },
      create: (context) => ({
        ArrowFunctionExpression(node) {
          const annotation = (node as { returnType?: object }).returnType;
          if (!annotation) return;
          if (context.getSourceCode().getText().includes('/* m')) return;
          context.report({
            node: node as never,
            messageId: 'plant',
            fix: (fixer) =>
              fixer.insertTextBefore(annotation as never, '/* m\n */ '),
          });
        },
      }),
    });
    linter.defineRule('control/strip-return-annotation', {
      meta: {
        type: 'problem',
        schema: [],
        fixable: 'code',
        messages: { strip: 'strip' },
      },
      create: (context) => ({
        ArrowFunctionExpression(node) {
          const annotation = (node as { returnType?: object }).returnType;
          if (!annotation) return;
          context.report({
            node: node as never,
            messageId: 'strip',
            fix: (fixer) => fixer.remove(annotation as never),
          });
        },
      }),
    });

    const source = 'export const f = (a: number): number => a;\n';
    const composed = classifyComposed(
      source,
      'control.ts',
      controlCore,
      controlFix([
        'control/comment-before-annotation',
        'control/strip-return-annotation',
      ]),
    );
    expect({
      rewritten: composed.rewritten,
      risen: composed.risen,
      output: composed.output,
    }).toEqual({
      rewritten: true,
      risen: [RESTRICTED],
      output: expect.stringContaining('/* m'),
    });

    for (const id of [
      'control/comment-before-annotation',
      'control/strip-return-annotation',
    ]) {
      const solo = classifyComposed(
        source,
        'control.ts',
        controlCore,
        controlFix([id]),
      );
      expect({ id, rewritten: solo.rewritten, risen: solo.risen }).toEqual({
        id,
        rewritten: true,
        risen: [],
      });
    }
  });

  it('stays silent on a composition that introduces nothing (negative control)', () => {
    // The same two fixers, composing onto DISTINCT keys. Both rewrite the
    // source; neither the pair nor either half violates anything.
    linter.defineRule('control/rename-ab-safe', keyRenamer('ab', 'y'));
    const outcome = classifyComposed(
      'export const o = { aa: 1, ab: 2 };\n',
      'control.ts',
      controlCore,
      controlFix(['control/rename-aa', 'control/rename-ab-safe']),
    );
    expect({ rewritten: outcome.rewritten, risen: outcome.risen }).toEqual({
      rewritten: true,
      risen: [],
    });
  });

  it('does not count a violation that was ALREADY there (negative control)', () => {
    // The count gate's other half: a fixture may carry its own violations, and
    // a fix that leaves the count flat has not made the consumer's build worse.
    // The input carries one of every core violation this file counts, and the
    // fix REWRITES it — an input nothing touched would exercise nothing.
    const outcome = classifyComposed(
      [
        'export function f() {',
        '  const dupe = { x: 1, x: 2 };',
        '  const other = { aa: 3 };',
        '  dupe.x = dupe.x;',
        '  return dupe;',
        '  const dead = 3;',
        '}',
        '',
      ].join('\n'),
      'control.ts',
      controlCore,
      controlFix(['control/rename-aa']),
    );
    expect({ rewritten: outcome.rewritten, risen: outcome.risen }).toEqual({
      rewritten: true,
      risen: [],
    });
  });

  it('reads a count rise, not a text change (oracle controls)', () => {
    const message = (ruleId: string) =>
      ({ ruleId } as unknown as Linter.LintMessage);
    // Same count, so a fixer that merely reworded or moved the site is not a
    // finding.
    expect(
      risenOracles(
        [message('no-self-assign')],
        [message('no-self-assign')],
        0,
        0,
      ),
    ).toEqual([]);
    // A genuine increment is.
    expect(
      risenOracles(
        [message('no-self-assign')],
        [message('no-self-assign'), message('no-self-assign')],
        0,
        0,
      ),
    ).toEqual(['no-self-assign']);
    // A violation of a different core rule appearing from nothing.
    expect(risenOracles([], [message('no-unreachable')], 0, 0)).toEqual([
      'no-unreachable',
    ]);
    // A rule whose count FELL is not a finding either.
    expect(
      risenOracles(
        [message('no-dupe-keys'), message('no-dupe-keys')],
        [],
        0,
        0,
      ),
    ).toEqual([]);
    // The structural arm rises on its own count...
    expect(risenOracles([], [], 0, 1)).toEqual([RESTRICTED]);
    // ...abstains when either side could not be parsed, rather than reading an
    // absent parse as "no breaches"...
    expect(risenOracles([], [], null, 1)).toEqual([]);
    expect(risenOracles([], [], 0, null)).toEqual([]);
    // ...and lets an input that already breaches carry its breach.
    expect(risenOracles([], [], 1, 1)).toEqual([]);
  });

  it('names the rules that must BOTH be present (attribution control)', () => {
    // Attribution runs over the real `classifyComposed`, so this proves the
    // ablation can distinguish a composition from a solo culprit at all — the
    // property every finding's `culprits` field rests on.
    const source = 'export const o = { aa: 1, ab: 2 };\n';
    const ids = [
      'control/rename-aa',
      'control/rename-ab',
      'control/rename-ab-safe',
    ];
    const reproduces = (subset: string[]) =>
      classifyComposed(
        source,
        'control.ts',
        controlCore,
        controlFix(subset),
      ).risen.includes('no-dupe-keys');

    expect(ids.filter((id) => reproduces([id]))).toEqual([]);
    expect(reproduces(['control/rename-aa', 'control/rename-ab'])).toBe(true);
    expect(reproduces(['control/rename-aa', 'control/rename-ab-safe'])).toBe(
      false,
    );

    // And every subset the ablation builds keeps the config's own order, which
    // is what a consumer runs. Sorting instead measured a config nobody has.
    expect(
      subsetInConfigOrder(ids, ['control/rename-ab', 'control/rename-aa']),
    ).toEqual(['control/rename-aa', 'control/rename-ab']);
    expect(subsetInConfigOrder(ids, ['control/rename-ab-safe'])).toEqual([
      'control/rename-ab-safe',
    ]);
  });

  /**
   * THE TRANSITION ARM, asserted as an EXACT empty census.
   *
   * A row here is a composed `--fix` that left a binding unreferenced while the
   * unused COUNT stayed flat, so the arm above never looks at it. The census is
   * empty today and pinned rather than floored: a row appearing is a
   * regression, and if one is ever legitimately baselined the entry must be
   * added deliberately.
   *
   * Attribution is deliberately NOT run for this arm. The ablation harness
   * minimises against `risenOracles`, which by construction does not reproduce a
   * finding the count gate cannot see; a row here therefore reports its fixture
   * and its stranded names and is attributed by hand.
   */
  it('strands no referenced binding while the count stays flat', () => {
    if (stranded.length) {
      // eslint-disable-next-line no-console
      console.error(
        stranded
          .slice(0, 3)
          .map((row) =>
            [
              `${row.fixtureRule} ${row.origin} (${row.bucket})`,
              `  stranded: ${row.stranded.join(', ')}`,
              `  --- source ---\n${row.source}`,
              `  --- composed output ---\n${row.output}`,
            ].join('\n'),
          )
          .join('\n\n'),
      );
    }
    expect(stranded).toEqual([]);
  });

  /**
   * NON-VACUITY for the arm above, which is the only thing separating a verdict
   * from a sweep that considered nothing (#1984).
   *
   * The floor sits just under the MEASURED 2,171 rather than at a round number
   * with room to spare — a floor with slack keeps passing while the sweep
   * quietly stops doing most of its work, which is how the #1984 floors sat at
   * 5,500 against an actual 8,141.
   */
  it('drives the transition arm over the population the count gate drops', () => {
    expect(stats.exchange).toBeGreaterThan(2100);
    // Every fixture that parsed must have yielded a scope manager; without one
    // every reference count reads zero and the arm silently returns nothing.
    expect(stats.scopesMissing).toBe(0);
  });

  /**
   * ORACLE CONTROLS for the transition arm, exercising the REAL exported
   * predicate rather than a copy of it.
   *
   * An arm whose census is empty is indistinguishable from an arm that never
   * fires at all, so the discriminating cases are planted here directly: the
   * exchange it must catch, and the two artefacts it must not.
   */
  it('keys the transition on before-references, not on the count (oracle controls)', () => {
    // POSITIVE — the exchange. `handler` held a reference before and holds none
    // after, while a separate already-unused binding goes away in the same pass.
    // The unused COUNT is flat at one, so the arm above is the only instrument
    // in this file that can see it.
    expect(
      strandedByTransition(
        ['stale'],
        ['handler'],
        new Map([
          ['handler', 1],
          ['stale', 0],
        ]),
      ),
    ).toEqual(['handler']);

    // NEGATIVE — the rename artefact the count gate existed to absorb, and the
    // reason this arm keys on before-references. An already-unused `foo` becomes
    // an already-unused `FOO`; no declaration named `FOO` had a reference
    // before, so nothing was stranded. This is the 1,593-artefact shape.
    expect(
      strandedByTransition(['foo'], ['FOO'], new Map([['foo', 0]])),
    ).toEqual([]);

    // NEGATIVE — a name unused on BOTH sides is cancelled by the multiset
    // subtraction before the reference test is ever consulted.
    expect(
      strandedByTransition(['idle'], ['idle'], new Map([['idle', 3]])),
    ).toEqual([]);
  });

  it('swept the buckets it claims to and no others', () => {
    const byBucket = new Map<FixtureBucket, number>();
    for (const cases of corpus.byRule.values()) {
      for (const testCase of cases) {
        if (testCase.language !== 'ts') continue;
        byBucket.set(testCase.bucket, (byBucket.get(testCase.bucket) || 0) + 1);
      }
    }
    const skipped = [...byBucket]
      .filter(([bucket]) => !BUCKETS.has(bucket))
      .map(([bucket, count]) => `${bucket}=${count}`)
      .sort();
    expect(skipped).toEqual([]);
    // An empty `skipped` is also what a bucket VANISHING from the harvest looks
    // like, so name each one and floor it.
    expect([...byBucket.keys()].sort()).toEqual(['invalid', 'output', 'valid']);
    expect(byBucket.get('valid')).toBeGreaterThan(5000);
    expect(byBucket.get('invalid')).toBeGreaterThan(5000);
    expect(byBucket.get('output')).toBeGreaterThan(1000);
    expect(stats.considered).toBe(
      [...byBucket.values()].reduce((total, count) => total + count, 0),
    );
  });
});

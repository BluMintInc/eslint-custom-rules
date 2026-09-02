import { Linter } from 'eslint';
import {
  FixtureCase,
  defaultFilenameFor,
  harvestFixtureCorpus,
  parserOptionsFor,
  severityWithOptions,
  silentWithoutProgramRuleNames,
} from '../utils/fixtureCorpus';

/**
 * A sibling rule's `as const` must not silence another rule.
 *
 * Three rules in `configs.recommended` append `as const` with `--fix`, so the
 * wrapper arrives on code the author never wrapped. A rule that classifies its
 * subject with a bare `node.type === ObjectExpression` / `=== Literal` test
 * goes blind the moment one does, which means `eslint --fix` can silence a rule
 * on the very code it just rewrote.
 *
 * This is the DELETION direction of fix closure. `recommended-config-fix-closure`
 * counts reports a fix INTRODUCES, so it is structurally blind to a fix that
 * removes one — the gap that let #1805, #1806 and #1807 ship.
 *
 * The causal isolation below is load-bearing rather than incidental.
 * `global-const-style` both renames a constant and appends the assertion in one
 * rewrite, and the rename accounts for half the raw signal: of the 8 rules the
 * first sweep flagged, only 4 lost their report to the assertion. Comparing the
 * fixed output against the same output with ONLY ` as const` removed is what
 * separates them, so without it this guard would fail four rules that are
 * behaving correctly.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as {
  rules: Record<string, any>;
  configs: { recommended: { rules: Record<string, unknown> } };
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tsParser = require('@typescript-eslint/parser');

const PREFIX = '@blumintinc/blumint/';

const linter = new Linter();
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}
linter.defineParser('ts', tsParser);

/**
 * Recommended rules whose fixer appends an `as const`.
 *
 * Derived by measurement, not by hand, and closed in both directions below:
 * every `fixable: 'code'` recommended rule was driven over its own corpus and
 * kept when the fix RAISED the `as const` token count. The hand-written list
 * held three; the measurement finds five.
 */
const CULPRITS = [
  'enforce-global-constants',
  'enforce-object-literal-as-const',
  'global-const-style',
  'prefer-clone-deep',
  'prefer-union-from-const-array',
];

const configWith = (
  testCase: FixtureCase,
  rules: Record<string, unknown>,
): Linter.Config =>
  ({
    parser: 'ts',
    parserOptions: parserOptionsFor(testCase),
    rules,
  } as Linter.Config);

/**
 * Reports per messageId, COUNTED rather than collected into a set.
 *
 * A set answers "does this messageId still appear at all", which a fixture
 * carrying several violations of one kind can satisfy while most of them go
 * dark. `enforce-firestore-doc-ref-generic` lost 2 of 3 `missingGeneric`
 * reports to an `as const` and this guard stayed green, because the third
 * report kept the messageId present on both sides (#2007, #2010).
 */
const reportsOf = (
  rule: string,
  code: string,
  testCase: FixtureCase,
  filename: string,
): Map<string, number> | null => {
  const id = PREFIX + rule;
  let messages: Linter.LintMessage[];
  try {
    messages = linter.verify(
      code,
      configWith(testCase, { [id]: severityWithOptions(testCase) }),
      { filename },
    );
  } catch {
    return null;
  }
  // A fatal parse reports nothing else, so it would read as rule silence.
  if (messages.some((m) => m.fatal)) return null;
  const counts = new Map<string, number>();
  for (const message of messages) {
    // Filtered by `ruleId` first: a rule-not-found error reads as both silence
    // and inflation if it reaches the counter.
    if (message.ruleId !== id) continue;
    const key = message.messageId || message.message;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
};

const culpritRules = () => {
  const rules: Record<string, string> = {};
  for (const culprit of CULPRITS) rules[PREFIX + culprit] = 'error';
  return rules;
};

/** The culprits' combined `--fix` output, or null if they changed nothing. */
const afterCulpritFix = (
  testCase: FixtureCase,
  filename: string,
): string | null => {
  try {
    const result = linter.verifyAndFix(
      testCase.code,
      configWith(testCase, culpritRules()),
      { filename },
    );
    if (!result.fixed || result.output === testCase.code) return null;
    return result.output;
  } catch {
    return null;
  }
};

type Finding = {
  rule: string;
  messageId: string;
  origin: string;
  filename: string;
  before: string;
  after: string;
};

type ProbeResult = {
  findings: Finding[];
  /** Cases a culprit actually rewrote — the only number that can assert. */
  rewritten: number;
  /**
   * Whether the rule reported on the untouched fixture, which is the
   * precondition for a report to be LOST. Carried, along with `asserted`, so a
   * rule the probe never reached can NAME the reason instead of leaving it to
   * inference — the two are different failures and only one is legitimate.
   */
  reported: boolean;
  /** Whether a culprit's `--fix` added an assertion to this fixture at all. */
  asserted: boolean;
};

const probeCase = (rule: string, testCase: FixtureCase): ProbeResult => {
  const filename = defaultFilenameFor(testCase);
  const before = reportsOf(rule, testCase.code, testCase, filename);
  const blank = (): ProbeResult => ({
    findings: [],
    rewritten: 0,
    reported: false,
    asserted: false,
  });
  if (!before || before.size === 0) return blank();

  const rewritten = afterCulpritFix(testCase, filename);
  if (!rewritten || !/\bas const\b/.test(rewritten)) {
    return { ...blank(), reported: true };
  }

  const after = reportsOf(rule, rewritten, testCase, filename);
  if (!after) return { ...blank(), reported: true, asserted: true };

  const base = { reported: true, asserted: true };
  const lost = [...before.entries()]
    .filter(([id, count]) => count > (after.get(id) || 0))
    .map(([id]) => id);
  if (!lost.length) return { ...base, findings: [], rewritten: 1 };

  /**
   * The isolation: the SAME rewrite with only the assertion removed. A report
   * that stays missing here was lost to something else the fixer did (the
   * rename), and is not this guard's subject.
   */
  const stripped = rewritten.replace(/ as const\b/g, '');
  const restored = reportsOf(rule, stripped, testCase, filename);
  if (!restored) return { ...base, findings: [], rewritten: 1 };

  return {
    ...base,
    rewritten: 1,
    findings: lost
      // Restored means the count RECOVERS once the assertion goes, not merely
      // that the messageId reappears — the same partial-loss blindness.
      .filter(
        (messageId) =>
          (restored.get(messageId) || 0) > (after.get(messageId) || 0),
      )
      .map((messageId) => ({
        rule,
        messageId,
        origin: testCase.origin,
        filename,
        before: testCase.code,
        after: rewritten,
      })),
  };
};

const corpus = harvestFixtureCorpus();

/**
 * Only rules that measurably cannot be driven here are excluded — that set is
 * currently empty. The wider "mentions the type checker" set used to be dropped
 * instead, on the theory that a bare `Linter` builds no program; it does build
 * one (an isolated single-file program), and all 16 of those rules report over
 * their own fixtures, so excluding them removed live coverage rather than
 * preventing a false clean (#1859). A culprit cannot be its own victim.
 */
const victims = Object.keys(plugin.rules)
  .filter((name) => !silentWithoutProgramRuleNames.has(name))
  .filter((name) => !CULPRITS.includes(name))
  .sort();

/**
 * Fixtures this guard's probe cannot be applied to, named per (guard, rule)
 * with the reason.
 *
 * The probe rewrites a fixture with an `as const` assertion and asks whether
 * the rule still reports. That needs a TypeScript expression and a TypeScript
 * AST.
 * A `package.json` body and a Markdown document have neither, so a case in
 * either language cannot pose the question. Skipping by LANGUAGE rather than by
 * parse failure is what keeps the skip honest: a Markdown fence is an empty
 * template literal, so several of those fixtures do parse as TypeScript and
 * would otherwise answer a TypeScript question by accident (#1860).
 *
 * A rule-global exclusion would be the wrong instrument — it would un-gate every
 * other arm these rules participate in (#1839) — so the entry is scoped to this
 * guard and asserted in both directions below.
 */
const NON_TYPESCRIPT_FIXTURES: Record<string, string> = {
  'enforce-typescript-markdown-code-blocks':
    'declares only Markdown documents, under ruleTesterMarkdown',
  'no-unpinned-dependencies':
    'declares only package.json bodies, under ruleTesterJson',
  'prefer-nullish-coalescing-boolean-props':
    'declares one package.json body under ruleTesterJson alongside its TypeScript fixtures',
};

const findings: Finding[] = [];
let casesRewritten = 0;
let nonTypeScriptSkipped = 0;
const rulesWithNonTypeScriptFixtures = new Set<string>();

/**
 * Per-rule bookkeeping, so a rule's row can assert that the probe reached it.
 *
 * `rewritten` is the only counter a finding can come out of; `tsCases` and
 * `reporting` exist to say WHY a rule was never reached, which is what turns a
 * dark row into a reviewable exemption rather than a silent one.
 */
type Drive = {
  tsCases: number;
  reporting: number;
  asserted: number;
  rewritten: number;
};
const driveByRule = new Map<string, Drive>(
  victims.map((rule) => [
    rule,
    { tsCases: 0, reporting: 0, asserted: 0, rewritten: 0 },
  ]),
);

for (const victim of victims) {
  const drive = driveByRule.get(victim)!;
  for (const testCase of corpus.byRule.get(victim) || []) {
    if (testCase.language !== 'ts') {
      nonTypeScriptSkipped++;
      rulesWithNonTypeScriptFixtures.add(victim);
      continue;
    }
    drive.tsCases++;
    const result = probeCase(victim, testCase);
    if (result.reported) drive.reporting++;
    if (result.asserted) drive.asserted++;
    drive.rewritten += result.rewritten;
    casesRewritten += result.rewritten;
    findings.push(...result.findings);
  }
}

const flaggedRules = [...new Set(findings.map((f) => f.rule))].sort();

/**
 * Why a rule's per-rule row could never fail, read off the counters rather than
 * guessed.
 *
 * A row that renders green having rewritten nothing is worse than a missing
 * row: it names the rule in the jest output, so the next reader takes it as
 * evidence the rule WAS checked. Each rule therefore either asserts a culprit
 * actually wrapped one of its fixtures, or it is a NAMED SKIP carrying the
 * measured reason — the same non-vacuity check the controls at the bottom of
 * this file already carry (`result.rewritten === 1`), applied to the ~190 rows
 * it was never applied to (#1861).
 *
 * Ordered from the outermost precondition inwards, so the cause named is the
 * FIRST one that failed: a rule with no TypeScript fixture is not also
 * "unreported", it was never linted.
 */
const UNDRIVEN_CAUSES = {
  noTsFixture:
    'declares no TypeScript fixture, and an `as const` assertion is a TypeScript expression',
  silent: 'reports on none of its own fixtures under this harness',
  noAssertionAdded:
    'no fixture it reports on is one the `as const` fixers rewrite, so the assertion never lands on code it had an opinion about',
  lintFailedOnRewrite:
    'every assertion-carrying rewrite failed to lint, so no after-state exists to compare',
} as const;
type UndrivenCause = keyof typeof UNDRIVEN_CAUSES;

const causeOf = (rule: string): UndrivenCause | null => {
  const drive = driveByRule.get(rule)!;
  if (drive.tsCases === 0) return 'noTsFixture';
  if (drive.reporting === 0) return 'silent';
  if (drive.asserted === 0) return 'noAssertionAdded';
  if (drive.rewritten === 0) return 'lintFailedOnRewrite';
  return null;
};

/**
 * Rules this guard cannot drive, each with the measured cause.
 *
 * Nearly all are `noAssertionAdded`, which is a fact about the CORPUS and not
 * about the rule: the probe is causal — it asks what a culprit's real `--fix`
 * does to code the victim reports on — so a rule whose fixtures contain no
 * module-scope object constant, no returned object literal and no `as const`
 * array simply has no subject here. Synthesising an assertion instead would
 * answer a question no `eslint --fix` run can pose.
 *
 * Both directions and the cause itself are asserted below, so an entry cannot
 * outlive what it describes: a rule that becomes drivable fails as stale, and a
 * rule that goes dark fails as unrecorded.
 */
const UNDRIVEN: Record<string, UndrivenCause> = {
  'array-methods-this-context': 'noAssertionAdded',
  'class-methods-read-top-to-bottom': 'noAssertionAdded',
  'dynamic-https-errors': 'noAssertionAdded',
  'enforce-assert-throws': 'noAssertionAdded',
  'enforce-date-ttime': 'noAssertionAdded',
  'enforce-dynamic-file-naming': 'noAssertionAdded',
  'enforce-dynamic-imports': 'noAssertionAdded',
  'enforce-early-destructuring': 'noAssertionAdded',
  'enforce-f-extension-for-entry-points': 'noAssertionAdded',
  'enforce-fieldpath-syntax-in-docsetter': 'noAssertionAdded',
  'enforce-firestore-path-utils': 'noAssertionAdded',
  'enforce-is-prefix-validators': 'noAssertionAdded',
  'enforce-m3-sentence-case': 'noAssertionAdded',
  'enforce-realtimedb-path-utils': 'noAssertionAdded',
  'enforce-render-hits-memoization': 'noAssertionAdded',
  'enforce-serializable-params': 'noAssertionAdded',
  'enforce-single-exported-unit-per-file': 'noAssertionAdded',
  'enforce-stable-hash-spread-props': 'noAssertionAdded',
  'enforce-transform-memoization': 'noAssertionAdded',
  'enforce-typescript-markdown-code-blocks': 'noTsFixture',
  'fast-deep-equal-over-microdiff': 'noAssertionAdded',
  /**
   * Its corpus is almost entirely `const arr = []; arr.push(x)`, and
   * `global-const-style` — the only culprit that reached it — declines the
   * assertion on a binding that is mutated later, because `as const` types the
   * value `readonly` and the rewrite was turning those fixtures into TS2339
   * (#2013). No assertion lands on a fixture this rule reports on any more.
   */
  'flatten-push-calls': 'noAssertionAdded',
  'generic-starts-with-t': 'noAssertionAdded',
  'key-only-outermost-element': 'noAssertionAdded',
  'memoize-root-level-hocs': 'noAssertionAdded',
  'no-async-array-filter': 'noAssertionAdded',
  'no-async-foreach': 'noAssertionAdded',
  'no-complex-cloud-params': 'noAssertionAdded',
  'no-conditional-literals-in-jsx': 'noAssertionAdded',
  'no-fill-template-mutation': 'noAssertionAdded',
  'no-filter-without-return': 'noAssertionAdded',
  'no-firestore-jest-mock': 'noAssertionAdded',
  'no-jsx-in-hooks': 'noAssertionAdded',
  'no-jsx-whitespace-literal': 'noAssertionAdded',
  'no-memoize-on-static': 'noAssertionAdded',
  'no-misused-switch-case': 'noAssertionAdded',
  'no-passthrough-getters': 'noAssertionAdded',
  'no-portal-inside-tooltip': 'noAssertionAdded',
  'no-redundant-boolean-callback-props': 'noAssertionAdded',
  'no-res-error-status-in-onrequest': 'noAssertionAdded',
  'no-separate-loading-state': 'noAssertionAdded',
  'no-stablehash-react-nodes': 'noAssertionAdded',
  'no-try-catch-already-exists-in-transaction': 'noAssertionAdded',
  'no-unmemoized-memo-without-props': 'noAssertionAdded',
  'no-unnecessary-destructuring': 'noAssertionAdded',
  'no-unpinned-dependencies': 'noTsFixture',
  'no-unused-props': 'noAssertionAdded',
  'no-unused-usestate': 'noAssertionAdded',
  'no-useless-fragment': 'noAssertionAdded',
  'no-usememo-for-pass-by-value': 'noAssertionAdded',
  'no-uuidv4-base62-as-key': 'noAssertionAdded',
  'parallelize-loop-awaits': 'noAssertionAdded',
  'prefer-batch-operations': 'noAssertionAdded',
  'prefer-fragment-shorthand': 'noAssertionAdded',
  /**
   * The two rules below lost their only asserting culprit to #2015. Their
   * fixtures return ARRAY literals from unannotated functions (`return [cb,
   * config];`, `return [1, 2, 3];`), which `enforce-object-literal-as-const`
   * used to freeze; it declines that shape now, because the frozen arity
   * becomes part of the inferred return type and breaks the callers. No other
   * culprit reaches a fixture either rule reports on, so `asserted` measures 0.
   */
  'prefer-type-over-interface': 'noAssertionAdded',
  'prefer-use-theme': 'noAssertionAdded',
  'prefer-usecallback-over-usememo-for-functions': 'noAssertionAdded',
  'prefer-usememo-over-useeffect-usestate': 'noAssertionAdded',
  'prevent-children-clobber': 'noAssertionAdded',
  'react-usememo-should-be-component': 'noAssertionAdded',
  'require-hooks-default-params': 'noAssertionAdded',
  'require-https-error': 'noAssertionAdded',
  'require-https-error-cause': 'noAssertionAdded',
  'require-memoize-jsx-returners': 'noAssertionAdded',
  'require-migration-script-metadata': 'noAssertionAdded',
  'require-props-composition': 'noAssertionAdded',
  'test-file-location-enforcement': 'noAssertionAdded',
  'use-custom-memo': 'noAssertionAdded',
  'use-custom-router': 'noAssertionAdded',
};

const measuredUndriven: Record<string, UndrivenCause> = Object.fromEntries(
  victims
    .map((rule) => [rule, causeOf(rule)] as const)
    .filter(
      (entry): entry is readonly [string, UndrivenCause] => entry[1] !== null,
    ),
);

/** The rows that CAN fail: every rule a culprit's `--fix` actually reached. */
const drivenVictims = victims.filter((rule) => !causeOf(rule));

/**
 * A skipped row, titled with the rule and the measured reason. Jest renders
 * these as `○ skipped`, which is the point: a rule the probe never drove must
 * be visibly absent from the result rather than indistinguishable from a clean
 * one.
 */
const skipTitles = victims
  .map((rule) => [rule, causeOf(rule)] as const)
  .filter((entry): entry is readonly [string, UndrivenCause] => !!entry[1])
  .map(([rule, cause]) => `${rule} — NOT DRIVEN: ${UNDRIVEN_CAUSES[cause]}`);

/**
 * Rules whose silence under an assertion is correct, not a defect.
 *
 * Asserted in BOTH directions below: a rule that stops appearing must be
 * removed, and a new one must be added consciously. A one-way list would let a
 * fresh defect hide under an entry written for something else.
 */
const EXEMPT: Record<string, string> = {
  // `as const` and `satisfies T` are CHECKED assertions — TypeScript still
  // validates the literal against the declared return type — so no hazard is
  // hidden and the rule is right to stay silent. It still reports the unchecked
  // `as T` cast, which is what it exists to catch. Whether `useExplicitVariable`
  // should fire anyway is the human-labelled design call #1615; see #1808.
  'no-type-assertion-returns': 'checked assertion, tracked as #1615/#1808',
  // `as const` on a values array is a checked NARROWING, not a laundering: it
  // turns `(typeof KINDS)[number]` from `string` into the literal union, which
  // makes an indexed lookup keyed by that alias compiler-bounded — the #1875
  // carve-out then correctly stops demanding assertSafe. The silence is the
  // carve-out working on a genuinely changed type, not a hazard hidden behind
  // an assertion; the un-narrowed spelling keeps its report, which is the
  // fixture that drives this row.
  'enforce-assert-safe-object-key':
    'as const genuinely closes the key domain the #1875 carve-out reads',
};

/**
 * Rules whose silence under an assertion is a real DEFECT, recorded so the
 * suite stays actionable while each one is filed and fixed. Distinct from
 * `EXEMPT` on purpose: an entry here is a bug with an owner, not a design call,
 * and merging the two would let a defect retire quietly under a "correct
 * silence" label.
 *
 * Surfaced by the #1859 widening — these rules were never probed because the
 * type-aware exclusion dropped them wholesale.
 */
const KNOWN_DEFECTS: Record<string, string> = {};

/** Both lists at once: the suite flags exactly the rules recorded here. */
const ACCEPTED: Record<string, string> = { ...EXEMPT, ...KNOWN_DEFECTS };

const reportOf = (rule: string) =>
  findings
    .filter((f) => f.rule === rule)
    .map(
      (f) =>
        `${f.messageId} lost to an assertion a sibling fixer added\n` +
        `src/tests/${f.origin} as ${f.filename}\n` +
        `--- before --fix ---\n${f.before}\n--- after --fix ---\n${f.after}`,
    )
    .join('\n\n');

// ---------------------------------------------------------------------------
// Controls. A zero over the real rules asserts nothing without these.
// ---------------------------------------------------------------------------

const CONTROLS = [
  {
    // Classifies on a bare node type, so the assertion hides the literal.
    name: 'control-asconst-blind',
    expect: true,
    rule: {
      meta: { type: 'problem', schema: [], messages: { m: 'no margin' } },
      create(context: any) {
        return {
          VariableDeclarator(node: any) {
            if (node.init?.type !== 'ObjectExpression') return;
            context.report({ node, messageId: 'm' });
          },
        };
      },
    },
  },
  {
    // Sees through the assertion, so it must NOT be flagged — without this the
    // guard would pass while flagging every rule that merely reports twice.
    name: 'control-asconst-transparent',
    expect: false,
    rule: {
      meta: { type: 'problem', schema: [], messages: { m: 'no margin' } },
      create(context: any) {
        const unwrap = (node: any) => {
          let current = node;
          while (
            current &&
            (current.type === 'TSAsExpression' ||
              current.type === 'TSSatisfiesExpression' ||
              current.type === 'TSNonNullExpression' ||
              current.type === 'TSTypeAssertion')
          ) {
            current = current.expression;
          }
          return current;
        };
        return {
          VariableDeclarator(node: any) {
            if (unwrap(node.init)?.type !== 'ObjectExpression') return;
            context.report({ node, messageId: 'm' });
          },
        };
      },
    },
  },
  {
    /**
     * The PARTIAL loss, which is the granularity this guard reads at.
     *
     * Same blind classifier as the first control, driven over a fixture with
     * two subjects where the assertion only reaches one. Both reports carry the
     * same messageId, so a set-differencing comparison sees `{m}` on both sides
     * and finds nothing — which is exactly how a rule losing 2 of its 3 reports
     * stayed green here (#2007, #2010). Only a count catches it.
     */
    name: 'control-asconst-partial',
    expect: true,
    code:
      'export const styles = { margin: 8 };\n' +
      'export function build() {\n' +
      '  const local = { padding: 4 };\n' +
      '  return local;\n' +
      '}\n',
    rule: {
      meta: { type: 'problem', schema: [], messages: { m: 'no margin' } },
      create(context: any) {
        return {
          VariableDeclarator(node: any) {
            if (node.init?.type !== 'ObjectExpression') return;
            context.report({ node, messageId: 'm' });
          },
        };
      },
    },
  },
] as const;

for (const control of CONTROLS) {
  linter.defineRule(PREFIX + control.name, control.rule as never);
}

/** A module-scope object constant, which `global-const-style` rewrites. */
const CONTROL_CODE = 'export const styles = { margin: 8 };\n';

const controlCaseFor = (code: string): FixtureCase => ({
  code,
  tester: 'ruleTesterTs',
  origin: 'planted control',
  bucket: 'invalid',
});

console.log(
  [
    `[asconst-composition] ${victims.length} victims, ` +
      `${casesRewritten} cases rewritten by a culprit --fix`,
    `  ${findings.length} finding(s) across ${flaggedRules.length} rule(s)`,
    `  ${drivenVictims.length} victim(s) driven, ` +
      `${skipTitles.length} named skip(s)`,
  ].join('\n'),
);

describe("a sibling fixer's assertion must not silence a rule", () => {
  it('rewrites enough cases to make a zero mean something', () => {
    expect(corpus.failures).toEqual([]);
    expect(victims.length).toBeGreaterThan(150);
    /**
     * The floor sits on cases a culprit ACTUALLY rewrote, not on cases
     * considered. Only a rewrite can produce a finding, so a collapse here —
     * a culprit losing its fixer, say — would make every assertion below pass
     * while examining nothing.
     */
    expect(casesRewritten).toBeGreaterThan(200);
    /**
     * …and a second floor on the rows that can actually fail. The count above
     * survives intact even if every rewrite piles onto a handful of rules,
     * which is exactly the state in which most per-rule rows go vacuous.
     */
    expect(drivenVictims.length).toBeGreaterThan(90);
  });

  /**
   * The culprit POPULATION, closed by measurement in both directions.
   *
   * Everything else here asks whether a victim survives the perturbation; none
   * of it can ask whether the perturbation is ever applied. A culprit missing
   * from the list is not under-probed, it is unprobed — its assertion is never
   * written, so every victim passes against a rewrite that never happened. The
   * hand-written list named three and had been wrong since the guard shipped:
   * `enforce-global-constants` and `prefer-clone-deep` also append one, the
   * latter emitting `cloneDeep(x, {…} as const)` outright.
   *
   * Token count rather than presence: a fixer that merely preserves an
   * assertion it found is not writing one, and counting presence would enroll
   * it, diluting the floors above with a culprit that perturbs nothing.
   */
  it('declares exactly the recommended fixers that measurably append an `as const`', () => {
    const assertions = (text: string) =>
      (text.match(/\bas const\b/g) || []).length;
    const enabled = new Set(
      Object.keys(plugin.configs.recommended.rules).map((id) =>
        id.replace(PREFIX, ''),
      ),
    );
    const appends = (name: string, testCase: FixtureCase): boolean => {
      try {
        const fixed = linter.verifyAndFix(
          testCase.code,
          configWith(testCase, {
            [PREFIX + name]: severityWithOptions(testCase),
          }),
          { filename: defaultFilenameFor(testCase) },
        );
        return (
          fixed.fixed && assertions(fixed.output) > assertions(testCase.code)
        );
      } catch {
        return false;
      }
    };

    const measured = Object.entries(plugin.rules)
      .filter(
        ([name, rule]) => rule.meta?.fixable === 'code' && enabled.has(name),
      )
      .filter(([name]) =>
        (corpus.byRule.get(name) || [])
          .filter((testCase) => testCase.language === 'ts')
          .some((testCase) => appends(name, testCase)),
      )
      .map(([name]) => name)
      .sort();

    // Non-vacuity: a harness that stopped fixing would measure the empty set
    // and quietly agree with an empty CULPRITS.
    expect(measured.length).toBeGreaterThan(2);
    expect(measured).toEqual([...CULPRITS].sort());
  });

  it('flags exactly the rules whose silence is a filed decision', () => {
    expect(flaggedRules).toEqual(Object.keys(ACCEPTED).sort());
  });

  /**
   * The non-TypeScript skip, both ways. An unlisted rule whose fixtures get
   * skipped is a silent loss of coverage; a listed rule whose fixtures stop
   * being skipped is a dead entry that would absorb the next one. The count
   * floor keeps the set equality from passing vacuously.
   */
  it('skips only the named non-TypeScript fixtures', () => {
    expect([...rulesWithNonTypeScriptFixtures].sort()).toEqual(
      Object.keys(NON_TYPESCRIPT_FIXTURES).sort(),
    );
    expect(nonTypeScriptSkipped).toBeGreaterThan(0);
  });

  /**
   * Two-way accounting for the skipped rows, cause included.
   *
   * A rule that becomes drivable fails as a stale entry; a rule that stops
   * being drivable fails as an unrecorded skip; and a rule that stays dark for
   * a DIFFERENT reason fails too, because the recorded cause is the claim being
   * made about it and a changed cause is a changed claim.
   */
  it('accounts for every victim this guard cannot drive', () => {
    expect(measuredUndriven).toEqual(UNDRIVEN);
  });

  it('explains every cause it records, for victims that exist', () => {
    expect(
      Object.values(UNDRIVEN).filter((cause) => !UNDRIVEN_CAUSES[cause]),
    ).toEqual([]);
    // An entry naming a rule outside the victim set is never measured by the
    // assertion above, so it would sit there forever absorbing the next one.
    const known = new Set(victims);
    expect(Object.keys(UNDRIVEN).filter((rule) => !known.has(rule))).toEqual(
      [],
    );
  });

  it.each(drivenVictims.filter((rule) => !(rule in ACCEPTED)))('%s', (rule) => {
    // The row asserts it did work before it asserts a zero: an `expect('')
    // .toBe('')` over a rule no culprit ever rewrote is a green row that
    // validated nothing (#1861).
    expect(driveByRule.get(rule)!.rewritten).toBeGreaterThan(0);
    expect(reportOf(rule)).toBe('');
  });

  if (skipTitles.length) {
    it.skip.each(skipTitles)('%s', () => undefined);
  }
});

describe('the detector is load-bearing', () => {
  it.each(
    CONTROLS.map(
      (c) =>
        [c.name, c.expect, ('code' in c && c.code) || CONTROL_CODE] as const,
    ),
  )('control %s yields %s', (name, expected, code) => {
    const result = probeCase(name, controlCaseFor(code));
    // A control the probe never actually rewrote would prove nothing.
    expect(result.rewritten).toBe(1);
    expect(result.findings.length > 0).toBe(expected);
  });

  /**
   * The partial control must be partial. If the assertion happened to reach
   * BOTH of its subjects the row above would still pass, but it would be
   * re-testing the total-loss case the first control already covers, and the
   * counting granularity this guard now reads at would go unexercised.
   */
  it('loses only part of the partial control, which a set comparison cannot see', () => {
    const partial = CONTROLS.find((c) => c.name === 'control-asconst-partial')!;
    const code = ('code' in partial && partial.code) || CONTROL_CODE;
    const testCase = controlCaseFor(code);
    const filename = defaultFilenameFor(testCase);
    const before = reportsOf(partial.name, code, testCase, filename)!;
    const rewritten = afterCulpritFix(testCase, filename)!;
    const after = reportsOf(partial.name, rewritten, testCase, filename)!;

    expect(before.get('m')).toBe(2);
    expect(after.get('m')).toBe(1);
    // The messageId survives on both sides, so set-differencing finds nothing —
    // the exact blindness this change removes.
    expect([...before.keys()].filter((id) => !after.has(id))).toEqual([]);
  });
});

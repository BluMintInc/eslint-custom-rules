/**
 * Two rules that share a contract must not disagree about the same text.
 *
 * The question, which nothing else in the suite asks: does a rule's own `valid`
 * fixture — the shape it explicitly BLESSES, written to sit on its carve-out
 * boundary — get reported by a SIBLING rule under the recommended config?
 *
 * That is a STATIC disagreement, with no fixer involved, which is why the
 * fix-closure guards cannot see it: `recommended-config-fix-closure` and
 * `fix-closure-core-rules` both ask "did a FIX introduce a violation", over docs
 * fences; `exemption-composition-closure` composes the whole config but re-lints
 * with the SAME rule, so it never asks what a sibling thinks. The axis produced
 * #1840, #1841, #1842 and #1843.
 *
 * SCOPE — documented pairs only. The unrestricted probe produces 25,521
 * findings over 1,834 pairs on 9,934 cases, and that is not gateable: the
 * overwhelming majority are fixtures written without regard to sibling rules (an
 * `enforce-serializable-params` fixture trips `enforce-exported-function-types`
 * on every one of its cases purely because its author did not annotate returns).
 * A spelling satisfying both exists, so those are not contradictions. The
 * gateable unit is the pair rule A's SOURCE names rule B — the recorded tell of
 * a contract-sharing pair (`contract-sharing-rules-cascade`). Both directions of
 * a mention are checked, since either rule's fixtures can be the ones the
 * sibling reports on.
 *
 * SHAPE — three-way accounting, the healthiest guard shape in this repo:
 *
 *   - a documented pair NOT in `KNOWN_DIVERGENT` may not diverge (a new
 *     contradiction, or a newly-added cross-rule reference, fails the build);
 *   - a pair IN `KNOWN_DIVERGENT` MUST still diverge, so fixing one and leaving
 *     the entry behind fails too. A dead exemption is what masks the next
 *     regression (#1839).
 *
 * The key is the PAIR (`owner::reporter`), never the rule. A rule-keyed entry
 * would un-gate every other pair that rule participates in — the #1839 lesson,
 * where three rule-keyed exemptions hid three reverted fixes. Each entry then
 * pins the FIXTURE COUNT per messageId, and that third direction is asserted
 * too, because the pair alone is still not fine enough: see the mutation audit
 * below, where two of the four cited fixes are invisible without it.
 *
 * MUTATION AUDIT — every cited fix reverted in turn, guard re-run:
 *
 *   #1840 (enforce-querykey-ts resolver) RED. The count on
 *     `prefer-global-router-state-key::enforce-querykey-ts` moves
 *     `enforceQueryKeyConstant` 1 -> 2. The pair was ALREADY diverging on other
 *     fixtures, so a pair-level key stays green; this is what forced the count.
 *   #1841 (enforce-global-constants remedy) RED.
 *     `react-memoize-literals::enforce-global-constants` moves from
 *     `{declareMemoDependency: 8, useGlobalConstant: 2}` to
 *     `{useGlobalConstant: 10}` — the impossible hoisting advice, back on all 10.
 *   #1842 (enforce-querykey-ts report site) RED. The same pair loses a fixture,
 *     `enforceQueryKeyImport` 5 -> 4. A false negative reintroduced shows up as
 *     a disagreement that SHRANK, which is why the counts are exact rather than
 *     a ceiling.
 *   #1843 (enforce-dynamic-file-naming directives) RED both ways. Reverting the
 *     rule source alone trips the SELF-CONTROL (6 of its own valid fixtures
 *     report under it). Reverting the fixtures the fix also rewrote — the inert
 *     `ednl` / line-comment spellings that the whole defect was about — trips the
 *     primary test, naming `enforce-dynamic-file-naming::require-dynamic-firebase-imports`.
 *
 * TRIAGE, before filing anything this guard reports: a disagreement is only a
 * defect if NO spelling satisfies both rules. Run the input through
 * `Linter.verifyAndFix` with both rules enabled — sibling rules here are usually
 * sequential steps of one pipeline (`useMemo` -> `useCallback` ->
 * `useLatestCallback`) that `--fix` converges. That question killed 7 of the 9
 * pairs triaged when this axis was opened.
 *
 * Traps this harness encodes, each of which faked a result before it did:
 *
 *   - INLINE DIRECTIVES ARE REWRITTEN to the `@blumintinc/blumint/` id. Fixtures
 *     write `// eslint-disable-next-line <rule>` with a BARE name, because that
 *     is what `RuleTester` registers; under the real prefix a bare directive
 *     matches nothing and the rule reports anyway. That was 26 of 37
 *     self-control failures. It is NOT solved by registering bare ids, which
 *     breaks every directive that does name the prefixed id (over-counts ~3x).
 *   - SELF-CONTROL: a `valid` fixture must be silent under its OWN rule. If it
 *     is not, the filename/options/parser plumbing is wrong and every cross-rule
 *     count is fabricated. Type-aware rules (no program under a bare `Linter`)
 *     and `test-file-location-enforcement` (decides purely on the file path,
 *     which is synthetic here) are the only legitimate residue; both are counted
 *     separately rather than folded into the control they would otherwise break.
 *   - `test-file-location-enforcement` is excluded as a REPORTER for the same
 *     reason: its reports are by design (~168 on the consumer mainline) and say
 *     nothing about the snippet.
 *   - `m.ruleId` is filtered against the ids actually enabled for the lint, not
 *     merely truthiness. A fatal parse carries no `ruleId` and would otherwise
 *     read as silence, so fatals are counted and asserted at zero.
 *   - `invalid` fixtures are skipped: they are EXPECTED to report.
 *
 * OFF/ABSENT RULES are excluded as REPORTERS — a rule the consumer never runs
 * cannot manufacture a report, so it cannot contradict anything. They are KEPT
 * as owners, which is a deliberate departure from the original sketch: a
 * fixture is just text, and a sibling the consumer DOES run reporting on the
 * shape another plugin rule blesses is a genuine disagreement between two rules
 * of this plugin whether or not the blessing rule ships enabled. #1843 is the
 * proof — `enforce-dynamic-file-naming` is absent from `recommended`, and
 * excluding it as an owner leaves this guard green across that fix's revert
 * (measured, not assumed).
 */
import fs from 'fs';
import path from 'path';
import { Linter, Rule } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import {
  harvestFixtureCorpus,
  defaultFilenameFor,
  parserOptionsFor,
  severityWithOptions,
  ruleNameByIdentity,
  typeAwareRuleNames,
  FixtureCase,
} from '../utils/fixtureCorpus';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as {
  rules: Record<string, unknown>;
  configs: { recommended: { rules: Record<string, unknown> } };
};
/* eslint-enable @typescript-eslint/no-var-requires */

const PREFIX = '@blumintinc/blumint/';
const RULES_DIR = path.join(__dirname, '..', 'rules');

type Exemption = {
  reason: string;
  /** Diverging fixture count per messageId the reporter emits on this pair. */
  cases: Record<string, number>;
};

/**
 * Documented pairs that disagree today, keyed `owner::reporter` — the owner
 * blesses the text, the reporter reports on it.
 *
 * AN ENTRY IS NOT A WAY TO MAKE A BUILD GREEN. It records a disagreement
 * someone established is acceptable, with the reason. Three reasons recur, and
 * each says a satisfying spelling exists, which is what makes it not a
 * contradiction:
 *
 *   - PIPELINE: the two rules are sequential steps of one migration, so the
 *     earlier one's fixture is the later one's input and the config's own
 *     multi-pass `--fix` converges. Stated with the measured ratio.
 *   - HANDOFF: the owner deliberately declines and the sibling owns the shape,
 *     usually said out loud in one of the two rule sources.
 *   - INCIDENTAL: the sibling objects to a detail the fixture did not set out
 *     to pin (a package specifier, a name, a missing `as const`). Every one of
 *     these carries a spelling measured clean under BOTH rules.
 *
 * `cases` is not decoration. A pair-level key alone would let a NEW fixture
 * join an already-exempted disagreement in silence, which is exactly what
 * #1840 was: `enforce-querykey-ts` began reporting `enforceQueryKeyConstant` on
 * one more of `prefer-global-router-state-key`'s valid fixtures, inside a pair
 * that was already diverging on other cases. Reverting that fix moves this
 * entry's `enforceQueryKeyConstant` from 1 to 2 and nothing coarser can see it
 * (measured). The counts are checked EXACTLY in both directions, so a
 * disagreement that shrinks — a fix landing, or a false negative reintroduced,
 * which is #1842 — fails just as loudly as one that grows.
 *
 * When a count changes, the fix is never to bump the number: read the fixture
 * the failure prints, ask whether any spelling satisfies both rules, and only
 * then update the entry and say what changed.
 */
const KNOWN_DIVERGENT: Record<string, Exemption> = {
  'enforce-boolean-naming-prefixes::no-explicit-return-type': {
    reason:
      'PIPELINE: the fixtures annotate an inferable return only to display the boolean under test; `--fix` strips it on 44 of 49 and the prefix check reads the name either way.',
    cases: { noExplicitReturnTypeInferable: 49 },
  },
  'enforce-centralized-mock-firestore::global-const-style': {
    reason:
      'PIPELINE: the mock fixtures declare module-scope consts without `as const` or SCREAMING_SNAKE; `--fix` supplies both on all 9 and centralization is untouched.',
    cases: { asConst: 9, upperSnakeCase: 9 },
  },
  'enforce-dynamic-file-naming::enforce-dynamic-imports': {
    reason:
      'INCIDENTAL: the `.dynamic.ts` fixtures carry a directive for `require-dynamic-firebase-imports` only, so their static `firebase/auth` import still trips the bundle-size rule; naming both rules in one directive is clean under both (measured).',
    cases: { dynamicImportRequired: 6 },
  },
  'enforce-exported-function-types::require-memo': {
    reason:
      'PIPELINE: the fixtures export unmemoized components to exercise the props-type check; `--fix` wraps 10 of 12 in `memo()`, and the `forwardRef`/named-function pair is memoizable by hand.',
    cases: { requireMemo: 12 },
  },
  'enforce-firestore-doc-ref-generic::no-explicit-return-type': {
    reason:
      'INCIDENTAL: the fixtures annotate `DocumentReference<T>` returns to display the generic under test; the annotation is inferable, and deleting it leaves the generic check unchanged.',
    cases: { noExplicitReturnTypeInferable: 6 },
  },
  'enforce-firestore-doc-ref-generic::prefer-type-over-interface': {
    reason:
      'PIPELINE: the fixtures declare their models with `interface`; `--fix` converts all 77 to `type`, which the generic check reads identically.',
    cases: { preferType: 77 },
  },
  'enforce-global-constants::react-memoize-literals': {
    reason:
      'HANDOFF: the fixtures declare component-scope literals that close over nothing, which `react-memoize-literals` owns; hoisting one to module scope — the remedy `enforce-global-constants` itself names — is clean under both (measured).',
    cases: { componentLiteral: 6, hookReturnLiteral: 4 },
  },
  'enforce-memoize-async::enforce-dynamic-imports': {
    reason:
      "INCIDENTAL: the fixtures carry an unrelated static `import { something } from 'lib'` beside the decorator under test; without it both are silent (measured), and the decorator package itself is on `DEFAULT_IGNORED_LIBRARIES`.",
    cases: { dynamicImportRequired: 6 },
  },
  'enforce-memoize-async::no-explicit-return-type': {
    reason:
      'PIPELINE: the fixtures annotate an inferable `Promise<T>` return; `--fix` strips 12 of 13 and the decorator requirement is unaffected.',
    cases: { noExplicitReturnTypeInferable: 13 },
  },
  'enforce-memoize-getters::enforce-dynamic-imports': {
    reason:
      'INCIDENTAL: the fixtures import the UPSTREAM `typescript-memoize`; the fork this plugin injects, `@blumintinc/typescript-memoize`, is on `DEFAULT_IGNORED_LIBRARIES` and clean under both (measured).',
    cases: { dynamicImportRequired: 6 },
  },
  'enforce-microdiff::enforce-dynamic-imports': {
    reason:
      "INCIDENTAL: the surviving fixture keeps an unrelated `import _ from 'lodash'` for the `_.difference` call the microdiff fixer deliberately declines; dropping it is clean under both (measured). Was 2 — the `fast-deep-equal/es6` SUBPATH half was FIXED in #1845, where an `ignoredLibraries` entry began covering the package's subpaths.",
    cases: { dynamicImportRequired: 1 },
  },
  'enforce-mock-firestore::enforce-object-literal-as-const': {
    reason:
      'PIPELINE: the mock payload literals lack `as const`; `--fix` supplies it on all 5 without changing which module the mock comes from.',
    cases: { enforceAsConst: 5 },
  },
  'enforce-positive-naming::no-explicit-return-type': {
    reason:
      'PIPELINE: the fixtures annotate an inferable boolean return to display the name under test; `--fix` strips all 6.',
    cases: { noExplicitReturnTypeInferable: 6 },
  },
  'enforce-props-argument-name::enforce-props-naming-consistency': {
    reason:
      'INCIDENTAL: the fixture names a constructor parameter `panelSettings` to exercise the class carve-out; the sibling asks for `props`, which is clean under both (measured).',
    cases: { usePropsName: 1 },
  },
  'enforce-props-naming-consistency::enforce-props-argument-name': {
    reason:
      'PIPELINE: `--fix` renames the parameter on all 3 fixtures, after which both rules agree.',
    cases: { usePropsParameterName: 1, usePropsParameterNameWithPrefix: 2 },
  },
  'enforce-querykey-ts::prefer-global-router-state-key': {
    reason:
      'HANDOFF: the fixtures feed `useRouterState` degenerate keys (empty and `-` templates) to pin the query-key parser; the sibling owns "the key must come from the global module", and an imported `QUERY_KEY_*` constant is clean under both (measured).',
    cases: { invalidQueryKeySource: 12, preferGlobalRouterStateKey: 15 },
  },
  'enforce-react-type-naming::global-const-style': {
    reason:
      'INCIDENTAL: the fixtures put a JSX-typed value in a camelCase module-scope const to display the TYPE annotation under test; SCREAMING_SNAKE satisfies both, and `--fix` reaches 6 of 17.',
    cases: { asConst: 3, upperSnakeCase: 17 },
  },
  'enforce-render-hits-memoization::no-empty-dependency-use-callbacks': {
    reason:
      'PIPELINE: `--fix` migrates 10 of 12 to a spelling both accept; the remaining two are module-scope `useLatestCallback` calls the sibling asks to be extracted into a component-scope utility, which is clean under both (measured).',
    cases: { preferUtilityFunction: 8, preferUtilityLatest: 4 },
  },
  'enforce-render-hits-memoization::use-latest-callback': {
    reason:
      'PIPELINE: sequential steps of the callback migration; `--fix` converges to `useLatestCallback`.',
    cases: { useLatestCallback: 1 },
  },
  'enforce-safe-stringify::enforce-dynamic-imports': {
    reason:
      "INCIDENTAL: the fixed output carries an unrelated static `import ... from 'other-module'` beside the stringify call; without it both are silent (measured).",
    cases: { dynamicImportRequired: 1 },
  },
  'enforce-transform-memoization::use-latest-callback': {
    reason:
      'PIPELINE: sequential steps of the callback migration; `--fix` converges to `useLatestCallback` on all 6.',
    cases: { useLatestCallback: 6 },
  },
  'enforce-verb-noun-naming::no-explicit-return-type': {
    reason:
      'PIPELINE: the fixtures annotate an inferable return beside the name under test; `--fix` strips both.',
    cases: { noExplicitReturnTypeInferable: 2 },
  },
  'firestore-transaction-reads-before-writes::enforce-assert-safe-object-key': {
    reason:
      'PIPELINE: the fixtures index an object with a raw key beside the read/write ordering under test; `--fix` wraps both in `assertSafe`.',
    cases: { useAssertSafe: 2 },
  },
  'logical-top-to-bottom-grouping::enforce-object-literal-as-const': {
    reason:
      'PIPELINE: the fixtures pin statement ORDER and their object literals lack `as const`, which `--fix` supplies on all 3.',
    cases: { enforceAsConst: 3 },
  },
  'logical-top-to-bottom-grouping::global-const-style': {
    reason:
      'PIPELINE: the fixtures pin statement ORDER and name their module-scope consts lowercase incidentally; `--fix` supplies `as const`/SCREAMING_SNAKE on 51 of 65, the rest by hand.',
    cases: { asConst: 51, upperSnakeCase: 65 },
  },
  'logical-top-to-bottom-grouping::parallelize-async-operations': {
    reason:
      'PIPELINE: the ordering fixtures await sequentially; `--fix` parallelizes both without disturbing the grouping under test.',
    cases: { parallelizeAsyncOperations: 2 },
  },
  'memo-nested-react-components::require-memo': {
    reason:
      'PIPELINE: the fixtures declare unmemoized OUTER components around the nested one under test; `--fix` wraps 6 of 7 in `memo()`.',
    cases: { requireMemo: 7 },
  },
  'memo-nested-react-components::use-custom-memo': {
    reason:
      'PIPELINE: the fixtures import `memo` from `react`; `--fix` redirects all 4 to the repo wrapper.',
    cases: { useCustomMemo: 4 },
  },
  'no-direct-function-state::no-type-assertion-returns': {
    reason:
      'INCIDENTAL: the fixture returns `null as unknown as ToClose` to keep the state type UNRESOLVABLE, which is the carve-out under test; returning a typed local instead keeps the type local and is clean under both (measured).',
    cases: { noTypeAssertionReturns: 1 },
  },
  'no-explicit-return-type::enforce-boolean-naming-prefixes': {
    reason:
      'INCIDENTAL: the fixture declares `static readonly seed: boolean` beside the static-block returns under test; `isSeed` is clean under both (measured).',
    cases: { missingBooleanPrefix: 1 },
  },
  'no-explicit-return-type::enforce-memoize-async': {
    reason:
      'PIPELINE: the fixtures declare an async class method beside the annotation under test; `--fix` adds the `@Memoize()` decorator on all 3.',
    cases: { requireMemoize: 3 },
  },
  'no-explicit-return-type::enforce-verb-noun-naming': {
    reason:
      'INCIDENTAL: the fixtures name functions with bare nouns (`factorial`) to display the return annotation under test; a verb phrase (`computeFactorial`) is clean under both (measured).',
    cases: { functionVerbPhrase: 24 },
  },
  'no-explicit-return-type::prefer-type-over-interface': {
    reason:
      'PIPELINE: the fixtures declare `interface` shapes beside the annotation under test; `--fix` converts all 5.',
    cases: { preferType: 5 },
  },
  'no-firestore-object-arrays::prefer-union-from-const-array': {
    reason:
      'CO-DESIGNED: `no-firestore-object-arrays` recognizes `(typeof VALUES)[number]` precisely because that is what this sibling autofixes toward, and says so in its own source; `--fix` converges on all 5.',
    cases: { preferDerivedUnion: 5 },
  },
  'no-margin-properties::global-const-style': {
    reason:
      'PIPELINE: the style-object fixtures sit in lowercase module-scope consts; `--fix` supplies `as const`/SCREAMING_SNAKE on all 9.',
    cases: { asConst: 5, upperSnakeCase: 9 },
  },
  'no-redundant-usecallback-wrapper::use-latest-callback': {
    reason:
      'PIPELINE: sequential steps of one migration (`useMemo` -> `useCallback` -> `useLatestCallback`); multi-pass `--fix` converges on all 59 with both rules silent.',
    cases: { useLatestCallback: 59 },
  },
  'no-render-function-components::no-jsx-in-hooks': {
    reason:
      "HANDOFF: the fixture is a `useRender*` hook returning JSX, a shape `no-render-function-components` deliberately excludes and names as `no-jsx-in-hooks`' domain in a source comment; a memoized component satisfies both (measured).",
    cases: { noJsxInHooks: 1 },
  },
  'no-render-function-components::require-memo': {
    reason:
      'PIPELINE: the fixtures declare unmemoized components around the `render*` function under test; `--fix` wraps them and `require-memo` goes silent on all 4.',
    cases: { requireMemo: 4 },
  },
  'no-unnecessary-destructuring-rename::global-const-style': {
    reason:
      'PIPELINE: the rename fixtures build lowercase module-scope consts; `--fix` supplies `as const`/SCREAMING_SNAKE on all 20.',
    cases: { asConst: 18, upperSnakeCase: 20 },
  },
  'no-unnecessary-verb-suffix::enforce-object-literal-as-const': {
    reason:
      'PIPELINE: the fixtures return object literals without `as const`; `--fix` supplies it on all 4.',
    cases: { enforceAsConst: 4 },
  },
  'no-unnecessary-verb-suffix::prefer-type-over-interface': {
    reason:
      'PIPELINE: the fixtures declare `interface` service shapes to carry the method names under test; `--fix` converts all 39.',
    cases: { preferType: 39 },
  },
  'optimize-object-boolean-conditions::enforce-boolean-naming-prefixes': {
    reason:
      'INCIDENTAL: the fixtures name a boolean `loading` to display the condition under test; `isLoading` is clean under both (measured).',
    cases: { missingBooleanPrefix: 2 },
  },
  'optimize-object-boolean-conditions::global-const-style': {
    reason:
      'PIPELINE: the condition fixtures sit in lowercase module-scope consts; `--fix` renames all 9.',
    cases: { asConst: 1, upperSnakeCase: 9 },
  },
  'prefer-field-paths-in-transforms::enforce-object-literal-as-const': {
    reason:
      'PIPELINE: the transform fixtures return object literals without `as const`; `--fix` supplies it and the sibling goes silent on all 18.',
    cases: { enforceAsConst: 18 },
  },
  'prefer-flat-transform-each-keys::enforce-object-literal-as-const': {
    reason:
      'PIPELINE: the same shape — `--fix` adds `as const` to all 4 transform literals.',
    cases: { enforceAsConst: 4 },
  },
  'prefer-global-router-state-key::enforce-querykey-ts': {
    reason:
      'HANDOFF: the fixtures pin this rule\'s own carve-outs (an optional-chained template key, a shadowed local constant, an import written after its use); `enforce-querykey-ts` owns "the key must be imported from `queryKeys`", and an imported `QUERY_KEY_*` constant is clean under both (measured). The `enforceQueryKeyConstant` count is the #1840 tripwire: reverting that fix takes it from 1 to 2.',
    cases: { enforceQueryKeyConstant: 1, enforceQueryKeyImport: 5 },
  },
  'prefer-spread-over-reassembly::enforce-object-literal-as-const': {
    reason:
      "INCIDENTAL: the fixture's fixed output asserts `as Pair`, which the literal rule does not accept in place of `as const`; writing `as const` is clean under both (measured).",
    cases: { enforceAsConst: 1 },
  },
  'prefer-usecallback-over-usememo-for-functions::use-latest-callback': {
    reason:
      'PIPELINE: sequential steps of one migration (`useMemo` -> `useCallback` -> `useLatestCallback`); multi-pass `--fix` converges and the sibling is silent on all 34.',
    cases: { useLatestCallback: 34 },
  },
  'prefer-utility-function-own-file::semantic-function-prefixes': {
    reason:
      'INCIDENTAL: the fixture names its utility `processData` to exceed the size threshold under test; `transformData` is clean under both (measured).',
    cases: { avoidGenericPrefix: 1 },
  },
  'react-memoize-literals::enforce-global-constants': {
    reason:
      'HANDOFF: the fixtures memoize component literals; `react-memoize-literals` says in its own source that hoisting is the correct branch when nothing is closed over, and the hoisted spelling is clean under both (measured). The `declareMemoDependency` count is #1841 in place — before that fix all 10 drew `useGlobalConstant`, hoisting advice a literal closing over a prop cannot follow.',
    cases: { declareMemoDependency: 8, useGlobalConstant: 2 },
  },
  'require-memo::enforce-exported-function-types': {
    reason:
      'INCIDENTAL: the fixed output exports a component whose props type the snippet references but never declares; declaring and exporting it is clean under both (measured).',
    cases: { missingExportedPropsType: 1 },
  },
  'require-memo::memo-nested-react-components': {
    reason:
      'HANDOFF: `require-memo` declines for a component declared inside a render body and names `memo-nested-react-components` as its owner in a source comment; memoizing the nested component is clean under both (measured).',
    cases: { memoizeNestedComponent: 3 },
  },
  'require-memo::no-render-function-components': {
    reason:
      'HANDOFF: `require-memo` treats a lowercase `render*` function as not-a-component and declines; `no-render-function-components` claims exactly that name shape in its own source, and a PascalCase memoized component is clean under both (measured).',
    cases: { renderFunctionComponent: 4 },
  },
  'require-memoize-jsx-returners::enforce-dynamic-imports': {
    reason:
      'INCIDENTAL: the fixtures import the UPSTREAM `typescript-memoize`; the injected fork `@blumintinc/typescript-memoize` is on `DEFAULT_IGNORED_LIBRARIES` and clean under both (measured).',
    cases: { dynamicImportRequired: 3 },
  },
  'require-props-composition::memo-nested-react-components': {
    reason:
      'HANDOFF: the fixture nests a zero-prop child inside the component that renders it — a shape `require-props-composition` anchors its scope on precisely because `memo-nested-react-components` ships as an error; hoisting the child is clean under both (measured).',
    cases: { memoizeNestedComponent: 2 },
  },
  'use-latest-callback::enforce-dynamic-imports': {
    reason:
      'INCIDENTAL: the fixture imports `useCallback` from `some-other-package` to prove the rule ignores non-React sources; the migrated `use-latest-callback` import is on `DEFAULT_IGNORED_LIBRARIES` and clean under both (measured).',
    cases: { dynamicImportRequired: 2 },
  },
};

const registeredNames = [...ruleNameByIdentity.values()].sort();

/** Only what a consumer actually runs may act as a REPORTER. */
const ENABLED = new Map<string, unknown>();
for (const [id, severity] of Object.entries(plugin.configs.recommended.rules)) {
  if (!id.startsWith(PREFIX)) continue;
  const name = id.slice(PREFIX.length);
  if (!registeredNames.includes(name)) continue;
  const level = Array.isArray(severity) ? severity[0] : severity;
  if (level === 'off' || level === 0) continue;
  ENABLED.set(name, severity);
}

/**
 * `test-file-location-enforcement` answers from the FILE PATH alone, and every
 * fixture here is linted under a synthetic one. Excluded as a reporter rather
 * than triaged thousands of times; it stays an owner, where its own path-keyed
 * self-reports are accounted for separately.
 */
const FILENAME_ARTIFACT_REPORTERS = new Set(['test-file-location-enforcement']);

/**
 * The documented pair graph: rule A's source naming rule B, both directions.
 *
 * A plain substring test, so a rule name that is a PREFIX of another also links
 * the two (`require-memo` inside `require-memoize-jsx-returners`,
 * `no-unnecessary-destructuring` inside `...-rename`, `require-https-error`
 * inside `...-cause`). Kept deliberately: six of the eight links that produces
 * are name-family siblings, which is the same contract-sharing signal a written
 * mention is, and an extra pair that never diverges costs nothing while a
 * missing one costs coverage. It links 140 directed pairs, of which 137 have an
 * enabled reporter and a fixture-bearing owner.
 */
const documentedPartners = new Map<string, Set<string>>();
const link = (from: string, to: string) => {
  const partners = documentedPartners.get(from) || new Set<string>();
  partners.add(to);
  documentedPartners.set(from, partners);
};
for (const name of registeredNames) {
  const file = path.join(RULES_DIR, `${name}.ts`);
  if (!fs.existsSync(file)) continue;
  const source = fs.readFileSync(file, 'utf8');
  for (const other of registeredNames) {
    if (other === name || !source.includes(other)) continue;
    link(name, other);
    link(other, name);
  }
}

const reportersFor = (owner: string) =>
  [...(documentedPartners.get(owner) || [])]
    .filter(
      (name) => ENABLED.has(name) && !FILENAME_ARTIFACT_REPORTERS.has(name),
    )
    .sort();

const linter = new Linter();
linter.defineParser('ts', tsParser as never);
for (const [rule, name] of ruleNameByIdentity) {
  linter.defineRule(`${PREFIX}${name}`, rule as never);
}

/**
 * Rewrites a bare rule name inside an inline directive to its prefixed id.
 *
 * Longest name first, so `use-latest-callback` inside a longer name is never
 * rewritten out from under it, and the lookahead stops a name that is a prefix
 * of another from matching.
 */
const BARE_NAMES = [...registeredNames].sort((a, b) => b.length - a.length);
const DIRECTIVE =
  /(eslint-disable(?:-next-line|-line)?|eslint-enable)([^\n*]*)/g;
const prefixDirectives = (code: string) =>
  code.replace(DIRECTIVE, (_whole, keyword: string, tail: string) => {
    let rewritten = tail;
    for (const name of BARE_NAMES) {
      rewritten = rewritten.replace(
        new RegExp(`(^|[\\s,])${name}(?![\\w/-])`, 'g'),
        `$1${PREFIX}${name}`,
      );
    }
    return `${keyword}${rewritten}`;
  });

type Divergence = {
  owner: string;
  reporter: string;
  bucket: string;
  origin: string;
  filename: string;
  messageIds: string[];
  code: string;
};

const stats = {
  casesConsidered: 0,
  ownersWithCases: new Set<string>(),
  pairsChecked: 0,
  fatals: 0,
  selfReports: 0,
  selfReportExamples: [] as string[],
  typeAwareSelfReports: 0,
  filenameArtifactSelfReports: 0,
  reportersHeardFrom: new Set<string>(),
};

/**
 * Lints one owner's blessed fixtures with ONLY that owner and its documented
 * partners enabled.
 *
 * Restricting the config is not a shortcut that changes an answer: with no
 * fixing involved, each rule's reports on a given source are independent of
 * which other rules are enabled, and an inline directive naming a rule that is
 * not enabled is simply inert. It is what makes the guard affordable — one lint
 * over ~2 rules instead of ~190.
 */
function scanOwner(
  owner: string,
  cases: readonly FixtureCase[],
  reporters: Record<string, unknown>,
  /** Overridden only by a control, which registers its own owner rule. */
  ownerId = `${PREFIX}${owner}`,
  count = true,
): Divergence[] {
  const divergences: Divergence[] = [];
  const enabledIds = new Set([ownerId, ...Object.keys(reporters)]);

  for (const testCase of cases) {
    // `invalid` code is EXPECTED to report; only blessed text is evidence.
    if (testCase.bucket === 'invalid') continue;
    if (count) {
      stats.casesConsidered++;
      stats.ownersWithCases.add(owner);
    }

    const filename = defaultFilenameFor(testCase);
    const code = prefixDirectives(testCase.code);
    const config = {
      parser: 'ts',
      parserOptions: parserOptionsFor(testCase),
      rules: {
        ...reporters,
        // The owner's own options must reach it, or its silence is not its real
        // silence. It stays enabled so the self-control can observe it.
        [ownerId]: severityWithOptions(testCase),
      },
    };

    let messages;
    try {
      messages = linter.verify(code, config as never, filename);
    } catch {
      if (count) stats.fatals++;
      continue;
    }
    if (messages.some((message) => message.fatal)) {
      if (count) stats.fatals++;
      continue;
    }

    // Filtered against the ids enabled for THIS lint, which is strictly tighter
    // than the registered set: a fatal carries no `ruleId` and must never be
    // read as one rule's silence.
    const reported = messages.filter(
      (message) => message.ruleId && enabledIds.has(message.ruleId),
    );

    if (count && testCase.bucket === 'valid') {
      const selfReported = reported.some(
        (message) => message.ruleId === ownerId,
      );
      if (selfReported) {
        if (typeAwareRuleNames.has(owner)) {
          stats.typeAwareSelfReports++;
        } else if (FILENAME_ARTIFACT_REPORTERS.has(owner)) {
          stats.filenameArtifactSelfReports++;
        } else {
          stats.selfReports++;
          stats.selfReportExamples.push(`${owner} <- ${testCase.origin}`);
        }
      }
    }

    const byReporter = new Map<string, Set<string>>();
    for (const message of reported) {
      if (message.ruleId === ownerId) continue;
      const reporter = String(message.ruleId).slice(PREFIX.length);
      const ids = byReporter.get(reporter) || new Set<string>();
      ids.add(String(message.messageId || message.message));
      byReporter.set(reporter, ids);
    }
    for (const [reporter, messageIds] of byReporter) {
      if (count) stats.reportersHeardFrom.add(reporter);
      divergences.push({
        owner,
        reporter,
        bucket: testCase.bucket,
        origin: testCase.origin,
        filename,
        messageIds: [...messageIds].sort(),
        code: testCase.code,
      });
    }
  }
  return divergences;
}

const corpus = harvestFixtureCorpus();

const divergences: Divergence[] = [];
const divergentPairs = new Set<string>();
/** Every pair this run actually examined, so a stale entry is provable. */
const pairsExamined = new Set<string>();

for (const owner of [...documentedPartners.keys()].sort()) {
  const reporterNames = reportersFor(owner);
  if (!reporterNames.length) continue;
  const cases = corpus.byRule.get(owner) || [];
  if (!cases.length) continue;

  for (const reporter of reporterNames) {
    pairsExamined.add(`${owner}::${reporter}`);
    stats.pairsChecked++;
  }

  const reporters = Object.fromEntries(
    reporterNames.map((name) => [`${PREFIX}${name}`, ENABLED.get(name)]),
  );
  for (const found of scanOwner(owner, cases, reporters)) {
    divergentPairs.add(`${found.owner}::${found.reporter}`);
    divergences.push(found);
  }
}

const exampleFor = (pair: string) =>
  divergences.find((found) => `${found.owner}::${found.reporter}` === pair);

/**
 * `pair -> messageId -> number of diverging FIXTURES`, counted per case rather
 * than per message: one fixture that draws the same complaint three times is
 * one disagreement, and a fixer that changes report multiplicity should not
 * read as a new one.
 */
const observedCases = (found: readonly Divergence[]) => {
  const byPair = new Map<string, Record<string, number>>();
  for (const one of found) {
    const pair = `${one.owner}::${one.reporter}`;
    const counts = byPair.get(pair) || {};
    for (const messageId of one.messageIds) {
      counts[messageId] = (counts[messageId] || 0) + 1;
    }
    byPair.set(pair, counts);
  }
  return byPair;
};

const observed = observedCases(divergences);

const sortedCounts = (counts: Record<string, number>) =>
  Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1)),
  );

describe('documented rule pairs do not contradict each other', () => {
  it('reports no divergence outside KNOWN_DIVERGENT', () => {
    const unexpected = [...divergentPairs]
      .filter((pair) => !(pair in KNOWN_DIVERGENT))
      .sort();

    if (unexpected.length) {
      const detail = unexpected
        .map((pair) => {
          const example = exampleFor(pair);
          return [
            `  ${pair}`,
            `    ${example?.bucket} fixture from src/tests/${example?.origin} as ${example?.filename}`,
            `    reporter says: ${example?.messageIds.join(', ')}`,
            `    ${example?.code.replace(/\s+/g, ' ').slice(0, 200)}`,
          ].join('\n');
        })
        .join('\n');
      throw new Error(
        [
          `${unexpected.length} documented rule pair(s) disagree about the same text.`,
          'The owner rule declares this shape VALID; the sibling it names in its own',
          'source reports on it under the recommended config.',
          '',
          'Before filing: a disagreement is only a defect if NO spelling satisfies',
          'both. Run the input through `Linter.verifyAndFix` with both rules enabled —',
          'sibling rules here are usually sequential steps of one pipeline that',
          '`--fix` converges. If it converges, or if the owner deliberately hands the',
          'case to the sibling, add the pair to KNOWN_DIVERGENT with that reason.',
          '',
          detail,
        ].join('\n'),
      );
    }
  });

  it('carries no stale exemption', () => {
    // An entry left behind after a fix would absorb the next regression in that
    // exact pair, so the map is required to be exactly the divergent set.
    const stale = Object.keys(KNOWN_DIVERGENT)
      .filter((pair) => !divergentPairs.has(pair))
      .sort();
    const unexamined = Object.keys(KNOWN_DIVERGENT)
      .filter((pair) => !pairsExamined.has(pair))
      .sort();
    expect({ stale, unexamined }).toEqual({ stale: [], unexamined: [] });
  });

  it('exempts exactly the fixtures each entry was signed off for', () => {
    // The half a pair-level key cannot see. Both directions matter: a count
    // that GREW is a fixture that joined an exempted disagreement without
    // triage (#1840); one that SHRANK is a disagreement partly resolved — or a
    // detection the rule quietly lost, which is what #1842 restored.
    const drifted = [...observed]
      .filter(([pair]) => pair in KNOWN_DIVERGENT)
      .map(([pair, counts]) => ({
        pair,
        signedOff: sortedCounts(KNOWN_DIVERGENT[pair].cases),
        observed: sortedCounts(counts),
      }))
      .filter(
        (entry) =>
          JSON.stringify(entry.signedOff) !== JSON.stringify(entry.observed),
      );

    if (drifted.length) {
      throw new Error(
        [
          `${drifted.length} exempted pair(s) no longer disagree on exactly the`,
          'fixtures their entry was signed off for:',
          ...drifted.map((entry) =>
            [
              `  ${entry.pair}`,
              `    signed off: ${JSON.stringify(entry.signedOff)}`,
              `    observed:   ${JSON.stringify(entry.observed)}`,
              `    e.g. ${exampleFor(entry.pair)
                ?.code.replace(/\s+/g, ' ')
                .slice(0, 160)}`,
            ].join('\n'),
          ),
          '',
          'Do not simply bump the number. A count that grew means a fixture',
          'joined the disagreement: read it, and ask whether any spelling',
          'satisfies both rules. A count that shrank means the disagreement',
          'moved — either a fix landed (say so in the reason) or the reporter',
          'stopped seeing a shape it used to see, which is a false negative.',
        ].join('\n'),
      );
    }
  });
});

describe('the cross-rule contradiction guard is load-bearing', () => {
  it('reaches the documented corpus', () => {
    // 137 pairs over 5,493 cases from 71 owners at the time of writing. Each
    // floor is separate: a high pair count over a collapsed corpus, or a large
    // corpus that reaches few owners, would each read as health.
    expect(stats.pairsChecked).toBeGreaterThanOrEqual(120);
    expect(stats.ownersWithCases.size).toBeGreaterThanOrEqual(60);
    expect(stats.casesConsidered).toBeGreaterThanOrEqual(4500);
    expect(corpus.failures).toEqual([]);
    // And enough DISTINCT sibling rules must actually have spoken (25). A
    // corpus that reaches every owner but trips two chatty reporters would
    // clear every floor above while saying nothing about the other 23.
    expect(stats.reportersHeardFrom.size).toBeGreaterThanOrEqual(20);
  });

  it('keeps every valid fixture silent under its own rule', () => {
    // A fabricated cross-rule count always shows up here first: a fixture the
    // owner itself reports on was linted under the wrong filename, options or
    // parser, so nothing said about a sibling's verdict on it is trustworthy.
    expect({
      selfReports: stats.selfReports,
      examples: stats.selfReportExamples.slice(0, 5),
      fatals: stats.fatals,
    }).toEqual({ selfReports: 0, examples: [], fatals: 0 });
  });

  it('accounts for the legitimate self-control residue', () => {
    // Counted, never folded into the control above: a type-aware rule has no
    // program here and `test-file-location-enforcement` answers from the path.
    //
    // Both are asserted non-zero: a zero would mean the exclusion has stopped
    // being needed and is now free to hide a real self-report instead. The
    // type-aware residue (6) comes from the two type-aware rules that own a
    // documented pair here, `prefer-use-deep-compare-memo` and
    // `no-entire-object-hook-deps`, whose fixtures are written for a checker
    // this bare `Linter` does not give them.
    expect(typeAwareRuleNames.size).toBeGreaterThanOrEqual(5);
    expect(stats.filenameArtifactSelfReports).toBeGreaterThan(0);
    expect(stats.typeAwareSelfReports).toBeGreaterThan(0);
    // eslint-disable-next-line no-console
    console.log(
      `[crossrule-contradiction] self-control residue: ` +
        `${stats.filenameArtifactSelfReports} path-keyed, ` +
        `${stats.typeAwareSelfReports} type-aware`,
    );
  });

  it('detects a sibling reporting on a blessed fixture (positive control)', () => {
    const OWNER_ID = `${PREFIX}control-blesses-export`;
    const REPORTER_ID = `${PREFIX}control-reports-export`;
    const silentOwner: Rule.RuleModule = {
      meta: { type: 'problem', schema: [], messages: { never: 'never' } },
      create: () => ({}),
    };
    const loudSibling: Rule.RuleModule = {
      meta: { type: 'problem', schema: [], messages: { saw: 'saw an export' } },
      create: (context) => ({
        ExportNamedDeclaration(node) {
          context.report({ node, messageId: 'saw' });
        },
      }),
    };
    linter.defineRule(OWNER_ID, silentOwner);
    linter.defineRule(REPORTER_ID, loudSibling);

    const planted: FixtureCase[] = [
      {
        code: 'export const PLANTED = 1;\n',
        tester: 'ruleTesterTs',
        origin: 'planted control',
        bucket: 'valid',
      },
    ];
    const found = scanOwner(
      'control-blesses-export',
      planted,
      { [REPORTER_ID]: 'error' },
      OWNER_ID,
      false,
    );
    expect(found.map((one) => `${one.owner}::${one.reporter}`)).toEqual([
      'control-blesses-export::control-reports-export',
    ]);
  });

  it('stays silent when the sibling agrees (negative control)', () => {
    const OWNER_ID = `${PREFIX}control-blesses-export`;
    const QUIET_ID = `${PREFIX}control-reports-nothing`;
    const quietSibling: Rule.RuleModule = {
      meta: { type: 'problem', schema: [], messages: { saw: 'saw a class' } },
      create: (context) => ({
        ClassDeclaration(node) {
          context.report({ node, messageId: 'saw' });
        },
      }),
    };
    linter.defineRule(QUIET_ID, quietSibling);

    const planted: FixtureCase[] = [
      {
        code: 'export const PLANTED = 1;\n',
        tester: 'ruleTesterTs',
        origin: 'planted control',
        bucket: 'valid',
      },
    ];
    expect(
      scanOwner(
        'control-blesses-export',
        planted,
        { [QUIET_ID]: 'error' },
        OWNER_ID,
        false,
      ),
    ).toEqual([]);
  });

  it('runs a config that can both speak and stay quiet (machinery control)', () => {
    // The shipped rules, not a plant: a detector proved only against doubles
    // passes even when the real config is misassembled and reports nothing.
    const everyEnabled = Object.fromEntries(
      [...ENABLED].map(([name, severity]) => [`${PREFIX}${name}`, severity]),
    );
    const lint = (code: string, filename: string) =>
      linter
        .verify(
          code,
          {
            parser: 'ts',
            parserOptions: {
              ecmaVersion: 2022,
              sourceType: 'module',
              ecmaFeatures: { jsx: true },
            },
            rules: everyEnabled,
          } as never,
          filename,
        )
        .filter((message) => message.ruleId)
        .map((message) => String(message.ruleId));

    expect(
      lint('export const NUMBER_ONE = 1;\n', 'file.ts').length,
    ).toBeGreaterThan(0);
    // Chosen by measurement, not by guess: a bare `export const NUMBER_ONE = 1`
    // draws three reports (`enforce-unique-cursor-headers`, `global-const-style`,
    // `no-hungarian`), so it cannot serve as the silent half.
    expect(
      lint(
        "/** @fileoverview Control. */\nexport const GREETING = 'hello' as const;\n",
        'src/util/greeting.ts',
      ),
    ).toEqual([]);
  });
});

/* eslint-disable no-console */
console.log(
  [
    `[crossrule-contradiction] ${stats.pairsChecked} documented pair(s) over ` +
      `${stats.casesConsidered} case(s) from ${stats.ownersWithCases.size} owner(s)`,
    `    divergent: ${divergentPairs.size}, exempted: ${
      Object.keys(KNOWN_DIVERGENT).length
    }`,
    // Printed as paste-ready entries so a triaged finding is transcribed rather
    // than retyped, which is how a count gets recorded wrong.
    ...[...observed]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(
        ([pair, counts]) =>
          `    '${pair}': { cases: ${JSON.stringify(sortedCounts(counts))} }`,
      ),
  ].join('\n'),
);
/* eslint-enable no-console */

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
 * MUTATION AUDIT of the convergence half, every arm of the classifier broken in
 * turn, guard re-run:
 *
 *   Second conjunct weakened to the literal `verifyAndFix(output).output !==
 *     output` RED: the two-cycle positive control drops to NO-OP. That is the
 *     #1846 shape, so this mutation is the defect the pass exists to catch.
 *   First conjunct dropped (the loose `fixed: true` + a residual report) RED
 *     twice: the negative control turns NO-OP into OSCILLATED, and the primary
 *     test fires on 11 ordinary corpus fixtures — the false-positive rate the
 *     conjunction exists to remove, measured rather than asserted.
 *   A signed-off standoff count moved 3 -> 4 RED, naming the pair and printing
 *     its three fixtures.
 *   The convergence loop fed an empty divergence list RED twice, on the probe
 *     floors and on the standoff set. A pass that examines nothing cannot go
 *     green.
 *
 * NON-VACUITY IS PER-MEMBER (#1863). Only 48 of the 80 scanned owners appear in
 * `KNOWN_DIVERGENT`; for the other 32 the whole claim rested on three global
 * floors, so each could stop contributing evidence and nothing would say so.
 * Every documented PAIR is now either examined or named with a measured cause,
 * every scanned owner must have contributed a fixture, and `casesConsidered` is
 * pinned to the corpus rather than floored.
 *
 * SECOND HALF — CONVERGENCE. Everything above is static, and static accounting
 * is what let #1846 through: `enforce-react-type-naming` and `global-const-style`
 * were exempted here with a reason that was FALSE ("SCREAMING_SNAKE satisfies
 * both"), and their fixers traded one identifier back and forth until ESLint's
 * ten-pass cap wrote `const e_LEMENT` to disk. Every exemption's reason claims a
 * satisfying spelling exists; the convergence pass below runs the config's own
 * `--fix` over every diverging fixture with both rules enabled and refuses to
 * let a pair that never reaches a fixpoint be recorded as acceptable. It reuses
 * the divergence scan rather than re-deriving it, which is why the whole file
 * still runs in ~15s. The exact classification, and the measurement proving the
 * obvious way to write it is blind to #1846, are documented at that section.
 *
 * TRIAGE, before filing anything this guard reports: a disagreement is only a
 * defect if NO spelling satisfies both rules. Run the input through
 * `Linter.verifyAndFix` with both rules enabled — sibling rules here are usually
 * sequential steps of one pipeline (`useMemo` -> `useCallback` ->
 * `useLatestCallback`) that `--fix` converges. That question killed 7 of the 9
 * pairs triaged when this axis was opened. It is not sufficient on its own:
 * asking it ONLY of pairs where `--fix` converged on zero fixtures is how #1846
 * was mis-triaged, since that pair converged on 6 of 17 and was classified from
 * its convergent half. Partial convergence is where a mixed pair hides.
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
  'enforce-assert-safe-object-key::prefer-union-from-const-array': {
    reason:
      "PIPELINE: the #1875 fixtures declare in-file `type Kind = 'live' | 'simulated'` aliases to pin the compiler-bounded Record carve-out — 12 valid fixtures plus the fixed outputs of 9 invalid ones — and the sibling wants every such alias derived from an `as const` values array. The composed `--fix` rewrites the alias on all 21 and the carve-out reads the derived `(typeof KINDS)[number]` spelling — via name identity or the array's own literal elements — so the valid fixtures end silent under BOTH rules with zero `assertSafe` wraps, and the outputs keep their already-wrapped keys exempt (measured, every one). Was 20 for a corpus-identity reason rather than a reach one: the carve-out's `String()` and template-interpolation fixtures used to fix to the BYTE-IDENTICAL `m[assertSafe(kind)]`, which the corpus deduped to a single case. #2144 stopped the fixer replacing a coercion with its operand, so those outputs are now `m[assertSafe(String(kind))]` and ``m[assertSafe(`${kind}`)]`` — two distinct texts, both entering the corpus on the same alias the entry was already signed off for. The disagreement reached no new shape.",
    cases: { preferDerivedUnion: 21 },
  },
  'enforce-boolean-naming-prefixes::no-explicit-return-type': {
    reason:
      'PIPELINE: the fixtures annotate an inferable return only to display the boolean under test; `--fix` strips it on 44 of 49 and the prefix check reads the name either way. Two joined with #1935 — `#isLocked(): boolean` and its `private isLocked(): boolean` isolation control — and both are that same shape: the owner detects a boolean METHOD only through the annotation, so dropping it would not satisfy both rules but make the fixture vacuous, and the composed `--fix` strips it on both (measured) leaving them silent under both rules. 51 -> 49 with the #2019 carve-out, which removed a disagreement rather than a detection: the `processData` and `checkFlag` fixtures are overload SETS, and the sibling used to strip the implementation signature — the type every overload above it is checked against — which is TS2394. Nothing about the annotations it still reads changed.',
    cases: { noExplicitReturnTypeInferable: 49 },
  },
  'enforce-is-prefix-validators::enforce-boolean-naming-prefixes': {
    reason:
      'INCIDENTAL: the owner\'s "Boolean literal constant" control, `export const FEATURE_ENABLED = true;`, exists to show that a non-function declaration inside a validators file is not a validator, and the sibling objects only to its name. `export const IS_FEATURE_ENABLED = true;` is silent under BOTH rules (measured) and is still a boolean literal constant, so the control keeps its meaning. The pair joins this list because the #2016 carve-out names `enforce-is-prefix-validators` in this rule\'s source: that rule mandates the `is` prefix on validators whose verdict is `true | string`, which is exactly the prefix the carve-out stops reading as a boolean contract on the result. The disagreement itself predates the mention.',
    cases: { missingBooleanPrefix: 1 },
  },
  'no-inline-component-prop::global-const-style': {
    reason:
      'PIPELINE: the module-scope wrapper fixtures declare plain `const` bindings to exercise the allowModuleScopeFactories carve-out, without regard to naming or `as const`; `--fix` supplies both and converges with ZERO residual reports (measured), and the component check reads the object identically through `unwrapExpression`. Surviving that converged spelling is exactly what #1864 fixed.',
    cases: { asConst: 3, upperSnakeCase: 5 },
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
      'PIPELINE: the fixtures export unmemoized components to exercise the props-type check; `--fix` wraps 10 of 12 in `memo()`, and the `forwardRef`/named-function pair is memoizable by hand. 12 -> 15 with the #2006 fixtures, which are three spellings of one shape: a component default-exported by NAME (`const Banner = ...; export default Banner;`, its `function Banner` twin, and the named-plus-default pair). They are written unmemoized on purpose — the memoized spelling is the split `require-memo` emits for a default-exported declaration, which the same fix already covers in its own fixtures, so the unwrapped spelling is the control proving the identifier hop does not depend on a wrapper. The composed `--fix` wraps all three in one pass and both rules end silent on every one (measured), and the wrapped result is exactly that split shape, so memoizing them keeps the props check alive rather than trading it away.',
    cases: { requireMemo: 15 },
  },
  'enforce-firestore-doc-ref-generic::global-const-style': {
    reason:
      "PIPELINE: the sibling is named in the owner's source because its fix is the one that used to silence the owner — it appends ` as const` to a module-scope literal, and #2007 made the owner keep reporting the references underneath one. Every objection is to the module-scope const itself, never to a generic. Two are object literals holding an annotated accessor (`const userRepository = { getRef(id: string): DocumentReference<User> {...} }` and its arrow-property twin), whose camelCase name and missing assertion are incidental to the spelling each pins; the composed `--fix` yields `const USER_REPOSITORY = {...} as const` and BOTH rules are silent on it (measured), since the return annotation states the schema whether or not the literal is frozen. The other three draw the naming objection alone — `const data: Array<string> = ['test']` and the two #2007 cases asserting `CollectionReference<User>[]` and `Record<string, CollectionReference<User>>` — because a literal that already carries an assertion gets no second one; the rename leaves the asserted type each case exists to pin untouched, and all three end clean under both (measured).",
    cases: { asConst: 2, upperSnakeCase: 5 },
  },
  'enforce-firestore-doc-ref-generic::no-explicit-return-type': {
    reason:
      'INCIDENTAL: the fixtures annotate `DocumentReference<T>` returns to display the generic under test; the annotation is inferable, and deleting it leaves the generic check unchanged. 6 -> 25 with the #1909 fixtures, which pin the SAME annotated shapes in the spellings the rule used to miss — arrow (block, concise, optional-chained and awaited), function expression, class method, getter, class arrow property, object-literal method and property, an IIFE, and a nested-`return` pair. 25 -> 26 with #1936, which adds one ECMA-private method annotated `#getSettingsCollection(): CollectionReference<Settings>`; the composed `--fix` strips that annotation and the call-site `db.collection<Settings>(...)` it wraps keeps the owner silent (measured). Every one is a respelling of an already-exempted declaration, so the sibling objects to the same inferable annotation it always did.',
    cases: { noExplicitReturnTypeInferable: 26 },
  },
  'enforce-firestore-doc-ref-generic::prefer-type-over-interface': {
    reason:
      'PIPELINE: the fixtures declare their models with `interface`; `--fix` converts all 117 to `type`, which the generic check reads identically. 77 -> 96 with the #1909 fixtures, whose models are the same plain `interface User { name: string }` declarations the existing 77 use. 96 -> 109 with the #1936 fixtures, which respell the member holding the schema as `#member` and leave the model declaration untouched — the same plain `interface`, converted and still silent under the owner on all 13 (measured). 109 -> 117 with the #2007 fixtures, whose eight models are that same plain declaration (`interface User { name: string }`, `interface Mapping { placement: number }`) carried only so the assertion under test has a schema to name; the conversion leaves the assertion untouched and all eight stay silent under the owner (measured). 117 -> 122 with the #2189 fixtures, which pin the interface half of the alias/interface parity the fix establishes, so their models are necessarily `interface` declarations; composed `--fix` rewrites each to a type alias and leaves zero messages under either rule, while a negative control (same interface, no assertion) still reports `missingGeneric` (measured).',
    cases: { preferType: 122 },
  },
  'enforce-global-constants::react-memoize-literals': {
    reason:
      'HANDOFF: the fixtures declare component-scope literals that close over nothing, which `react-memoize-literals` owns; hoisting one to module scope — the remedy `enforce-global-constants` itself names — is clean under both (measured). 6/4 -> 8/6 with the #2046 width-gate fixtures: two blessed outputs keep an all-numeric `[100, …, 12800]` default inline because the hoist fix DECLINES it — prettier re-packs a numeric array several elements per line (fill mode), so no fixer-authored one-per-line hoist is a prettier fixed point — and each draws both sibling complaints, the surviving array (`componentLiteral`) and the object the hook returns (`hookReturnLiteral`). Hand-hoisting the array in prettier’s own fill layout and returning the object through `useMemo` with both names declared is clean under both (measured).',
    cases: { componentLiteral: 8, hookReturnLiteral: 6 },
  },
  'enforce-memoize-async::enforce-dynamic-imports': {
    reason:
      "INCIDENTAL: the fixtures carry an unrelated static `import { something } from 'lib'` beside the decorator under test; without it both are silent (measured), and the decorator package itself is on `DEFAULT_IGNORED_LIBRARIES`. Was 6 — the #1957 prologue fixture carrying that same `from 'lib'` import joined the identical class, and `enforce-dynamic-imports` reports it on the fixture's INPUT just as it does on the output (measured), so the memoize fix introduces nothing. Of the three fixtures #1957 added only that one joins; the two without the unrelated import are silent under both.",
    cases: { dynamicImportRequired: 7 },
  },
  'enforce-memoize-async::no-explicit-return-type': {
    reason:
      "PIPELINE: the fixtures annotate an inferable `Promise<T>` return; `--fix` strips 8 of 9 and the decorator requirement is unaffected. Was 13 — the #1975 fixture pinning that a `Promise<Transaction>` RETURN type still reports joined the identical class. Its annotation is load-bearing rather than incidental: the fixture is the negative control proving the transaction carve-out reads PARAMETERS, where the attempt-scoped handle actually arrives, and not the return type, which describes a handle the method produces. So no spelling drops it. `verifyAndFix` with both rules converges on `@Memoize() public async open()` with zero messages remaining (measured), stripping the annotation while leaving the decorator requirement the fixture asserts. 14 -> 9 because the #2014 FIX LANDED: five of these fixtures declare `function Log(): MethodDecorator { return () => {}; }` beside the decorated member under test, and that annotation is what makes `@Log()` legal at the decoration site — stripping it left every `@Log()` use as TS1329 — so the reporter declines on decorator factories and those five leave the disagreement rather than moving. The nine that remain are the inferable `Promise<T>` returns this entry always described; the composed `--fix` clears eight of them and leaves `class Example<T> { @Memoize() public async load(): Promise<T> ... }`, whose annotation names a type PARAMETER the fixer will not strand (measured). 9 -> 22 across the #2068 handle-factory carve-out and the #2073 answer to it, which land together. The 13 fixtures that joined are the INVALID ones added for #2068, pinning that a plain data result still requires `@Memoize()`; their annotations are ordinary inferable `Promise<T>` restatements and the composed `--fix` strips every one of them while the decorator requirement they assert survives (measured). The 22 VALID ones added alongside — a result the carve-out reads as a resource handle, an object carrying a function-valued member — are absent from this count by construction: their annotation is the carve-out's own SIGNAL, so #2073 taught the reader to preserve exactly that shape, `declaresResourceHandleResult` in `src/utils/resourceHandleType.ts`, which both rules now import so the two predicates cannot drift. Before that fix the composed `verifyAndFix` stripped the annotation and then decorated the handle factory on 15 of the 22 (the other 7 survived only because removing the annotation would strand a same-file type declaration the fixer will not orphan); after it, 0 of 26 handle fixtures in the owner's suite gain a decorator (measured both ways). This arm is #1562 one carve-out later, answered the same way: on the reader side.",
    cases: { noExplicitReturnTypeInferable: 22 },
  },
  'enforce-memoize-getters::no-explicit-return-type': {
    reason:
      "PIPELINE: the #2074 handle carve-out's NEGATIVE direction. The 12 blessed texts are the fixtures pinning that the carve-out keys on an object result carrying a callable and NOT on the presence of a written return annotation — a plain data object, a primitive, an index signature of callables, a getter signature member, an unresolved `Function` reference, a two-argument container — so each annotates an inferable result the sibling correctly calls a restatement. Their annotations are load-bearing rather than incidental: each fixture EXISTS to prove the carve-out declines that shape, so no spelling drops them. The composed `verifyAndFix` converges 11 of the 12 to zero messages, stripping the annotation while the `@Memoize()` the fixture asserts survives on all 12 (measured). The twelfth is a NO-OP residual, not an oscillation: it declares `type Admission = { reservedMb: number }` inside `makeGovernor()`, shadowing an outer handle alias of the same name, and the getter's annotation is that inner alias's SOLE reference — so the sibling reports but its fixer declines rather than orphan a same-file type declaration. Isolated directly: adding a second reference to the inner alias makes the same input fix cleanly and the annotation disappear, while the sole-reference spelling reports and declines (measured both ways). The 26 handle fixtures the same issue added are absent from this count by construction — their annotation is the carve-out's own SIGNAL, and the sibling preserves exactly that shape through `declaresResourceHandleResult` in `src/utils/resourceHandleType.ts`, which both rules import so the two predicates cannot drift. This mirrors `enforce-memoize-async::no-explicit-return-type`, whose #2068/#2073 arm is the same carve-out on the async side.",
    cases: { noExplicitReturnTypeInferable: 12 },
  },
  'enforce-memoize-getters::enforce-dynamic-imports': {
    reason:
      "INCIDENTAL: the fixtures import the UPSTREAM `typescript-memoize`; the fork this plugin injects, `@blumintinc/typescript-memoize`, is on `DEFAULT_IGNORED_LIBRARIES` and clean under both (measured). Was 6 — the #1958 prologue fixture joined on the same incidental footing but through a different carrier, an unrelated static `import { something } from 'lib'` the case needs in order to put a directive and an existing import on one line. `enforce-dynamic-imports` reports it on that fixture's INPUT just as on its output (measured), so the memoize fix introduces nothing. Of the three fixtures #1958 added only that one joins; the two without an unrelated import are silent under both.",
    cases: { dynamicImportRequired: 7 },
  },
  'enforce-microdiff::enforce-dynamic-imports': {
    reason:
      "INCIDENTAL: three outputs keep a static import of a library the microdiff fixer deliberately leaves in place, and none of the three is a spelling the pair forbids jointly. One keeps an unrelated `import _ from 'lodash'` for the `_.difference` call the fixer declines to convert; dropping it is clean under both (measured). The other two are the #1903 fixtures, where retiring the competing import would leave a binding unreferenced: an import every call of which is shadowed (the composed `--fix` reaches the clean spelling by itself on the next pass, measured — once a comparison elsewhere pulls microdiff in, the dead import is REMOVED rather than replaced), and one whose specifier a value reference keeps read (`export const chosen = detailedDiff`), whose remedy is `chosen = diff` off the microdiff import — clean under both (measured). `@blumintinc/microdiff` is on `DEFAULT_IGNORED_LIBRARIES`, so every remedy this rule names satisfies the sibling. Was 2 — the `fast-deep-equal/es6` SUBPATH half was FIXED in #1845, where an `ignoredLibraries` entry began covering the package's subpaths.",
    cases: { dynamicImportRequired: 3 },
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
  'enforce-props-naming-consistency::enforce-props-argument-name': {
    reason:
      'PIPELINE: `--fix` renames the parameter on all 3 fixtures, after which both rules agree.',
    cases: { usePropsParameterName: 1, usePropsParameterNameWithPrefix: 2 },
  },
  'enforce-querykey-ts::prefer-global-router-state-key': {
    reason:
      'HANDOFF: the fixtures feed `useRouterState` degenerate keys (empty and `-` templates) to pin the query-key parser; the sibling owns "the key must come from the global module", and an imported `QUERY_KEY_*` constant is clean under both (measured). `preferGlobalRouterStateKey` 15 -> 24 is that same handoff read one pass earlier, not a new disagreement: each substitution carries the import for its own key, so two of them contend for the import declaration and the single `RuleTester` pass an `output` records rewrites one key and leaves the rest quoted (#2012). Exactly 9 `output` fixtures therefore still hold a bare key their `code` held, which the sibling reports precisely as it reports that `code`; the tenth already held one behind an inline disable and was counted before. The composed `--fix` finishes them across passes, which is why the pair\'s residual count is unmoved.',
    cases: { invalidQueryKeySource: 12, preferGlobalRouterStateKey: 24 },
  },
  'enforce-react-type-naming::global-const-style': {
    reason:
      "PIPELINE: the fixtures put a JSX/ReactNode-typed value in a camelCase module-scope const to display the TYPE annotation under test; `--fix` supplies SCREAMING_SNAKE/`as const` and BOTH rules fall silent on all 16 (measured, every one). The previous entry claimed the same thing and was FALSE: this rule demanded a lowercase initial for the very identifier the sibling demanded in SCREAMING_SNAKE, no spelling satisfied either, and the two fixers oscillated to a mangled `e_LEMENT` at the ten-pass cap — the one genuine contradiction this guard found (#1846). It is resolved by this rule yielding for the module-scope consts `global-const-style` governs, which leaves the sibling as the only renamer. #1847 extended that yield to EXPORTED consts, where the sibling withholds only its FIX and still reports: it moved NO count here, because this direction measures the SIBLING reporting on this rule's blessed fixtures and the fix changed which reports THIS rule emits. The five exported fixtures it added (`export const ELEMENT: JSX.Element = …`) are clean under both and contribute nothing. `upperSnakeCase` 15 -> 16 is one deliberately-added fixture, `const config: FC = {} as FC`, pinning that the sibling's Next.js reserved-name exemption is keyed on the EXPORT; unexported it renames to `CONFIG` and both go silent (measured). Was `{asConst: 3, upperSnakeCase: 17}` with `--fix` reaching 6 of 17. `upperSnakeCase` 16 -> 17 is #2029's carve-out fixture, `const widget = {} as FC`: the assertion became a detection carrier there, so the yield needed a fixture proving it still fires when the TYPE is written as an assertion rather than an annotation. It is the same handoff as every row above — this rule is silent, the sibling asks for `WIDGET`, and `const WIDGET = {} as FC;` is clean under both (measured, and pinned as a `--fix` fixpoint in this rule's own suite).",
    cases: { asConst: 4, upperSnakeCase: 17 },
  },
  'enforce-react-type-naming::no-redundant-annotation-assertion': {
    reason:
      "PIPELINE: the fixtures write the type BOTH ways — `const WIDGET: FC = {} as FC;` — because the annotation is what this rule reads and the assertion is what keeps the value non-assignable to it; the sibling deletes the redundant annotation and the composed `--fix` leaves every one of them silent under both rules (measured, all five: three blessed fixtures, one fixed output, and the `unknown` annotation whose assertion the sibling calls redundant, which `--fix` carries to `const X = {} as FC`). That deletion is precisely the defect in #2029: while the annotation was this rule's only carrier, the sibling's fix turned its report into permanent silence. Reading the assertion too is what makes the converged spelling still governed, so this disagreement is a handoff rather than a loss. The pair joins this list because the #2029 carrier names `no-redundant-annotation-assertion` in this rule's source; the disagreement itself predates the mention.",
    cases: { redundantAnnotationAndAssertion: 5 },
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
      'PIPELINE: the fixtures annotate an inferable return beside the name under test; `--fix` strips both. 2 -> 5 with #2165, which extends the React-component carve-out to the class-METHOD spelling: a method in a `.ts` file carries its React type as a return annotation (`public Panel(): React.JSX.Element`), so the three joiners are the annotation-carrier fixtures for that path plus its field-spelling parity twin. The annotation being stripped is the documented hazard rather than a contradiction — which is exactly why the rule recognises a component by what it renders, the hooks it calls and how the file uses it as well, and this suite pins each of those carriers on its own fixture, all of them clean under both rules (measured).',
    cases: { noExplicitReturnTypeInferable: 5 },
  },
  'firestore-transaction-reads-before-writes::enforce-assert-safe-object-key': {
    reason:
      'PIPELINE: the fixtures index an object with a raw key beside the read/write ordering under test; `--fix` wraps both in `assertSafe`.',
    cases: { useAssertSafe: 2 },
  },
  'logical-top-to-bottom-grouping::enforce-object-literal-as-const': {
    reason:
      'PIPELINE: the fixtures pin statement ORDER and their literals lack `as const`, which `--fix` supplies. 3 -> 1 is the #2015 fix landing: two of the three returned an ARRAY from an unannotated function, where `as const` freezes the arity into the inferred return type and breaks the callers, so the sibling declines those. The remaining object literal is unaffected.',
    cases: { enforceAsConst: 1 },
  },
  'logical-top-to-bottom-grouping::global-const-style': {
    reason:
      "PIPELINE: the fixtures pin statement ORDER and name their module-scope consts lowercase incidentally; `--fix` supplies `as const`/SCREAMING_SNAKE on 53 of 67, the rest by hand. 51/65 -> 53/67 is the pair of fixtures #2023 added, whose blessed text leaves `const name = 'elementAt';` at module scope: each draws both complaints, and composing the two fixers settles it to `const NAME = 'elementAt' as const;` under the statement it derives from, clean under both (measured). That same composition measured clean before the #2023 join fix too — by appending the declaration onto a trailing `//` comment, which deleted it.",
    cases: { asConst: 53, upperSnakeCase: 67 },
  },
  'logical-top-to-bottom-grouping::parallelize-async-operations': {
    reason:
      'PIPELINE: the ordering fixtures await sequentially; `--fix` parallelizes both without disturbing the grouping under test.',
    cases: { parallelizeAsyncOperations: 2 },
  },
  'memo-nested-react-components::require-memo': {
    reason:
      "PIPELINE: the fixtures declare unmemoized OUTER components around the nested one under test; `--fix` wraps 8 of 9 in `memo()`. The ninth declines because the visible `memo` binding is react's rather than the `util/memo` helper, so the edit would collide. Two joined with #1911 as the `?.` twins of rows already here — each draws the report on the same outer component its plain twin does, and both converge (measured). Container-carried hand-backs are absent from this list rather than withheld from the corpus: `require-memo` credits `return { default: memo(Row) }` since #1919 and this rule credits the array spelling since #1925, so both suites pin them and neither rule reports on the other's (measured).",
    cases: { requireMemo: 9 },
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
      "PIPELINE: the fixtures declare an async class method beside the annotation under test; `--fix` adds the `@Memoize()` decorator on all 3. 3 -> 4 with the #2014 reproduction, whose class holds an async `compute()` beside the decorator factory under test; the composed `--fix` adds `@Memoize()` above the existing `@Log()` and converges with zero messages remaining, leaving the factory's `: MethodDecorator` annotation — the thing the fixture pins — intact (measured). 4 -> 10 with #2073: six of the negative controls added for the resource-handle carve-out are async methods returning plain DATA (`Promise<{ id: string; name: string }>`, `Promise<string>`, an index signature of callables, a getter signature, a self-referential plain alias, a `Function`-typed member), and they enter this count through their stripped `output`, which is blessed text the harness lints. Their reporting here is the pair working rather than disagreeing: a plain data result is exactly what `enforce-memoize-async` should memoize, and the composed `verifyAndFix` reaches `@Memoize()` with the annotation gone and zero messages remaining on all nine such fixtures (measured). The handle-shaped valid fixtures added in the same change contribute nothing here, because the carve-out keeps the owner silent on them.",
    cases: { requireMemoize: 10 },
  },
  'no-explicit-return-type::enforce-verb-noun-naming': {
    reason:
      'INCIDENTAL: the fixtures name functions with bare nouns (`factorial`) to display the return annotation under test; a verb phrase (`computeFactorial`) is clean under both (measured). 24 -> 26 with the #2014 decorator fixtures, on that same footing: one names an arrow factory `Injectable` for the decoration site it feeds (`createInjectable` is clean under both, measured), and the other is the stripped output of the scope-resolution control, whose enclosing function is named `outer` exactly as the mutual-recursion fixtures already counted here name theirs — the objection is to `outer`, not to the decorator, and `buildMemoizer` is clean under both (measured).',
    cases: { functionVerbPhrase: 26 },
  },
  'no-explicit-return-type::prefer-getter-over-parameterless-method': {
    reason:
      "INCIDENTAL: the sibling objects to the METHOD spelling and never to an annotation, which is the axis every one of these fixtures exists to pin. All 16 are parameterless value-returning members carried as scenery for the return-type question: three non-inferable widenings (`getCache(): ReadonlyMap<string, number>` over a `Map` field, its `static` `ReadonlySet` twin, a `Readonly<{ debug: boolean }>` config), three un-annotated cases pinning that no annotation is required (`getMap`, `find`/`load`), three comment-placement fixtures, and seven decorator cases — five where the decorated `compute()`/`read()` is scenery for the factory's own return type, and two factory methods (`static log(): MethodDecorator`, `public log(): PropertyDecorator`) whose parameterless shape draws the objection directly. The composed `--fix` rewrites NONE of them, because the sibling withholds its fixer for anything not `private` and every one of these is public API surface, so the residual is a single-rule NO-OP rather than a standoff (measured). The remedy the report itself names is available: applying `get <suggestedName>()` to each reported member leaves all 16 silent under BOTH rules (measured), and the widening annotation each case exists to pin survives the conversion untouched. The pair joins this list because the #2154 fix names `no-explicit-return-type` in the sibling's source — that rule's fixer strips the `: Promise<T>` annotation the promise exemption reads, which is why the exemption reads the body too. The disagreement itself predates the mention: the same 16 diverge on the parent commit, where neither source names the other (measured). 16 -> 19 with #2158, which widens the sibling to the class-FIELD spelling, on that same footing: the three joiners are all `no-explicit-return-type` OUTPUTS whose stripped member is a parameterless field arrow (`Registry.buildCount = () => /** doc */ 1`, its `// doc` twin `readCount`, and `Repo.read = () => { // doc \\n return 1; }`), so they are scenery for the comment-placement question exactly as the three method-spelled comment fixtures already counted here are. The same remedy is available and settles it: converting each to `get buildCount()` / `get readCount()` / `get read()` leaves BOTH rules silent (measured), and the comment the fixture exists to pin survives the conversion in place.",
    cases: { preferGetter: 19 },
  },
  'no-explicit-return-type::prefer-type-over-interface': {
    reason:
      'PIPELINE: the fixtures declare `interface` shapes beside the annotation under test; `--fix` converts all 5. 5 -> 6 with #2073, whose resource-handle corpus needs an `interface Subscription { unsubscribe: () => void }` arm: the handle predicate resolves an interface through a different branch than a type alias, so both must be blessed. The conversion is the pipeline, not a contradiction, and it is load-bearing in both directions — after `--fix` rewrites the interface into `type Subscription = { ... }` the handle carve-out still reads it and the annotation survives, with zero messages remaining (measured). 6 -> 5 + 1 with #2080, which is one fixture changing its messageId rather than joining or leaving: the overload fixture `interface StringNumberConverter { convert(input: string): number; convert(input: number): string; }` is written on one line, so the alias the conversion would emit is one 97-column line, past the width at which a formatter expands the object instead. That conversion is reported without a fix, so this one arm is handed over rather than piped — and it is still a spelling problem with a solution, since the same shape written as `type StringNumberConverter = { ... }` is clean under BOTH rules (measured).',
    cases: { preferType: 5, preferTypeOverflowsPrintWidth: 1 },
  },
  'no-firestore-object-arrays::prefer-union-from-const-array': {
    reason:
      'CO-DESIGNED: `no-firestore-object-arrays` recognizes `(typeof VALUES)[number]` precisely because that is what this sibling autofixes toward, and says so in its own source; `--fix` converges on all 4. 5 -> 4 is the #2020 fix landing, a defect removed rather than detection lost: the departed fixture holds its alias inside a `declare namespace`, where TS1254 rejects any `const` array initializer, so the sibling declines a rewrite it had no legal spelling for. The remaining four are ordinary module-scope aliases and still converge.',
    cases: { preferDerivedUnion: 4 },
  },
  'no-margin-properties::global-const-style': {
    reason:
      'PIPELINE: the style-object fixtures sit in lowercase module-scope consts; `--fix` supplies `as const`/SCREAMING_SNAKE on all 9.',
    cases: { asConst: 5, upperSnakeCase: 9 },
  },
  'no-redundant-usecallback-wrapper::use-latest-callback': {
    reason:
      'PIPELINE: sequential steps of one migration (`useMemo` -> `useCallback` -> `useLatestCallback`); multi-pass `--fix` converges on all 67 with both rules silent. 59 -> 60 is a net of three moves, all from #1895 (the collapse now drops the import specifier it orphans). Two `output` fixtures JOIN: both keep a `useCallback` call the sibling still wants migrated — one is the fixture pinning that a surviving call keeps the import, the other the suppressed-sibling fixture whose disabled call is deliberately left standing. One LEAVES by deduplication, not by going silent: the output of the `useLatestCallback(inner)` fixture loses the `use-latest-callback` import the collapse orphans, which makes it byte-identical to an existing fixture output the corpus already carries. 60 -> 67 is a net of nine moves, all from #2008 (a module-level function counts as a stable delegate). Eight `valid` fixtures JOIN, each a carve-out the extension has to leave alone — a literal declared inside a component or hook, a reassigned binding, an import, a `memoize()` result, a wrapper supplying an argument — and each holds the `useCallback` call that pins the carve-out, which is the call the sibling wants migrated; `useLatestCallback(inner)` is silent under both (measured). One LEAVES because it changed bucket rather than going silent: the module-level `function doThing() {}` fixture is `invalid` now that the rule reports it, and `invalid` text is never evidence here.',
    cases: { useLatestCallback: 67 },
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
  'no-unused-props::enforce-exported-function-types': {
    reason:
      'PIPELINE: two fixtures export a component whose in-file `Props` type stays unexported — the props CONTRACT is what they display, and who may import it is beside their point; `--fix` exports the type on both and each ends silent under BOTH rules (measured).',
    cases: { missingExportedPropsType: 2 },
  },
  'no-unused-props::require-memo': {
    reason:
      "PIPELINE: the fixtures declare unmemoized components to display the props contract under test; the composed `--fix` wraps 48 of 56 in `memo(...)` and both rules end silent (measured). Reading THROUGH the wrapper is what makes that true of this rule: before #2004 a `memo(...)` initializer matched nothing here, so the sibling's own fix hid the component from it. The remaining 8 are the shapes `require-memo` declines to fix — an `FC`-annotated declarator and a multi-declarator statement, plus their nested twins — and hand-memoizing each (`const C: FC<P> = memo(...)`, `const C = memo(...), LIMIT = 2`) is clean under both (measured, all 8).",
    cases: { requireMemo: 56 },
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
  'prefer-clone-deep::global-const-style': {
    reason:
      "PIPELINE: the spread-copy fixtures sit in lowercase module-scope consts without `as const` to display the literal shape under test; `--fix` supplies SCREAMING_SNAKE/`as const` and both rules end silent (measured). The pair joins this list because #2032 names `global-const-style` in this rule's source: under the composed `--fix` the sibling wins the range race and appends `as const` to the very literal this rule rewrites, and the fix used to decline on that assertion (#2011), so the hazard was reported forever and never fixed. Absorbing a DIRECT `as const` into the `cloneDeep(...)` rewrite is what lets the pipeline converge; the disagreement itself predates the mention. 36 -> 38 and 42 -> 47 is #2094 adding fixtures, not behaviour moving: the #2094 rule against the PRE-#2094 fixture list still measures 36/42 exactly (measured, both directions). The joiners are the module-scope `const result = ...` declarations that pin which parentheses the rewrite absorbs and which enclosing literals it declines on; 46 of the 47 end silent under the composed `--fix`, and the single residual is the pre-existing valid fixture whose `eslint-disable-next-line prefer-clone-deep` omits the plugin prefix, so this rule keeps reporting underneath it — a NO-OP, not a standoff.",
    cases: { asConst: 38, upperSnakeCase: 47 },
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
  'prefer-getter-over-parameterless-method::no-explicit-return-type': {
    reason:
      "PIPELINE: the fixtures annotate an inferable return (`(): string`, `(): number`, `(): Promise<string>`) only to display the member shape under test — abstract declarations, heritage-bound implementations, `#`-named members, getters — and `--fix` strips all 52, leaving zero messages from either rule (measured). 32 -> 52 with the #2154 promise fixtures, which are the same shape one contract deeper: their annotation is the very thing the promise exemption reads, so stripping it is exactly the composition that could destroy the exemption. It does not, because the exemption also reads the body, and the body of an annotated sibling when no annotation survives the strip — all 20 stay exempt through it (measured), which is the property `exemption-composition-closure` pins on this pair. The disagreement predates the mention that enrols the pair: the other 32 diverge on the parent commit, where nothing in this rule's source names `no-explicit-return-type` (measured).",
    cases: { noExplicitReturnTypeInferable: 52 },
  },
  'prefer-global-router-state-key::enforce-querykey-ts': {
    reason:
      'HANDOFF: the fixtures pin this rule\'s own carve-outs (an optional-chained template key, a shadowed local constant, an import written after its use); `enforce-querykey-ts` owns "the key must be imported from `queryKeys`", and an imported `QUERY_KEY_*` constant is clean under both (measured). The `enforceQueryKeyConstant` count is the #1840 tripwire: reverting that fix takes it from 1 to 2.',
    cases: { enforceQueryKeyConstant: 1, enforceQueryKeyImport: 5 },
  },
  'prefer-spread-over-reassembly::enforce-object-literal-as-const': {
    reason:
      "INCIDENTAL: one fixed output asserts `as Pair`, which the literal rule does not accept in place of `as const`; writing `as const` is clean under both (measured). 1 -> 5 is the #1908 widening: the four narrowing-pick carve-outs (#1642 annotation, #1643 `Readonly` unwrap, #1644 sibling-module hop, #1769 lexically nested type) gained a FunctionDeclaration twin, and a declaration must spell its target `return { a, b };` where the arrow twin spells it `=> ({ a, b })`. The sibling registers only a `ReturnStatement` visitor (its own `DETECTION_EXEMPT` entry, #1795), so the concise arrow is structurally invisible to it and the block-bodied twin is not — the disagreement is about the block body, not about either rule's subject. `return { a, b } as const;` leaves both silent on all four (measured), and this rule's `unwrapTransparent` reads the pick through that assertion unchanged, so the carve-out still holds in the satisfying spelling.",
    cases: { enforceAsConst: 5 },
  },
  'prefer-use-base62-id::require-memo': {
    reason:
      "PIPELINE: two fixtures declare an unmemoized component to display the NON-EMPTY `useMemo` deps carve-out, where memoization is beside their point; the composed `--fix` wraps both in `memo(...)` and both rules end silent (measured, both). Reading THROUGH the wrapper is what makes that silence the carve-out rather than blindness: before #2005 a `memo(...)` initializer defeated `isComponentOrHook` and every handler here bailed, so the sibling's own fix hid the component from this rule. The pair joins this list because #2005 names `require-memo` in this rule's source; the disagreement itself predates that mention.",
    cases: { requireMemo: 2 },
  },
  'prefer-usecallback-over-usememo-for-functions::use-latest-callback': {
    reason:
      'PIPELINE: sequential steps of one migration (`useMemo` -> `useCallback` -> `useLatestCallback`); multi-pass `--fix` converges and the sibling is silent on all 42. The count rose from 34 when #2091 added eight fixtures whose converted call carries a comment or a re-indented body — the same `useCallback(...)` output the 34 already produce, so each joins the existing disagreement rather than opening a new shape.',
    cases: { useLatestCallback: 42 },
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
      'CO-REPORT: `require-memo` claims nested components in both spellings (#1774) and says so in its source; the sibling reports the same nested component because nesting is ITS complaint and hoisting its remedy — two sequential steps of one repair. One case is the `Unmemoized` opt-out valid fixture, which opts out of memo(), not of hoisting; the other eight are fixed outputs whose in-place `memo(...)` wrapper the sibling correctly calls insufficient. All nine hand-enumerated; `require-memo` is silent on every one (its fix converges), and the HOC-factory exemption in the sibling leaves the factory-shaped outputs unreported.',
    cases: { memoizeNestedComponent: 9 },
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
 * Owners whose self-reports on their own `valid` fixtures are an artifact of the
 * TYPE information this harness withholds, keyed by rule with the measurement
 * behind each.
 *
 * This replaces a blanket discount of every rule whose source mentions the
 * checker. That set has 16 members and only one of them self-reports, so the
 * blanket form was silently blessing 15 rules' future false positives while
 * claiming to explain one rule's (#1859). It is also not "these rules report
 * nothing here": all 16 report, which is why they are probed at all.
 *
 * Both directions are asserted below: an entry that stops reproducing must be
 * deleted, since a stale one absorbs the next real self-report.
 */
const TYPE_ARTIFACT_SELF_REPORTERS: Record<string, string> = {
  /**
   * Its built-in carve-out is type-driven: `arrivalIds.has(id)`,
   * `teamIndexMap.get(id)` and `onLoad.call/bind/apply` are reads of a METHOD on
   * a `Set`/`Map`/function dependency, and the rule recognises them by asking
   * the checker for the dependency's type. `harvestFixtureCorpus` strips
   * `parserOptions.project`, and the isolated single-file program that remains
   * has no lib types, so `Set<string>` resolves to an error type, the carve-out
   * never fires, and all six of these `valid` fixtures report
   * `avoidEntireObject`. Under the configuration its own suite declares, they
   * are silent.
   */
  'no-entire-object-hook-deps':
    'built-in method carve-out needs lib types the isolated program lacks',
};

/**
 * The documented pair graph: rule A's source naming rule B, both directions.
 *
 * A plain substring test, so a rule name that is a PREFIX of another also links
 * the two (`require-memo` inside `require-memoize-jsx-returners`,
 * `no-unnecessary-destructuring` inside `...-rename`, `require-https-error`
 * inside `...-cause`). Kept deliberately: six of the eight links that produces
 * are name-family siblings, which is the same contract-sharing signal a written
 * mention is, and an extra pair that never diverges costs nothing while a
 * missing one costs coverage. It links 180 directed pairs, of which 177 have an
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
  /** Carried so the convergence pass re-lints under the case's OWN config. */
  testCase: FixtureCase;
};

const stats = {
  casesConsidered: 0,
  ownersWithCases: new Set<string>(),
  /** Per owner, so one chatty owner cannot cover for another going dark. */
  casesByOwner: new Map<string, number>(),
  pairsChecked: 0,
  fatals: 0,
  selfReports: 0,
  selfReportExamples: [] as string[],
  typeArtifactSelfReports: 0,
  /** Which owners actually produced one, so a stale discount can be found. */
  typeArtifactSelfReporters: new Set<string>(),
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
      stats.casesByOwner.set(owner, (stats.casesByOwner.get(owner) || 0) + 1);
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
        if (owner in TYPE_ARTIFACT_SELF_REPORTERS) {
          stats.typeArtifactSelfReports++;
          stats.typeArtifactSelfReporters.add(owner);
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
        testCase,
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
/** Every owner the scan actually entered, whatever it then found. */
const ownersScanned = new Set<string>();

for (const owner of [...documentedPartners.keys()].sort()) {
  const reporterNames = reportersFor(owner);
  if (!reporterNames.length) continue;
  const cases = corpus.byRule.get(owner) || [];
  if (!cases.length) continue;
  ownersScanned.add(owner);

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

/* ------------------------- TWO-WAY DRIVE ACCOUNTING ----------------------- */

/**
 * Every directed pair the mention graph documents, examined or not.
 *
 * `pairsChecked >= 170` says the scan examined SOME pairs; it cannot say it
 * examined a particular one, and 180 pairs against a floor of 172 leaves
 * eight free to leave the scan silently — a rule dropping out of the
 * recommended config takes every pair it reports on with it (#1863). Every
 * member is therefore either examined or named below with a measured cause.
 */
const documentedPairs: string[] = [];
for (const [owner, partners] of documentedPartners) {
  for (const partner of partners) documentedPairs.push(`${owner}::${partner}`);
}
documentedPairs.sort();

const UNEXAMINED_CAUSES = {
  reporterIsFilenameArtifact:
    'the sibling answers from the FILE PATH alone, which is synthetic here, so it is excluded as a reporter by design',
  reporterNotEnabled:
    'the sibling is not enabled in the recommended config, so no consumer ever runs the two together',
  ownerHasNoCorpus:
    'the owner declares no fixture, so it blesses no text a sibling could report on',
  unaccounted:
    'no measured explanation — the pair left the scan for a reason this file cannot name, which is the state this accounting exists to surface',
} as const;
type UnexaminedCause = keyof typeof UNEXAMINED_CAUSES;

const unexaminedCauseOf = (pair: string): UnexaminedCause | null => {
  if (pairsExamined.has(pair)) return null;
  const [owner, reporter] = pair.split('::');
  if (FILENAME_ARTIFACT_REPORTERS.has(reporter)) {
    return 'reporterIsFilenameArtifact';
  }
  if (!ENABLED.has(reporter)) return 'reporterNotEnabled';
  if (!(corpus.byRule.get(owner) || []).length) return 'ownerHasNoCorpus';
  return 'unaccounted';
};

const measuredUnexamined: Record<string, UnexaminedCause> = Object.fromEntries(
  documentedPairs
    .map((pair) => [pair, unexaminedCauseOf(pair)] as const)
    .filter((entry): entry is readonly [string, UnexaminedCause] => !!entry[1]),
);

/**
 * Documented pairs this run never examined, each with the measured cause.
 *
 * Asserted as an exact map, so a pair that quietly leaves the scan fails as an
 * unrecorded skip, a pair that re-enters it fails as a stale entry, and a pair
 * that leaves for a DIFFERENT reason fails too — the recorded cause is the claim
 * being made about it.
 */
const UNEXAMINED_PAIRS: Record<string, UnexaminedCause> = {
  'enforce-assert-safe-object-key::test-file-location-enforcement':
    'reporterIsFilenameArtifact',
  // `enforce-dynamic-file-naming` is registered and declares
  // `meta.docs.recommended: 'error'`, yet ships ABSENT from
  // `configs.recommended.rules` — deliberately, since it is the fallback for a
  // consumer who has disabled the two dynamic-import rules it names. It is
  // therefore never a reporter here. Both directions of each pair are
  // documented, and the mirrors (this rule as OWNER) are examined normally, so
  // the contract it shares with these two is still checked one way round.
  'enforce-dynamic-imports::enforce-dynamic-file-naming': 'reporterNotEnabled',
  'require-dynamic-firebase-imports::enforce-dynamic-file-naming':
    'reporterNotEnabled',
};

/**
 * Owners whose fixtures the scan never linted, each with the measured cause.
 *
 * An owner can be counted as examined — its pairs are added before a single
 * lint runs — and still contribute no evidence, because only `valid` and
 * `output` text is evidence and a corpus of nothing but `invalid` fixtures is
 * skipped case by case. SHIPS EMPTY: all 80 scanned owners contribute.
 */
const UNSCANNED_OWNER_CAUSES = {
  ownerHasOnlyInvalidFixtures:
    'every fixture it declares is an `invalid` one, which is EXPECTED to report and so is never evidence about a sibling',
} as const;
type UnscannedOwnerCause = keyof typeof UNSCANNED_OWNER_CAUSES;

const measuredOwnersWithoutCases: Record<string, UnscannedOwnerCause> =
  Object.fromEntries(
    [...ownersScanned]
      .sort()
      .filter((owner) => !stats.ownersWithCases.has(owner))
      .map((owner) => [owner, 'ownerHasOnlyInvalidFixtures' as const]),
  );

const OWNERS_WITHOUT_CASES: Record<string, UnscannedOwnerCause> = {};

/**
 * What `casesConsidered` must be, derived from the corpus rather than floored.
 *
 * A floor of 8,100 against 8,383 lets a thirtieth of the evidence disappear; this
 * equality lets none of it, since every non-`invalid` fixture of every scanned
 * owner has to arrive. A case lost to a fatal parse would show up here as well
 * as in `stats.fatals`.
 */
const expectedCasesConsidered = [...ownersScanned].reduce(
  (total, owner) =>
    total +
    (corpus.byRule.get(owner) || []).filter(
      (testCase) => testCase.bucket !== 'invalid',
    ).length,
  0,
);

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

/**
 * ============================ CONVERGENCE PASS ============================
 *
 * Everything above is STATIC: who reports on whose blessed text. It says
 * nothing about what the config's own `--fix` DOES to that text, which is where
 * #1846 lived: `enforce-react-type-naming` and `global-const-style` demanded
 * incompatible spellings of one identifier and their fixers traded it back and
 * forth until ESLint's ten-pass cap wrote `const e_LEMENT` to disk with
 * `fixed: true` and no signal it never converged. Every `KNOWN_DIVERGENT`
 * reason above asserts a satisfying spelling exists; this pass is what stops one
 * of those claims from being false the way that one was.
 *
 * `fixer-convergence` cannot see this class: it probes ONE rule at a time, and
 * an oscillation between two fixers is a property of the pair.
 *
 * CLASSIFICATION, per diverging fixture, both rules enabled:
 *
 *   CONVERGED   the fixed output re-lints clean. Nothing to record.
 *   NO-OP       a report remains but nothing pending would move the text; the
 *               developer hand-edits to the spelling the entry's reason names.
 *               Legitimate.
 *   OSCILLATED  a residual report STILL CARRIES A FIX and the fix loop had not
 *               reached a fixpoint when it stopped. ESLint would have applied
 *               that fix unless it hit the pass cap, so what landed on disk is
 *               an arbitrary intermediate state. MUST FAIL.
 *
 * The `residualFixable` conjunct is load-bearing. `fixed: true` with a residual
 * report ALONE is not oscillation — an unrelated fix may have applied while an
 * unfixable report remains, which is ordinary and describes 202 fixtures here.
 * The loose test calls 12 of them oscillations; this one calls none.
 *
 * THE SECOND CONJUNCT IS "the loop did not settle", NOT "the text moved again".
 * That distinction was measured against #1846 itself, with its pre-fix rule
 * source restored:
 *
 *   pass 1  global-const-style        element  -> ELEMENT
 *   pass 2  enforce-react-type-naming ELEMENT  -> eLEMENT
 *   pass 3  global-const-style        eLEMENT  -> E_LEMENT
 *   pass 4  enforce-react-type-naming E_LEMENT -> e_LEMENT
 *   passes 5-10 alternate E_LEMENT / e_LEMENT
 *
 * The cycle has length TWO and ESLint's cap is TEN, so re-fixing the output
 * runs another even number of flips and lands on the SAME text:
 * `verifyAndFix(output).output !== output` is FALSE for the very defect this
 * pass exists to catch, and a text-inequality test would have classified #1846
 * NO-OP. `verifyAndFix(output).fixed` is TRUE — measured — because the loop
 * exits only when a whole pass applies nothing, so a re-fix that applies
 * anything at all proves the first call stopped at the cap with movement still
 * pending. Both signals are kept: the weaker one is asserted FALSE in the
 * positive control, so the strengthening cannot be quietly undone.
 *
 * The scratch harness this pass was folded in from also flagged MANGLED
 * IDENTIFIERS (`/\b[A-Za-z]_[A-Z]/`, the human-visible tell of `e_LEMENT`).
 * Dropped rather than carried: its one hit on this corpus is the legitimate
 * generated constant `A_VALUES`, from a single-letter type `A`. A cosmetic
 * signal with a known false positive is a maintenance tax, and the convergence
 * verdict already covers everything it detected.
 */
type FixVerdict = 'CONVERGED' | 'NO-OP' | 'OSCILLATED';

type FixOutcome = {
  verdict: FixVerdict;
  /** `rule:messageId` for every report the fixed output still draws. */
  residual: string[];
  /** Rules still reporting after the fix; two of them is a live standoff. */
  stillReporting: string[];
  /** Whether `--fix` changed the text at all, floored so the pass is not idle. */
  rewritten: boolean;
  /** `verifyAndFix` applied a fix somewhere, the LOOSE and wrong signal. */
  fixed: boolean;
  /** The literal "text moved again" test, kept to prove it is insufficient. */
  refixMovesText: boolean;
  /** The real signal: the fix loop had not reached a fixpoint. */
  refixAppliesAFix: boolean;
  /** A fixer that produced unparsable text; read as silence if ignored. */
  fatalOutput: boolean;
  output: string;
};

function classifyFixOutcome(
  source: string,
  filename: string,
  config: unknown,
  enabledIds: ReadonlySet<string>,
): FixOutcome {
  const fixedResult = linter.verifyAndFix(source, config as never, filename);
  const messages = linter.verify(fixedResult.output, config as never, filename);
  const residualMessages = messages.filter(
    (message) => message.ruleId && enabledIds.has(message.ruleId),
  );
  const residualFixable = residualMessages.some((message) => message.fix);

  // Paid for only when a fix is still pending, which no corpus fixture is
  // today: all 202 residuals carry no fix. The second `verifyAndFix` therefore
  // costs the sweep nothing and is exercised by the controls alone.
  let refixMovesText = false;
  let refixAppliesAFix = false;
  if (residualFixable) {
    const refixed = linter.verifyAndFix(
      fixedResult.output,
      config as never,
      filename,
    );
    refixMovesText = refixed.output !== fixedResult.output;
    refixAppliesAFix = refixed.fixed;
  }

  const verdict: FixVerdict = !residualMessages.length
    ? 'CONVERGED'
    : residualFixable && (refixAppliesAFix || refixMovesText)
    ? 'OSCILLATED'
    : 'NO-OP';

  const label = (message: Linter.LintMessage) =>
    `${String(message.ruleId).slice(PREFIX.length)}:${
      message.messageId || message.message
    }`;

  return {
    verdict,
    residual: [...new Set(residualMessages.map(label))].sort(),
    stillReporting: [
      ...new Set(
        residualMessages.map((message) =>
          String(message.ruleId).slice(PREFIX.length),
        ),
      ),
    ].sort(),
    rewritten: fixedResult.output !== source,
    fixed: fixedResult.fixed,
    refixMovesText,
    refixAppliesAFix,
    fatalOutput: messages.some((message) => message.fatal),
    output: fixedResult.output,
  };
}

type ConvergenceRow = Divergence & { outcome: FixOutcome };

const convergenceStats = {
  probes: 0,
  rewritten: 0,
  pairs: new Set<string>(),
  fatalOutputs: [] as string[],
  looseOscillations: 0,
};

const convergence: ConvergenceRow[] = [];
for (const found of divergences) {
  const { testCase } = found;
  const ownerId = `${PREFIX}${found.owner}`;
  const reporterId = `${PREFIX}${found.reporter}`;
  const enabledIds = new Set([ownerId, reporterId]);
  // Exactly the two rules of the pair, which is what an entry's reason claims
  // is jointly satisfiable. A wider config would attribute a third rule's fix
  // to this pair.
  const config = {
    parser: 'ts',
    parserOptions: parserOptionsFor(testCase),
    rules: {
      [ownerId]: severityWithOptions(testCase),
      [reporterId]: ENABLED.get(found.reporter),
    },
  };
  let outcome;
  try {
    outcome = classifyFixOutcome(
      prefixDirectives(testCase.code),
      found.filename,
      config,
      enabledIds,
    );
  } catch {
    // A throw here is a broken probe, not a verdict; counted as a fatal so it
    // cannot pass for convergence.
    convergenceStats.fatalOutputs.push(
      `${found.owner}::${found.reporter} <- ${found.origin} (threw)`,
    );
    continue;
  }
  convergenceStats.probes++;
  convergenceStats.pairs.add(`${found.owner}::${found.reporter}`);
  if (outcome.rewritten) convergenceStats.rewritten++;
  if (outcome.fatalOutput) {
    convergenceStats.fatalOutputs.push(
      `${found.owner}::${found.reporter} <- ${found.origin}`,
    );
  }
  if (outcome.fixed && outcome.residual.length) {
    convergenceStats.looseOscillations++;
  }
  convergence.push({ ...found, outcome });
}

/** Fixtures where BOTH rules of the pair still report after the composed fix. */
const standoffs = convergence.filter(
  (row) => row.outcome.stillReporting.length > 1,
);

/**
 * The eleven fixtures on which both rules of a pair are still speaking once the
 * composed `--fix` has run — the small, hand-checked set where the NEXT
 * contradiction will surface, since a pair that cannot be silenced by fixing is
 * one hand-edit away from being unsatisfiable.
 *
 * Keyed `owner::reporter` and then by the RESIDUAL SIGNATURE (both rules'
 * messageIds, sorted), not by a per-pair total. The #1840 lesson applies here
 * exactly as it does to `KNOWN_DIVERGENT.cases`: a pair-level count lets a new
 * fixture join an already-signed-off standoff in silence, and a signature-level
 * count also catches a fixture that swaps one complaint for another while the
 * total holds.
 *
 * Each reason names a spelling measured clean under BOTH rules. That is the
 * whole burden of proof: a standoff is legitimate exactly when the developer
 * has somewhere to go.
 */
const KNOWN_STANDOFFS: Record<
  string,
  { reason: string; residuals: Record<string, number> }
> = {
  'enforce-global-constants::react-memoize-literals': {
    reason:
      'Two INDEPENDENT complaints about different expressions, neither fixable: a second destructuring default the hoist rule declines (`a_b = 2`, kept snake_case to pin how the constant NAME is derived; `debounceMs = 10`, whose derived `DEFAULT_DEBOUNCE_MS` already exists as a module-scope `let` — a deliberate name collision), and the returned array literal, which is `react-memoize-literals` domain. Hoisting the second default under a free name and memoizing the return is clean under both (measured). The three-way signature joined with the #2046 width-gate fixtures: their blessed outputs keep an all-numeric `[100, …, 12800]` default inline because the hoist fix declines it (prettier re-packs a numeric array in fill mode, so no fixer-authored hoist is a prettier fixed point), and the hook also returns an object literal. Hand-hoisting the array in prettier’s own fill layout plus `useMemo` around the returned object, both names declared, is clean under both (measured).',
    residuals: {
      'enforce-global-constants:extractDefaultToGlobalConstant + react-memoize-literals:componentLiteral': 1,
      'enforce-global-constants:extractDefaultToGlobalConstant + react-memoize-literals:hookReturnLiteral': 1,
      'enforce-global-constants:extractDefaultToGlobalConstant + react-memoize-literals:componentLiteral + react-memoize-literals:hookReturnLiteral': 2,
    },
  },
  'enforce-microdiff::enforce-dynamic-imports': {
    reason:
      'The `lodash` import the microdiff fixer deliberately declines to rewrite (`_.difference` is not a deep diff) draws BOTH complaints — the static import and the lodash call are the same remedy. Dropping lodash for `@blumintinc/microdiff`, which is on `DEFAULT_IGNORED_LIBRARIES`, is clean under both (measured). The `enforceMicrodiffImport` residual is the same shape one step earlier: `export const chosen = detailedDiff` holds a value reference of the competing import, which has no call site to rewrite, so the import survives the fix and both rules keep asking for it to go. Binding `chosen` to the `diff` from microdiff instead is clean under both (measured), and is the remedy the report names.',
    residuals: {
      'enforce-dynamic-imports:dynamicImportRequired + enforce-microdiff:enforceMicrodiff': 1,
      'enforce-dynamic-imports:dynamicImportRequired + enforce-microdiff:enforceMicrodiffImport': 1,
    },
  },
  'enforce-querykey-ts::prefer-global-router-state-key': {
    reason:
      "Degenerate `useRouterState` keys the query-key parser is written to pin — a raw literal shadowed by a local `QUERY_KEY_*` const, an empty string, and a parameterized `'prefix-' + id`. Both rules want the SAME thing (the key must come from the global module) and neither offers a fix, so they speak together until it is done by hand: `` `${QUERY_KEY_PLAYBACK_ID}-${id}` `` from an imported constant is clean under both (measured).",
    residuals: {
      'enforce-querykey-ts:enforceQueryKeyImport + prefer-global-router-state-key:preferGlobalRouterStateKey': 3,
    },
  },
  'prefer-global-router-state-key::enforce-querykey-ts': {
    reason:
      "The mirror direction, on this rule's own carve-out fixtures: a raw key beside a stale local `QUERY_KEY_USER_PROFILE = 'stale-key'`, and an import written AFTER its use. Importing the constant, and hoisting the import above the component, is clean under both (measured).",
    residuals: {
      'enforce-querykey-ts:enforceQueryKeyImport + prefer-global-router-state-key:preferGlobalRouterStateKey': 1,
      'enforce-querykey-ts:enforceQueryKeyConstant + prefer-global-router-state-key:invalidQueryKeySource': 1,
    },
  },
};

const observedStandoffs = new Map<string, Record<string, number>>();
for (const row of standoffs) {
  const pair = `${row.owner}::${row.reporter}`;
  const counts = observedStandoffs.get(pair) || {};
  const signature = row.outcome.residual.join(' + ');
  counts[signature] = (counts[signature] || 0) + 1;
  observedStandoffs.set(pair, counts);
}

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

describe('exempted pairs converge under the composed --fix', () => {
  it('has no pair whose two fixers oscillate', () => {
    const oscillated = convergence.filter(
      (row) => row.outcome.verdict === 'OSCILLATED',
    );
    if (oscillated.length) {
      throw new Error(
        [
          `${oscillated.length} exempted fixture(s) do not reach a fixpoint under`,
          "the config's own `--fix` with both rules of the pair enabled.",
          '',
          'This is the #1846 shape: ESLint applies fixes until its ten-pass cap',
          'and writes whatever that pass produced to disk, with `fixed: true` and',
          'no signal it never converged. The two rules must AGREE — one has to',
          'yield for the shape they share. Bumping a count here fixes nothing.',
          '',
          ...oscillated
            .slice(0, 5)
            .map((row) =>
              [
                `  ${row.owner}::${row.reporter}`,
                `    fixture from src/tests/${row.origin} as ${row.filename}`,
                `    in:  ${row.code.replace(/\s+/g, ' ').slice(0, 160)}`,
                `    out: ${row.outcome.output
                  .replace(/\s+/g, ' ')
                  .slice(0, 160)}`,
                `    still reports: ${row.outcome.residual.join(', ')}`,
              ].join('\n'),
            ),
        ].join('\n'),
      );
    }
    // Exactly zero, never a threshold: "no pair oscillates" is a property that
    // does not decay as rules are added, whereas a tuned ceiling absorbs the
    // next one silently.
    expect(oscillated).toEqual([]);
  });

  it('leaves both rules reporting on exactly the hand-verified fixtures', () => {
    const drifted = [
      ...new Set([
        ...observedStandoffs.keys(),
        ...Object.keys(KNOWN_STANDOFFS),
      ]),
    ]
      .sort()
      .map((pair) => ({
        pair,
        signedOff: sortedCounts(KNOWN_STANDOFFS[pair]?.residuals || {}),
        observed: sortedCounts(observedStandoffs.get(pair) || {}),
      }))
      .filter(
        (entry) =>
          JSON.stringify(entry.signedOff) !== JSON.stringify(entry.observed),
      );

    if (drifted.length) {
      throw new Error(
        [
          `${drifted.length} pair(s) leave both rules reporting on a different set`,
          'of fixtures than the eight that were hand-checked.',
          '',
          'A standoff is a fixture the composed `--fix` cannot silence: both rules',
          'still speak and the developer must hand-edit. That is legitimate ONLY',
          'while a spelling satisfying both exists. This is the smallest set in',
          'this guard and the likeliest place for the next unsatisfiable pair, so',
          'find the spelling and record it before touching the number.',
          '',
          ...drifted.map((entry) =>
            [
              `  ${entry.pair}`,
              `    signed off: ${JSON.stringify(entry.signedOff, null, 2)}`,
              `    observed:   ${JSON.stringify(entry.observed, null, 2)}`,
              ...standoffs
                .filter((row) => `${row.owner}::${row.reporter}` === entry.pair)
                .slice(0, 3)
                .map(
                  (row) =>
                    `    e.g. ${row.origin}: ${row.outcome.output
                      .replace(/\s+/g, ' ')
                      .slice(0, 160)}`,
                ),
            ].join('\n'),
          ),
        ].join('\n'),
      );
    }
  });

  it('fixed and re-linted the exempted corpus (non-vacuity)', () => {
    const byVerdict: Record<FixVerdict, number> = {
      CONVERGED: 0,
      'NO-OP': 0,
      OSCILLATED: 0,
    };
    for (const row of convergence) byVerdict[row.outcome.verdict]++;

    // 990 probes over 67 pairs, 800 of them rewritten by the fix, at the time
    // of writing. Each floor is separate because each fails differently: a
    // probe count with nothing rewritten means the fix pass never ran (the
    // options or parser plumbing lost), and a pair count without probes means
    // the divergence scan collapsed.
    expect(convergenceStats.probes).toBeGreaterThanOrEqual(950);
    expect(convergenceStats.rewritten).toBeGreaterThanOrEqual(760);
    expect(convergenceStats.pairs.size).toBeGreaterThanOrEqual(64);
    expect(byVerdict.CONVERGED).toBeGreaterThanOrEqual(750);
    expect(byVerdict['NO-OP']).toBeGreaterThanOrEqual(190);
    // A fixer that produced unparsable text would leave a fatal carrying no
    // `ruleId`, which the residual filter drops — i.e. it would read as
    // CONVERGED. Asserted rather than counted.
    expect(convergenceStats.fatalOutputs).toEqual([]);
    // The sharpening is live on REAL fixtures, not only in the plant below: the
    // loose "`fixed: true` and something still reports" test fires on 12 of
    // these, every one of them ordinary. If this ever reaches zero the two
    // tests have stopped differing here and the sharp one is no longer being
    // exercised against its own false-positive class.
    expect(convergenceStats.looseOscillations).toBeGreaterThan(0);

    // eslint-disable-next-line no-console
    console.log(
      `[convergence] ${convergenceStats.probes} fixture(s) of ` +
        `${convergenceStats.pairs.size} exempted pair(s) fixed and re-linted: ` +
        `${byVerdict.CONVERGED} converged, ${byVerdict['NO-OP']} no-op, ` +
        `${byVerdict.OSCILLATED} oscillated ` +
        `(${convergenceStats.rewritten} rewritten, ` +
        `${convergenceStats.looseOscillations} would fail the loose test, ` +
        `${standoffs.length} leave both rules reporting)`,
    );
  });

  it('catches two fixers that never reach a fixpoint (positive control)', () => {
    // The corpus cannot exercise the OSCILLATED branch — it is zero by design,
    // and #1846's own input is fixed — so the branch is proved on a plant that
    // goes through the SAME `classifyFixOutcome` the corpus does.
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

    // TWO-CYCLE, which is #1846's exact shape: `a` -> `b` -> `a`. ESLint's cap
    // is an EVEN ten passes, so the text lands back where it started and
    // `verifyAndFix(output).output !== output` is FALSE. Asserting that here is
    // the point of the control: the literal text-inequality test — the obvious
    // way to write this check — is blind to the very defect that motivated it.
    const UP = `${PREFIX}control-oscillate-up`;
    const DOWN = `${PREFIX}control-oscillate-down`;
    linter.defineRule(UP, renamer('oscillate', 'OSCILLATE'));
    linter.defineRule(DOWN, renamer('OSCILLATE', 'oscillate'));
    const twoCycle = classifyFixOutcome(
      'const oscillate = 1;\n',
      'file.ts',
      configFor([UP, DOWN]),
      new Set([UP, DOWN]),
    );
    expect({
      verdict: twoCycle.verdict,
      refixMovesText: twoCycle.refixMovesText,
      refixAppliesAFix: twoCycle.refixAppliesAFix,
    }).toEqual({
      verdict: 'OSCILLATED',
      refixMovesText: false,
      refixAppliesAFix: true,
    });

    // THREE-CYCLE (`a` -> `b` -> `c` -> `a`), where ten passes do NOT return to
    // the start, so the text-inequality arm of the disjunction is the one that
    // fires. Both arms are therefore load-bearing and neither can be dropped.
    const FORWARD = `${PREFIX}control-cycle-forward`;
    const BACKWARD = `${PREFIX}control-cycle-backward`;
    const forward: Rule.RuleModule = {
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
    };
    linter.defineRule(FORWARD, forward);
    linter.defineRule(BACKWARD, renamer('bbb', 'ccc'));
    const threeCycle = classifyFixOutcome(
      'const aaa = 1;\n',
      'file.ts',
      configFor([FORWARD, BACKWARD]),
      new Set([FORWARD, BACKWARD]),
    );
    expect({
      verdict: threeCycle.verdict,
      refixMovesText: threeCycle.refixMovesText,
    }).toEqual({ verdict: 'OSCILLATED', refixMovesText: true });
  });

  it('calls an unfixable residual a NO-OP, not an oscillation (negative control)', () => {
    // The sharpness half. A fixture where `--fix` DID rewrite something while
    // an unrelated, unfixable report remains is ordinary — 202 of the corpus's
    // fixtures are exactly this — and the loose test calls it an oscillation.
    const FIXES = `${PREFIX}control-fixes-once`;
    const UNFIXABLE = `${PREFIX}control-reports-unfixable`;
    const QUIET = `${PREFIX}control-reports-never`;
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
    const config = (ids: string[]) => ({
      parser: 'ts',
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: Object.fromEntries(ids.map((id) => [id, 'error'])),
    });

    const noop = classifyFixOutcome(
      'const stale = 1;\n',
      'file.ts',
      config([FIXES, UNFIXABLE]),
      new Set([FIXES, UNFIXABLE]),
    );
    expect({
      verdict: noop.verdict,
      // What the LOOSE test sees, spelled out: a fix applied and something
      // still reports. Sharpness is this pair of expectations disagreeing.
      looseWouldFail: noop.fixed && noop.residual.length > 0,
      rewritten: noop.rewritten,
    }).toEqual({ verdict: 'NO-OP', looseWouldFail: true, rewritten: true });

    // And the classifier can still say CONVERGED, so a NO-OP verdict is a
    // finding about the input rather than the only answer it knows.
    const converged = classifyFixOutcome(
      'const stale = 1;\n',
      'file.ts',
      config([FIXES, QUIET]),
      new Set([FIXES, QUIET]),
    );
    expect({ verdict: converged.verdict, output: converged.output }).toEqual({
      verdict: 'CONVERGED',
      output: 'const fresh = 1;\n',
    });
  });
});

describe('the cross-rule contradiction guard is load-bearing', () => {
  it('reaches the documented corpus', () => {
    // 177 pairs over 8,383 cases from 80 owners at the time of writing. Each
    // floor is separate: a high pair count over a collapsed corpus, or a large
    // corpus that reaches few owners, would each read as health.
    expect(stats.pairsChecked).toBeGreaterThanOrEqual(170);
    expect(stats.ownersWithCases.size).toBeGreaterThanOrEqual(76);
    expect(stats.casesConsidered).toBeGreaterThanOrEqual(8100);
    expect(corpus.failures).toEqual([]);
    // And enough DISTINCT sibling rules must actually have spoken (28). A
    // corpus that reaches every owner but trips two chatty reporters would
    // clear every floor above while saying nothing about the other 23.
    expect(stats.reportersHeardFrom.size).toBeGreaterThanOrEqual(26);
  });

  /**
   * The drive dimension, per member. Only 48 of the 80 scanned owners appear in
   * `KNOWN_DIVERGENT`, so for the other 32 the three floors above were the
   * whole of the non-vacuity claim: each could stop contributing evidence
   * entirely and nothing would say so (#1863).
   */
  it('accounts for every documented pair: examined, or named with its cause', () => {
    expect(measuredUnexamined).toEqual(UNEXAMINED_PAIRS);
    expect(documentedPairs.length).toBeGreaterThanOrEqual(172);
    expect(
      Object.values(UNEXAMINED_PAIRS).filter(
        (cause) => !UNEXAMINED_CAUSES[cause],
      ),
    ).toEqual([]);
    // An entry for a pair the mention graph no longer documents is an exemption
    // nothing can retire.
    expect(
      Object.keys(UNEXAMINED_PAIRS).filter(
        (pair) => !documentedPairs.includes(pair),
      ),
    ).toEqual([]);
  });

  it('lints a fixture for every owner it examined a pair for', () => {
    expect(measuredOwnersWithoutCases).toEqual(OWNERS_WITHOUT_CASES);
    expect([...stats.ownersWithCases].sort()).toEqual(
      [...ownersScanned]
        .sort()
        .filter((owner) => !(owner in OWNERS_WITHOUT_CASES)),
    );
  });

  /**
   * And how MUCH each owner contributed, pinned to the corpus rather than
   * floored: a rule that kept one `valid` fixture out of forty still clears any
   * global count.
   */
  it('considers every blessed fixture of every scanned owner', () => {
    expect(stats.casesConsidered).toBe(expectedCasesConsidered);
    expect(expectedCasesConsidered).toBeGreaterThanOrEqual(8100);
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
    // Counted, never folded into the control above: `no-entire-object-hook-deps`
    // resolves its carve-out through the checker and `test-file-location-
    // enforcement` answers from the path, so neither one's self-report is
    // evidence about the rule.
    //
    // Both are asserted non-zero: a zero would mean the discount has stopped
    // being needed and is now free to hide a real self-report instead — which
    // is why the type residue is keyed by RULE NAME rather than by "the rule
    // mentions the checker". That wider form covered 16 rules to explain one,
    // and each of the other 15 would have had its next false positive absorbed
    // silently (#1859).
    expect(Object.keys(TYPE_ARTIFACT_SELF_REPORTERS).length).toBeGreaterThan(0);
    expect(stats.filenameArtifactSelfReports).toBeGreaterThan(0);
    expect(stats.typeArtifactSelfReports).toBeGreaterThan(0);
    // eslint-disable-next-line no-console
    console.log(
      `[crossrule-contradiction] self-control residue: ` +
        `${stats.filenameArtifactSelfReports} path-keyed, ` +
        `${stats.typeArtifactSelfReports} type-artifact ` +
        `(${Object.keys(TYPE_ARTIFACT_SELF_REPORTERS).join(', ')})`,
    );
  });

  /**
   * The other direction. An owner listed as a type artifact that no longer
   * self-reports has had its discount outlive its reason, and would absorb the
   * next real one — the #1839 failure in miniature.
   */
  it('holds no stale type-artifact discount', () => {
    expect(
      Object.keys(TYPE_ARTIFACT_SELF_REPORTERS).filter(
        (rule) => !stats.typeArtifactSelfReporters.has(rule),
      ),
    ).toEqual([]);
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

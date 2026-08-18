/**
 * The verified carve-outs shared by the two comment-fidelity guards.
 *
 * It lives in its own module, not on either guard, because a guard importing it
 * from the other's suite file EXECUTES that suite: measured, that doubled the
 * cross-paired sweep's runtime from ~530s to ~1096s by running the whole
 * own-corpus sweep a second time in the same process.
 *
 * Read by:
 *   - `src/tests/comment-fix-fidelity.test.ts` — pairs each fixer with its OWN
 *     fixtures, and additionally asserts this map holds no STALE entry.
 *   - `src/tests/cross-comment-fidelity-closure.test.ts` — pairs each fixer with
 *     every fixture any rule REPORTS on.
 */

/**
 * Comment-sensitive fix behaviour that is understood and accepted, keyed
 * `<rule> :: <kind>`.
 *
 * AN ENTRY IS NOT A WAY TO MAKE A BUILD GREEN. Each records a verified reason
 * why this rule may legitimately produce a different fix — or none — when a
 * comment is present. Anything unlisted fails, and a listed group that stops
 * reproducing also fails, so an entry cannot rot into a shield for the next
 * regression.
 *
 * Two reasons recur and are both legitimate:
 *   - DECLINE: the rule detects that its rewrite would destroy a comment and
 *     withholds the fix, keeping the report. That is the preferred remedy on
 *     this axis, so a rule appearing here for that reason is working correctly.
 *   - IN-NODE: the perturbation lands inside a node the fixer legitimately
 *     replaces or deletes wholesale, so the comment goes with its subject. The
 *     discriminator is a trailing same-line comment after the terminating token,
 *     which sits OUTSIDE the node's range — a fixer that drops one of those is
 *     writing text it does not own, and is a defect.
 *
 * The `SUGGESTION_*` kinds are separate keys on purpose: a rule's fixer and its
 * suggestions are different transforms, so a reason verified for one can never
 * be read as covering the other.
 *
 * A key is a rule and a kind, and nothing else — so an entry verified against a
 * rule's OWN fixtures also excuses that rule's findings on every other rule's
 * fixtures. That is deliberate (the reason a fixer legitimately consumes a
 * comment is a property of the fixer, not of the snippet it ran on) and it is
 * the known cost: a rule-global entry un-gates every arm the rule participates
 * in (#1839). The finer key each consumer prints — owner suite, variant, and a
 * before/after diff — is what keeps an entry auditable against the arm that is
 * actually reproducing it.
 */
export const COMMENT_FIDELITY_BASELINE: Record<string, string> = {
  // DECLINE. The rule re-hosts each comment in the span onto the element it
  // annotates, or withholds the fix entirely so none is destroyed (#1589). Every
  // case here leaves the source byte-identical and keeps its report.
  'parallelize-async-operations :: TRANSFORM_DIVERGED':
    'declines rather than destroy a comment in the span it would merge (#1589); output is byte-identical to the input and the report stands',
  // DECLINE. `clobbersComment` refuses the interface-to-type rewrite when a
  // comment sits where the generated text would land.
  'prefer-type-over-interface :: TRANSFORM_DIVERGED':
    'clobbersComment withholds the rewrite when a comment occupies the generated span',
  // DECLINE. Past the print width the comparator fix rebuilds memo's argument
  // list one argument per line, and that rebuild owns every byte between the
  // parentheses — a comment among the arguments would be dropped by it. The
  // rule refuses the rewrite there, so the file keeps its report and is left
  // byte-identical (verified: `fixed: false`, output === input on the
  // `memo<any, Props>( /* c */ …)` fixture). Below the width nothing is rebuilt
  // and the comment is untouched, which is why only the over-width arm diverges.
  'memo-compare-deeply-complex-props :: TRANSFORM_DIVERGED':
    'declines the over-width argument-list rebuild when a comment sits inside the list; input is left byte-identical and the report stands',
  // FORMATTING. The divergence is line wrapping and trailing commas only.
  // Verified by formatting both outputs with agora's pinned prettier (2.8.8,
  // not this repo's 2.7.1) and comparing code tokens: all cases converge. agora
  // enforces prettier through the fixable `prettier/prettier` rule rather than a
  // `prettier --check` step, so the drift self-heals in the same `--fix` run.
  'prefer-sx-prop-over-system-props :: TRANSFORM_DIVERGED':
    'wrapping-only divergence that agora prettier normalizes to an identical token stream',
  'use-custom-memo :: TRANSFORM_DIVERGED':
    'trailing-comma/wrapping divergence that agora prettier normalizes to an identical token stream',
  'use-latest-callback :: TRANSFORM_DIVERGED':
    'wrapping-only divergence that agora prettier normalizes to an identical token stream',

  // IN-NODE. The marker lands inside a node the fixer replaces or deletes
  // wholesale, so the comment goes with its subject. Verified mechanically:
  // the marker's offset was tracked through every applied fix pass and found
  // contained in an applied `fix.range` in every case. The discriminator that
  // separates these from a defect is a trailing same-line comment AFTER the
  // terminating token, which sits outside the node — each of these rules
  // preserves one of those.
  'use-latest-callback :: COMMENT_LOST':
    'marker sits inside the useCallback import specifier list / call the fixer replaces',
  'enforce-centralized-mock-firestore :: COMMENT_LOST':
    'marker sits inside the retired mockFirestore declaration itself',
  'prefer-union-from-const-array :: COMMENT_LOST':
    'marker sits inside the type alias the fixer replaces with a const array',
  'enforce-unique-cursor-headers :: COMMENT_LOST':
    'the rule exists to delete a duplicate header comment; the marker is inserted into the block it removes',
  // The enforce-dynamic-firebase-imports entry is gone with #1716: the fixer no
  // longer converts the static import where it stands, so no marker inside that
  // import is consumed by it.
  'prefer-clone-deep :: COMMENT_LOST':
    'marker sits inside the object literal the fixer replaces with a cloneDeep call',
  'no-empty-dependency-use-callbacks :: COMMENT_LOST':
    'marker sits inside the callback the fixer hoists out of the component',
  'no-redundant-usecallback-wrapper :: COMMENT_LOST':
    'marker sits inside the useCallback wrapper the fixer collapses (the wrapper body itself is #1696, a separate defect)',
};

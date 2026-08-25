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
  // WIDTH. The rule chooses between two correct shapes by measuring the header
  // the in-place one would emit — `const X = memo(function XUnmemoized(<params>`
  // — and a comment in the parameter list occupies columns in exactly that
  // header, so it moves the measurement like any other text. Past the width the
  // wrapper is appended as its own statement instead (#2054). Both shapes are
  // valid and BOTH CARRY THE COMMENT: this is a layout choice diverging, not a
  // comment being consumed, which is why the remedy is not a decline. Ignoring
  // comment columns would re-emit the over-wide in-place header that #2054
  // exists to prevent. Anchored by the straddling fixture pair in
  // `src/tests/require-memo.test.ts`, so the own-corpus guard keeps it honest.
  'require-memo :: TRANSFORM_DIVERGED':
    'chooses its shape by measured header width, which a comment in the parameter list legitimately changes; both shapes preserve the comment (#2054)',
  // WIDTH, same class as require-memo above. Renaming `useMemo` to
  // `useDeepCompareMemo` adds eleven columns to the call's line, so the fixer
  // measures that line and writes Prettier's broken argument list when the
  // rename would overflow it (#2064). A BLOCK comment on that line occupies
  // columns there like any other text, and Prettier counts it the same way —
  // measured, it breaks the identical statement at 88 columns with a trailing
  // `/* … */` and leaves it flat without. Both shapes are valid and BOTH CARRY
  // THE COMMENT, so the remedy is not a decline: ignoring those columns would
  // emit the over-wide line #2064 exists to prevent.
  // The mirror case is NOT excused and is fixed rather than baselined: Prettier
  // prints a trailing `//` comment as a line suffix that never counts toward
  // fitting (measured, flat at 124 columns), so the rule subtracts one before
  // measuring and a line-comment perturbation produces no divergence at all.
  // Anchored by the straddling fixture pair and the trailing-comment pair in
  // `src/tests/prefer-use-deep-compare-memo.test.ts`.
  // WIDTH/LAYOUT, same class as require-memo above. A `QUERY_KEY_*` constant is
  // longer than the key literal it replaces, so past the print width the fixer
  // emits the shape Prettier hugs a sole object argument into — the object open
  // beneath the call, one property per line, the closing brace and parenthesis
  // back at the statement's column (#2125). A trailing BLOCK comment occupies
  // columns on that line like any other text, so it carries a substitution that
  // fits on its own (68 columns) past the width and the object breaks around
  // it. Measured against Prettier 2.8.8, that is the identical answer the
  // formatter gives, and the fix's output is a Prettier fixed point in both
  // shapes.
  // Both shapes are valid and BOTH CARRY THE COMMENT — the marker census over
  // this rule's corpus reports 74 diverged variants and MARKERS_LOST=0 across
  // 1046 variants examined — so the remedy is not a decline, which would
  // withdraw a working fix. Ignoring those columns would re-emit the over-wide
  // line #2125 exists to prevent.
  // The mirror case is NOT excused and is fixed rather than baselined: a
  // trailing `//` comment is printed as a suffix that never counts toward
  // fitting, so the rule subtracts one before measuring and a line-comment
  // perturbation produces no divergence at all. A second STATEMENT on the line
  // is a third case and also not excused: its layout is Prettier's to decide,
  // so the key is substituted in place. Anchored by those three fixtures in
  // `src/tests/enforce-querykey-ts.test.ts`, so the own-corpus guard keeps the
  // entry honest.
  'enforce-querykey-ts :: TRANSFORM_DIVERGED':
    'chooses its shape by measured line width, which a trailing block comment legitimately changes exactly as it changes the answer Prettier itself gives; both shapes preserve the comment (#2125)',
  // WIDTH/LAYOUT, same class as require-memo above. Rewriting `.seg` into
  // `.get('seg', null)` adds thirteen columns per path segment, so past the
  // print width the fix emits the shape Prettier answers an over-wide call
  // argument with: the argument on its own line, a trailing comma, and the
  // closing parenthesis back at the call's column (#2123). A trailing BLOCK
  // comment occupies columns on that line like any other text, so it pushes a
  // rewritten literal that fits on its own (65 columns) past the width and the
  // call breaks around it. Measured against Prettier 2.8.8, that is the
  // identical answer the formatter gives: it breaks
  // `publish("…get('org', null)…"); /* c */` open at 85 columns and leaves the
  // same statement flat without the comment, and the fix's broken output is a
  // Prettier fixed point.
  // Both shapes are valid and BOTH CARRY THE COMMENT — measured, zero markers
  // are lost across this rule's corpus — so the remedy is not a decline, which
  // would withdraw a working fix. Ignoring those columns would re-emit the
  // over-wide line #2123 exists to prevent.
  // The mirror case is NOT excused and is fixed rather than baselined: a
  // trailing `//` comment is printed as a suffix that never counts toward
  // fitting, so the identical rewrite stays flat and a line-comment
  // perturbation produces no divergence at all. Anchored by that straddling
  // trailing-comment pair in
  // `src/tests/enforce-firestore-rules-get-access.test.ts`, so the own-corpus
  // guard keeps it honest.
  'enforce-firestore-rules-get-access :: TRANSFORM_DIVERGED':
    'chooses its shape by measured line width, which a trailing block comment legitimately changes exactly as it changes the answer Prettier itself gives; both shapes preserve the comment (#2123)',
  'prefer-use-deep-compare-memo :: TRANSFORM_DIVERGED':
    'chooses its shape by measured line width, which a block comment on the call line legitimately changes exactly as it changes the answer Prettier itself gives; both shapes preserve the comment (#2064)',
  // WIDTH/LAYOUT, same class as require-memo above. Having replaced a wide
  // conditional with a short lookup, the fixer joins the enclosing statement
  // back onto one line when the shortened statement fits, because that is what
  // Prettier does with it (#2060). A comment inside the span that join would
  // absorb legitimately changes PRETTIER'S OWN layout answer — a `//` comment
  // forces the break to stay, and a comment on its own line keeps the call open
  // — so the fixer declines the join there, which tracks Prettier rather than
  // diverging from it. The conversion itself still happens in both shapes.
  // NOT a COMMENT_LOST in disguise: that kind is a separate key and stays
  // gated, and the case that used to lose a comment here — one after Prettier's
  // dangling comma, adjacent to neither end of the absorbed span — is fixed and
  // pinned by a fixture rather than excused. Verified by formatting every
  // shape at the repo's settings: the declined output is a Prettier fixed point
  // in each, except where the INPUT was not one either (a block comment between
  // the argument's comma and the closer, which Prettier rewrites with or
  // without this rule).
  // The parenthesis widening (#2063) is the same shape and the same remedy: a
  // comment between a parenthesis and the expression it groups sits in the
  // margin that widening adds, so the fixer steps down to the narrower
  // replacement and both the conversion and the comment survive. It shares this
  // entry because it is measured by the same gate, on the same span.
  'prefer-map-over-conditional-dispatch :: TRANSFORM_DIVERGED':
    'declines a layout widening — the shortened-statement join, or the now-redundant parentheses — when a comment sits in the span it would absorb; Prettier makes the same layout choice, and every shape keeps both the conversion and the comment (#2060, #2063)',
  // WIDTH/LAYOUT, same class as require-memo above, and both arms track what
  // Prettier itself does with the merged call (#2086). The merged argument list
  // is emitted flat while it fits the print width and one argument per line —
  // with the trailing comma a formatter writes into any list it breaks — once it
  // does not, so a comment changes the layout in exactly two ways:
  //
  //   1. A LINE comment (19 of the 20 cases). It cannot ride on a single-line
  //      argument list at all: folded onto one line it would swallow the closing
  //      parenthesis and the rest of the call. The list therefore has to break,
  //      whatever its width. Measured, Prettier breaks the identical call one
  //      argument per line for the identical reason.
  //   2. A single-line BLOCK comment (1 case). It rides along inline and changes
  //      nothing — the `/* leading note */ alpha` and `alpha /* inline note */`
  //      fixtures are flat in both shapes — UNLESS its columns push the merged
  //      call past the width, which is the fixture straddling 80 columns at
  //      `arr.push(alphaAlpha, …, eeeeeeeeeeeeee)`: flat at 74 columns and
  //      broken at 94 once the marker is added. A comment occupies columns like
  //      any other text and Prettier counts it the same way — measured, it
  //      breaks that same call at 94 and leaves it flat at 74.
  //
  // BOTH SHAPES CARRY THE COMMENT, so nothing is consumed and the remedy is not
  // a decline: measured across 216 comparisons over this rule's own fixtures,
  // the marker survives every diverging output (0 lost), and every one of those
  // outputs is a fixed point of agora's pinned Prettier (2.8.8, not this repo's
  // 2.7.1). Ignoring the width would re-emit the always-expanded list that #2086
  // exists to remove, which Prettier collapsed again on 19 fixtures.
  // Anchored by the straddling fixture pair and the inline-block-comment
  // fixtures in `src/tests/flatten-push-calls.test.ts`, so the own-corpus guard
  // keeps this entry honest.
  'flatten-push-calls :: TRANSFORM_DIVERGED':
    'chooses its shape by measured print width, and must break the list outright for a line comment that would otherwise swallow the rest of the call; Prettier makes both choices identically and every shape carries the comment (#2086)',
  // DECLINE, plus one arm where the marker is genuinely not neutral. Two
  // classes reproduce here, both verified against the rule's own fixtures with
  // the probe replayed by hand (#2065):
  //
  //   1. DECLINE (12 of the 14 cases). The disable comment the fixer inserts
  //      needs a line of its own, which forces Prettier to print the hook call
  //      one argument per line, so the fix re-emits every byte between the
  //      parentheses. A comment written BETWEEN the arguments belongs to no
  //      argument and would be dropped by that re-emission, so the rule refuses
  //      the rewrite: the marker variants leave the source byte-identical and
  //      keep their report. Same shape and same remedy as
  //      `memo-compare-deeply-complex-props` above.
  //   2. NON-NEUTRAL MARKER (2 cases). Two fixtures already carry an
  //      `// eslint-disable-next-line react-hooks/exhaustive-deps` on the line
  //      above the hook call. A `-next-line` directive targets the line that
  //      FOLLOWS it, so inserting any comment between the directive and the
  //      call retargets the directive at the marker — ESLint's own semantics,
  //      not this rule's reading of them. The dependency array is then no
  //      longer suppressed, and the rule correctly writes a fresh disable where
  //      the base output needed none. Both outputs keep the marker; nothing is
  //      consumed.
  'enforce-stable-hash-spread-props :: TRANSFORM_DIVERGED':
    'declines the argument-list re-emission when a comment sits between the arguments (output byte-identical, report stands); and a marker inserted between an existing exhaustive-deps disable and its hook retargets that directive, so a fresh one is legitimately emitted (#2065)',
  // RESTRICTED PRODUCTION. A correctness constraint rather than a layout
  // choice, and confined to one arm of the fix: the call standing where a line
  // terminator ends the construct — the argument of `return`, `throw` or
  // `yield`, or the operand of a postfix `++`. The unwrap carries every comment
  // stranded inside the call, and a comment that owns its line puts a line
  // terminator in the middle of what is written; the parentheses are what keep
  // that terminator inert. Bare, `return` followed by a terminator is ASI: the
  // function hands back `undefined` and the inlined expression stands as dead
  // code (#1963). MEASURED BY EXECUTION rather than asserted —
  // `src/tests/no-useless-usememo-primitives.test.ts` runs both spellings of the
  // emitted output and gets the value from the parenthesised one and
  // `undefined` from the bare one.
  // BOTH SHAPES CARRY THE COMMENT, so nothing is consumed and the remedy is not
  // a decline: the perturbed variant is parenthesised and the unperturbed one is
  // not, and the token streams differ by exactly that pair.
  // The arm is narrow on purpose. Outside a restricted production the same
  // carried comment drops the parentheses, because a pair the landing position
  // never asked for is text prettier deletes again, which fails
  // `prettier --check` on every fixed file (#2071) — an unconditional wrapper
  // here would reintroduce that for `return useMemo(...)`, the rule shape most
  // real code is written in. Anchored by the `useNullValue` fixture in
  // `src/tests/no-useless-usememo-primitives.test.ts`: a
  // `return useMemo(() => { ... }, [])` carrying no comment of its own, which
  // the probe trailing-marker variant turns into the parenthesised shape, so the
  // own-corpus guard keeps this entry honest.
  'no-useless-usememo-primitives :: TRANSFORM_DIVERGED':
    'parenthesises the inlined expression when a carried comment puts a line terminator inside a restricted production, where bare ASI would return `undefined` instead (#1963); both shapes carry the comment, so nothing is consumed (#2071)',
  // FORMATTING. The divergence is line wrapping and trailing commas only.
  // Verified by formatting both outputs with agora's pinned prettier (2.8.8,
  // not this repo's 2.7.1) and comparing code tokens: all cases converge. agora
  // enforces prettier through the fixable `prettier/prettier` rule rather than a
  // `prettier --check` step, so the drift self-heals in the same `--fix` run.
  'prefer-sx-prop-over-system-props :: TRANSFORM_DIVERGED':
    'wrapping-only divergence that agora prettier normalizes to an identical token stream',
  // WIDTH-DRIVEN LAYOUT, the #2086 class. Stripping the redundant annotation
  // makes a parameter list that was broken across lines fit on one, so the fixer
  // re-lays it out at the measured print width rather than leaving behind the
  // expanded list prettier collapses again on the next pass — which is the whole
  // of #2130. Measuring the width makes a comment a layout INPUT rather than
  // text the fixer consumes: a block comment written above a parameter is one
  // prettier itself holds the list open for, so the fixer keeps it broken and
  // the marker rides along, where the same input without it collapses to
  // `(event)`. Both shapes are what prettier prints for their own input.
  // NOTHING IS CONSUMED: this guard classifies a dropped comment as
  // COMMENT_LOST and an unparseable output as PARSE_BREAK, and this rule reaches
  // neither — all 79 diverging outputs still carry the marker. Anchored by the
  // bidirectional width fixtures in `src/tests/no-redundant-param-types.test.ts`
  // (pairs pinned at exactly 80 and 81 columns), so the own-corpus guard keeps
  // this entry honest.
  'no-redundant-param-types :: TRANSFORM_DIVERGED':
    'chooses the shape of the stripped parameter list by measured print width, and keeps the list broken for a comment prettier itself holds it open for; prettier makes the same choice in every shape and the comment is carried in all of them (#2130)',
  'use-custom-memo :: TRANSFORM_DIVERGED':
    'trailing-comma/wrapping divergence that agora prettier normalizes to an identical token stream',
  'use-latest-callback :: TRANSFORM_DIVERGED':
    'wrapping-only divergence that agora prettier normalizes to an identical token stream',
  // DECLINE. The batch manager arm is the rule's one rewrite that cannot edit
  // the call in place: `update(ref, data)` carries two positional arguments
  // where `set` takes a single descriptor, so the argument list is rebuilt from
  // the text of the receiver and the two arguments. That rebuild copies nothing
  // BETWEEN those pieces, and a comment sitting between the arguments is
  // dropped by it — a dropped `eslint-disable` silently re-enables the rule it
  // suppressed (#1877). The rule refuses the rewrite there, so the file keeps
  // its report and is left byte-identical. The other rewrites edit the method
  // name and the argument list's separators in place — an argument's own text,
  // comments absorbed, is never re-emitted — and they too decline rather than
  // rewrite the one gap the spans do not absorb: a comment between the last
  // argument and the closing parenthesis (#2097).
  'enforce-firestore-set-merge :: TRANSFORM_DIVERGED':
    'declines the batchManager restructure rather than drop a comment sitting between the arguments it rebuilds from (#1877); output is byte-identical to the input and the report stands',
  // WIDTH/LAYOUT, same class as flatten-push-calls above, and the shape tracks
  // what Prettier itself prints for the converted call (#2091). Unwrapping
  // `useMemo(() => fn, deps)` into `useCallback(fn, deps)` deletes the wrapper
  // the comment sat inside, so the comment is re-hosted onto an argument of the
  // surviving call — and a LINE comment cannot ride on a single-line argument
  // list at all: folded onto one line it would swallow the closing parenthesis
  // and the rest of the call. The list therefore breaks one argument per line,
  // carrying the trailing comma a formatter writes into any list it breaks, and
  // that comma is the ENTIRE divergence: measured, the variant's token stream
  // equals the baseline's once trailing commas before a closer are dropped, on
  // 11 of 11 diverging cases.
  //
  // BOTH SHAPES CARRY THE COMMENT, so nothing is consumed and the remedy is not
  // a decline: measured across 866 comparisons over the 121 fixtures this rule
  // reports on (its own corpus and every other rule's), the marker survives
  // every diverging output (0 lost), and every one of those outputs is a fixed
  // point of agora's pinned Prettier (2.8.8, not this repo's 2.7.1). All 11 are
  // the TRAILING_LINE variant — 9 on this rule's own fixtures, 2 on
  // `no-redundant-usecallback-wrapper`'s — because that is the placement that
  // lands a `//` comment inside the collapsed wrapper. Emitting the flat list
  // anyway is what #2091 exists to remove: Prettier rewrote it on sight.
  // Anchored by the `// tail`, `// before`/`// after` and multi-line block
  // comment fixtures in
  // `src/tests/prefer-usecallback-over-usememo-for-functions.test.ts`, so the
  // own-corpus guard keeps this entry honest.
  'prefer-usecallback-over-usememo-for-functions :: TRANSFORM_DIVERGED':
    'breaks the converted argument list open for a comment that cannot ride on a flat one, which adds only the trailing comma a formatter writes into a broken list; Prettier makes the same choice and every shape carries the comment (#2091)',

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

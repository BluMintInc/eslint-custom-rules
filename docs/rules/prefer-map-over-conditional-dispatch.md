# Prefer a Record<Discriminant, Value> lookup over switch/ternary/if-else dispatch on a literal-union discriminant where every branch returns or assigns a single value (`@blumintinc/blumint/prefer-map-over-conditional-dispatch`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

💭 This rule requires [type information](https://typescript-eslint.io/linting/typed-linting).

<!-- end auto-generated rule header -->

A `switch`, a chain of `? :` ternaries, or an `if`/`else if` chain that dispatches
on the **same literal-union-typed discriminant** where every branch simply
**returns or assigns a single value** is a lookup table wearing imperative
clothing. This rule detects that shape and rewrites it as a
`Record<Discriminant, Value>` lookup.

```ts
// Before: the function IS a lookup table, hidden behind control flow
switch (token.standard) {
  case 'native':
    return NativeTokenEncoder;
  case 'ERC20':
    return Erc20TokenEncoder;
  // ...one branch per union member
}

// After: the lookup table IS a lookup table
const RESULT_BY_STANDARD: Record<
  TokenStandard,
  typeof NativeTokenEncoder | typeof Erc20TokenEncoder
> = {
  native: NativeTokenEncoder,
  ERC20: Erc20TokenEncoder,
};
return RESULT_BY_STANDARD[token.standard];
```

A `Record` makes exhaustiveness a **compile-time** guarantee — a missing key is
a type error the moment a new member joins the union — instead of a runtime
fallthrough risk. That guarantee lives in the key *type*, so the fix emits the
discriminant's type **expression** (`TokenStandard`, `ThumbnailBody['kind']`)
and the missing-key error lands on the `Record`; see
[The key type](#the-key-type). Adding a new case becomes a one-line data edit
instead of a new branch. This mechanizes BluMint's "Replace hardcoded
special-cases with data" doctrine.

This rule is the dispatch-side companion to
[`prefer-union-from-const-array`](./prefer-union-from-const-array.md): that rule
keeps the **key space** in data (an `as const` array deriving the union); this
rule keeps the **dispatch on that key space** in data (a `Record` keyed by the
union).

## This rule is type-aware

Unlike its sibling, this rule needs the TypeScript type checker
(`ParserServices` + `getTypeChecker()`). It fires **only** when the
discriminant's static type is a finite literal-string/number union — every
constituent must be a string-literal or number-literal type. A `boolean`, an
open `string`/`number`, an object type, or a function type anywhere in the union
means the rule does **not** fire. This single type gate is what protects
trust-boundary switches on raw runtime data (whose `default: throw` is
load-bearing validation), without any bespoke pattern-matching.

When TypeScript parser services are unavailable (non-type-aware parser), the
rule silently skips — consistent with preferring false negatives over false
positives.

## The narrowing exemption (highest priority — never fires)

The single most important exemption: a `switch`/chain on a **discriminated
union's tag** that *narrows the surrounding object* must never fire. A flat
`Record` cannot express "and also narrow the object to the matching variant."

When the discriminant is a member expression `obj.tag`, the rule scans every
**kept** branch value for a reference to the base object `obj` beyond the tag
access itself — reading another field (`obj.data`, `obj.userId`), casting it
(`obj as X`), or otherwise using the `obj` binding. If any kept branch touches
the base object, the whole construct is exempt.

```ts
// Never fires — each branch reads a variant-specific field after narrowing
switch (result.kind) {
  case 'success':
    return result.data.length; // `result.data` exists only on the success variant
  case 'failure':
    return 0;
}
```

The base object may be reached through `this`: a chain rooted at the `this`
keyword (`this.result.kind`, `this.options.target.type`) narrows exactly as one
rooted at a binding does, so the rule scans the kept branches for reads of the
same receiver and exempts the construct on the first one. Hoisting a narrowed
member read such as `this.result.data` into an eagerly-evaluated `Record` would
otherwise emit code that does not typecheck.

```ts
// Never fires — the narrowed base object is reached through `this`
class Holder {
  public result!: Result;

  public describe() {
    switch (this.result.kind) {
      case 'success':
        return this.result.data.length;
      case 'failure':
        return 0;
    }
  }
}
```

A `this` inside a nested `function` or class body is a different receiver, so it
does not count as reading the narrowed object; an arrow function's `this` is the
lexical one and does count, matching how a closure over an identifier-rooted base
object counts.

How the member is made private does not enter into any of this. A `private`
modifier and an ECMA private field (`#result`) are the same privacy, the walk to
the chain's root goes through the receiver rather than the property, and an
author who picks the `#` spelling cannot opt back into the other (`private #x` is
TS18010) — so `switch (this.#result.kind)` is exempt exactly as
`switch (this.result.kind)` is, and every non-narrowing `#private` dispatch
reports and autofixes exactly as its `private` twin does.

An optional-chained discriminant is read the same way, in every form. TypeScript
discriminates a union through `?.`, so `switch (result?.kind)` and
`result?.kind === 'success' ? ... : ...` narrow exactly as their plain spellings
do, and the exemption applies to all of them — a nullable discriminant is
precisely where `?.` gets written, and a `Record` hoisted out of one destroys the
same narrowing (`result.data` then fails with TS2339).

```ts
// Never fires — `?.` narrows the union just as the plain access does
switch (result?.kind) {
  case 'success':
    return result.data.length;
  case 'failure':
    return 0;
}
```

A non-null assertion is read the same way, wherever it sits in the chain
(`result!.kind`, `box?.r!.kind`, `result.kind!`). It asserts a value the
narrowing does not depend on, so an exemption that a `!` could switch off would
be an exemption for one spelling — and the `Record` it let through would hoist
`result.data` out of the narrowing exactly as before.

Where the construct is **not** narrowing, an optional-chained discriminant keeps
the ordinary autofix: the generated lookup copies the discriminant's source text
verbatim (`RESULT_BY_KIND[o?.kind]`), so the optional link survives intact.
Whether the chain can yield `undefined` is answered by the discriminant's *type*
— under `strictNullChecks` a nullish receiver makes `o?.kind` include
`undefined`, which routes to the report-only `Partial<Record<D, V>>` advice
below. That is a question about the type, not about the spelling, so it is
decided identically for a `switch`, a ternary and an `if`/`else if` chain.

A branch that returns a tag-independent constant (`case 'failure': return 0;`)
does not by itself disqualify the construct — it is the *sibling* branch's
`result.data` access that exempts the whole thing. A dropped `default` (see
coverage below) is not scanned: the real `deduceConstructor` example throws
`new HttpsError({ details: { token } })` in its default, yet still fires because
that default is unreachable for typed values and dropped by the fix.

## Detection shape

Every branch must reduce to **exactly one** value-producing statement: a single
`return <expr>;` or a single assignment `<target> = <expr>;` (a trailing `break`
is fine; an empty grouped case that falls through to the next case's body is
fine). Any branch with an extra statement, a bare side-effect call, a mutation,
or logging disqualifies the whole construct — that is genuine control flow, not
a hidden lookup table.

- **Grouped cases** (`case 'a': case 'b': return X;`) do fire; the fix expands
  them into repeated `Record` entries.
- For the **ternary** and **if/else-if** forms, "same discriminant" means
  token-identical AND restricted to an identifier or a call-free, non-computed
  member expression rooted at an identifier. Optional links and non-null
  assertions *inside* the chain (`slot?.role === 'title' ? ... : ...`,
  `slot!.role === ...`) are spellings of that same member read, so they qualify
  exactly as the plain access does — the `switch` form reads them that way too,
  so every form answers the same question about the same discriminant. An
  assertion on the whole tag access (`slot.role! === 'title' ? ... : ...`) and a
  `this`-rooted discriminant (`this.slot.role === 'title' ? ... : ...`) remain
  out of scope for these two forms. A call-bearing discriminant
  (`getKind() === 'a' ? ... : getKind() === 'b' ? ...`) does not fire —
  collapsing repeated evaluations into one lookup changes the evaluation count —
  and neither does a computed link (`a[i].kind`), whose index would be read once
  instead of once per test.
- A lone `x === 'lit' ? a : b` on a 2-member union is a fully-covered chain of
  length 1 and does fire.

## Options

```js
'@blumintinc/blumint/prefer-map-over-conditional-dispatch': ['error', {
  // Column the autofix measures the emitted declaration head against
  printWidth: 80,
  // Quote style the autofix spells emitted string literals with
  singleQuote: true,
}]
```

### `printWidth`

Type: `number`

Default: `80`

The column the autofix measures against, matching Prettier's option of the same
name. Set it to your formatter's `printWidth` so the fixed source is already in
the shape the formatter would produce; a lint run carrying `--fix` otherwise
leaves the tree failing `prettier --check`. See
[Line width](#line-width).

### `singleQuote`

Type: `boolean`

Default: `true`

The quote style the autofix spells emitted string literals with, matching
Prettier's option of the same name. It governs both the keys the fixer
synthesizes and any string-literal type it inlines into the emitted
`Record<...>` key — the compiler prints a literal type as `"a" | "b"` whatever
the codebase's style is, so without this the fix would ship double quotes into a
single-quoted tree and fail `prettier --check` at any width. See
[Quote style](#quote-style).

## Coverage and autofix carve-outs

The rule **reports** on every qualifying construct, but applies the **autofix**
(`preferMap`) only when all of the following hold; otherwise it emits a
report-only message (`preferMapManual`) explaining why and suggesting the shape:

- **Full explicit coverage.** Every union member has an explicit case/test, or a
  `default`/final-`else`/final-`alternate` covers exactly the one remaining
  member. If a `default`/tail covers **multiple** remaining members (partial
  coverage), the fix is skipped — use `Partial<Record<D, V>>` with a `?? default`
  at the lookup site. If the union includes `undefined`/`null`, the fix is
  skipped (nullish keys are not Record-expressible).
- **Side-effect-free branch values.** Every branch value is composed only of
  literals, identifiers, member expressions, template literals, and
  unary/logical/conditional/JSX compositions thereof. Returning a **function or
  class reference** (`return handleStart;`, `return NativeTokenEncoder;`) is
  side-effect-free and autofixes. **Invoking** (`return handleStart();`) or
  **awaiting** (`return await fetchA();`) reports without a fix — a `Record` of
  eager values would run every branch's effects at construction. Async dispatch
  is left report-only with a suggested thunk shape
  (`Record<D, () => Promise<V>>` invoked after lookup) rather than risk an
  incorrect eager-evaluation autofix.
- **A function-valued branch is already that thunk.** The eager test stops at a
  function boundary, so a branch value that *is* a function — a concise arrow
  (`return (input: string) => trim(input);`), a block-bodied one, or an `async`
  function expression whose body awaits — autofixes however busy its body is:
  the body runs on invocation, after the lookup, and a default parameter is
  evaluated on invocation too. What blocks the fix is a call or `await`
  evaluated where the `Record` literal is built, so a **top-level** `await`
  still reports. A class expression is deliberately not a boundary — its static
  initializers, static blocks, computed member names and parameter decorators
  all run when the class definition is evaluated, which the `Record` literal
  does for every entry.
- **A derivable, collision-free lookup name.** The name is derived
  deterministically from the discriminant as `RESULT_BY_<KEY>`, upper-snake-cased
  from the discriminant's identifier or trailing member property
  (`token.standard` → `RESULT_BY_STANDARD`, `side` → `RESULT_BY_SIDE`). An ECMA
  private field is a trailing member property like any other: `this.#tier` and
  `this.tier` both derive `RESULT_BY_TIER`, because the two are the same privacy
  written two ways (and mutually exclusive — `private #tier` is TS18010), and the
  emitted lookup copies the discriminant's source text verbatim, so `this.#tier`
  is still read as `this.#tier` from inside the class body where the fix lands.
  If the derived name already appears in the file, or a dispatch earlier in the
  same scope has already claimed it (`#tier` and a sibling public `tier` are
  different members that derive the same constant, and two `const RESULT_BY_TIER`
  in one scope do not compile), or no usable name can be derived at all, the fix
  is skipped — and the message names which of those happened.
- **The fix can be placed.** A ternary hoists its `Record` to the enclosing
  statement; if that would cross a function boundary (a ternary as an
  expression-bodied arrow's body), the fix is skipped so values/discriminant
  stay in scope. Inside a class, the enclosing statement of a field initializer
  or `static` block is the class declaration itself, so the hoist leaves the
  class body: a branch value reading `this` or a `#private` member cannot travel
  there (TS18013), and the fix is skipped. Branch values that need nothing from
  the class still hoist, and the lookup replacing the construct never moves, so a
  `#private` discriminant is always read where it was written.
  The `switch` and `if`/`else if` forms are replaced where they stand, with a
  declaration followed by a statement, so they need a statement **list** to land
  in. A construct that is the entire body of a braceless branch
  (`if (cond) switch (x) { ... }`) sits where a lexical declaration is not
  allowed at all (TS1156); it reports, and the fix waits for braces.
- **The hoist stays inside its guard.** A braceless body is not a statement
  list, so a ternary written as one hoists its `Record` past the construct that
  guards it: `if (box) return kind === 'a' ? box.a.v : box.b.v;` would place the
  `Record` **above** the `if`, dereferencing both branch values with the
  narrowing that made them safe left behind (TS18048 under `strict`, and a
  `TypeError` at run time when `box` is `undefined`). The same walk leaves a
  loop's own scope, so `for (const r of rows) total += kind === 'a' ? r.a.v :
  r.b.v;` would read `r` where no `r` is declared (TS2304). The fix is therefore
  skipped whenever reaching the insertion point crosses something that decides
  **whether** — or **how often** — the ternary runs: a braceless `if` branch,
  any loop body, a `while`/`do…while` test, the right operand of `&&`/`||`/`??`,
  or an arm of an enclosing ternary. Adding braces around the branch stops the
  hoist inside the guarded block, where the values are still narrowed and every
  loop binding is still in scope, and the fix then applies. Positions evaluated
  exactly once before the construct they head — an `if` test, a `for` init, a
  `for…of` right-hand side — guard nothing and still hoist.
- **A printable, in-scope annotation.** The `Record<D, V>` value type is
  synthesized from the checker's printed types. Union members in function,
  constructor, or conditional notation are parenthesized, as TypeScript
  requires (`((a: A) => void) | ((b: B) => void)`, never
  `(a: A) => void | (b: B) => void`). If the synthesized annotation still
  fails to parse, or names a type that is not in scope at the fix site (the
  checker prints a symbol's bare name with no regard for imports — an
  unimported helper type prints the same as an imported one), the fix is
  skipped — import the type or write the `Record` manually.
- **An annotation whose names still mean what was printed.** Being in scope is
  not enough: a printed bare name must still **denote** the symbol it was
  printed for at the place the `Record` lands. A nearer declaration of the same
  name — a local `type`, `interface`, `class` or `enum` between the type's
  declaration and the dispatch — is in scope and binds the annotation to
  itself, on either side of the `Record`. A shadow that is incompatible breaks
  the build (`Record<Mode, V>` where the local `Mode` is an object type is
  TS2344); a compatible one is worse, because it compiles: the map is keyed on
  the shadow instead of the union, so growing the union no longer fails the
  build and the promise this rule is made on is silently gone. The correct
  spelling is not derivable — the outer type has no reachable name there at all
  — so the fix is skipped and only the report stands. Rename the shadowing type
  (or write the `Record` manually) and the fix applies. A same-named type
  declared somewhere that does not enclose the dispatch shadows nothing and
  costs the fix nothing.
- **An annotation that fits the print width.** The head the fixer authors is
  laid out the way Prettier lays it out (see [Line width](#line-width)). When
  no such layout exists — a single printed type too long for its own line that
  Prettier would open up, such as a function type with several parameters —
  the fix is skipped rather than shipping a head the formatter rewrites.
- **Map entries the formatter would keep.** A JSX branch value is laid out on
  its entry the way Prettier lays it out (see
  [JSX branch values](#jsx-branch-values)). A value whose entry Prettier would
  open up further — an element past the width even on a line of its own, or
  one nesting an element child — is a shape the fixer cannot author, so the
  fix is skipped rather than shipping an entry the formatter rewrites.
- **Hostable comments.** Comments inside the converted construct are carried
  onto the generated `Record`: a branch's leading comments (including
  `eslint-disable-next-line` and `@ts-expect-error` directives that target the
  branch's value line) land directly above the map entry that hosts the value
  they annotated, a same-line trailing comment (including
  `eslint-disable-line`) stays on its entry's line, comments inside a copied
  value expression travel verbatim, and comments inside a dropped unreachable
  `default`/`else`/tail die with the code they annotate. If a comment cannot
  be hosted without changing what it annotates or suppresses — a directive on
  a grouped case that expands into several entries, a directive separated from
  its value by a blank line, a region directive (`/* eslint-disable */`), or a
  comment after the last branch — the fix is skipped so the comment is never
  destroyed or silently retargeted.

The autofix constructs the `Record` **inline at the site** with an explicit
`Record<D, V>` annotation (never `satisfies`, which Next.js 12's SWC cannot
parse) so branch values that close over local scope stay valid, then indexes it.
The derived form is a `Record` index — not a switch/ternary/if — so it never
re-flags (the fix is idempotent).

### Key emission

An inline-literal case test becomes a plain key (`case 'active':` → `active:`,
`case 3:` → `3:`). Any other test — a constant reference, an enum member, a
template literal, a negated number — becomes a **computed key carrying the
original expression**:

```ts
switch (status) {
  case THIS_DEVICE_STATUS.active: return <Row status="active" />;
  case THIS_DEVICE_STATUS.blocked: return <Row status="blocked" />;
}
```

```ts
const RESULT_BY_STATUS: Record<'active' | 'blocked', JSX.Element> = {
  [THIS_DEVICE_STATUS.active]: <Row status="active" />,
  [THIS_DEVICE_STATUS.blocked]: <Row status="blocked" />,
};
return RESULT_BY_STATUS[status];
```

The checker resolves such a test to a literal value — that is how the rule
proves the discriminant is a finite literal union — but emitting the *value* as
the key would strip the reference: the constant is left unused (an imported one
then fails `@typescript-eslint/no-unused-vars`) and its value is baked into the
call site, so the map no longer tracks the single source of truth the constant
exists to provide. The computed key is type-safe by construction: the fix runs
only after the checker resolved the expression to a string/number *literal*
type, so the key is a literal key and `Record<D, V>` stays exhaustive over it.
Keys for the member a `default`/`else` covers have no case-test expression of
their own and stay plain.

### The key type

The exhaustiveness guarantee lives entirely in the `Record`'s **key type**, so
the fix emits a type expression that keeps tracking the union rather than the
literal union the checker resolved the discriminant to:

- a discriminant whose own type prints as a name keeps that name
  (`Record<TokenStandard, V>`, `Record<Mode, V>`);
- a tag access such as `body.kind`, whose resolved type is an anonymous literal
  union, is emitted as the indexed access through the object's named type
  (`Record<ThumbnailBody['kind'], V>`);
- when no name is reachable — a fully inline type such as
  `declare const o: { kind: 'a' | 'b' }`, or a tag access the surrounding flow
  has already narrowed below its declared union — the resolved literal union is
  the only faithful spelling and stays.

The difference is not cosmetic. With the literal union inlined, a `Record` that
has fallen behind its union still typechecks on its own and only the **lookup**
errors, as `TS7053` ("implicitly has an 'any' type"). That is an implicit-any
diagnostic, so under `noImplicitAny: false` nothing is reported at all and the
lookup silently yields `undefined` for the new member; even under full `strict`
the error lands at the lookup site rather than on the table that is missing the
key. With the type expression the error is `TS2741` ("Property 'c' is missing")
on the `Record` itself — it names exactly what to add and does not depend on
`noImplicitAny`.

The derived spelling ships only when the name resolves at the fix site and the
property's declared key set matches the discriminant's; otherwise the fix falls
back to the resolved literal union, because a weak key type beats one that does
not compile.

### Line width

The fixer authors the whole declaration head — the lookup name, both `Record`
type arguments and the `= {` that opens the map — and both type arguments grow
with the source: the value type is the distinct branch value types joined with
`|`, and an anonymous discriminant union is inlined into the key type. The head
is therefore measured against [`printWidth`](#printwidth) and emitted in the
layout Prettier itself settles on, which has three regimes:

```ts
// Fits: one line.
function pickFits() {
  const RESULT_BY_MODE: Record<Mode, typeof PlainSummary | typeof FancyCard> = {
    plain: PlainSummary,
    fancy: FancyCard,
  };
  return RESULT_BY_MODE[mode];
}

// Over by one or two columns: the annotation through the `=` still fits, so
// the map moves to its own line.
function pickNarrowlyOver() {
  const RESULT_BY_MODE: Record<Mode, typeof PlainSummary | typeof FancyCards> =
    {
      plain: PlainSummary,
      fancy: FancyCards,
    };
  return RESULT_BY_MODE[mode];
}

// Further over: the type-argument list breaks open, and a value union that
// does not fit its own line is spelled one member per line.
function deduceEncoder() {
  const RESULT_BY_STANDARD: Record<
    TokenStandard,
    | typeof NativeTokenEncoder
    | typeof Erc20TokenEncoder
    | typeof OffchainTokenEncoder
  > = {
    native: NativeTokenEncoder,
    ERC20: Erc20TokenEncoder,
    offchain: OffchainTokenEncoder,
  };
  return RESULT_BY_STANDARD[token.standard];
}
```

The middle regime is withheld for an annotation Prettier calls *complex* — one
whose key or value type is itself a generic reference (`Record<Mode, Box<Row>>`)
or a conditional type. Prettier breaks the argument list for those however
narrowly the head overflows, so the fixer does too.

Each regime is a measurement, not a preference. Wrapping unconditionally would
break the first case just as badly: Prettier collapses a hand-broken
`Record<Mode, string>` straight back onto one line, so a fixer that always
wraps trades this failure for its mirror image on every short dispatch.

A type with no break point of its own — a reference, a `typeof` query, a
literal, and the array / `keyof` / indexed-access wrappers around one — is left
on its own over-wide line, because that is what Prettier does with it. A type
Prettier *would* open up (a function type's parameter list, a type literal's
members, a two-argument type-argument list) is a shape the fixer cannot author,
so it declines the fix instead.

#### JSX branch values

Map entries are measured too, because a key is wider than the `return ` it
replaces — a computed key such as `[THIS_DEVICE_STATUS.unregistered]` by a
good margin. A JSX branch that fit on its own line inside the switch therefore
overflows once it becomes an entry, and Prettier answers that by
parenthesizing the element onto lines of its own. The fixer emits that layout
rather than the flat line Prettier would immediately reopen:

```ts
const RESULT_BY_STATUS: Record<Status, ReactNode> = {
  [THIS_DEVICE_STATUS.active]: device ? (
    <ThisDeviceRow device={device} status="active" />
  ) : null,
  [THIS_DEVICE_STATUS.unregistered]: (
    <ThisDeviceRow status="unregistered" onTurnOn={turnOn} />
  ),
};
```

A `null` or `undefined` branch stays inline, as above, because Prettier never
parenthesizes those. An entry within the width keeps its single line — the
parentheses appear only when the entry breaks — and an element the source
already broke across lines is parenthesized and re-indented onto the entry.

Two JSX shapes have no entry spelling the fixer can author, and are reported
without a fix:

- an element still past the width on a line of its own, which Prettier answers
  by breaking its attribute list apart;
- an element nesting an **element** child (`<Row><Inner /></Row>`) written on
  one line, which Prettier opens across lines wherever it lands. An expression
  child (`<Row>{child}</Row>`) does not open its parent, and keeps its fix.

### The replaced span

The lookup is shorter than the construct it replaces, so the fixer's other job
at the fix site is dropping the text that shortening leaves stale: a line break
the enclosing statement took only because the ternary was wide, and the
parentheses that used to bind the ternary. Precedence is a property of the
replacement text — an indexed lookup binds tighter than every operator that
could enclose it — so `(kind === 'a' ? 1 : 2) > 0`, whose parentheses the
ternary genuinely needed, becomes `RESULT_BY_KIND[kind] > 0` rather than
`(RESULT_BY_KIND[kind]) > 0`, which the next `prettier --write` would strip.

Both widenings are established rather than assumed. Parentheses the parent's
own syntax requires stay — an `if`/`while`/`switch` head, a lone call or `new`
argument list — and so does a decorator's pair, whose grammar admits no indexed
access. A widening that would absorb a comment (one written between a
parenthesis and the expression it groups, say) is dropped in favour of the
narrower replacement, so the conversion and the comment both survive.

### Quote style

Two of the things the fixer authors are string literals: the map's keys, and —
when the discriminant is an anonymous union rather than a named alias — the
literal types inlined into the `Record`'s key argument. The key type is read
back from the compiler, which prints a string-literal type with double quotes
unconditionally, so both are re-spelled at [`singleQuote`](#singlequote) before
they ship.

The delimiter is chosen the way Prettier chooses it, by occurrence count rather
than by preference: the configured quote wins unless the content holds strictly
more of it than of the other, in which case the other wins because it needs
fewer escapes. A tie keeps the configured quote.

```ts
// Configured quote, and escapes are re-spelled to match the new delimiter.
const RESULT_BY_KIND: Record<'a' | 'b', number> = {

// Content with more single quotes than double keeps double quotes, because
// that is the spelling Prettier settles on.
const RESULT_BY_KIND: Record<"it's" | 'b', number> = {
```

Re-spelling happens on the parsed type's literal nodes, not by rewriting the
type text: re-escaping is a property of the literal being re-delimited, and a
quote inside a **template** literal type is not a delimiter at all and is left
untouched.

### Incorrect

Because the rule fires only when the discriminant's static type is a finite
literal union, each example declares that type — an undeclared discriminant is
`any` and is never flagged.

```ts
type TokenStandard = 'native' | 'ERC20';
declare class NativeTokenEncoder {}
declare class Erc20TokenEncoder {}
declare class HttpsError {
  constructor(o: { code: string });
}
declare const token: { standard: TokenStandard };

// Full coverage — autofixes (default throw is dropped)
function deduceConstructor() {
  switch (token.standard) {
    case 'native': return NativeTokenEncoder;
    case 'ERC20': return Erc20TokenEncoder;
    default: throw new HttpsError({ code: 'invalid-argument' });
  }
}

type Side = 'buy' | 'sell';
declare const side: Side;

// 2-member ternary — autofixes
function getLabel() {
  const label = side === 'buy' ? 'Buy now' : 'Sell now';
  return label;
}

type Raw = 'granted' | 'denied' | 'prompt' | 'unknown';
declare const raw: Raw;

// Partial-coverage default — report-only (use Partial<Record> + ?? fallback)
function normalize() {
  switch (raw) {
    case 'granted': return 'granted';
    case 'denied': return 'denied';
    default: return 'unsupported';
  }
}

type Source = 'algolia' | 'firestore';
declare const source: Source;
declare const query: string;
declare function fetchFromAlgolia(q: string): Promise<string>;
declare function fetchFromFirestore(q: string): Promise<string>;

// Async / call-bearing branches — report-only (thunk shape suggested)
async function search() {
  switch (source) {
    case 'algolia': return await fetchFromAlgolia(query);
    case 'firestore': return await fetchFromFirestore(query);
  }
}

type Kind = 'a' | 'b';
declare const kind: Kind;
declare const box: { a: { v: number }; b: { v: number } } | undefined;

// Ternary as the body of a braceless guard — report-only, because the Record
// would hoist above the `if` and dereference both values unguarded. Add braces
// around the branch and the same dispatch autofixes inside the guard.
function read() {
  if (box) return kind === 'a' ? box.a.v : box.b.v;
  return 0;
}
```

### Correct

```ts
type ReportTarget =
  | { type: 'profile'; userId: string }
  | { type: 'tournament'; tournamentId: string };
declare const target: ReportTarget;

// Discriminated-union narrowing — never fires
function describeTarget() {
  switch (target.type) {
    case 'profile': return `p-${target.userId}`;
    case 'tournament': return `t-${target.tournamentId}`;
  }
}

// The same narrowing reached through `this` — never fires
class ReportAlerter {
  private readonly options!: { target: ReportTarget };

  private get targetReference() {
    switch (this.options.target.type) {
      case 'profile': return `User: ${this.options.target.userId}`;
      case 'tournament': return `Tournament: ${this.options.target.tournamentId}`;
    }
  }
}

declare function splitEncodedToken<T>(encoded: string, n: number): T;
declare function decodeNative(encoded: string): string;
declare const encoded: string;

// Non-literal (trust-boundary) discriminant — never fires
function decode() {
  const [standard] = splitEncodedToken<[string, string]>(encoded, 2);
  switch (standard) {
    case 'native': return decodeNative(encoded);
    default: throw new Error('Unsupported standard');
  }
}

declare const onChange: 'disabled' | ((next?: number) => void);
declare function set(next?: number): void;

// Guard idiom whose union contains a function type — never fires
function resolveOnChange() {
  return onChange === 'disabled' ? 'disabled' : (next?: number) => set(next);
}

type Level = 'warn' | 'info';
declare const level: Level;
declare const data: unknown;

// Side-effect dispatch — never fires (no unified produced value)
function log() {
  switch (level) {
    case 'warn': console.warn(data); break;
    default: console.log(data);
  }
}

type Side = 'buy' | 'sell';
declare const side: Side;

// The rule's own derived form — idempotent, never re-flags
function label() {
  const RESULT_BY_SIDE: Record<Side, string> = {
    buy: 'Buy now',
    sell: 'Sell now',
  };
  return RESULT_BY_SIDE[side];
}
```

## When Not To Use It

If a specific dispatch genuinely must stay imperative (for example, a
performance-sensitive hot path where eager `Record` construction is undesirable),
use a per-line disable with a written justification rather than turning the rule
off:

```ts
// eslint-disable-next-line @blumintinc/blumint/prefer-map-over-conditional-dispatch -- hot path; Record allocation per call is measurable here
switch (kind) {
  case 'a': return A;
  case 'b': return B;
}
```

## Related Rules

- [`prefer-union-from-const-array`](./prefer-union-from-const-array.md) —
  complementary half of the same review thread: it keeps the key space in data;
  this rule keeps the dispatch in data.
- `no-misused-switch-case` — polices incorrect switch-case syntax; this rule
  replaces a whole class of switches with data. No overlap.

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
const RESULT_BY_STANDARD: Record<TokenStandard, typeof NativeTokenEncoder | typeof Erc20TokenEncoder> = {
  native: NativeTokenEncoder,
  ERC20: Erc20TokenEncoder,
};
return RESULT_BY_STANDARD[token.standard];
```

A `Record` makes exhaustiveness a **compile-time** guarantee — under `strict`, a
missing key is a type error the moment a new member joins the union — instead of
a runtime fallthrough risk. Adding a new case becomes a one-line data edit
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

An optional-chained discriminant is read the same way. TypeScript discriminates
a union through `?.`, so `switch (result?.kind)` narrows exactly as
`switch (result.kind)` does, and the exemption applies to both — a nullable
discriminant is precisely where `?.` gets written, and a `Record` hoisted out of
one destroys the same narrowing (`result.data` then fails with TS2339).

```ts
// Never fires — `?.` narrows the union just as the plain access does
switch (result?.kind) {
  case 'success':
    return result.data.length;
  case 'failure':
    return 0;
}
```

Where the construct is **not** narrowing, an optional-chained discriminant keeps
the ordinary autofix: the generated lookup copies the discriminant's source text
verbatim (`RESULT_BY_KIND[o?.kind]`), so the optional link survives intact.
Whether the chain can yield `undefined` is answered by the discriminant's *type*
— under `strictNullChecks` a nullish receiver makes `o?.kind` include
`undefined`, which routes to the report-only `Partial<Record<D, V>>` advice
below.

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
  token-identical AND restricted to an identifier or a non-optional, call-free
  member expression rooted at an identifier (a `this`-rooted or optional-chained
  discriminant such as `this.slot.role === 'title' ? ... : ...` or
  `slot?.role === 'title' ? ... : ...` is out of scope for those two forms; the
  `switch` form accepts both). A call-bearing discriminant
  (`getKind() === 'a' ? ... : getKind() === 'b' ? ...`) does not fire —
  collapsing repeated evaluations into one lookup changes the evaluation count.
- A lone `x === 'lit' ? a : b` on a 2-member union is a fully-covered chain of
  length 1 and does fire.

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
- **A derivable, collision-free lookup name.** The name is derived
  deterministically from the discriminant as `RESULT_BY_<KEY>`, upper-snake-cased
  from the discriminant's identifier or trailing member property
  (`token.standard` → `RESULT_BY_STANDARD`, `side` → `RESULT_BY_SIDE`). If that
  name already appears in scope, or no usable name can be derived, the fix is
  skipped.
- **The fix can be placed.** A ternary hoists its `Record` to the enclosing
  statement; if that would cross a function boundary (a ternary as an
  expression-bodied arrow's body), the fix is skipped so values/discriminant
  stay in scope.
- **A printable, in-scope annotation.** The `Record<D, V>` value type is
  synthesized from the checker's printed types. Union members in function,
  constructor, or conditional notation are parenthesized, as TypeScript
  requires (`((a: A) => void) | ((b: B) => void)`, never
  `(a: A) => void | (b: B) => void`). If the synthesized annotation still
  fails to parse, or names a type that is not in scope at the fix site (the
  checker prints a symbol's bare name with no regard for imports — an
  unimported helper type prints the same as an imported one), the fix is
  skipped — import the type or write the `Record` manually.
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
  const RESULT_BY_SIDE: Record<Side, string> = { buy: 'Buy now', sell: 'Sell now' };
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

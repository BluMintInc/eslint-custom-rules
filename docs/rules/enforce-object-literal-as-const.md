# Enforce that object literals returned from functions should be marked with `as const` to ensure type safety and immutability (`@blumintinc/blumint/enforce-object-literal-as-const`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

An object or array literal returned from a function is widened by TypeScript: `return { role: 'admin' }` infers `{ role: string }`, and `return [group, groupRef]` infers `(GroupInfo | DocumentReference<GroupInfo>)[]` rather than the tuple the caller destructures. Marking the literal `as const` keeps the literal types and the tuple shape, and makes the returned value readonly so callers cannot mutate a value the producer treats as constant.

This rule reports object and array literals returned directly from a function and auto-fixes by appending `as const`. An **array** literal is reported only where the enclosing signature states a type that accepts a readonly tuple — see [An array literal the signature does not accept as readonly](#an-array-literal-the-signature-does-not-accept-as-readonly). One reported shape is deliberately left unfixed — see [A literal that already carries an assertion](#a-literal-that-already-carries-an-assertion).

## Rule Details

A `return` statement is reported when all of the following hold:

- It sits inside a function, arrow function, function expression, or method (a getter, a static method, and a generator all count).
- Its argument is an object literal or an array literal — written inline, not a variable, call, template literal, JSX element, or any other expression.
- The literal is not already asserted `as const`.
- The literal contains no spread element. A spread makes the result depend on a value the rule cannot see, so `{ ...data, extra: 1 }` and `[...a, ...b]` are left alone.

Arrays returned from a React hook callback (`useMemo`, `useCallback`, or any `use*` hook) are also exempt, whatever their elements. These are memoized prop and data lists that flow into mutable or `readonly` array parameters downstream, and freezing them into readonly tuples produced false positives (see issues #511 and #1324). An **object** literal returned from a hook callback is still reported.

### An array literal the signature does not accept as readonly

`as const` makes an array literal a readonly *tuple* of fixed length — strictly narrower than the array the literal is otherwise given, in both mutability and arity. An **array** literal is therefore reported only where the enclosing signature states a type that accepts a readonly tuple. Two positions are exempt.

#### The signature declares a mutable array

```ts
function getNames(): string[] {
  return ['a', 'b']; // not reported
}
```

TypeScript rejects a readonly tuple against a mutable target: `TS4104: The type 'readonly ["a", "b"]' is 'readonly' and cannot be assigned to the mutable type 'string[]'`. Appending `as const` here turns compiling code into code that does not compile (issue #1526).

#### The signature declares nothing

```ts
function diff(a, b) {
  return [{ a, b }]; // not reported
}

function isSame(a, b) {
  return diff(a, b).length === 0;
}
```

With no annotation, the frozen arity becomes part of the *inferred* return type and every caller inherits it. `diff` returns a one-element tuple once its literal is frozen, so `.length` has the literal type `1` and the comparison fails to compile: `TS2367: This comparison appears to be unintentional because the types '1' and '0' have no overlap`. The same narrowing breaks `.includes` (the element type of `readonly []` is `never`, so passing a `string` raises `TS2345`), `.push`, and any assignment into a mutable `T[]` parameter.

The damage lands in a **different function** from the one edited, and the rule reads a single file's syntax — the callers are beyond what it can see, so it cannot judge which of them the arity change breaks (issue #2015). Annotating the signature with a `readonly` type states the contract explicitly and brings the literal back into scope for the rule.

In both positions the rule stays **silent** rather than reporting without a fix. Nothing the author can do at the literal satisfies the rule — honouring it means changing the function's contract and every call site that depends on the array's length or mutability. A finding no local edit can resolve is noise, and noise on a file is what blocks the rule's adoption.

The declared type is read syntactically, from wherever it is written for the enclosing function:

- its own return annotation, including a method's (`getNames(): string[]`);
- the annotation on the variable or class property that declares it (`const getNames: () => string[] = () => …`);
- an assertion on the function expression (`(() => …) as () => string[]`).

For an `async` function the awaited type is used (`Promise<string[]>` is a mutable array position), and for a generator the second type argument is (`Generator<number, string[], void>`).

A `readonly` spelling accepts the readonly tuple, so those positions are reported and fixed as usual: `readonly string[]`, `ReadonlyArray<string>`, `readonly [string, number]`, `Promise<readonly string[]>`, and any union with a `readonly` member. The mutable spellings — `T[]`, `[A, B]`, `Array<T>` — and unions in which no member accepts a readonly tuple (`string[] | undefined`) are exempt.

The signature that counts is the nearest enclosing one, so a `return` inside a callback is judged against that callback's annotation rather than the surrounding function's.

Where the declared type is a name the rule cannot resolve (a type alias, an interface, an imported type), it is treated as accepting, and a callback's contextual type coming from the callee's parameter list is not resolved at all. `as const` is still appended in those positions: what callers read there is the declared name, so the literal's arity never escapes into their view.

**Object** literals are unaffected by any of this. `readonly` property modifiers do not enter assignability, so `{ name: 'a' } as const` still satisfies a mutable `{ name: string }`, and an object literal has no arity for the assertion to fix. A `Config` return annotation and an absent annotation are both reported and fixed.

### A literal that already carries an assertion

A literal carrying a different assertion — `return { foo: 'bar' } as SomeType` — is reported, but **not auto-fixed**. `--fix` leaves it exactly as written.

The rewrite the fix would have to make is lossy. `as const` infers `{ readonly foo: 'bar' }`, which is a structurally different type from `SomeType`: property types narrow to literals and every property becomes readonly. Replacing the assertion would silently change what the function returns, and where the assertion was written to widen the literal to satisfy a signature, it would break that signature — an automatic, information-destroying edit. Which of the two types is wanted is a decision only the author can make, so the rule states the finding and stops there.

Resolve it by hand in one of two ways: drop the assertion if `as const` was the intent, or move the declared type somewhere the rule does not inspect — a return type annotation on the function, or a typed local returned by name.

The assertion must sit on the returned literal itself. One nested inside it — on an array element or a property value — does not suppress the fix, because appending `as const` to the outer literal preserves the inner assertion verbatim.

The angle-bracket assertion form (`return <SomeType>{ foo: 'bar' }`, which is illegal in `.tsx` files) is not detected at all, so it is neither reported nor fixed.

### Examples of incorrect code

```ts
function getConfig() {
  return { foo: 'bar', baz: 42 };
}
```

```ts
// The signature accepts a readonly tuple, so the array literal is reported
function fetchGroupRefs(
  groupId: string,
): readonly DocumentReference<GroupInfo>[] {
  return [groupRef, parentRef];
}
```

```ts
class ConfigService {
  getConfig() {
    return { foo: 'bar' };
  }
}
```

```ts
// An object literal returned from a hook callback is still reported
const config = useMemo(() => {
  return { theme: 'dark', fontSize: 16 };
}, []);
```

```ts
// An identifier-element array outside a hook callback is reported, the
// annotation keeping it out of the arity carve-out
function getHits(): readonly Hit[] {
  return [ANY_GAME_HIT];
}
```

```ts
// Reported but NOT auto-fixed: rewriting `as SomeType` into `as const` would
// discard the declared type
type SomeType = { foo: string };
function getData() {
  return { foo: 'bar' } as SomeType;
}
```

```ts
// The assertion sits on an array element, not on the returned literal, so this
// is reported AND fixed — to `[{ foo: 'bar' } as SomeType, other] as const`
function getItems(): readonly unknown[] {
  return [{ foo: 'bar' } as SomeType, other];
}
```

```ts
// A readonly array annotation accepts a readonly tuple, so this is reported
// and fixed
function getNames(): readonly string[] {
  return ['a', 'b'];
}
```

```ts
// An object literal is reported whatever the annotation says: `as const` only
// adds `readonly` property modifiers, which assignability ignores
type Config = { name: string; count: number };
function getConfig(): Config {
  return { name: 'a', count: 1 };
}
```

### Examples of correct code

```ts
function getConfig() {
  return { foo: 'bar', baz: 42 } as const;
}
```

```ts
function fetchAssertGroup(groupId: string) {
  return [group, groupRef] as const;
}
```

```ts
// Not a literal: the rule only inspects literals returned directly
function getData() {
  const result = { foo: 'bar' };
  return result;
}
```

```ts
// A spread makes the result depend on a value the rule cannot see
function mergeData() {
  return { ...data, newProp: 'value' };
}
```

```ts
// Arrays returned from a hook callback stay mutable on purpose
const avatarUsers = useMemo(() => {
  return [{ userId: id, imgUrl }];
}, [id, imgUrl]);
```

```ts
// The signature declares a mutable array, so `as const` would not compile
// (TS4104) and the rule stays silent
function getNames(): string[] {
  return ['a', 'b'];
}
```

```ts
// The same, with the type declared on the variable rather than the arrow
const getNames: () => string[] = () => {
  return ['a', 'b'];
};
```

```ts
// The signature declares nothing, so freezing the array would hand its arity to
// every caller: `diff` would return a one-element tuple and this comparison
// would stop compiling (TS2367)
function diff(a: number, b: number) {
  return [{ a, b }];
}

function isSame(a: number, b: number) {
  return diff(a, b).length === 0;
}
```

```ts
// An object literal in the same position is reported and fixed: freezing one
// adds `readonly` property modifiers, which assignability ignores, and leaves
// no arity for a caller to trip over
function getConfig() {
  return { foo: 'bar' } as const;
}
```

```ts
// A readonly annotation takes the fix
function getPair(): readonly [string, number] {
  return ['a', 1] as const;
}
```

```ts
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';

// The exemption covers identifier and member elements too
const useHits = (hits: readonly { id: string }[], hasQuery: boolean) => {
  return useDeepCompareMemo(() => {
    if (hasQuery && hits.length === 0) {
      return [ANY_GAME_HIT];
    }
    return hits;
  }, [hits, hasQuery]);
};
```

```ts
// Resolving a reported `as SomeType` by hand: annotate a named value and
// return it, which the rule does not inspect. Annotating the signature instead
// would work here too, but `no-explicit-return-type` reports that.
type SomeType = { foo: string };
function getData() {
  const data: SomeType = { foo: 'bar' };
  return data;
}
```

## When Not To Use It

Disable this rule for code that returns a literal it intends callers to mutate, or where the widened (non-literal) types are load-bearing — for example a factory whose result is assigned into a mutable configuration object.

# Enforce that object literals returned from functions should be marked with `as const` to ensure type safety and immutability (`@blumintinc/blumint/enforce-object-literal-as-const`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

An object or array literal returned from a function is widened by TypeScript: `return { role: 'admin' }` infers `{ role: string }`, and `return [group, groupRef]` infers `(GroupInfo | DocumentReference<GroupInfo>)[]` rather than the tuple the caller destructures. Marking the literal `as const` keeps the literal types and the tuple shape, and makes the returned value readonly so callers cannot mutate a value the producer treats as constant.

This rule reports object and array literals returned directly from a function and auto-fixes by appending `as const`. One reported shape is deliberately left unfixed — see [A literal that already carries an assertion](#a-literal-that-already-carries-an-assertion).

## Rule Details

A `return` statement is reported when all of the following hold:

- It sits inside a function, arrow function, function expression, or method (a getter, a static method, and a generator all count).
- Its argument is an object literal or an array literal — written inline, not a variable, call, template literal, JSX element, or any other expression.
- The literal is not already asserted `as const`.
- The literal contains no spread element. A spread makes the result depend on a value the rule cannot see, so `{ ...data, extra: 1 }` and `[...a, ...b]` are left alone.

Arrays returned from a React hook callback (`useMemo`, `useCallback`, or any `use*` hook) are also exempt, whatever their elements. These are memoized prop and data lists that flow into mutable or `readonly` array parameters downstream, and freezing them into readonly tuples produced false positives (see issues #511 and #1324). An **object** literal returned from a hook callback is still reported.

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
function fetchAssertGroup(groupId: string) {
  return [group, groupRef];
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
// An identifier-element array outside a hook callback is reported
function getHits() {
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
function getItems() {
  return [{ foo: 'bar' } as SomeType, other];
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
// The exemption covers identifier and member elements too
const useHits = (hits: readonly { id: string }[], hasQuery: boolean) => {
  return useMemo(() => {
    if (hasQuery && hits.length === 0) {
      return [ANY_GAME_HIT];
    }
    return hits;
  }, [hits, hasQuery]);
};
```

```ts
// Resolving a reported `as SomeType` by hand: state the type on the signature
// and return a named value, which the rule does not inspect
type SomeType = { foo: string };
function getData(): SomeType {
  const data: SomeType = { foo: 'bar' };
  return data;
}
```

## When Not To Use It

Disable this rule for code that returns a literal it intends callers to mutate, or where the widened (non-literal) types are load-bearing — for example a factory whose result is assigned into a mutable configuration object.

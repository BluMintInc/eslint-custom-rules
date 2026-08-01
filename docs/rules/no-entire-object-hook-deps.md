# Avoid using entire objects in React hook dependency arrays (`@blumintinc/blumint/no-entire-object-hook-deps`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

💭 This rule requires [type information](https://typescript-eslint.io/linting/typed-linting).

<!-- end auto-generated rule header -->

## Why this rule matters

- Your hooks rerun when any dependency identity changes. Listing an entire object means unrelated property updates (or shallow re-creations) rerun your hook even when you only read a few fields.
- You risk duplicate network calls, animation glitches, or wasted memo computations when your hook fires unnecessarily.
- Listing a dependency you never read in a `useMemo`/`useCallback` reruns the computation for no effect and can hide the real missing dependency you rely on.
- An effect that depends on the value it also writes retriggers itself, producing a render loop.

## What this rule checks

- `useEffect`, `useMemo`, and `useCallback` dependency arrays.
- Flags when you list an entire object even though the hook body only reads specific properties (including optional chaining paths).
- Flags dependencies you put in a `useMemo`/`useCallback` array but never reference in the hook body.
- Requires TypeScript with `parserOptions.project` so the rule can distinguish objects from primitives and arrays.

### Unread dependencies on `useEffect`

An effect runs for its side effects rather than to produce a value, so a dependency the body never reads is normally deliberate: it is a **re-run trigger** for React's reset-on-scope-change pattern ("when the scope identified by these values changes, reset the derived state"). Deleting such a trigger keeps the code compiling while silently stopping the reset, so the rule leaves it alone.

The one shape where an unread effect dependency is genuinely wrong is a **circular dependency**: the effect writes the very value it depends on and therefore retriggers itself. The rule recognises this by the corresponding state setter — a dependency named `channelGroupActive` is only reported when the effect body calls `setChannelGroupActive(...)` (dependency `count` pairs with `setCount`, and so on). The setter call may be nested anywhere in the body, including inside an inner `async` function, a `startTransition` callback, or a `.then()`.

## Incorrect

```typescript
function Component({ user }) {
  const greeting = useMemo(() => `Hello ${user.name}`, [user]);
  return <div>{greeting}</div>;
}
```

Message:
`What's wrong: Dependency array includes entire object "user". Why it matters: Any change to its other properties reruns the hook even though the hook reads only user.name, creating extra renders and stale memoized values. How to fix: Depend on those fields instead.`

```typescript
function Component({ unusedObject, usedValue }) {
  // unusedObject is never read, and a memo gains nothing from it
  const result = useMemo(() => usedValue.total * 2, [unusedObject, usedValue]);
  return <div>{result}</div>;
}
```

Message:
`What's wrong: Dependency "unusedObject" is listed in the array but never read inside the hook body. Why it matters: The hook reruns when "unusedObject" changes without affecting the result and can hide the real missing dependency. How to fix: Remove it or add the specific value that actually drives the hook.`

```typescript
function Component({ channelGroupIdRouter, channelGroupActive }) {
  useEffect(() => {
    // channelGroupActive is never read, yet the effect writes it: depending on
    // it makes the effect retrigger itself
    setChannelGroupActive(toActiveChannelGroup(channelGroupIdRouter));
  }, [channelGroupIdRouter, channelGroupActive]);
}
```

Message:
`What's wrong: Dependency "channelGroupActive" is listed in the array but never read inside the hook body. Why it matters: The hook reruns when "channelGroupActive" changes without affecting the result and can hide the real missing dependency. How to fix: Remove it or add the specific value that actually drives the hook.`

## Correct

```typescript
function Component({ user }) {
  const greeting = useMemo(() => `Hello ${user.name}`, [user.name]);
  return <div>{greeting}</div>;
}
```

```typescript
function Component({ channelGroupIdRouter }) {
  useEffect(() => {
    setChannelGroupActive(toActiveChannelGroup(channelGroupIdRouter));
  }, [channelGroupIdRouter]);
}
```

`status` and `filter` are re-run triggers, not values the effect reads, and the effect never calls `setStatus`/`setFilter`. Keeping them is how the reset happens:

```typescript
function useResettingPagination(status, filter, isPaginated) {
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => {
    if (!isPaginated) {
      return;
    }
    setPageSize(10);
  }, [isPaginated, status, filter]);
  return { pageSize };
}
```

## Auto-fix

- Rewrites your dependency arrays to list the specific fields your hook reads.
- Removes dependencies you keep in a `useMemo`/`useCallback` array but never use.
- Removes an unread `useEffect` dependency only when the effect also calls its corresponding setter, so deliberate re-run triggers survive `--fix`.

## When not to use it

- You intentionally want your hook to rerun on any change to an object reference (for example, when you treat the object as an immutable snapshot).
- You rely on dynamic computed property access where specifying individual fields is impossible or would reduce correctness.

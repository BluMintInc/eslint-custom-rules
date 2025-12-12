# Avoid entire objects in hook deps (`@blumintinc/blumint/no-entire-object-hook-deps`)

Depend on the specific fields your hook reads; listing an entire object forces your hook to rerun when unrelated properties change and can leave memoized values stale.

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

💭 This rule requires [type information](https://typescript-eslint.io/linting/typed-linting).

<!-- end auto-generated rule header -->

## Why this rule matters

- Your hooks rerun when any dependency identity changes. Listing an entire object means unrelated property updates (or shallow re-creations) rerun your hook even when you only read a few fields.
- You risk duplicate network calls, animation glitches, or wasted memo computations when your hook fires unnecessarily.
- Listing a dependency you never read reruns the hook for no effect and can hide the real missing dependency you rely on.

## What this rule checks

- `useEffect`, `useMemo`, and `useCallback` dependency arrays.
- Flags when you list an entire object even though the hook body only reads specific properties (including optional chaining paths).
- Flags dependencies you put in the array but never reference in the hook body.
- Requires TypeScript with `parserOptions.project` so the rule can distinguish objects from primitives and arrays.

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
function Component({ channelGroupIdRouter, channelGroupActive }) {
  useEffect(() => {
    // channelGroupActive is never read
    fetchChannels(channelGroupIdRouter);
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
    fetchChannels(channelGroupIdRouter);
  }, [channelGroupIdRouter]);
}
```

## Auto-fix

- Rewrites your dependency arrays to list the specific fields your hook reads.
- Removes dependencies you keep in the array but never use when it is safe to do so.

## When not to use it

- You intentionally want your hook to rerun on any change to an object reference (for example, when you treat the object as an immutable snapshot).
- You rely on dynamic computed property access where specifying individual fields is impossible or would reduce correctness.

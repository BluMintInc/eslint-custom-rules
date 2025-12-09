# Prevent entire objects in React hook dependency arrays; depend on the fields the hook actually reads to avoid noisy re-renders and stale memoized values (`@blumintinc/blumint/no-entire-object-hook-deps`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

💭 This rule requires [type information](https://typescript-eslint.io/linting/typed-linting).

<!-- end auto-generated rule header -->

## Why this rule matters

- React hooks rerun when any dependency identity changes. Putting an entire object in the dependency array means unrelated property updates (or shallow re-creations) rerun the hook even when the hook only reads a few fields.
- Extra rerenders and repeated effects can trigger duplicate network calls, animation glitches, or wasted memo computations.
- Listing a dependency that is never read causes the hook to rerun for no effect and can hide the real missing dependency the hook relies on.

## What this rule checks

- `useEffect`, `useMemo`, and `useCallback` dependency arrays.
- Flags when an entire object is listed even though the hook body only reads specific properties (including optional chaining paths).
- Flags dependencies that appear in the array but are never referenced in the hook body.
- Requires TypeScript with `parserOptions.project` so the rule can distinguish objects from primitives and arrays.

## Incorrect

```typescript
function Component({ user }) {
  const greeting = useMemo(() => `Hello ${user.name}`, [user]);
  return <div>{greeting}</div>;
}
```

Message:
`Dependency array includes entire object "user", so any change to its other properties reruns the hook even though only user.name is read inside. Depend on those fields instead to avoid extra renders and stale memoized values.`

```typescript
function Component({ channelGroupIdRouter, channelGroupActive }) {
  useEffect(() => {
    // channelGroupActive is never read
    fetchChannels(channelGroupIdRouter);
  }, [channelGroupIdRouter, channelGroupActive]);
}
```

Message:
`Dependency "channelGroupActive" is listed in the array but never read inside the hook body, so the hook reruns when "channelGroupActive" changes without affecting the result. Remove it or add the specific value that actually drives the hook.`

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

- Rewrites dependency arrays to list the specific fields the hook reads.
- Removes dependencies that are present in the array but unused in the hook body when it is safe to do so.

## When not to use it

- You intentionally want the hook to rerun on any change to an object reference (for example, when the object is treated as an immutable snapshot).
- You depend on dynamic computed property access where specifying individual fields is impossible or would reduce correctness.

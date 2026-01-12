# Discourage stale intermediate state by disallowing useState setter calls both before and after async boundaries (await, .then(), yield) within the same function (`@blumintinc/blumint/no-stale-state-across-await`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

When a `useState` setter is called both before and after an async boundary (like `await`, `.then()`, or `yield`), the UI may enter a stale state if the async operation resolves out of order or if the first update is overwritten by a later stale update. This rule suggests keeping setter calls on one side of the boundary or consolidating them into a single atomic update.

## Why this rule?

- Updates issued before an async boundary can resolve after later updates and overwrite fresher data.
- Multiple state updates in the same function can lead to unnecessary re-renders.
- Consolidating updates after the async work ensures that the UI always reflects the final state.

## Examples

### ❌ Incorrect

```tsx
async function loadProfile(id) {
  setProfile(null); // update before await
  const data = await api.get(`/users/${id}`);
  setProfile(data); // update after await
}
```

Example message:

```text
State setter "setProfile" runs on both sides of an await boundary, which might lead to stale UI updates if the async work resolves out of order. This rule is a suggestion; patterns like optimistic UI or intentional sentinel updates before/after awaits are sometimes necessary. If this pattern is intentional, please use an // eslint-disable-next-line @blumintinc/blumint/no-stale-state-across-await comment. Otherwise, consider consolidating updates after the async boundary.
```

### ✅ Correct

```tsx
async function loadProfile(id) {
  // Only update once after the async work
  const data = await api.get(`/users/${id}`);
  setProfile(data);
}
```

### ✅ Correct (With disable comment for intentional sentinel/optimistic UI)

```tsx
async function loadProfile(id) {
  // eslint-disable-next-line @blumintinc/blumint/no-stale-state-across-await
  setProfile('loading');
  const data = await api.get(`/users/${id}`);
  setProfile(data);
}
```

## When Not To Use It

Disable this rule if you are intentionally using a sentinel value or implementing an optimistic UI pattern where multiple updates are required across an async boundary. Use an `// eslint-disable-next-line @blumintinc/blumint/no-stale-state-across-await` comment to document the intent.

## Further Reading

- [React Docs: Keeping Components Pure](https://react.dev/learn/keeping-components-pure)
- [React Docs: State as a Snapshot](https://react.dev/learn/state-as-a-snapshot)

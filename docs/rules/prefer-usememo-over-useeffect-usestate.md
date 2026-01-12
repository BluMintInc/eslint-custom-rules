# Prefer useMemo over useEffect + useState for pure computations to avoid extra render cycles and stale derived state (`@blumintinc/blumint/prefer-usememo-over-useeffect-usestate`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Why this rule matters

- When a pure computation runs in `useEffect` and writes into `useState`, React performs the initial render, runs the effect, then re-renders after the setter fires. That extra render is avoidable work.
- Copying derived values into state creates stale snapshots. Props change immediately, but state updates lag by a tick, so components and children can briefly read outdated data.
- Derived objects and arrays lose referential stability when recreated in an effect, causing memoized children to re-render unnecessarily.

## Rule Details

The rule flags `useEffect` callbacks that only call a `useState` setter with a value that looks pure (object/array literals, array map/filter/reduce, or calls to `compute*`, `calculate*`, `format*`, `transform*`, `convert*`, `get*`, `derive*`, `create*`, `expensive*`).

The rule does **not** report when:

- The effect includes other statements or side effects
- The setter mirrors a prop/value for synchronization (same identifier as the initializer)
- The computation is impure (awaits, assignments, or function calls with unknown side effects)

### Incorrect Examples

The following pattern demonstrates an anti-pattern where derived state is computed in `useEffect` and mirrored into React state. This causes an extra render cycle and risks stale state because the `sum` is calculated after the component has already rendered with potentially outdated values. Instead, you should compute `sum` with `useMemo` or inline it in the component body.

```tsx
function Component({ a, b }) {
  const [sum, setSum] = useState(0);

  useEffect(() => {
    setSum(a + b);
  }, [a, b]);

  return <div>{sum}</div>;
}
// Lint: Use useMemo to compute derived state "sum" instead of useEffect + useState to avoid extra render cycles and stale snapshots.
```

### Correct Examples

These examples demonstrate the preferred patterns for handling derived values and side effects correctly:

1. **Using `useMemo` for derived values**: Compute the `sum` during the render pass to ensure it stays in sync and avoids extra renders.

```tsx
function Component({ a, b }) {
  const sum = useMemo(() => a + b, [a, b]);
  return <div>{sum}</div>;
}
```

2. **Legitimate side effects**: Using `useEffect` is correct when you perform asynchronous operations or other side effects, like fetching data.

```tsx
function Component({ userId }) {
  const [user, setUser] = useState(null);
  useEffect(() => {
    fetchUser(userId).then(setUser); // side effect is allowed
  }, [userId]);
  return <Profile user={user} />;
}
```

3. **Prop-to-state synchronization**: The rule allows direct synchronization of a prop to state, although React generally discourages this pattern.

```tsx
function Component({ initialValue }) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    setValue(initialValue); // prop-to-state synchronization is allowed
  }, [initialValue]);
  return <Input value={value} />;
}
```

> [!NOTE]
> While this pattern is allowed by the rule (it does not flag simple identifier-to-identifier synchronization), React generally discourages prop-to-state mirroring. Prefer using a [controlled component](https://react.dev/learn/sharing-state-between-components#controlled-and-uncontrolled-components), a [key-based reset](https://react.dev/learn/you-might-not-need-an-effect#resetting-all-state-when-a-prop-changes), or a guarded comparison if you must sync.


## When Not to Use It

You should not use this rule if:

- The effect performs side actions beyond state updates, such as logging, network requests, or DOM manipulation.
- State updates are intended to be asynchronous or must wait for some other side effect.
- The computation is impure and its results shouldn't be memoized based only on React dependencies.
- Intentional state synchronization is required (e.g., updating local state when a prop changes).

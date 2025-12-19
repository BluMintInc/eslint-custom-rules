# Prefer useMemo over useEffect + useState for pure computations to avoid extra render cycles and stale derived state (`@blumintinc/blumint/prefer-usememo-over-useeffect-usestate`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Why this rule matters

- When a pure computation runs in `useEffect` and writes into `useState`, React performs the initial render, runs the effect, then re-renders after the setter fires. That extra render is avoidable work.
- Copying derived values into state creates stale snapshots. Props change immediately, but state updates lag by a tick, so components and children can briefly read outdated data.
- Derived objects and arrays lose referential stability when recreated in an effect, causing memoized children to re-render unnecessarily.

## Rule details

The rule flags `useEffect` callbacks that only call a `useState` setter with a value that looks pure (object/array literals, array map/filter/reduce, or calls to `compute*`, `calculate*`, `format*`, `transform*`, `convert*`, `get*`, `derive*`, `create*`).

The rule does **not** report when:

- The effect includes other statements or side effects
- The setter mirrors a prop/value for synchronization (same identifier as the initializer)
- The computation is impure (awaits, assignments, or function calls with unknown side effects)

### Incorrect

```tsx
function Component({ a, b }) {
  const [sum, setSum] = useState(0);

  useEffect(() => {
    setSum(a + b);
  }, [a, b]);

  return <div>{sum}</div>;
}
// Lint: Derived state "sum" is computed inside useEffect and copied into React state even though the value comes from a pure calculation. That extra render cycle and state indirection make components re-render more and risk stale snapshots when dependencies change. Compute the value with useMemo (or inline in render) and read it directly instead of mirroring it into state.
```

### Correct

```tsx
function Component({ a, b }) {
  const sum = useMemo(() => a + b, [a, b]);
  return <div>{sum}</div>;
}
```

```tsx
function Component({ userId }) {
  const [user, setUser] = useState(null);
  useEffect(() => {
    fetchUser(userId).then(setUser); // side effect is allowed
  }, [userId]);
  return <Profile user={user} />;
}
```

```tsx
function Component({ initialValue }) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    setValue(initialValue); // prop-to-state synchronization is allowed
  }, [initialValue]);
  return <Input value={value} />;
}
```

# Suggest useMemo over useEffect + useState for pure computations to avoid extra render cycles and stale derived state (`@blumintinc/blumint/prefer-usememo-over-useeffect-usestate`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Computing derived state in `useEffect` and storing it in another `useState` adds an extra render cycle and risks stale state. This rule suggests using `useMemo` (or inlining the calculation) for pure derived data.

## Why this rule?

- Syncing state in `useEffect` causes an extra re-render after the effect runs.
- Derived state in `useState` can become stale if dependencies change but the effect hasn't run yet.
- `useMemo` keeps derived data in sync with its dependencies during the primary render pass.

## Examples

### ❌ Incorrect

```tsx
function Component({ items }) {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    // Pure computation should be useMemo
    setTotal(items.reduce((sum, item) => sum + item.price, 0));
  }, [items]);

  return <div>Total: {total}</div>;
}
```

Example message:

```text
Derived state "total" is updated in useEffect, which might be better handled by useMemo to avoid extra render cycles. This rule is a suggestion based on a heuristic for "pure" calculations and might miss intentional side effects. If this update must happen in useEffect, please use an // eslint-disable-next-line @blumintinc/blumint/prefer-usememo-over-useeffect-usestate comment. Otherwise, consider computing the value with useMemo (or inline) and reading it directly.
```

### ✅ Correct

```tsx
function Component({ items }) {
  const total = useMemo(() =>
    items.reduce((sum, item) => sum + item.price, 0),
  [items]);

  return <div>Total: {total}</div>;
}
```

### ✅ Correct (With disable comment if side effects are required)

```tsx
function Component({ items }) {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line @blumintinc/blumint/prefer-usememo-over-useeffect-usestate
    setTotal(calculateTotal(items));
    logAnalytics(items); // intentional side effect
  }, [items]);

  return <div>Total: {total}</div>;
}
```

## When Not To Use It

Disable this rule if your calculation involves intentional side effects (like logging or triggering external APIs) that must happen inside `useEffect`. Use an `// eslint-disable-next-line @blumintinc/blumint/prefer-usememo-over-useeffect-usestate` comment if the rule incorrectly flags your logic as "pure".

## Further Reading

- [React Docs: You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- [React Docs: useMemo](https://react.dev/reference/react/useMemo)

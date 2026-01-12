# Enforce memoization of adaptValue transformValue/transformOnChange (`@blumintinc/blumint/enforce-transform-memoization`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Creating new transform functions on every render inside `adaptValue` can cause unnecessary re-renders of the adapted component. This rule suggests memoizing these transforms using `useMemo` or `useCallback`.

## Why this rule?

- Unmemoized functions passed to `adaptValue` change their reference on every render.
- Stable handlers help React skip re-rendering child components when their props haven't effectively changed.
- Correct hook usage (`useMemo` for values, `useCallback` for handlers) clarifies the intent of the memoization.

## Examples

### ❌ Incorrect

```tsx
function Component() {
  return adaptValue(
    {
      valueKey: 'checked',
      onChangeKey: 'onChange',
      // transformValue is recreated every render
      transformValue: (value) => Boolean(value),
    },
    Switch,
  );
}
```

Example message:

```text
transformValue might need memoization. This rule is a suggestion to keep adaptValue handlers stable. If this reference change is acceptable, please use an // eslint-disable-next-line @blumintinc/blumint/enforce-transform-memoization comment. Otherwise, consider wrapping it in useMemo.
```

### ✅ Correct

```tsx
function Component() {
  const transformValue = useMemo(() => (value) => Boolean(value), []);
  
  return adaptValue(
    {
      valueKey: 'checked',
      onChangeKey: 'onChange',
      transformValue,
    },
    Switch,
  );
}
```

### ✅ Correct (With disable comment if stability is not required)

```tsx
// eslint-disable-next-line @blumintinc/blumint/enforce-transform-memoization
const transform = (v) => v;
```

## Options

This rule does not have any options.

## When Not To Use It

Disable this rule if the adapted component is lightweight and the performance impact of re-renders is negligible, or if you are intentionally passing a fresh reference. Use an `// eslint-disable-next-line @blumintinc/blumint/enforce-transform-memoization` comment for local exceptions.

## Further Reading

- [React Docs: useMemo](https://react.dev/reference/react/useMemo)
- [React Docs: useCallback](https://react.dev/reference/react/useCallback)

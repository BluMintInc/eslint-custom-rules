# enforce-transform-memoization

Enforces proper memoization of transform functions in the `adaptValue` component to prevent unnecessary re-renders.

## Rule Details

The `adaptValue.tsx` higher-order component uses `transformValue` and `transformOnChange` functions to convert values between editable components and their adapted components. When these functions are provided inline, they must be memoized with `useMemo` or `useCallback` respectively to prevent unnecessary re-renders.

This rule enforces:
1. `transformValue` should be wrapped in `useMemo()`
2. `transformOnChange` should be wrapped in `useCallback()`

### Examples of **incorrect** code for this rule:

```tsx
// Not memoized - creates new functions on every render
adaptValue({
  valueKey: 'checked',
  onChangeKey: 'onChange',
  transformValue: (value) => Boolean(value),
  transformOnChange: (event) => event.target.checked,
}, Switch);
```

### Examples of **correct** code for this rule:

```tsx
// Properly memoized
adaptValue({
  valueKey: 'checked',
  onChangeKey: 'onChange',
  transformValue: useMemo(() => (value) => Boolean(value), []),
  transformOnChange: useCallback((event) => event.target.checked, []),
}, Switch);

// Using external functions (defined outside the component)
const convertToBoolean = (value) => Boolean(value);
const extractChecked = (event) => event.target.checked;

function MyComponent() {
  return adaptValue({
    valueKey: 'checked',
    onChangeKey: 'onChange',
    transformValue: convertToBoolean,
    transformOnChange: extractChecked,
  }, Switch);
}

// Using variables that are already memoized
function MyComponent() {
  const transformValue = useMemo(() => (value) => Boolean(value), []);
  const transformOnChange = useCallback((event) => event.target.checked, []);

  return adaptValue({
    valueKey: 'checked',
    onChangeKey: 'onChange',
    transformValue,
    transformOnChange,
  }, Switch);
}
```

## When Not To Use It

If you don't use the `adaptValue` component in your codebase, you can safely disable this rule.

## Further Reading

- [React Hooks - useMemo](https://reactjs.org/docs/hooks-reference.html#usememo)
- [React Hooks - useCallback](https://reactjs.org/docs/hooks-reference.html#usecallback)

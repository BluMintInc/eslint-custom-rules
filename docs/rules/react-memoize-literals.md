# Detect object, array, and function literals created in React components or hooks that create new references every render. Prefer memoized values (useMemo/useCallback) or module-level constants to keep referential stability (`@blumintinc/blumint/react-memoize-literals`)

💼 This rule is enabled in the ✅ `recommended` config.

💡 This rule is manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

<!-- end auto-generated rule header -->

Creating new object, array, or function literals on every render breaks referential stability. This rule suggests memoizing these values or hoisting them to constants to prevent unnecessary re-renders or effect re-runs.

## Why this rule?

- Fresh references on every render can cause `useEffect`, `useMemo`, or `useCallback` to re-run even if the data hasn't changed.
- Passing new references to `memo()` components defeats their optimization.
- Stable references make component behavior more predictable and easier to debug.

## Rule Details

- Reports object, array, and inline function literals created inside React components or custom hooks.
- Flags nested literals inside hook argument objects/arrays (e.g., `useQuery({ options: { cache: {...} } })`) while allowing the top-level argument itself.
- Detects custom hooks that return object/array/function literals directly, since callers receive a fresh reference each render.
- Skips literals that are destined to be thrown (e.g., `throw { message: 'error' }` or a variable where every usage is in a `throw` statement), as throwing aborts the render cycle and referential stability is irrelevant.
- Skips literals already inside callbacks passed to stable hooks (`useMemo`, `useCallback`, `useEffect`, `useLayoutEffect`, `useInsertionEffect`, `useImperativeHandle`, `useState`, `useReducer`, `useRef`, `useSyncExternalStore`, `useDeferredValue`, `useTransition`, `useId`, `useLatestCallback`, `useDeepCompareMemo`, `useDeepCompareCallback`, `useDeepCompareEffect`, `useProgressionCallback`) and module-level constants.
- Accounts for `async` function boundaries, skipping literals inside `async` function expressions or declarations. While the synchronous portion before the first `await` runs immediately, async functions are typically used as event handlers or effect callbacks where internal literal references do not affect render stability.
- Exempts object and array literals passed to deep-compared JSX attributes like `sx`, `style`, and any attribute ending in `Sx` or `Style` (e.g., `containerSx`). These attributes are compared using deep-equality (via `blumintAreEqual`) in BluMint components, so fresh references do not trigger unnecessary re-renders. **Note:** Inline functions passed to these attributes are still flagged, as they cannot be reliably deep-compared and still break referential stability.
- Offers suggestions to wrap component-level literals in `useMemo`/`useCallback` for a stable reference and injects a `__TODO_MEMOIZATION_DEPENDENCIES__` placeholder so callers must supply real dependencies instead of accidentally shipping an empty array.

## Examples

### ❌ Incorrect

```tsx
function UserProfile({ userId }) {
  // New object on every render
  const config = { enabled: true };

  // New function on every render
  const handleClick = () => console.log(userId);

  return <Child config={config} onClick={handleClick} />;
}
```

Example message:

```text
New object literal inside component "UserProfile" is created on every render, which might break referential stability. This rule is a suggestion; small or static literals often do not justify the overhead of useMemo. If this reference change is acceptable or intentional, please use an // eslint-disable-next-line @blumintinc/blumint/react-memoize-literals comment. Otherwise, consider hoisting it to a constant or wrapping it in useMemo with the right dependencies.
```

### ✅ Correct

These examples show how you keep references stable by memoizing values with the right dependencies (or hoisting constants).

```tsx
const DEFAULT_CONFIG = { enabled: true };

function UserProfile({ userId }) {
  const config = useMemo(() => DEFAULT_CONFIG, []);
  const handleClick = useCallback(() => console.log(userId), [userId]);

  return <Child config={config} onClick={handleClick} />;
}
```

```tsx
function useUserSettings() {
  const onChange = useCallback(() => updateTheme(), []);
  return useMemo(
    () => ({
      theme: 'dark',
      onChange,
    }),
    [onChange],
  );
}
```

#### Deep-compared JSX attributes

Object and array literals passed to deep-compared attributes (sx, style, or any attribute ending in Sx or Style) are exempt from memoization requirements:

```tsx
// ✅ Valid: object literals in deep-compared attributes
function UserCard({ name }) {
  return (
    <Box sx={{ padding: 2, margin: 1 }}>
      <Typography style={{ fontWeight: 'bold' }}>{name}</Typography>
      <Container containerSx={{ display: 'flex' }}>Content</Container>
    </Box>
  );
}
```

### ✅ Correct (With disable comment if stability is not required)

```tsx
function Component() {
  // eslint-disable-next-line @blumintinc/blumint/react-memoize-literals
  const smallLiteral = { x: 1 };
  return <div data-meta={smallLiteral} />;
}
```

#### How the suggestion placeholder looks

When the rule suggests a fix, it injects a dependency placeholder you must replace:

```tsx
const options = useMemo(
  () => ({ debounce: 50 }),
  [/* __TODO_MEMOIZATION_DEPENDENCIES__ */],
);
```

This placeholder must be replaced before committing.

## When Not To Use It

- Components that intentionally regenerate literals on every render (e.g., to force recalculation) and where the cost is acceptable.
- Codepaths outside React components or hooks where referential stability is irrelevant.
- Small, stable literals that are not used in performance-sensitive contexts or as hook dependencies. Use an `// eslint-disable-next-line @blumintinc/blumint/react-memoize-literals` comment for local exceptions.

## Further Reading

- [React Docs: useMemo](https://react.dev/reference/react/useMemo)
- [React Docs: useCallback](https://react.dev/reference/react/useCallback)

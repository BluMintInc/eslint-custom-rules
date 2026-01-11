# Detect object, array, and function literals created in React components or hooks that create new references every render. Prefer memoized values (useMemo/useCallback) or module-level constants to keep referential stability (`@blumintinc/blumint/react-memoize-literals`)

💼 This rule is enabled in the ✅ `recommended` config.

💡 This rule is manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

<!-- end auto-generated rule header -->

Creating new object, array, or function literals on every render breaks referential stability. This rule suggests memoizing these values or hoisting them to constants to prevent unnecessary re-renders or effect re-runs.

## Why this rule?

- Fresh references on every render can cause `useEffect`, `useMemo`, or `useCallback` to re-run even if the data hasn't changed.
- Passing new references to `memo()` components defeats their optimization.
- Stable references make component behavior more predictable and easier to debug.

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

```tsx
const DEFAULT_CONFIG = { enabled: true };

function UserProfile({ userId }) {
  const config = useMemo(() => DEFAULT_CONFIG, []);
  const handleClick = useCallback(() => console.log(userId), [userId]);

  return <Child config={config} onClick={handleClick} />;
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

## When Not To Use It

Disable this rule for small, stable literals that are not used in performance-sensitive contexts or as hook dependencies. Use an `// eslint-disable-next-line @blumintinc/blumint/react-memoize-literals` comment for local exceptions.

## Further Reading

- [React Docs: useMemo](https://react.dev/reference/react/useMemo)
- [React Docs: useCallback](https://react.dev/reference/react/useCallback)

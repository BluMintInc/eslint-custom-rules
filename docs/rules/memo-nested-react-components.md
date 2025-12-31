# Disallow React components defined in useCallback/useDeepCompareCallback (`@blumintinc/blumint/memo-nested-react-components`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Creating React components inside `useCallback` or `useDeepCompareCallback` hides a component behind a callback hook. When the hook dependencies change, the callback reference changes and React treats the new function as a brand-new component type, forcing a remount that drops local state and causes flicker. Components should be memoized with `memo()` and created through `useMemo`/`useDeepCompareMemo` so their identities stay stable across renders.

## Rule Details

- **Why**: Component identity matters to React. Wrapping a component in `useCallback` does not give React a stable component type—dependency changes create a new function and trigger a remount, resetting state and effects. Using `useMemo`/`useDeepCompareMemo` with `memo()` preserves component identity while keeping props-based updates predictable.
- **What it checks**:
  - Flags callbacks passed to `useCallback` or `useDeepCompareCallback` when they return JSX, a `React.createElement` call, or return another function that returns JSX (higher-order component factories).
  - Detects component wrappers such as `forwardRef` or `memo` returned from these callback hooks.
  - Skips files that match configured `ignorePatterns`.
- **Fix behavior**: When `memo` and the replacement hook (`useMemo` or `useDeepCompareMemo`) are already available in scope (either as named imports or as a namespace reference such as `React.useMemo`/`React.useDeepCompareMemo`), the fixer rewrites `useCallback`/`useDeepCompareCallback` calls to the memo variant and wraps the original callback in `memo(...)`. Fixes are skipped when required identifiers are missing to avoid producing invalid code. The fixer also skips callbacks that return another function which returns JSX (component factories) because those require a manual refactor.

### Options

```json
{
  "ignorePatterns": ["**/*.spec.tsx"]
}
```

- `ignorePatterns` (string[], default `[]`): Glob patterns for files the rule should ignore (useful for tests or stories).

## Examples

Bad:

```tsx
import { useCallback } from 'react';

const CustomButton = useCallback(({ onClick, children }) => {
  return <button onClick={onClick}>{children}</button>;
}, []);
```

Good:

```tsx
import { useMemo, memo } from 'react';

const CustomButton = useMemo(
  () => memo(({ onClick, children }) => <button onClick={onClick}>{children}</button>),
  [],
);
```

### Edge Cases

- Higher-order factories that return a function producing JSX are flagged (e.g., `() => (props) => <div {...props} />`). The fixer leaves these cases untouched; refactor manually to memoize the component factory:

  ```tsx
  // Reported but not auto-fixed
  const makeCard = useCallback(() => (props: Props) => <Card {...props} />, []);

  // Manual fix
  const makeCard = useMemo(
    () => memo((props: Props) => <Card {...props} />),
    [],
  );
  ```

- `forwardRef` wrappers returned from `useCallback` are flagged because they still create a component inside a callback.
- Event handlers or callbacks that do not return JSX are allowed.
- Components already built with `useMemo`/`useDeepCompareMemo` and `memo()` are unaffected.
- The fixer requires both the replacement hook and `memo` to be in scope; otherwise, it reports without auto-fixing.

## Version

- Introduced in v1.12.6

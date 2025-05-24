# memo-nested-react-components

> Prevent creating React components inside useCallback or useDeepCompareCallback without proper memoization

## Rule Details

This rule prevents the anti-pattern of creating React components inside `useCallback` or `useDeepCompareCallback` without proper memoization. This pattern causes React components to remount unnecessarily because React treats different function references as different component types, even when the callback is memoized. This leads to performance issues, visual flashing, and loss of component state.

The rule detects when a function inside `useCallback`/`useDeepCompareCallback` returns JSX (indicating it's a React component) and suggests converting it to use `useMemo`/`useDeepCompareMemo` with `memo()` wrapper for proper component memoization.

### ❌ Incorrect

```tsx
import { useDeepCompareCallback } from '@blumintinc/use-deep-compare';

function MyComponent() {
  const NonLinkMenu = useDeepCompareCallback(
    (props: Omit<MenuProps, 'children'>) => {
      return <Menu {...props}>{menuItemsFile}</Menu>;
    },
    [menuItemsFile],
  );

  const CustomButton = useCallback(
    ({ onClick, children }) => {
      return <Button onClick={onClick}>{children}</Button>;
    },
    [],
  );

  return <div>{/* Component usage */}</div>;
}
```

### ✅ Correct

```tsx
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import { memo } from '../../../util/memo';

function MyComponent() {
  const NonLinkMenu = useDeepCompareMemo(() => {
    return memo(function NonLinkMenuUnmemoized(
      props: Omit<MenuProps, 'children'>,
    ) {
      return <Menu {...props}>{menuItemsFile}</Menu>;
    });
  }, [menuItemsFile]);

  const CustomButton = useMemo(() => {
    return memo(function CustomButtonUnmemoized({ onClick, children }) {
      return <Button onClick={onClick}>{children}</Button>;
    });
  }, []);

  return <div>{/* Component usage */}</div>;
}
```

## Rule Options

This rule has no options.

## When Not To Use It

If you have a specific use case where you need to create components inside callbacks and don't want to memoize them, you might want to disable this rule. However, this is generally an anti-pattern in React and should be avoided.

## Further Reading

- [React.memo documentation](https://reactjs.org/docs/react-api.html#reactmemo)
- [useMemo documentation](https://reactjs.org/docs/hooks-reference.html#usememo)
- [useCallback documentation](https://reactjs.org/docs/hooks-reference.html#usecallback)

# enforce-useDeepCompareMemo

Enforce using `useDeepCompareMemo` instead of React's native `useMemo` when the dependency array contains pass-by-reference types (objects, arrays, functions) that aren't already memoized.

## Rule Details

This rule enforces the use of `useDeepCompareMemo` from `@blumintinc/use-deep-compare` instead of React's native `useMemo` when the dependency array contains non-primitive values (objects, arrays, functions) that aren't already memoized above.

Using `useDeepCompareMemo` prevents unnecessary re-renders caused by reference equality checks in `useMemo` failing for structurally identical but newly created objects, arrays, or functions. By leveraging deep equality comparisons for dependencies, we get more predictable component rendering behavior and better performance.

### Examples

#### ❌ Incorrect

```tsx
// Component re-renders whenever `userConfig` reference changes, even if data is identical
const UserProfile = ({ userConfig }) => {
  // userConfig is a pass-by-reference object and will cause unnecessary re-renders
  const formattedData = useMemo(() => {
    return {
      name: userConfig.name.toUpperCase(),
      status: getStatusLabel(userConfig.status),
      lastActive: formatDate(userConfig.lastLogin)
    };
  }, [userConfig]); // Object in deps array will cause memo to recalculate on every render

  return <ProfileCard data={formattedData} />;
};
```

#### ✅ Correct

```tsx
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';

const UserProfile = ({ userConfig }) => {
  // Only recalculates when userConfig's values change, not its reference
  const formattedData = useDeepCompareMemo(() => {
    return {
      name: userConfig.name.toUpperCase(),
      status: getStatusLabel(userConfig.status),
      lastActive: formatDate(userConfig.lastLogin)
    };
  }, [userConfig]); // Deep comparison prevents unnecessary recalculations

  return <ProfileCard data={formattedData} />;
};
```

### When Not To Use It

- When you're working with only primitive values (strings, numbers, booleans) in dependency arrays
- When you have an empty dependency array (`[]`)
- When all non-primitive dependencies are already memoized with `useMemo`, `useCallback`, etc.
- When you're memoizing React components or JSX elements (use a different optimization approach)
- In performance-critical sections where the overhead of deep comparison might be too costly

## Further Reading

- [React useMemo Documentation](https://reactjs.org/docs/hooks-reference.html#usememo)
- [Understanding React's useCallback and useMemo Hooks](https://dmitripavlutin.com/react-usememo-hook/)
- [When to useMemo and useCallback](https://kentcdodds.com/blog/usememo-and-usecallback)

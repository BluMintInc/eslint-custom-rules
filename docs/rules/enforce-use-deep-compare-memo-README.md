# enforce-use-deep-compare-memo

Enforce the use of `useDeepCompareMemo` instead of React's native `useMemo` when the dependency array contains pass-by-reference types (objects, arrays, functions) that aren't already memoized.

## Rule Details

This rule prevents unnecessary re-renders caused by reference equality checks in `useMemo` failing for structurally identical but newly created objects, arrays, or functions. By using `useDeepCompareMemo`, we leverage deep equality comparisons for dependencies, resulting in more predictable component rendering behavior and better performance.

## Examples

### ❌ Incorrect

```tsx
// Component re-renders whenever `userConfig` reference changes, even if data is identical
const UserProfile: FC<UserProfileProps> = ({ userConfig }) => {
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

```tsx
// Array in dependency array
const Component = ({ items }) => {
  const processedItems = useMemo(() =>
    items.map(item => item.name.toUpperCase())
  , [items]);
  return <div>{processedItems.join(', ')}</div>;
};
```

```tsx
// Function in dependency array
const Component = ({ onSubmit }) => {
  const config = useMemo(() => ({
    handler: onSubmit,
  }), [onSubmit]);
  return <form onSubmit={config.handler} />;
};
```

### ✅ Correct

```tsx
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';

const UserProfile: FC<UserProfileProps> = ({ userConfig }) => {
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

```tsx
// Empty dependency array - no change needed
const Component = () => {
  const value = useMemo(() => ({ foo: 'bar' }), []);
  return <div>{value.foo}</div>;
};
```

```tsx
// Only primitives in dependency array - no change needed
const Component = ({ text }) => {
  const result = useMemo(() => ({
    length: text.length,
    upper: text.toUpperCase(),
  }), [text.length, text.toUpperCase()]);
  return <div>{result.upper}</div>;
};
```

```tsx
// Already memoized dependencies - no change needed
const Component = ({ onSubmit }) => {
  const handleSubmit = useCallback(onSubmit, [onSubmit]);
  const config = useMemo(() => ({ onSubmit: handleSubmit }), [handleSubmit]);
  return <form onSubmit={config.onSubmit} />;
};
```

```tsx
// useMemo returns JSX - no change needed
const Component = ({ config }) => {
  const element = useMemo(() => (
    <ExpensiveComponent config={config} />
  ), [config]);
  return element;
};
```

## When Not to Use

This rule should not be used if:

1. **Performance Critical Sections**: In some performance-critical sections, the overhead of deep comparison might not be desirable.
2. **Large Objects**: When dealing with very large objects where deep comparison would be more expensive than occasional re-renders.

You can disable the rule for specific instances using ESLint comments:

```tsx
// eslint-disable-next-line @blumintinc/blumint/enforce-use-deep-compare-memo
const result = useMemo(() => {
  return highPerformanceTransform(data);
}, [data]);
```

## Edge Cases Handled

### 1. Primitives Only
If the dependency array only contains primitives (strings, numbers, booleans), the rule will not suggest `useDeepCompareMemo`.

### 2. Already Memoized Dependencies
If objects/arrays in the dependency array are already memoized (with `useMemo`, `useCallback`, etc.), the rule will not suggest `useDeepCompareMemo`.

### 3. Empty Dependency Arrays
Empty dependency arrays never change, so deep comparison is unnecessary.

### 4. React Components or JSX in useMemo
When `useMemo` is used to memoize React components or JSX elements, different optimization patterns apply, so the rule will not suggest `useDeepCompareMemo`.

## Configuration

This rule has no configuration options.

## Related Rules

- [`enforce-callback-memo`](./enforce-callback-memo.md) - Enforces useCallback for inline functions in JSX props
- [`prefer-usecallback-over-usememo-for-functions`](./prefer-usecallback-over-usememo-for-functions.md) - Prefers useCallback over useMemo for functions

## Further Reading

- [React useMemo documentation](https://react.dev/reference/react/useMemo)
- [When to useMemo and useCallback](https://kentcdodds.com/blog/usememo-and-usecallback)
- [Deep comparison hooks](https://github.com/kentcdodds/use-deep-compare-effect)

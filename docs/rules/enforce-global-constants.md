# Enforce using global static constants instead of useMemo with empty dependency arrays for object literals (`@blumintinc/blumint/enforce-global-constants`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule identifies instances where `useMemo` hooks are used with empty dependency arrays to return object literals (`Record<string, unknown>`). Such usage is unnecessary and less performant than using global static constants.

## Rule Details

React's `useMemo` is intended for memoizing computationally expensive values that depend on props or state. When a `useMemo` has an empty dependency array and returns an object literal, it creates a new reference on each render but never recalculates the value. This pattern leads to unnecessary memory allocation and garbage collection without providing any benefit over a global static constant.

By identifying and refactoring these patterns, we can:
1. Reduce runtime memory consumption
2. Improve code clarity and maintainability
3. Encourage proper use of React hooks

### Examples of incorrect code for this rule:

```tsx
const MyComponent = () => {
  // This useMemo creates a new object reference on every render
  // but never recomputes the values because the dependency array is empty
  const roomOptions = useMemo(() => {
    return {
      disconnectOnPageLeave: true,
    } as const;
  }, []);

  return (
    <div>
      {Object.entries(roomOptions).map(([key, option]) => (
        <Option key={key} label={option.label} icon={option.icon} />
      ))}
    </div>
  );
};
```

### Examples of correct code for this rule:

```tsx
// Define once at module scope - never recreated during renders
const ROOM_OPTIONS = { disconnectOnPageLeave: true } as const;

const MyComponent = () => {
  return (
    <div>
      {Object.entries(ROOM_OPTIONS).map(([key, option]) => (
        <Option key={key} label={option.label} icon={option.icon} />
      ))}
    </div>
  );
};
```

## When Not To Use It

You might want to disable this rule if your codebase has a specific pattern or architecture that requires using `useMemo` with empty dependency arrays for object literals.

## Further Reading

- [React useMemo Documentation](https://reactjs.org/docs/hooks-reference.html#usememo)
- [React Hooks Performance Optimization](https://reactjs.org/docs/hooks-faq.html#how-to-memoize-calculations)

# Enforce using global static constants instead of useMemo with empty dependency arrays for object literals, and extract inline destructuring defaults in React components/hooks to global constants (`@blumintinc/blumint/enforce-global-constants`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule identifies instances where `useMemo` hooks are used with empty dependency arrays to return object literals (`Record<string, unknown>`). Such usage is unnecessary and less performant than using global static constants.

## Rule Details

React's `useMemo` is intended for memoizing computationally expensive values that depend on props or state. When a `useMemo` has an empty dependency array and returns an object literal, it creates a new reference on each render but never recalculates the value. This pattern leads to unnecessary memory allocation and garbage collection without providing any benefit over a global static constant.

By identifying and refactoring these patterns, we can:
1. Reduce runtime memory consumption
1. Improve code clarity and maintainability
1. Encourage proper use of React hooks

### Examples of incorrect code for this rule:

#### `useMemo` with empty dependency array

```tsx
const MyComponent = () => {
  // This useMemo creates a new object reference on every render
  // but never recomputes the values because the dependency array is empty
  const roomOptions = useMemo(() => {
    return {
      roomA: { label: 'Room A', icon: 'room-icon' },
      roomB: { label: 'Room B', icon: 'room-icon' },
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

#### Inline destructuring defaults

```tsx
// Incorrect: inline default object/array in component props
const MyComponent = ({ config = { theme: 'light', size: 'medium' } }) => {
  return <div>{config.theme}</div>;
};

// Incorrect: inline default object/array in hook arguments
const useMyHook = (options = ['default-option']) => {
  return options;
};
```

### Examples of correct code for this rule:

#### Global constants for `useMemo` replacement

```tsx
// Define once at module scope - never recreated during renders
const ROOM_OPTIONS = {
  roomA: { label: 'Room A', icon: 'room-icon' },
  roomB: { label: 'Room B', icon: 'room-icon' },
} as const;

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

#### Global constants for destructuring defaults

```tsx
// Extract to global constant
const DEFAULT_CONFIG = { theme: 'light', size: 'medium' } as const;

const MyComponent = ({ config = DEFAULT_CONFIG }) => {
  return <div>{config.theme}</div>;
};

const DEFAULT_OPTIONS = ['default-option'] as const;

const useMyHook = (options = DEFAULT_OPTIONS) => {
  return options;
};
```

## When Not To Use It

You might want to disable this rule if your codebase has a specific pattern or architecture that requires using `useMemo` with empty dependency arrays for object literals.

## Further Reading

- [React useMemo Documentation](https://reactjs.org/docs/hooks-reference.html#usememo)
- [React Hooks Performance Optimization](https://reactjs.org/docs/hooks-faq.html#how-to-memoize-calculations)

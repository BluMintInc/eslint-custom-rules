# Enforce using useCallback instead of useMemo for memoizing functions (prefer-usecallback-over-usememo-for-functions)

This rule enforces the use of `useCallback` instead of `useMemo` when memoizing functions with dependency arrays. While both hooks can technically memoize functions, `useCallback` is semantically designed for this purpose, making code more readable and intention-clear.

## Rule Details

This rule aims to improve code maintainability and follow React best practices by making the developer's intent explicit when memoizing functions.

Examples of **incorrect** code for this rule:

```jsx
// Using useMemo to memoize a function with block body
const handleClick = useMemo(() => {
  return () => {
    console.log('Button clicked');
  };
}, []);

// Using useMemo to memoize a function with implicit return
const fetchData = useMemo(() => () => {
  fetch('/api/data');
}, []);

// Using useMemo to memoize an async function
const loadData = useMemo(() => {
  return async () => {
    const response = await fetch('/api/data');
    return response.json();
  };
}, []);
```

Examples of **correct** code for this rule:

```jsx
// Using useCallback for function memoization
const handleClick = useCallback(() => {
  console.log('Button clicked');
}, []);

// Using useCallback for async function
const fetchData = useCallback(async () => {
  const response = await fetch('/api/data');
  return response.json();
}, []);

// Using useMemo for object memoization (not a function)
const config = useMemo(() => ({
  apiUrl: '/api',
  timeout: 5000,
}), []);

// Using useMemo for function factory (returning object with functions)
const handlers = useMemo(() => {
  return {
    onClick: (id) => () => console.log(`Clicked ${id}`),
    onHover: (id) => () => console.log(`Hovered ${id}`)
  };
}, []);
```

## When Not To Use It

You might consider disabling this rule if your codebase has an established pattern of using `useMemo` for function memoization and you don't want to refactor existing code.

## Further Reading

- [React Hooks API Reference - useCallback](https://reactjs.org/docs/hooks-reference.html#usecallback)
- [React Hooks API Reference - useMemo](https://reactjs.org/docs/hooks-reference.html#usememo)

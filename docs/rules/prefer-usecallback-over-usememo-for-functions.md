# Enforce using useCallback instead of useMemo for memoizing functions (`@blumintinc/blumint/prefer-usecallback-over-usememo-for-functions`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

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

## Options

This rule accepts an options object with the following properties:

```js
{
  // When true, allows useMemo for complex function bodies that have multiple statements before returning a function
  "allowComplexBodies": true,

  // When true, allows useMemo for function factories (returning objects with functions or functions that generate other functions)
  "allowFunctionFactories": true
}
```

### `allowComplexBodies`

When set to `true`, the rule will not flag `useMemo` calls that have complex bodies with multiple statements before returning a function. This is useful when the setup logic is complex and moving it outside the memoization might not be desirable.

Example of code allowed with `{ "allowComplexBodies": true }`:

```jsx
const handler = useMemo(() => {
  // Complex setup logic
  const timestamp = Date.now();
  const logger = setupLogger();

  // Return function at the end
  return () => {
    logger.log('Action performed at', timestamp);
  };
}, []);
```

### `allowFunctionFactories`

By default (`true`), the rule allows using `useMemo` for function factories - cases where you return an object containing functions or a function that generates other functions. This is a legitimate use case for `useMemo` that cannot be directly replaced with `useCallback`.

Example of code allowed with `{ "allowFunctionFactories": true }` (default):

```jsx
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

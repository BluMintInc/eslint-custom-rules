# Enforce using useCallback instead of useMemo for memoizing functions (`@blumintinc/blumint/prefer-usecallback-over-usememo-for-functions`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces the use of `useCallback` instead of `useMemo` when memoizing functions with dependency arrays. While both hooks can technically memoize functions, `useCallback` is semantically designed for this purpose, making code more readable and intention-clear.

## Rule Details

`useMemo` is intended for memoizing values. When it returns a function, the code hides that it depends on a stable callback reference. That makes it easy for someone to refactor the hook away and accidentally trigger prop-driven re-renders or effect loops. `useCallback` exists specifically to memoize callbacks and communicates that the function identity is part of the component contract. The fixer rewrites `useMemo` calls that return functions to `useCallback` while keeping the dependency array intact.

Why this matters:
- `useCallback` documents that callers depend on a stable function identity; `useMemo` suggests a computed value instead.
- Removing or inlining a `useMemo` that returns a function often re-creates the callback on every render, causing child components that receive it as a prop to re-render unnecessarily.
- Using the hook that matches the intent keeps code reviews, linting, and mental models aligned with React guidance.

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

// Using useMemo with dependencies to return a function
const handleClick = useMemo(() => {
  return () => {
    console.log('Button clicked', id);
  };
}, [id]);
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

## Autofix and imports

When `useMemo` comes from an import, the fixer rewrites the import list alongside the call so the result compiles:

```jsx
// before
import { useMemo } from 'react';
const cb = useMemo(() => () => {}, []);

// after
import { useCallback } from 'react';
const cb = useCallback(() => {}, []);
```

Specifics:

- `useCallback` is added to the same declaration `useMemo` was imported from, so `preact/hooks` and similar packages are handled too.
- The `useMemo` specifier is only dropped when no reference to it survives the fixes; a remaining `useMemo` call or value usage keeps it (`import { useMemo, useCallback } from 'react';`).
- An already-imported `useCallback` is reused instead of duplicated, including an aliased one (`import { useCallback as uc }` produces `uc(...)` at the call site).
- Files with no `useMemo` import (globals, test snippets) get the call rewritten without any import being inserted.
- If a local binding named `useCallback` would capture the emitted call, the violation is reported without a fix.
- The member-expression form (`React.useMemo(...)`) is not reported by this rule.

### Interaction with inline disable comments

The import edit rides on a single violation's fix, so it is attached to the
first violation that is **not** suppressed by an inline `eslint-disable`
directive. A suppressed violation also keeps its `useMemo(...)` call, so the
specifier it resolves to is never retired: whenever any violation in the file is
suppressed, the rename degrades to adding `useCallback` beside `useMemo`.

```jsx
// before
import { useMemo } from 'react';
// eslint-disable-next-line @blumintinc/blumint/prefer-usecallback-over-usememo-for-functions
const alpha = useMemo(() => () => {}, []);
const beta = useMemo(() => () => {}, []);

// after
import { useMemo, useCallback } from 'react';
// eslint-disable-next-line @blumintinc/blumint/prefer-usecallback-over-usememo-for-functions
const alpha = useMemo(() => () => {}, []);   // left alone, still bound
const beta = useCallback(() => {}, []);      // fixed, and carries the import
```

With every violation suppressed the file is left untouched — no specifier is
added or removed.

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

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

### Examples of **incorrect** code for this rule:

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

### Examples of **correct** code for this rule:

```jsx
// Using useCallback for function memoization
const logClick = useCallback(() => {
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

- `useCallback` is added to the same declaration `useMemo` was imported from.
- The `useMemo` specifier is only dropped when no reference to it survives the fixes; a remaining `useMemo` call or value usage keeps it (`import { useMemo, useCallback } from 'react';`).
- An already-imported `useCallback` is reused instead of duplicated, including an aliased one (`import { useCallback as uc }` produces `uc(...)` at the call site).
- If a local binding named `useCallback` would capture the emitted call, the violation is reported without a fix.
- The member-expression form (`React.useMemo(...)`) is not reported by this rule.

### The autofix requires a `useMemo` it can vouch for

The fix emits a call to `useCallback`, so it only runs when the `useMemo` being
replaced is provably React's hook — that is what guarantees a `useCallback` with
the same contract exists for the rewritten import to bind. Concretely, the callee
must resolve to a **value** import of the name `useMemo` from `react`,
`preact/hooks`, or `preact/compat` (preact's hooks are React's hooks by
specification, which is what makes rewriting their specifier sound).

Every other shape is **reported without a fix**:

```jsx
// left alone: the module need not export useCallback at all, and this useMemo
// need not be React's — a deep-compare memo, say, does not survive the swap
import { useMemo } from '../hooks';
const cb = useMemo(() => () => {}, []); // reported, not fixed

// left alone: a default import, a namespace member, a `require` destructure, a
// type-only import, `default as useMemo`, or no import at all
import useMemo from './use-memo';
const cb = useMemo(() => () => {}, []); // reported, not fixed
```

Declining is deliberate rather than a limitation: rewriting the call while
leaving the import untouched used to emit a `useCallback` that nothing bound
(`TS2304`), and renaming an unknown module's specifier would import a member that
module may not export. A hook of unknown provenance is left for a human to
convert.

The same reasoning applies from the other side. When the name `useCallback` is
already bound by an import from a module outside that set, no conversion in the
file is fixed: reusing that binding would call a different function, and adding
React's beside it would collide with a name already in scope.

```jsx
import { useMemo } from 'react';
import { useCallback } from '../hooks';
const cb = useMemo(() => () => {}, []); // reported, not fixed
```

### Comments survive the unwrap

Converting the call collapses the wrapper around the returned function — the
`() => {` and `return` before it, the `;` and `}` after it. The fix splices those
tokens out instead of re-printing the call, so the returned function, the type
arguments, the dependency array and every byte between them are left exactly as
written. Comments caught inside the collapsed wrapper are emitted back with the
line breaks that framed them, which keeps an `eslint-disable-next-line` in front
of the same line it governed:

```jsx
// before
const cb = useMemo(() => {
  // eslint-disable-next-line no-console
  return () => console.log('x');
}, []);

// after — the directive still suppresses the console call
const cb = useCallback(
  // eslint-disable-next-line no-console
  () => console.log('x'), []);
```

A comment is never dropped, so the fix is never declined on account of one:
every comment in the collapsed wrapper has a landing place inside the emitted
argument list. When a directive governed the `return` line itself, the directive
is kept even though the `return` is gone; the result is an unused directive,
which `--report-unused-disable-directives` surfaces, rather than a suppression
that silently stops applying.

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

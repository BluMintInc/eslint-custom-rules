# Enforce using useLatestCallback from use-latest-callback instead of React useCallback (`@blumintinc/blumint/use-latest-callback`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Enforces using `useLatestCallback` from the `use-latest-callback` package instead of React's `useCallback` for callbacks that do not return JSX.

## Rule Details

`useCallback` re-creates the function whenever its dependency array changes. That either forces you to maintain a long dependency list (and risk stale closures if you miss one) or accept that the function identity churns and triggers extra renders in parents, children, or effects. `useLatestCallback` keeps the reference stable while still executing with the latest props and state, so callers see a consistent function identity without needing dependency arrays.

This rule:
- Flags `useCallback` imports from `react` when the wrapped function does **not** return JSX.
- Auto-fixes by importing from `use-latest-callback`, replacing the call site, and removing the dependency array.
- Leaves JSX-returning callbacks and render-prop patterns alone because `useCallback` is the right tool for memoizing rendered output.
- Removes the `useCallback` specifier from the `react` import only when every reference to it is converted. If a JSX-returning call — or any other use of the binding, such as `const cb = useCallback` — survives, the `react` import is kept untouched and the `use-latest-callback` import is added alongside it.
- Emits the import rewrite and every call-site conversion as **one atomic fix** on a single report. When another rule's fix conflicts with any part of it in the same `--fix` pass, ESLint defers the whole conversion to the next pass instead of applying half of it, so the `useCallback` import can never be removed while a `useCallback(...)` call remains.
- Skips files in `node_modules` for performance so third-party code is untouched.

### Mixed files

When only some calls are converted, the `react` import stays because the remaining calls still need it. The new import gets its own name, so an aliased `react` import is never repurposed to point at a different hook.

```jsx
// Before
import { useCallback as uc, useMemo } from 'react';

function MyComponent({ items }) {
  const renderItem = uc((item) => <li>{item.name}</li>, []);
  const handleClick = uc(() => submit(items), [items]);
  const count = useMemo(() => items.length, [items]);
  return <ul onClick={handleClick}>{items.map(renderItem)}{count}</ul>;
}

// After --fix
import useLatestCallback from 'use-latest-callback';
import { useCallback as uc, useMemo } from 'react';

function MyComponent({ items }) {
  const renderItem = uc((item) => <li>{item.name}</li>, []);
  const handleClick = useLatestCallback(() => submit(items));
  const count = useMemo(() => items.length, [items]);
  return <ul onClick={handleClick}>{items.map(renderItem)}{count}</ul>;
}
```

### ❌ Incorrect

```jsx
import { useCallback, useState } from 'react';

function MyComponent({ onAction }) {
  const [count, setCount] = useState(0);

  const handleClick = useCallback(() => {
    console.log(`Clicked ${count} times`);
    onAction(count);
  }, [count, onAction]);

  return <button onClick={handleClick}>Click Me</button>;
}
```

### ✅ Correct

```jsx
import useLatestCallback from 'use-latest-callback';
import { useState } from 'react';

function MyComponent({ onAction }) {
  const [count, setCount] = useState(0);

  const handleClick = useLatestCallback(() => {
    console.log(`Clicked ${count} times`);
    onAction(count);
  });

  return <button onClick={handleClick}>Click Me</button>;
}
```

## When Not To Use It

You should not use this rule when:

1. Your codebase doesn't have access to the `use-latest-callback` package.
1. You're working with callbacks that return JSX (render props or components-as-children patterns). In these scenarios, `useCallback` is the correct hook to memoize the component/JSX structure itself.
1. You need a dependency-aware memoized function identity for advanced React optimization cases where a stable reference is not desired.

## Further Reading

- [use-latest-callback package](https://www.npmjs.com/package/use-latest-callback)
- [React useCallback documentation](https://reactjs.org/docs/hooks-reference.html#usecallback)

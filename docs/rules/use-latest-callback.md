# Enforce using useLatestCallback from use-latest-callback instead of React useCallback (`@blumintinc/blumint/use-latest-callback`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Enforces the use of `useLatestCallback` from the `use-latest-callback` package instead of React's built-in `useCallback` hook.

## Rule Details

This rule aims to ensure stable function references across re-renders, which can prevent unnecessary child component re-renders and simplify dependency management in `useEffect` hooks. `useLatestCallback` achieves this by always providing the same function reference while ensuring the callback executes with the most recent props and state.

### ❌ Incorrect

```jsx
import { useCallback } from 'react';

function MyComponent({ onAction }) {
  const [count, setCount] = useState(0);

  // This callback will change if 'count' changes, potentially causing
  // unnecessary re-renders of child components that depend on it.
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

function MyComponent({ onAction }) {
  const [count, setCount] = useState(0);

  // This callback reference remains stable, even if 'count' or 'onAction' changes.
  // The latest values of 'count' and 'onAction' will be used when it's executed.
  const handleClick = useLatestCallback(() => {
    console.log(`Clicked ${count} times`);
    onAction(count);
  }); // No dependency array needed

  return <button onClick={handleClick}>Click Me</button>;
}
```

## When Not To Use It

You should not use this rule when:

1. Your codebase doesn't have access to the `use-latest-callback` package.
2. You're working with callbacks that return JSX or implement render prop patterns. In these scenarios, `useCallback` is the correct hook to memoize the component/JSX structure itself.

## Further Reading

- [use-latest-callback package](https://www.npmjs.com/package/use-latest-callback)
- [React useCallback documentation](https://reactjs.org/docs/hooks-reference.html#usecallback)

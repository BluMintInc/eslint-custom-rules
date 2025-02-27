# Disallow unused useState hooks (`@blumintinc/blumint/no-unused-usestate`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

> Disallow unused useState hooks

## Rule Details

This rule identifies cases where the state variable from useState is ignored (e.g., replaced with `_`) and suggests removing the unnecessary state declaration to improve maintainability.

### ❌ Incorrect

```jsx
const [_, setCount] = useState(0); // The state variable is ignored.
```

### ✅ Correct

```jsx
// No unused useState hooks
```

## When Not To Use It

If you need to temporarily ignore a state variable for debugging purposes, you can disable this rule for a specific line:

```jsx
// eslint-disable-next-line @blumintinc/blumint/no-unused-usestate
const [_, setCount] = useState(0);
```

## Further Reading

- [React Hooks API Reference](https://reactjs.org/docs/hooks-reference.html#usestate)

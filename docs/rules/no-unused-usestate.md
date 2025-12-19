# Disallow unused useState hooks (`@blumintinc/blumint/no-unused-usestate`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

> Disallow unused useState hooks

## Rule Details

This rule flags `useState` calls where the state value is intentionally discarded (commonly named `_` or prefixed with `_`). Ignoring the value leaves React managing state that is never read, which:

- Adds avoidable allocations and renders for data you do not consume.
- Signals a misleading data flow where readers expect stateful behavior that never occurs.
- Suggests the code actually needs a different primitive (e.g., `useRef`, a prop callback, or a derived value) instead of state.

Use a ref or restructure the logic when you only need a mutable holder without triggering stateful re-renders. Keep the `useState` pair when both the value and setter are meaningful to the component.

### ❌ Incorrect

```jsx
// State value is thrown away while the setter is used
const [_, setCount] = useState(0);
setCount(prev => prev + 1);
```

### ✅ Correct

```jsx
// State value is read, so keeping useState is justified
const [count, setCount] = useState(0);
return <div onClick={() => setCount(prev => prev + 1)}>{count}</div>;
```

```jsx
// When only a mutable holder is needed, prefer useRef instead of unused state
const rerenderCount = useRef(0);
rerenderCount.current += 1;
```

## When Not To Use It

If you need to temporarily ignore a state variable for debugging purposes, you can disable this rule for a specific line:

```jsx
// eslint-disable-next-line @blumintinc/blumint/no-unused-usestate
const [_, setCount] = useState(0);
```

## Further Reading

- [React Hooks API Reference](https://reactjs.org/docs/hooks-reference.html#usestate)

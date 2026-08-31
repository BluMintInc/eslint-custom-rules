# Disallow unused useState hooks (`@blumintinc/blumint/no-unused-usestate`)

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

An `_` prefix is a naming convention, not proof that the binding is dead: the rule resolves the value binding through the scope manager and stays silent when the value is actually read.

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
// The underscore name is irrelevant when the value is consumed
const [_, setValue] = useState('');
return <input value={_} onChange={(e) => setValue(e.target.value)} />;
```

```jsx
// When only a mutable holder is needed, prefer useRef instead of unused state
const rerenderCount = useRef(0);
rerenderCount.current += 1;
```

## Autofix Scope

The autofix deletes the declaration **only when every binding it introduces is unreferenced** — the discarded value *and* the setter (plus any rest binding). Deleting a declaration whose setter is still called would strand the call sites and break the component, so that shape is reported without a fix and left for a human to convert to `useRef`, a derived value, or a prop callback.

```jsx
// Fixable: nothing references either binding, so the pair is dead code
const [_, setUnused] = useState(0);
```

```jsx
// Reported but not fixed: setCount is live, so the declaration must stay
const [_, setCount] = useState(0);
useEffect(() => subscribe(setCount), []);
```

When the deleted declaration held the last call to `useState`, the same fix unbinds the import: `import React, { useState } from 'react'` becomes `import React from 'react'`, and an import whose only specifier was `useState` is dropped whole. The deletion and the unbinding ship as one fix, so neither lands without the other, and a file with several dead pairs unbinds the import only once every call is gone.

The fix is withheld entirely when the specifier cannot be removed safely — a comment sits among the specifiers, or the discarded initializer holds the last read of another binding. An unfixed report costs less than a fix that trades a discarded state value for an unused-variable error nothing re-reports.

## When Not To Use It

If you need to temporarily ignore a state variable for debugging purposes, you can disable this rule for a specific line:

```jsx
// eslint-disable-next-line @blumintinc/blumint/no-unused-usestate
const [_, setCount] = useState(0);
```

## Further Reading

- [React Hooks API Reference](https://reactjs.org/docs/hooks-reference.html#usestate)

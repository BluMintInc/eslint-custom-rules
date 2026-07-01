# Prevent passing a function directly to a useState setter — React will invoke it as a functional updater instead of storing it. Wrap in a thunk: setState(() => fn) (`@blumintinc/blumint/no-direct-function-state`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

React's `useState` setter has a little-known gotcha: if you pass a **function** directly as the argument, React treats it as a **functional updater** — it invokes the function with the previous state value and stores the *return value* as the new state. This is never what you want when the goal is to *store* a function in state.

This rule flags `setter(fn)` patterns where `fn` is a function reference, and auto-fixes them to the safe thunk form `setter(() => fn)`.

### Why this matters

- The bug produces **no errors and no warnings**. The function is silently called, side effects fire at the wrong time, and the state is set to `undefined` (or whatever the function returned).
- This exact pattern caused a production bug in `usePortal.tsx` where `closeCancel` (from `useGuardFlow`) was invoked as a functional updater before the dialog rendered, silently resolving the guard as cancelled.

### Detection strategy

The rule uses purely syntactic detection (no type-checker required):

1. **Primary signal — explicit function type parameter**: If `useState<T>()` has a type parameter `T` that is (or contains in a union) a function type (e.g. `(() => void) | null`), *any* bare identifier or member expression passed to the setter is flagged.
2. **Secondary signal — naming heuristic**: If there is no explicit function type, the argument name is matched against configurable patterns (default: `callback`, `handler`, `fn`, `func`, `on[A-Z].*`).
3. **Tertiary signal — scope binding**: If an identifier is bound in scope to an arrow function or function expression, passing it to any tracked setter is flagged.

### Safe forms (never flagged)

- Inline arrow / function expressions: `setState(() => fn)` or `setState((prev) => prev + 1)`
- Literals: `setState(null)`, `setState(undefined)`, `setState(42)`, `setState('hello')`
- Call expressions (return type unknown without type checker): `setState(getHandler())`
- Object and array literals: `setState({})`, `setState([])`
- Non-function-typed state with non-matching names: `setCount(n)` where `n` is just a number

## Examples

### Incorrect

```typescript
// Function-typed state, bare identifier — React would call newOnClose
const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
setOnCloseState(newOnClose);

// Member expression to function-typed state
const [pageForward, setPageForward] = useState<(() => void) | null>(null);
setPageForward(showMore);

// Heuristic match: 'onClose' matches on[A-Z].* pattern
const [x, setX] = useState(null);
setX(props.onClose);
```

### Correct

```typescript
// Wrap in a thunk so React stores the function as a value
const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
setOnCloseState(() => newOnClose);

// Clearing state with null — safe
const [pageForward, setPageForward] = useState<(() => void) | null>(null);
setPageForward(null);

// Functional updater — intentional, always safe
const [count, setCount] = useState<number>(0);
setCount((prev) => prev + 1);

// Non-function state — fine to pass identifiers
const [count, setCount] = useState<number>(0);
setCount(n);
```

## Options

```typescript
{
  // Variable name / property name patterns treated as function references.
  // Uses regex anchored at both ends (^ and $).
  // Default: ['callback', 'handler', 'fn', 'func', 'on[A-Z].*']
  functionPatterns: string[];
}
```

### Example configuration

```javascript
// .eslintrc.js
{
  '@blumintinc/blumint/no-direct-function-state': [
    'error',
    {
      functionPatterns: [
        'callback',
        'handler',
        'fn',
        'func',
        'on[A-Z].*',
      ],
    },
  ],
}
```

## When to disable

Disable for a single line with an explicit comment if you have verified that the call is intentional — e.g., a custom hook that wraps a non-standard setter:

```typescript
// eslint-disable-next-line @blumintinc/blumint/no-direct-function-state
setInternalState(myFunction);
```

## Further reading

- [React docs — functional updates](https://react.dev/reference/react/useState#setstate)
- Related rule: `no-stale-state-across-await`

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

1. **Primary signal — explicit function type parameter**: If `useState<T>()` has a type parameter `T` that is (or contains in a union) a function type (e.g. `(() => void) | null`), *any* bare identifier or member expression passed to the setter is flagged. `T` may also be a same-file `type` alias (including alias chains and unions of aliases) that resolves to a function type — the rule follows the alias back to its declaration, wherever in the file it's declared.
2. **Secondary signal — naming heuristic**: If there is no explicit function type, the argument name is matched against configurable patterns (default: `callback`, `handler`, `fn`, `func`, `on[A-Z].*`).
3. **Tertiary signal — scope binding**: If an identifier is bound in scope to an arrow function or function expression, passing it to any tracked setter is flagged.

> **Alias resolution is same-file only.** A type alias imported from another module (e.g. `import { ToClose } from './types'`) can't be resolved without a type checker, so state typed with an imported alias falls back to the name-pattern and scope-binding signals above.

> **Alias resolution is lexical.** An alias is looked up in every enclosing statement container — function body, arrow body, bare block, `switch` case, `namespace` body, and finally the file's top level — innermost first, and `export type X = ...` is read the same as `type X = ...`. Declaring the alias beside the hook that uses it therefore behaves exactly like hoisting it to file scope:
>
> ```ts
> function usePortal() {
>   type ToClose = () => void; // resolved, same as if declared at file scope
>   const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
>   const open = (newOnClose: ToClose) => {
>     setOnCloseState(newOnClose); // flagged
>   };
>   return { open };
> }
> ```
>
> Because the innermost declaration wins, an inner alias shadows a same-named outer one, and an alias declared in a sibling scope is not in scope and does not resolve. TypeScript hoists type declarations, so an alias written *after* the `useState` call that references it still resolves.

> **Optional chaining and type assertions are transparent.** All three signals read through `?.`, `as T`, `<T>x`, `x satisfies T`, `x!` and `fn<T>`, because none of them changes the value that reaches the setter. `setX(props?.onClose)` is flagged exactly like `setX(props.onClose)` — when `props` is present and `onClose` is a function, React still invokes it as an updater — and the fix keeps the original expression verbatim inside the thunk (`setX(() => props?.onClose)`), so it cannot throw where the original did not. The same transparency preserves the carve-outs in the other direction: `setState(getHandler?.())` is a call, so it stays exempt just like `setState(getHandler())`.

> **A top-level type assertion is reported but not auto-fixed.** A thunk around `props.onClose as any` would be an arrow returning a cast, which [`no-type-assertion-returns`](./no-type-assertion-returns.md) — also `error` in the recommended config — reports, so `eslint --fix` would trade one error for another. Hoisting the cast is the remedy that converges under both rules:
>
> ```ts
> const onClose = props.onClose as any;
> setX(() => onClose);
> ```
>
> Moving the assertion outside the thunk (`setX((() => props.onClose) as any)`) is deliberately not emitted: it asserts a different value, and for an asserted type that is neither assignable to nor from `() => T` it does not compile.

### Safe forms (never flagged)

- Inline arrow / function expressions: `setState(() => fn)` or `setState((prev) => prev + 1)`
- Literals: `setState(null)`, `setState(undefined)`, `setState(42)`, `setState('hello')`
- Call expressions (return type unknown without type checker): `setState(getHandler())`, including the optional spellings `setState(getHandler?.())` and `setState(factory?.build())`
- Object and array literals: `setState({})`, `setState([])`
- Non-function-typed state with non-matching names: `setCount(n)` where `n` is just a number

## Examples

### Incorrect

```typescript
// Function-typed state, bare identifier — React would call newOnClose
type ToClose = () => void;
declare const newOnClose: ToClose;
const [onCloseState, setOnCloseState] = useState<ToClose | undefined>(undefined);
setOnCloseState(newOnClose);

// Member expression to function-typed state
const [pageForward, setPageForward] = useState<(() => void) | null>(null);
setPageForward(showMore);

// Heuristic match: 'onClose' matches on[A-Z].* pattern
const [x, setX] = useState(null);
setX(props.onClose);

// Optional chaining does not retire the hazard — when props is present,
// React still invokes onClose as a functional updater
const [y, setY] = useState(null);
setY(props?.onClose);

// Type assertions are erased at runtime, so this is the same call
// (reported without an auto-fix — hoist the cast, see above)
const [z, setZ] = useState(null);
setZ(props.onClose as any);
```

### Correct

```typescript
// Wrap in a thunk so React stores the function as a value
type ToClose = () => void;
declare const newOnClose: ToClose;
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

// The thunk carries the optional chain verbatim, so it short-circuits
// exactly where the original did
const [y, setY] = useState(null);
setY(() => props?.onClose);

// A call's return type is unknown without a checker, optional or not
const [cb, setCb] = useState<(() => void) | null>(null);
setCb(factory?.build());
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

### Invalid patterns are reported, not ignored

Each entry is compiled as a regular expression anchored at both ends. An entry
that does not compile is reported once per file against the `Program` node:

```
"on[A-Z" in functionPatterns is not a valid regular expression, so it was dropped.
```

The entry is dropped, and the entries that do compile keep working. Reporting it
is deliberate: a silently discarded pattern leaves the allowlist inert, so the
rule goes on flagging the very code the pattern was written to exclude, with
nothing to indicate why.

## When to disable

Disable for a single line with an explicit comment if you have verified that the call is intentional — e.g., a custom hook that wraps a non-standard setter:

```typescript
// eslint-disable-next-line @blumintinc/blumint/no-direct-function-state
setInternalState(myFunction);
```

## Further reading

- [React docs — functional updates](https://react.dev/reference/react/useState#setstate)
- Related rule: `no-stale-state-across-await`

# Disallow useMemo for primitive return values that do not need referential stability (`@blumintinc/blumint/no-useless-usememo-primitives`)

💼 This rule is enabled in the ✅ `recommended` config.  
🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

`useMemo` adds dependency noise and mental overhead when the memoized callback produces a pass-by-value type (string, number, boolean, null/undefined, bigint, and optionally symbol). Primitive values already compare by value, so memoizing them does not improve referential stability and only obscures intent.

## Rule Details

- **Why**: Primitive results do not change identity between renders, so `useMemo` only adds complexity and hides when values can change. Dependency arrays for primitives also provide no protection against re-renders, making the hook misleading.
- **What it checks**:
  - Flags `useMemo` (or `React.useMemo`) when the callback returns a primitive value.
  - Uses TypeScript type information when available; otherwise falls back to AST heuristics for simple primitive expressions (literals, identifiers, template literals, logical/conditional/arithmetic expressions).
  - Skips cases with obvious side effects or non-deterministic calls such as `Date.now()`, `new Date()`, `Math.random()`, or `crypto.getRandomValues`.
  - Skips when the callback includes function calls if `ignoreCallExpressions` is enabled (default) to avoid flagging intentionally expensive computations.
- **Auto-fix**: Replaces `useMemo(() => EXPR, [deps])` with `EXPR` and removes the dependency array.

### Examples

Bad – memoizing primitives:

```tsx
const label = useMemo(() => {
  return isPendingToJoinTeam ? 'Pending Response' : 'Request to Join';
}, [isPendingToJoinTeam]);

const countText = useMemo(() => `Count: ${count}`, [count]);
const isEnabled = useMemo(() => flagA && flagB, [flagA, flagB]);
```

Good – compute primitives directly:

```tsx
const label = isPendingToJoinTeam ? 'Pending Response' : 'Request to Join';
const countText = `Count: ${count}`;
const isEnabled = flagA && flagB;
```

Good – memoization still useful for reference types:

```tsx
const options = useMemo(() => ({ a, b }), [a, b]);
const list = useMemo(() => [a, b], [a, b]);
// Prefer useCallback for functions:
const onClick = useCallback(() => doThing(a, b), [a, b]);
```

### Options

```json
{
  "@blumintinc/blumint/no-useless-usememo-primitives": [
    "warn",
    {
      "ignoreCallExpressions": true,
      "ignoreSymbol": true,
      "tsOnly": false
    }
  ]
}
```

- `ignoreCallExpressions` (default: `true`): When `true`, skip callbacks that contain function calls to avoid flagging potentially expensive computations that intentionally use `useMemo`.
- `ignoreSymbol` (default: `true`): Do not flag callbacks whose return type is or includes `symbol`, since symbol identity can be intentional.
- `tsOnly` (default: `false`): Only run the rule when TypeScript type information is available. With `false`, the rule falls back to safe AST heuristics in JS files.

### Edge Cases

- Non-deterministic or side-effectful expressions (`Date.now()`, `Math.random()`, `new Date()`, `crypto.getRandomValues`) are never flagged.
- Function returns are not flagged here; prefer `@blumintinc/blumint/prefer-usecallback-over-usememo-for-functions` for those.
- Ambiguous or complex bodies with multiple statements are ignored to avoid unsafe fixes.
- When `ignoreCallExpressions` is `false`, calls are analyzed only when type information proves the return type is primitive; otherwise they are skipped to avoid false positives.

### When Not To Use It

- Performance hotspots where primitive-returning functions are intentionally expensive and rely on `useMemo` for throttling recomputation—disable locally with:

```tsx
// eslint-disable-next-line @blumintinc/blumint/no-useless-usememo-primitives
const checksum = useMemo(() => heavyChecksum(data), [data]);
```

## Version

- Introduced in v1.12.6

# Disallow useless useMemo with primitive values (`@blumintinc/blumint/no-useless-usememo-primitives`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

`useMemo` adds dependency noise and mental overhead when the memoized callback produces a pass-by-value type (string, number, boolean, null/undefined, bigint, and optionally symbol). Primitive values already compare by value, so memoizing them does not improve referential stability and only obscures intent.

The same holds for `useDeepCompareMemo` (from `@blumintinc/use-deep-compare`), which is governed on identical terms: it caches a callback's result against a dependency array exactly as `useMemo` does, so a primitive result gains nothing from it either — and deep comparison makes the bargain worse rather than acceptable, since every render walks the dependency array by value to protect a value that has no identity to preserve.

## Rule Details

- **Why**: Primitive results do not change identity between renders, so `useMemo` only adds complexity and hides when values can change. Dependency arrays for primitives also provide no protection against re-renders, making the hook misleading.
- **What it checks**:
  - Flags `useMemo` and `useDeepCompareMemo` — bare or namespaced (`React.useMemo`, `deepCompare.useDeepCompareMemo`) — when the callback returns a primitive value.
  - The hook names are enumerated rather than matched by prefix. `useDeepCompareCallback` hands its callback back rather than calling it, and `useDeepCompareEffect` produces no value at all, so neither is flagged however primitive its body looks.
  - `@blumintinc/blumint/prefer-use-deep-compare-memo` rewrites a `useMemo` callee to `useDeepCompareMemo` to repair a dependency-identity problem, leaving the callback byte-identical. Governing both spellings is what keeps that rewrite from taking a still-useless memoization out of this rule's sight (#2312).
- Uses TypeScript type information when available; otherwise falls back to AST heuristics for simple primitive expressions (literals, template literals, unary/comparison expressions, and conditionals whose branches are primitive). Bare identifiers are treated as unknown to avoid false positives in JS files.
  - Flags only cases without obvious side effects or non-deterministic calls (e.g., `Date.now()`, `new Date()`, `Math.random()`, or `crypto.getRandomValues`).
  - Respects async callbacks—they return Promises, so inlining a primitive from an async function would change the value type.
  - Respects generator callbacks—they always return iterators, so inlining yielded primitives would change the return type and behavior.
  - Does not apply when the callback includes function calls if `ignoreCallExpressions` is enabled (default) to avoid flagging intentionally expensive computations.
- **Auto-fix**: Replaces `useMemo(() => EXPR, [deps])` with `EXPR` and removes the dependency array. A comment inside the `useMemo` call but outside the returned expression — such as an `eslint-disable-next-line` directive on the return statement — is carried into the replacement rather than destroyed, so a suppressed rule is never silently re-enabled. Each comment keeps the side of the expression it was written on, and one whose meaning depends on the line it occupies (a line comment, or a block-comment `eslint-disable-next-line`) keeps a line of its own so it still covers the inlined expression. The presence of a comment therefore never changes whether the fix applies.
- **Auto-fix — where a carried comment lands**: A comment written behind the expression annotates the statement the call stood in, so it rides past the `;` or `,` that closes it: `useMemo(() => 3 * 3, /* no deps */ [])` becomes `3 * 3; /* no deps */`, not `3 * 3 /* no deps */;`. That is where `prettier` prints such a comment, and it also gives a line comment the end of the statement to break at, so the parentheses that used to hold that break open are no longer needed. A punctuator with source still behind it on the line is left alone — a line comment moved past it would swallow that source — and the comment stays inside the replacement instead.
- **Auto-fix — parentheses**: The replacement is parenthesised only where the position it lands in needs it. A pair the position does not need is text written into an otherwise formatted file, and `prettier` deletes it again, so every fixed file would fail `prettier --check`. Parentheses are kept where dropping them would change the parse or the meaning — `useMemo(() => 1, []).toFixed(2)` becomes `(1).toFixed(2)` because `1.toFixed(2)` is not a number followed by a method, `useMemo(() => 1 ?? 2, []) || fallback` becomes `(1 ?? 2) || fallback` because `??` cannot sit beside `||`, and a conditional used as a concise arrow body keeps them because prettier writes them back there. A carried comment that owns its line puts a line terminator in the middle of the replacement, and keeps the parentheses only where that terminator is not inert. Two positions qualify. One is a restricted production — the argument of `return`, `throw` or `yield`, or the operand of a postfix `++`/`--` — where a bare terminator ends the construct through automatic semicolon insertion, so a `return` would hand back `undefined` and leave the expression standing as dead code. The other is an emission ending in a line-bound comment with source still on that line for it to swallow. Anywhere else the terminator is whitespace, so the landing position decides exactly as it does for an uncommented emission. Where the pair does stay, the group is laid out the way prettier prints a parenthesised group that has to break: the interior one level in from the statement, and the closing parenthesis alone on its own line.
- **Auto-fix — imports**: The unwrap deletes the callee and the dependency array, so an import read only from there loses its last reference. Which import that is comes from the deletion itself rather than from a hardcoded name, so a `useDeepCompareMemo` call unbinds `@blumintinc/use-deep-compare` on exactly the terms a `useMemo` call unbinds `react`. The same fix drops that import, because a rewrite that strands a binding turns a clean file into one that fails `no-unused-vars` and `noUnusedLocals`, and the resolved report leaves nothing to re-raise the debt. Every unwrap in a file ships as one fix for the same reason: with two calls sharing one `useMemo` import, neither unwrap is the binding's last use on its own.

```tsx
// Before
const label = useMemo(() => {
  // eslint-disable-next-line no-restricted-syntax
  return isPending ? 'Pending Response' : 'Request to Join';
}, [isPending]);

// After — the directive still covers the ternary it was written for
const label =
  // eslint-disable-next-line no-restricted-syntax
  isPending ? 'Pending Response' : 'Request to Join';
```

```tsx
// Before
import { useMemo } from 'react';

export const useThing = () => useMemo(() => 1, []);

// After — the specifier the unwrap orphaned goes with it
export const useThing = () => 1;
```

A comment written behind the expression follows the statement's terminator:

```tsx
// Before
const isFlagged = useMemo(() => {
  return !value; // trailing note
}, [value]);

// After — the note trails the statement, as it did before the unwrap
const isFlagged = !value; // trailing note
```

The parentheses stay exactly where the landing position needs them:

```tsx
// Before
const width = useMemo(() => (isWide ? 'wide' : 'narrow'), [isWide]).length;

// After — a member access binds tighter than the conditional it now reads
const width = (isWide ? 'wide' : 'narrow').length;
```

After `return` a carried comment's line terminator would end the statement, so
the pair stays — laid out the way prettier prints a group that has to break:

```tsx
// Before
function useLabel(flag: boolean) {
  return useMemo(() => {
    // eslint-disable-next-line no-restricted-syntax
    return flag ? 'a' : 'b';
  }, [flag]);
}

// After — the directive still governs the line the ternary stands on
function useLabel(flag: boolean) {
  return (
    // eslint-disable-next-line no-restricted-syntax
    flag ? 'a' : 'b'
  );
}
```

A binding kept alive by anything else stays, and an import the returned
expression itself reads is never touched — the expression is moved, not deleted:

```tsx
// Before
import { useMemo } from 'react';
import { LIMIT } from './constants';

export const useCount = () => useMemo(() => 1, []);
export const useConfig = () => useMemo(() => ({ limit: LIMIT }), []);

// After — `useMemo` still has a caller, and `LIMIT` still has a reader
import { useMemo } from 'react';
import { LIMIT } from './constants';

export const useCount = () => 1;
export const useConfig = () => useMemo(() => ({ limit: LIMIT }), []);
```

The fix declines outright when a binding it would strand cannot be unbound
safely — a local `const` read only from the dependency array, or an import
declaration carrying a comment among its specifiers. A report without a fix is
the lesser damage.

### Examples

#### Examples of incorrect code — memoizing primitives

```tsx
const label = useMemo(() => {
  return isPendingToJoinTeam ? 'Pending Response' : 'Request to Join';
}, [isPendingToJoinTeam]);

const countText = useMemo(() => `Count: ${count}`, [count]);
const isEnabled = useMemo(() => flagA && flagB, [flagA, flagB]);
```

#### Examples of correct code — compute primitives directly

```tsx
const label = isPendingToJoinTeam ? 'Pending Response' : 'Request to Join';
const countText = `Count: ${count}`;
const isEnabled = flagA && flagB;
```

#### Examples of incorrect code — the deep-compare memo hook

```tsx
const greeting = useDeepCompareMemo(() => `Hello, ${name}`, [name]);
const isBelowCap = useDeepCompareMemo(() => count > cap, [count, cap]);
```

#### Examples of correct code — memoization still useful for reference types

```tsx
const options = useMemo(() => ({ a, b }), [a, b]);
const list = useMemo(() => [a, b], [a, b]);
// Prefer useCallback for functions:
const onClick = useCallback(() => doThing(a, b), [a, b]);
```

#### Examples of correct code — deep comparison of a reference value

```tsx
const filters = useDeepCompareMemo(() => ({ status, tags }), [status, tags]);
// The callback is handed back rather than called, so its result is a function:
const onSave = useDeepCompareCallback(() => save(draft), [draft]);
```

### Options

```json
{
  "@blumintinc/blumint/no-useless-usememo-primitives": [
    "error",
    {
      "ignoreCallExpressions": true,
      "ignoreSymbol": true,
      "tsOnly": false
    }
  ]
}
```

- `ignoreCallExpressions` (default: `true`): When `true`, skip callbacks that contain function calls (including tagged template invocations) to avoid flagging potentially expensive computations that intentionally use `useMemo`.
- `ignoreSymbol` (default: `true`): Do not flag callbacks whose return type is or includes `symbol`, since symbol identity can be intentional.
- `tsOnly` (default: `false`): Only run the rule when TypeScript type information is available. With `false`, the rule falls back to safe AST heuristics in JS files.

### Edge Cases

- Non-deterministic or side-effectful expressions (`Date.now()`, `Math.random()`, `new Date()`, `crypto.getRandomValues`) are never flagged.
- Function returns are not flagged here; prefer `@blumintinc/blumint/prefer-usecallback-over-usememo-for-functions` for those.
- Ambiguous or complex bodies with multiple statements are ignored to avoid unsafe fixes.
- When `ignoreCallExpressions` is `false`, calls are analyzed only when type information proves the return type is primitive; otherwise they are skipped to avoid false positives.
- Without TypeScript type information, identifiers are considered ambiguous (except for `undefined`, `Infinity`, and `NaN`), so JavaScript files may produce fewer findings to prevent false positives when a memoized identifier refers to an object or array.

### When Not To Use It

- Performance hotspots where primitive-returning functions are intentionally expensive and rely on `useMemo` for throttling recomputation—disable locally with:

```tsx
// eslint-disable-next-line @blumintinc/blumint/no-useless-usememo-primitives
const checksum = useMemo(() => heavyChecksum(data), [data]);
```

## Version

- Introduced in v1.12.6

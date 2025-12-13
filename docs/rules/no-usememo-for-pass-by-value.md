# Disallow useMemo for pass-by-value returns in custom hooks (`@blumintinc/blumint/no-usememo-for-pass-by-value`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

💭 This rule requires type information.

<!-- end auto-generated rule header -->

This rule flags custom React hooks that return a `useMemo` result when the memoized value is pass-by-value: primitives with value equality (`string`, `number`, `boolean`, `null`, `undefined`, `bigint`). Memoizing these primitives does not provide referential stability, so the hook only adds noise and suggests a stability guarantee that does not exist. Arrays/tuples and `symbol` values are excluded because their identity changes on each creation and memoization can legitimately stabilize them.

The fixer replaces `useMemo(() => expr, deps)` with `expr` (when the callback is a single-expression return) and removes the unused `useMemo` import when possible.

## Rule Details

Why this matters:
- Memoizing pass-by-value results does not change identity or prevent re-renders; it just obscures the hook’s intent.
- `useMemo` around primitives implies there is a referential contract, which can mislead readers and reviewers.
- Removing the wrapper eliminates dead dependency arrays and unused imports.

Examples of **incorrect** code for this rule:

```ts
import { useMemo } from 'react';

export function useIsReady(values: string[]) {
  return useMemo(() => values.every(Boolean), [values]); // boolean primitive
}

export function useUnion(flag: boolean) {
  return useMemo(() => (flag ? 'ready' : false), [flag]); // union of primitives
}
```

Examples of **correct** code for this rule:

```ts
// Return primitives directly
export function useLabelAndHref(slug: string) {
  const label = slug.toUpperCase();
  const href = `/t/${slug}`;
  return [label, href];
}

// Tuple/array identity can matter, so memoization is allowed
export function useLabelTuple(slug: string) {
  return useMemo(() => [slug, slug.toUpperCase()], [slug]);
}

// Symbols have unique identity per creation, so memoization can be useful
export function useStableSymbol() {
  return useMemo(() => Symbol('token'), []);
}

export function useActions(id: string) {
  return useMemo(
    () => ({ id, onClick: () => doSomething(id) }), // object + function
    [id],
  );
}

export function useBigPrime(n: number) {
  return useMemo(() => computeBigPrime(n), [n]); // allowed as expensive computation
}
```

## Options

This rule accepts an options object:

```json
{
  "allowExpensiveCalleePatterns": ["compute", "calculate", "derive", "generate", "expensive", "heavy", "hash"]
}
```

- `allowExpensiveCalleePatterns` (`string[]`, default shown): regex patterns matched against the callee name of the memoized expression. If the callback simply calls a function whose name matches one of these patterns (e.g., `computeBigPrime`), the rule allows the memoization to avoid false positives for clearly expensive computations that still return primitives.

## When Not To Use It

- If your codebase intentionally memoizes primitives to satisfy external dependency-array tooling and you prefer that style over readability.
- If type information is not available (this rule requires `parserOptions.project`).

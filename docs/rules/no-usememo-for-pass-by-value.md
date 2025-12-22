# Disallow returning useMemo results from custom hooks when the memoized value is pass-by-value: primitives with value equality (string, number, boolean, null, undefined, bigint) or arrays/tuples composed exclusively of these primitives. Requires type information (`@blumintinc/blumint/no-usememo-for-pass-by-value`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

💭 This rule requires [type information](https://typescript-eslint.io/linting/typed-linting).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

💭 This rule requires [type information](https://typescript-eslint.io/linting/typed-linting).

<!-- end auto-generated rule header -->

This rule flags custom React hooks that return a `useMemo` result when the memoized value is pass-by-value: primitives with value equality (`string`, `number`, `boolean`, `null`, `undefined`, `bigint`) or arrays/tuples composed exclusively of these primitives. Memoizing these values does not provide beneficial referential stability (as primitives have value equality and recreating primitive-only containers is inexpensive), so the hook only adds noise and suggests a stability guarantee that is not necessary. `symbol` values and objects (or arrays/tuples containing objects) are excluded because their identity changes on each creation and memoization can legitimately stabilize them.

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

export function useTuple(slug: string) {
  return useMemo(() => [slug, slug.toUpperCase()], [slug]); // tuple of primitives
}
```

Examples of **correct** code for this rule:

```ts
// Return primitives or primitive containers directly
export function useLabelAndHref(slug: string) {
  const label = slug.toUpperCase();
  const href = `/t/${slug}`;
  return [label, href];
}

// Objects (or containers with objects) identity can matter, so memoization is allowed
export function useLabelObject(slug: string) {
  return useMemo(() => ({ label: slug, upper: slug.toUpperCase() }), [slug]);
}

export function useMixedTuple(fn: () => void) {
  return useMemo(() => [fn, { call: fn }], [fn]); // contains function and object
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

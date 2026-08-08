# Disallow returning useMemo results from custom hooks when the memoized value is pass-by-value: primitives with value equality (string, number, boolean, null, undefined, bigint) or arrays/tuples composed exclusively of these primitives. Requires type information (`@blumintinc/blumint/no-usememo-for-pass-by-value`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

💭 This rule requires [type information](https://typescript-eslint.io/linting/typed-linting).

<!-- end auto-generated rule header -->

This rule flags custom React hooks that return a `useMemo` result when the memoized value is pass-by-value: primitives with value equality (`string`, `number`, `boolean`, `null`, `undefined`, `bigint`) or arrays/tuples composed exclusively of these primitives. Memoizing these values does not provide beneficial referential stability (as primitives have value equality and recreating primitive-only containers is inexpensive), so the hook only adds noise and suggests a stability guarantee that is not necessary. `symbol` values and objects (or arrays/tuples containing objects) are excluded because their identity changes on each creation and memoization can legitimately stabilize them.

The fixer replaces `useMemo(() => expr, deps)` with `expr` (when the callback is a single-expression return) and removes the unused `useMemo` import when possible.

### The fixer carries comments instead of destroying them

Inlining discards the callback, the `return` keyword and the dependency array, so a comment written in any of those places has no anchor of its own in the replacement. The fixer carries every such comment into the rewritten code — deleting it silently and declining the fix are both fidelity bugs, since declining lets the mere presence of a comment decide whether the rule rewrites at all.

A block comment stays beside the expression, on the side it was written on:

```ts
// Before
export function useLabel(slug: string) {
  return useMemo(() => {
    /* uppercased for the marquee */
    return slug.toUpperCase();
  }, [slug]);
}

// After --fix
export function useLabel(slug: string) {
  return /* uppercased for the marquee */ slug.toUpperCase();
}
```

A comment whose meaning is bound to its line — a `//` comment, or a block-comment `eslint-disable-next-line`, which targets the line after the comment ends — gets a full line of its own above the statement, because folding it onto the expression would comment the code out (or, after `return`, change the program through ASI):

```ts
// Before
export function useDelay() {
  return useMemo(() => {
    // the caller polls, so this stays constant
    return 0;
  }, []);
}

// After --fix
export function useDelay() {
  // the caller polls, so this stays constant
  return 0;
}
```

When the surrounding context parenthesizes the replacement anyway, such a comment rides inside the parentheses, where a line break can never trigger ASI:

```ts
// Before
export function useToggle(flag: boolean) {
  return !useMemo(() => {
    // inverted below
    return flag;
  }, [flag]);
}

// After --fix
export function useToggle(flag: boolean) {
  return !(
  // inverted below
  flag);
}
```

A comment inside the returned expression needs no carrying — it is copied verbatim along with the expression:

```ts
export function useLabel(flag: boolean) {
  return useMemo(() => (flag ? 'ready' : /* not started yet */ ''), [flag]);
}
```

The import retirement preserves comments the same way, by editing only the tokens it removes rather than re-emitting the declaration. A comment between the braces of a sole-specifier import survives in the declaration's place, and a comment between specifiers stays where it was written:

```ts
// Before
import { /* pinned */ useMemo } from 'react';

// After --fix
/* pinned */
```

```ts
// Before
import { useMemo, /* io hooks */ useState } from 'react';

// After --fix
import {  /* io hooks */ useState } from 'react';
```

## Rule Details

Why this matters:
- Memoizing pass-by-value results does not change identity or prevent re-renders; it just obscures the hook’s intent.
- `useMemo` around primitives implies there is a referential contract, which can mislead readers and reviewers.
- Removing the wrapper eliminates dead dependency arrays and unused imports.

### Examples of **incorrect** code for this rule:

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

### Examples of **correct** code for this rule:

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

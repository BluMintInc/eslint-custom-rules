# Disallow returning useMemo results from custom hooks when the memoized value is pass-by-value: primitives with value equality (string, number, boolean, null, undefined, bigint) or arrays/tuples composed exclusively of these primitives. Requires type information (`@blumintinc/blumint/no-usememo-for-pass-by-value`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

💭 This rule requires [type information](https://typescript-eslint.io/linting/typed-linting).

<!-- end auto-generated rule header -->

This rule flags custom React hooks that return a `useMemo` result when the memoized value is pass-by-value: primitives with value equality (`string`, `number`, `boolean`, `null`, `undefined`, `bigint`) or arrays/tuples composed exclusively of these primitives. Memoizing these values does not provide beneficial referential stability (as primitives have value equality and recreating primitive-only containers is inexpensive), so the hook only adds noise and suggests a stability guarantee that is not necessary. `symbol` values and objects (or arrays/tuples containing objects) are excluded because their identity changes on each creation and memoization can legitimately stabilize them.

The fixer replaces `useMemo(() => expr, deps)` with `expr` (when the callback is a single-expression return) and retires the import the unwrap leaves unreferenced.

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

### The fixer retires the import the unwrap orphans

Unwrapping deletes the callee, so the binding it read can be left bound to nothing — the `useMemo` specifier for the plain spelling, and the default or namespace import for `React.useMemo`. The same fix retires whichever it orphans, and every unwrap in the file ships as one fix: judged one call at a time, a file with two unwrappable calls never sees either as the binding's last use, and the pass that unwraps both resolves every report, so nothing revisits the stranded import.

```ts
// Before
import React from 'react';

export function useNamespace() {
  return React.useMemo(() => undefined, []);
}

// After --fix
export function useNamespace() {
  return undefined;
}
```

Whether a reference survives is decided by scope analysis alone, the same oracle `no-unused-vars` consults. Under the classic JSX runtime the scope manager records the implicit `React` reference a JSX pragma creates, so a file that renders anything keeps its `React` import:

```tsx
// Before
import React from 'react';

export function useLabel(flag: boolean) {
  return React.useMemo(() => flag, [flag]);
}

export const Panel = () => <div />;

// After --fix — the pragma still reads React, so the import stays
import React from 'react';

export function useLabel(flag: boolean) {
  return flag;
}

export const Panel = () => <div />;
```

A suppressed report never rewrites, so its reference still counts and the import stays. Only edits that actually land are weighed.

The whole fix is declined when a binding would be left unreferenced yet cannot be retired safely, because half a fix — the unwrap without the unbinding — turns a clean file into one that fails `no-unused-vars` and `noUnusedLocals`, and the report that would have flagged the debt is resolved by the fix itself. Two shapes decline: a comment written inside the import declaration, since the ranges that unbind a specifier span the separators around it and would swallow or strand the comment; and a dependency read only from the array the unwrap deletes, since a parameter or local is not something the retirement may rewrite. Both are still reported, just not fixed.

```ts
// Reported without a fix: retiring `useMemo` would take the comment with it.
import { /* pinned */ useMemo } from 'react';

export function useLabel() {
  return useMemo(() => 'ready', []);
}
```

```ts
// Reported without a fix: `flag` is read only by the dependency array.
import { useMemo } from 'react';

export function useConstant(flag: boolean) {
  return useMemo(() => 'ready', [flag]);
}
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

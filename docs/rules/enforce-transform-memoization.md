# Enforce memoization of transformValue and transformOnChange in adaptValue (`@blumintinc/blumint/enforce-transform-memoization`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

When you use `adaptValue` to bridge editable components, you must provide `transformValue` and `transformOnChange` functions. If you define these transforms inline, React recreates them on every render, forcing unnecessary re-renders and risking stale closures. This rule ensures you memoize those transforms with the correct React hook and include every captured value in your dependency arrays so the adapted component receives stable handlers and avoids unnecessary re-renders.

## Rule Details

This rule enforces:

1. `transformValue` must be memoized with `useMemo` (or a clearly memoized helper).
1. `transformOnChange` must be memoized with `useCallback` (or a memoized helper).
1. When `useMemo`/`useCallback` is used, the dependency array must exist and include all outer-scope values referenced by the transform.
1. Functions defined outside the component are treated as stable and are allowed directly.

`transformValue` represents a derived or computed value that should be stabilized to avoid expensive recomputations (hence `useMemo`), while `transformOnChange` is an event callback whose identity must be stable to prevent unnecessary re-renders or effect triggers in the adapted component (hence `useCallback`).

### Examples of incorrect code

```js
// Mock component for demonstration
const Switch = () => null;

function Component() {
  return adaptValue({
    valueKey: 'checked',
    onChangeKey: 'onChange',
    // ❌ Inline transforms recreate on every render
    transformValue: (value) => Boolean(value),
    transformOnChange: (event) => event.target.checked,
  }, Switch);
}
```

```js
// Mock component for demonstration
const Switch = () => null;

function MyForm({ keys }) {
  // ❌ A callback nested in a component is still a render path
  return keys.map((key) =>
    adaptValue({
      valueKey: key,
      onChangeKey: 'onChange',
      transformValue: (value) => Boolean(value),
    }, Switch),
  );
}
```

```js
// Mock component for demonstration
const Switch = () => null;
function Component({ formatter }) {
  // ❌ Wrong hook (should be useCallback) + missing dependency in array
  return adaptValue({
    valueKey: 'value',
    onChangeKey: 'onChange',
    transformOnChange: useMemo(
      () => (event) => formatter(event.target.value),
      [], // Missing formatter
    ),
  }, Switch);
}
```

### Examples of correct code

```js
import { useMemo, useCallback } from 'react';

// Mock component for demonstration
const Switch = () => null;

function Component() {
  return adaptValue({
    valueKey: 'checked',
    onChangeKey: 'onChange',
    transformValue: useMemo(() => (value) => Boolean(value), []),
    transformOnChange: useCallback((event) => event.target.checked, []),
  }, Switch);
}
```

```js
// Mock component for demonstration
const Switch = () => null;

// ✅ Stable helper defined outside the component
const convertToBoolean = (value) => Boolean(value);

function Component() {
  return adaptValue({
    valueKey: 'checked',
    onChangeKey: 'onChange',
    transformValue: convertToBoolean,
  }, Switch);
}
```

```js
// ✅ Memoized utility wrapper with useMemo
import { useMemo } from 'react';

// Mock throttle for demonstration - real implementation would delay execution
const throttle = (fn, _delay) => fn;

// Mock component for demonstration
const TextInput = () => null;

function Component() {
  const transformValue = useMemo(
    () => throttle((value) => value.toString(), 200),
    [],
  );

  return adaptValue({
    valueKey: 'value',
    onChangeKey: 'onChange',
    transformValue,
  }, TextInput);
}
```

## Scope: only inside React components and hooks

Every remediation this rule prescribes is a hook call (`useMemo` or `useCallback`), and the Rules of Hooks allow those only inside a function component or another hook. So the rule reports an `adaptValue` call only when a component or hook appears somewhere in its enclosing-function ancestry.

An `adaptValue` call at module scope, inside a plain (camelCase) helper, inside a class component's `render`, or inside a test body is skipped: nothing there is "recreated on every render" — there is no render — and wrapping the transform would throw `Invalid hook call. Hooks can only be called inside of the body of a function component`.

Classification is name-based, matching React's own convention: a PascalCase-initial name is a component, a `use`-prefixed name is a hook, and anything else is a plain helper. A nested callback still counts as a render path when any enclosing function is a component or hook, so a `.map()` callback inside a component remains reportable.

### Examples of correct code outside a component or hook

```js
// Mock component for demonstration
const Switch = () => null;

// ✅ Module scope: evaluated once at load, and no hook may be called here
export const ADAPTED = adaptValue({
  valueKey: 'checked',
  onChangeKey: 'onChange',
  transformValue: (value) => Boolean(value),
}, Switch);

// ✅ A plain camelCase helper is not a component, so hooks are illegal in it
function buildAdapted() {
  return adaptValue({
    valueKey: 'checked',
    onChangeKey: 'onChange',
    transformOnChange: (event) => event.target.checked,
  }, Switch);
}
```

```js
// Mock component for demonstration
const Switch = () => null;

// ✅ Test bodies are outside every render path
it('adapts the value', () => {
  const Adapted = adaptValue({
    valueKey: 'checked',
    onChangeKey: 'onChange',
    transformValue: (value) => Boolean(value),
  }, Switch);
  expect(Adapted).toBeDefined();
});
```

## When Not To Use It

Disable this rule if your project does not use `adaptValue`, or if you rely on a different memoization strategy for these transforms and prefer to manage re-render performance manually.

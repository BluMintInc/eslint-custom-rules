# Enforce memoization of transformValue and transformOnChange in adaptValue (`@blumintinc/blumint/enforce-transform-memoization`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

When you use `adaptValue` to bridge editable components, you must provide `transformValue` and `transformOnChange` functions. If you define these transforms inline, React recreates them on every render, forcing unnecessary re-renders and risking stale closures. This rule ensures you memoize those transforms with the correct React hook and include every captured value in your dependency arrays so the adapted component receives stable handlers and avoids unnecessary re-renders.

## Rule Details

This rule enforces:

1. `transformValue` must be memoized with `useMemo` (or a clearly memoized helper).
1. `transformOnChange` must be memoized with `useCallback` (or a memoized helper).
1. When `useMemo`/`useCallback` is used, the dependency array must exist and include all outer-scope values referenced by the transform.
1. Functions defined outside the component or hook that references them — at module scope, or in an enclosing factory, HOC, class method or `describe` callback — are treated as stable and are allowed directly.
1. `useLatestCallback` (from `use-latest-callback`) and `useEvent` are accepted for either transform. They return a reference stable for the component's whole life and take no dependency array, so there is none to audit.

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
// ✅ useLatestCallback keeps a stable reference and needs no dependency array.
// This is also the shape the `use-latest-callback` rule's autofix produces from
// the `useMemo`/`useCallback` forms above, so the two rules compose: running
// `eslint --fix` over already-correct code leaves it correct.
import useLatestCallback from 'use-latest-callback';

// Mock component for demonstration
const Switch = () => null;

function Component({ formatter }) {
  return adaptValue({
    valueKey: 'value',
    onChangeKey: 'onChange',
    transformValue: useLatestCallback((value) => formatter(value)),
    transformOnChange: useLatestCallback((event) => formatter(event.target.value)),
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

## Stability is measured against the component, not against module scope

A transform is stable when its binding cannot change between two renders of the component that passes it, so the boundary that matters is the render boundary — not absolute scope depth. A helper declared in a component factory, an HOC, a class-method factory, an IIFE or a `describe` callback is created once per call of that outer function, and the component created in the same call closes over that one reference: every render hands `adaptValue` the identical function. There is nothing to memoize, and `useMemo` could not be called in the factory anyway, since a factory is neither a component nor a hook.

The rule therefore reports a referenced helper only when its declaration shares a nearest enclosing function with the reference — that is, when the declaration re-runs with the render. A block is not a function boundary, and neither a custom hook nor a plain helper called during render counts as an outer boundary: both re-run on every render.

### Examples of incorrect code for the render boundary

```js
// Mock component for demonstration
const Switch = () => null;

function Component() {
  // Rebuilt by every render of Component
  const convertToBoolean = (value) => Boolean(value);

  // ❌ adaptValue receives a new transformValue identity on every render
  return adaptValue({
    valueKey: 'checked',
    onChangeKey: 'onChange',
    transformValue: convertToBoolean,
  }, Switch);
}
```

```js
// Mock component for demonstration
const Switch = () => null;

export function useAdaptedSwitch() {
  // A custom hook body re-runs with every render of its caller
  const handleChange = (event) => event.target.checked;

  // ❌ adaptValue receives a new transformOnChange identity on every render
  return adaptValue({
    valueKey: 'checked',
    onChangeKey: 'onChange',
    transformOnChange: handleChange,
  }, Switch);
}
```

### Examples of correct code for the render boundary

```js
// Mock component for demonstration
const Switch = () => null;

export function createBooleanAdapter() {
  // ✅ Created once per createBooleanAdapter() call; AdaptedSwitch closes over
  // that one reference, so no render recreates it
  const convertToBoolean = (value) => Boolean(value);

  return function AdaptedSwitch() {
    return adaptValue({
      valueKey: 'checked',
      onChangeKey: 'onChange',
      transformValue: convertToBoolean,
    }, Switch);
  };
}
```

```js
// Mock component for demonstration
const Switch = () => null;

export function withBooleanAdapter(Wrapped) {
  // ✅ An HOC helper may close over the HOC's own parameters, so it cannot be
  // hoisted to module scope — and it never changes for a given wrapped component
  const convertToBoolean = (value) => Boolean(value);

  return function AdaptedSwitch(props) {
    return adaptValue({
      valueKey: 'checked',
      onChangeKey: 'onChange',
      transformValue: convertToBoolean,
    }, Wrapped);
  };
}
```

## When Not To Use It

Disable this rule if your project does not use `adaptValue`, or if you rely on a different memoization strategy for these transforms and prefer to manage re-render performance manually.

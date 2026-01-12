# Enforce memoization of adaptValue transformValue/transformOnChange so the adapted component receives stable handlers and avoids unnecessary re-renders (`@blumintinc/blumint/enforce-transform-memoization`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

`adaptValue` relies on `transformValue` and `transformOnChange` to bridge editable components. Inline transforms recreate functions every render, forcing unnecessary re-renders and risking stale closures. This rule ensures those transforms are memoized with the correct React hook and that dependency arrays list every captured value.

## Rule Details

This rule enforces:

1. `transformValue` must be memoized with `useMemo` (or a clearly memoized helper).
1. `transformOnChange` must be memoized with `useCallback` (or a memoized helper).
1. When `useMemo`/`useCallback` is used, the dependency array must exist and include all outer-scope values referenced by the transform.
1. Functions defined outside the component are treated as stable and are allowed directly.

`transformValue` represents a derived or computed value that should be stabilized to avoid expensive recomputations (hence `useMemo`), while `transformOnChange` is an event callback whose identity must be stable to prevent unnecessary re-renders or effect triggers in the adapted component (hence `useCallback`).

Examples of **incorrect** code for this rule:

```js
adaptValue({
  valueKey: 'checked',
  onChangeKey: 'onChange',
  // ❌ Inline transforms recreate on every render
  transformValue: (value) => Boolean(value),
  transformOnChange: (event) => event.target.checked,
}, Switch);
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

Examples of **correct** code for this rule:

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

## When Not To Use It

Disable this rule if your project does not use `adaptValue`, or if you rely on a different memoization strategy for these transforms and prefer to manage re-render performance manually.

# Require memoizing reference props (objects, arrays, functions) inside React.memo components while avoiding unnecessary useMemo for pass-through values (`@blumintinc/blumint/prefer-memoized-props`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Memoized React components rely on stable prop references. Inline objects, arrays, or functions created inside a `React.memo` component are new on every render, which forces memoized children to re-render even when values are unchanged. Conversely, wrapping primitives or other pass-through values in `useMemo` adds noise without improving stability because primitives already compare by value. This rule keeps reference props stable and discourages unnecessary memoization of pass-through values.

## Rule Details

- Flags inline object/array literals and function expressions used as JSX props inside components wrapped with `React.memo`.
- Flags identifiers bound to objects, arrays, or functions declared inside a memoized component unless they come from `useMemo`/`useCallback`.
- Reports `useMemo` calls that simply return a primitive or pass-through value without creating a new reference, except when the dependency array is empty and the memoization intentionally freezes the initial value.
- Unwraps TypeScript assertions (`as`, `satisfies`, non-null) before analysis so reference props stay flagged even when annotated.
- Treats template literals as pass-through only when their interpolations are stable references; template literals that call functions are allowed because memoization can prevent repeated expensive computation.

### Examples of incorrect code

```jsx
import React, { memo } from 'react';

const MyComponent = memo(({ onClick }) => (
  <button onClick={() => onClick({ active: true })}>Click</button>
));
```

```jsx
import { memo } from 'react';

const Section = memo(({ title }) => {
  const style = { color: 'red' };
  return <Header style={style} title={title} />;
});
```

```jsx
import { memo, useMemo } from 'react';

const Label = memo(({ text }) => {
  const label = useMemo(() => text, [text]); // unnecessary primitive memoization
  return <span>{label}</span>;
});
```

### Examples of correct code

```jsx
import React, { memo, useMemo, useCallback } from 'react';

const MyComponent = memo(({ onClick }) => {
  const payload = useMemo(() => ({ active: true }), []);
  const handleClick = useCallback(() => onClick(payload), [onClick, payload]);

  return <button onClick={handleClick}>Click</button>;
});
```

```jsx
import { memo } from 'react';

const Label = memo(({ text }) => <span>{text}</span>); // primitives are fine without useMemo
```

```jsx
import { memo, useMemo } from 'react';

const Chart = memo(({ values }) => {
  const stableConfig = useMemo(
    () => ({
      axis: 'x',
      values,
    }),
    [values],
  );

  return <Graph config={stableConfig} />;
});
```

## When Not To Use It

- When a component intentionally recreates references each render to drive downstream effects.
- When render costs are negligible and prop stability is not a concern.
- When you prefer to manage memoization in a parent component instead of inside the memoized component body.

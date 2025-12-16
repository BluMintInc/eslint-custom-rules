# Enforce useCallback for inline functions and useMemo for objects/arrays containing functions in JSX props to prevent unnecessary re-renders. This improves React component performance by ensuring stable function references across renders and memoizing complex objects (`@blumintinc/blumint/enforce-callback-memo`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Inline functions and freshly created objects inside JSX props change on every render. React treats them as new references, which causes child components to re-render even when props are otherwise stable. This rule enforces `useCallback` for inline functions and `useMemo` for object/array/JSX literals that contain functions so that prop references stay stable.

## Rule Details

This rule reports when:

- A JSX prop receives an inline arrow/function expression instead of a `useCallback`-memoized function.
- A JSX prop receives an object, array, conditional, logical expression, or nested JSX that contains functions without wrapping the expression in `useMemo`.
- A callback is already inside a `useCallback` but still closes over parent parameters in a way that would create a new function each render.

The rule skips:

- Props already wrapped in `useCallback` or `useMemo`.
- Function literals that live inside a `useCallback` and legitimately reference variables from the parent scope.
- Spread attributes whose argument is not a literal object (to avoid costly static analysis).

### Examples of **incorrect** code for this rule:

```tsx
// Inline functions in JSX props
<Button onClick={() => handleClick(id)} />
<Form onSubmit={function (event) { submit(event, mode); }} />

// Objects or arrays containing functions passed directly to props
<Wizard config={{ onNext: () => goToStep(step + 1), onBack }} />
<List renderers={[() => renderItem(item), renderFallback]} />

// JSX literals that hide inline callbacks
<Dropdown trigger={<Button onClick={() => open(id)} />} />

// Conditional expressions that embed callbacks
<Card action={isAdmin ? () => remove(userId) : undefined} />
```

### Examples of **correct** code for this rule:

```tsx
// Memoize callbacks
const handleClick = useCallback(() => handleClickInner(id), [id]);
<Button onClick={handleClick} />

// Memoize configuration objects or arrays that include callbacks
const wizardConfig = useMemo(
  () => ({ onNext: () => goToStep(step + 1), onBack }),
  [step, onBack],
);
<Wizard config={wizardConfig} />

const renderers = useMemo(() => [() => renderItem(item), renderFallback], [
  item,
  renderFallback,
]);
<List renderers={renderers} />

// Inline memoization when convenient
<Dropdown trigger={useMemo(
  () => <Button onClick={() => open(id)} />,
  [id, open],
)} />
```

## Options

This rule does not have any options.

## When Not To Use It

- Components that intentionally pass unstable callbacks (e.g., testing instrumentation).
- Codebases that do not use React or do not care about prop referential stability.

## Further Reading

- [React docs: `useCallback`](https://react.dev/reference/react/useCallback)
- [React docs: `useMemo`](https://react.dev/reference/react/useMemo)

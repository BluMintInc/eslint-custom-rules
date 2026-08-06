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
- JSX that has no React component or hook anywhere in its enclosing-function ancestry (see [Scope](#scope-components-and-hooks-only)).

### Scope: components and hooks only

The only remediation this rule offers is a hook call, and hooks are legal only inside a component or another hook. So the rule reports a JSX prop only when a component (PascalCase-initial name) or a hook (`use`-prefixed name) sits somewhere in the chain of functions enclosing that JSX. Outside such a chain — module scope, a plain helper function, a test body — `useCallback` would throw `Invalid hook call` at runtime, and no re-render is being avoided because none of those is a render path.

The whole ancestry is consulted, not just the nearest enclosing function: a `.map()` callback inside a component is still part of that component's render and still reports.

A function is classified by its name first. A name the developer chose is authoritative even when the function returns JSX — `buildTree` is a helper, not a component. Only a function with no inferable name at all (`memo(() => <div />)`) is classified by whether it returns JSX.

The search stops at the first component it meets on the way out, so the question is relative: **is a render function interposed between the JSX and whatever encloses it further out?** A component built by a plain factory is still a component, and `useCallback` is legal inside it, so the factory's name does not suppress the report. This holds for both spellings — a component bound to a name (`const Card = () => ...`) and an anonymous one handed to `memo`, `forwardRef` or `observer`.

A helper's name settles the case only when no component is found at all. That is what keeps a bare `items.map((i) => <Row />)` callback inside a helper silent: the callback is anonymous and returns JSX, but nothing turns it into a component, so it is no more of a render path than the helper holding it. `useCallback`/`useMemo` arguments are treated the same way — they wrap a value produced inside a component, they do not define one.

```tsx
// Correct: module scope — there is no component to host a hook
const TREE = <Child onReady={(value) => { sink = value; }} />;
```

```tsx
// Correct: a plain, non-component helper — calling useCallback here is illegal
function buildTree(emit) {
  return <Child onReady={(value) => { emit(value); }} />;
}
```

```tsx
// Correct: a test body is not a render path
it('captures the value the child hands back', () => {
  let captured;
  render(<Child onReady={(value) => { captured = value; }} />);
  expect(captured).toBe(1);
});
```

```tsx
// Incorrect: a component ancestor exists, so the hook remediation is available
const List = ({ items }) => {
  return <div>{items.map((i) => <Child key={i} onReady={() => select(i)} />)}</div>;
};
```

### Examples of **incorrect** code for this rule:

Inline functions in JSX props:

```tsx
const Toolbar = ({ id }) => {
  return <Button onClick={() => handleClick(id)} />;
};
```

```tsx
const Editor = ({ mode }) => {
  return <Form onSubmit={function (event) { submit(event, mode); }} />;
};
```

Objects or arrays containing functions passed directly to props:

```tsx
const Flow = ({ step, onBack }) => {
  return <Wizard config={{ onNext: () => goToStep(step + 1), onBack }} />;
};
```

```tsx
const Feed = ({ item, renderFallback }) => {
  return <List renderers={[() => renderItem(item), renderFallback]} />;
};
```

JSX literals that hide inline callbacks:

```tsx
const Menu = ({ id, open }) => {
  return <Dropdown trigger={<Button onClick={() => open(id)} />} />;
};
```

Conditional expressions that embed callbacks:

```tsx
const Profile = ({ isAdmin, userId }) => {
  return <Card action={isAdmin ? () => remove(userId) : undefined} />;
};
```

### Examples of **correct** code for this rule:

Memoize callbacks:

```tsx
const Toolbar = ({ id }) => {
  const handleClick = useCallback(() => handleClickInner(id), [id]);
  return <Button onClick={handleClick} />;
};
```

Memoize configuration objects or arrays that include callbacks:

```tsx
const Flow = ({ step, onBack }) => {
  const wizardConfig = useMemo(
    () => ({ onNext: () => goToStep(step + 1), onBack }),
    [step, onBack],
  );
  return <Wizard config={wizardConfig} />;
};
```

```tsx
const Feed = ({ item, renderFallback }) => {
  const renderers = useMemo(
    () => [() => renderItem(item), renderFallback],
    [item, renderFallback],
  );
  return <List renderers={renderers} />;
};
```

Inline memoization when convenient:

```tsx
const Menu = ({ id, open }) => {
  return (
    <Dropdown trigger={useMemo(
      () => <Button onClick={() => open(id)} />,
      [id, open],
    )} />
  );
};
```

## When Not To Use It

- Components that intentionally pass unstable callbacks (e.g., testing instrumentation).
- Codebases that do not use React or do not care about prop referential stability.

## Further Reading

- [React docs: `useCallback`](https://react.dev/reference/react/useCallback)
- [React docs: `useMemo`](https://react.dev/reference/react/useMemo)

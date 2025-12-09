# Enforce using useMemo for inline object/array literals passed as props to JSX components to prevent unnecessary re-renders. When object/array literals are defined inline in JSX, they create new references on every render, causing child components to re-render even if the values haven't changed. Wrap them in useMemo to maintain referential equality (`@blumintinc/blumint/require-usememo-object-literals`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Inline object and array literals in JSX props create a brand-new reference on every render. React treats that as a prop change, which cascades into child components even when the literal contents are identical. Memoizing those literals with `useMemo` (or hoisting them to a stable module-level constant) keeps prop references stable and avoids wasted re-renders.

## Rule Details

- Flags object or array literals passed directly as JSX prop values on components with capitalized names.
- Skips styling props named `sx` or ending in `Sx` so common style-object patterns remain ergonomic.
- Encourages providing a stable reference with `useMemo` and an explicit dependency list or by hoisting a constant.

### Examples of incorrect code

```jsx
function Component({ handleClick }) {
  return (
    <DialogActions
      buttons={[
        {
          isAsync: false,
          color: 'primary',
          onClick: handleClick,
          children: 'Click me',
        },
      ]}
    />
  );
}
```

```jsx
function Component() {
  return <MyComponent config={{ foo: 'bar', baz: 42 }} />;
}
```

### Examples of correct code

```jsx
function Component({ handleClick }) {
  const buttons = useMemo(
    () => [
      {
        isAsync: false,
        color: 'primary',
        onClick: handleClick,
        children: 'Click me',
      },
    ],
    [handleClick],
  );

  return <DialogActions buttons={buttons} />;
}
```

```jsx
const sharedConfig = { foo: 'bar', baz: 42 };

function Component() {
  return <MyComponent config={sharedConfig} />;
}
```

## When Not To Use It

You might disable this rule when prop values intentionally need a fresh reference on each render (for example, to force child effects to re-run) or when working in codebases where React re-render costs are negligible.

## Options

This rule has no configuration options.

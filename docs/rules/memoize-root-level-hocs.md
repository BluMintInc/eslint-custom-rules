# Prevent creating Higher-Order Components at the root level of React components/hooks without wrapping them in useMemo to keep wrapped component identities stable across renders (`@blumintinc/blumint/memoize-root-level-hocs`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💭 This rule does not require type information.

Prevent creating Higher-Order Components (HOCs) at the root of a React component or hook during render. HOCs created inline produce a brand-new component identity on every render, which forces child components to re-render and can reset internal state. Wrap HOC creation in `useMemo` (or hoist it) so the wrapped component reference stays stable between renders.

## Why

- Keeps wrapped component identities stable, avoiding unnecessary renders.
- Protects child components from losing local state when parent re-renders.
- Makes dependencies explicit by requiring a `useMemo` dependency array.

## Rule Details

Examples of **incorrect** code for this rule:

```tsx
function MyComponent({ data }) {
  const EnhancedComponent = withSomeFeature(BaseComponent, {
    options: data.settings,
  });

  return <EnhancedComponent />;
}
```

```tsx
function useCustomComponent() {
  const EnhancedComponent = withFeatures(BaseComponent);
  return EnhancedComponent;
}
```

```tsx
function ReduxComponent() {
  const Connected = connect(mapState)(BaseComponent);
  return <Connected />;
}
// Configure connect as an additional HOC name to catch this form
```

Examples of **correct** code for this rule:

```tsx
function MyComponent({ data }) {
  const EnhancedComponent = useMemo(
    () => withSomeFeature(BaseComponent, { options: data.settings }),
    [data.settings],
  );

  return <EnhancedComponent />;
}
```

```tsx
function useCustomComponent() {
  const EnhancedComponent = useMemo(() => withFeatures(BaseComponent), []);
  return EnhancedComponent;
}
```

```tsx
function ReduxComponent() {
  const Connected = useMemo(() => connect(mapState)(BaseComponent), [mapState]);
  return <Connected />;
}
// connect listed under additionalHocNames
```

HOCs created inside event handlers, effect callbacks, or other nested functions are ignored because they do not run on every render.

JSX that exists only inside nested helper functions (such as HOC factories that build an inner `Wrapped` component) does not classify the outer factory as a render body; the rule focuses on actual component or hook renders.

## Options

```json
{
  "@blumintinc/blumint/memoize-root-level-hocs": [
    "error",
    {
      "additionalHocNames": ["connect", "memo"]
    }
  ]
}
```

- `additionalHocNames` (default `[]`): extra HOC factory names to treat as requiring `useMemo` even if they do not start with `with` (for example, `connect`, `memo`).

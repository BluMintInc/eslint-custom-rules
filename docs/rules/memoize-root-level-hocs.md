# Prevent creating Higher-Order Components at the root level of React components/hooks without wrapping them in useMemo to keep wrapped component identities stable across renders (`@blumintinc/blumint/memoize-root-level-hocs`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Prevent creating Higher-Order Components (HOCs) at the root of a React component or hook during render. HOCs created inline produce a brand-new component identity on every render, which forces child components to re-render and can reset internal state. Wrap HOC creation in `useMemo` (or hoist it) so the wrapped component reference stays stable between renders.

## Why

- Keeps wrapped component identities stable, avoiding unnecessary renders.
- Protects child components from losing local state when parent re-renders.
- Makes dependencies explicit by requiring a `useMemo` dependency array.

## What counts as an HOC call

A name is only half the signal. The rule treats a call as HOC creation when
**both** of the following hold:

1. The callee is named `with` followed by an uppercase letter (`withRouter`,
   `hocFactories.withPortal`, `maybeHocs?.withPortal`), or its name is listed in
   `additionalHocNames`.
2. The call passes something that is structurally a component. Any one of these
   arguments qualifies — for a curried HOC such as `withStyles(styles)(Base)`,
   the arguments of every call in the chain are considered:
   - a capitalized identifier (`BaseComponent`) or a member expression ending in
     a capitalized property (`Components.Base`), including behind a type
     assertion (`BaseComponent as ComponentType`);
   - an inline function that renders JSX
     (`withPortal((props) => <Base {...props} />)`), or an inline class;
   - another recognized HOC call (`withTracking(withAnalytics(Base))`);
   - a lowercase identifier whose declaration in scope is itself one of the
     signals above — a function returning JSX, a class, another HOC call, or an
     alias of a capitalized binding.

Requirement 2 is skipped for names given in `additionalHocNames`: configuring a
name is a deliberate opt-in, so those calls are always treated as HOC creation.

Consequently a helper that merely shares the `with[A-Z]` name shape but operates
on plain values — `withOpacity(theme.palette.disabled.main, 0.3)`,
`withFallback(tone, 'neutral')` — is not an HOC call and is never reported. A
lowercase argument the scope cannot tie to a component (an import, a parameter,
a global) proves nothing, so it does not make a call an HOC.

## Rule Details

### Examples of **incorrect** code for this rule:

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
// eslint-options: {"additionalHocNames": ["connect"]}
function ReduxComponent() {
  const Connected = connect(mapState)(BaseComponent);
  return <Connected />;
}
```

### Examples of **correct** code for this rule:

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
// eslint-options: {"additionalHocNames": ["connect"]}
function ReduxComponent() {
  const Connected = useMemo(() => connect(mapState)(BaseComponent), [mapState]);
  return <Connected />;
}
```

```tsx
// A string utility that only matches the with[A-Z] name shape: no argument is
// a component, so nothing is wrapped and nothing needs memoizing.
function DropIndicator() {
  const theme = useTheme();
  const background = withOpacity(theme.palette.disabled.main, 0.3);
  return <div style={{ backgroundColor: background }} />;
}
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

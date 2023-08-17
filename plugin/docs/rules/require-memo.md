# Requires memoization of react components (`@blumintinc/blumint/require-memo`)

<!-- end auto-generated rule header -->

This rule enforces that React components (that are not pure) to be memoized. If the component name includes "Unmemoized", then this rule is ignored.

## Rule Details

Examples of **incorrect** code for this rule:

```jsx
const Component = ({foo, bar}) => return (
    <SomeOtherComponent>{foo}{bar}</SomeOtherComponent>
)
```

Examples of **correct** code for this rule:

```jsx
const MemoizedComponent = memo(function BigComponent({foo, bar}) {
    return (
        <SomeOtherComponent>{foo}{bar}</SomeOtherComponent>
    )
})
const ComponentUnmemoized = ({foo, bar}) => return (
    <SomeOtherComponent>{foo}{bar}</SomeOtherComponent>
)
```


# Requires memoization of react components (`@blumintinc/blumint/require-memo`)

<!-- end auto-generated rule header -->

This rule enforces that React components (that are not pure) to be memoized.

## Rule Details

Examples of **incorrect** code for this rule:

```jsx
const UnmemoizedComponent = ({foo, bar}) => return (
    <SomeOtherComponent>{foo}{bar}</SomeOtherComponent>
)
```

Examples of **correct** code for this rule:

```jsx
const MemoizedComponent = memo(function UnmemoizedComponent({foo, bar}) {
    return (
        <SomeOtherComponent>{foo}{bar}</SomeOtherComponent>
    )
})
```


# React components must be memoized (`@blumintinc/blumint/require-memo`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces that React components (that are not pure) to be memoized using our custom `memo` implementation. The rule supports both absolute imports (`src/util/memo`) and relative imports (`../util/memo`) based on the file location. If the component name includes "Unmemoized", then this rule is ignored.

## Rule Details

Examples of **incorrect** code for this rule:

```jsx
const Component = ({foo, bar}) => return (
    <SomeOtherComponent>{foo}{bar}</SomeOtherComponent>
)
```

Examples of **correct** code for this rule:

```jsx
import { memo } from 'src/util/memo';

const MemoizedComponent = memo(function BigComponent({foo, bar}) {
    return (
        <SomeOtherComponent>{foo}{bar}</SomeOtherComponent>
    )
})

const ComponentUnmemoized = ({foo, bar}) => return (
    <SomeOtherComponent>{foo}{bar}</SomeOtherComponent>
)
```


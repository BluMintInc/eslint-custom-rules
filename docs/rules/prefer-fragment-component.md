# Enforce using Fragment imported from react over shorthand fragments and React.Fragment (`@blumintinc/blumint/prefer-fragment-component`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Enforces the use of `Fragment` imported from `'react'` over both `<>` and `<React.Fragment>`. This helps maintain consistency and ensures explicit imports in the codebase.

## Rule Details

This rule aims to enforce consistent usage of React Fragment components by requiring explicit imports and avoiding shorthand syntax.

Examples of **incorrect** code for this rule:

```jsx
<>Hello World</>

<><ChildComponent /></>

<React.Fragment>Hello World</React.Fragment>

<React.Fragment><ChildComponent /></React.Fragment>
```

Examples of **correct** code for this rule:

```jsx
import { Fragment } from 'react';

<Fragment>Hello World</Fragment>

<Fragment><ChildComponent /></Fragment>
```

## When Not To Use It

If you prefer using the shorthand fragment syntax `<>` or `React.Fragment` for better readability or have specific requirements that favor these syntaxes.

## Version

This rule was introduced in v1.0.0

## Further Reading

- [React Fragments Documentation](https://reactjs.org/docs/fragments.html)

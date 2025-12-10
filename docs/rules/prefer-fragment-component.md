# Require the Fragment named import instead of shorthand fragments and React.Fragment (`@blumintinc/blumint/prefer-fragment-component`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Using a single fragment style keeps React dependencies explicit and avoids shorthand limitations. This rule replaces `<>` and `<React.Fragment>` with `<Fragment>` imported from `'react'`.

## Why?

- Shorthand fragments cannot receive props such as `key`, so adding keys later forces a rewrite; `<Fragment>` keeps that option available.
- Mixing shorthand fragments and `React.Fragment` scatters two patterns across the codebase, making refactors and searches harder.
- An explicit `Fragment` import keeps the dependency visible to bundlers and ensures auto-fixes do not leave `<Fragment>` undefined.

## Rule Details

- Prefer `<Fragment>...</Fragment>` from `import { Fragment } from 'react';`.
- Do not use shorthand fragments `<>...</>` or `React.Fragment`.
- The fixer will add the missing `Fragment` import when needed and replace fragment wrappers.

Examples of **incorrect** code for this rule:

```jsx
const Component = () => <>Hello World</>;

const Component = () => (
  <React.Fragment>
    <ChildComponent />
  </React.Fragment>
);
```

Examples of **correct** code for this rule:

```jsx
import { Fragment } from 'react';

const Component = () => <Fragment>Hello World</Fragment>;

const Component = () => (
  <Fragment>
    <ChildComponent />
  </Fragment>
);
```

## When Not To Use It

Skip this rule if your project intentionally mixes fragment styles for brevity and you accept losing fragment props like `key` on shorthand fragments.

## Version

This rule was introduced in v1.0.0

## Further Reading

- [React Fragments Documentation](https://reactjs.org/docs/fragments.html)

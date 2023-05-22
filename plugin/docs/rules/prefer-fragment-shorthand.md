# Prefer <> shorthand for <React.Fragment> (`@blumintinc/blumint/prefer-fragment-shorthand`)

⚠️ This rule _warns_ in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule prefers the use of fragment shorthand, `<>` over `<React.Fragment>`

## Rule Details

Examples of **incorrect** code for this rule:

```jsx
<React.Fragment>Hello World</React.Fragment>
<React.Fragment><ChildComponent /></React.Fragment>
```

Examples of **correct** code for this rule:

```jsx
<>Hello World</>
<><ChildComponent /></>
```

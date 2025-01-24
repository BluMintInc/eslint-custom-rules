# Prevent unnecessary use of React fragments (`@blumintinc/blumint/no-useless-fragment`)

⚠️ This rule _warns_ in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

⚠️ This rule _warns_ in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

⚠️ This rule _warns_ in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces that React fragments (`<>...</>`) are only used when necessary. A fragment is deemed unnecessary if it wraps only a single child.

## Rule Details

Examples of **incorrect** code for this rule:

```jsx
<><ChildComponent /></>
```

Examples of **correct** code for this rule:

```jsx
<><ChildComponent /><AnotherChild /></>
<><ChildComponent />Some Text<AnotherChild /></>
```


# Prefer <> shorthand for <React.Fragment> (`@blumintinc/blumint/prefer-fragment-shorthand`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Prefer the fragment shorthand `<>...</>` instead of the verbose `<React.Fragment>...</React.Fragment>` when the fragment does not need attributes. The long form adds React namespace noise and suggests the fragment carries a `key` or props. Using the shorthand keeps JSX concise and makes it clear the wrapper is attribute-less. Keep the long form only when you truly need to attach a `key` or other attributes to the fragment.

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

### When the long form is necessary

Use `<React.Fragment>` when the fragment must carry attributes (most commonly a `key` in a list). The shorthand cannot express those attributes, so avoid applying the auto-fix in these cases.

```jsx
<React.Fragment key={item.id}>
  <ChildComponent />
</React.Fragment>
```

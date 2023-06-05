# Prevent unnecessary use of React fragments (`@blumintinc/blumint/no-useless-fragment`)

⚠️ This rule _warns_ in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule enforces that React fragments (`<>...</>` or `<React.Fragment>...</React.Fragment>`) are only used when necessary. A fragment is deemed unnecessary if it wraps only a single child.

## Rule Details

Examples of **incorrect** code for this rule:

```jsx
<><ChildComponent /></>
<React.Fragment><ChildComponent /></React.Fragment>
```

Examples of **correct** code for this rule:

```
<><ChildComponent /><AnotherChild /></>
<><ChildComponent />Text<AnotherChild /></>
<React.Fragment><ChildComponent /><AnotherChild /></React.Fragment>
```


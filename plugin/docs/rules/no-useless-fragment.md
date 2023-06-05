# Prevent unnecessary use of React fragments (`@blumintinc/blumint/no-useless-fragment`)

💼 This rule is enabled in the ✅ `recommended` config.

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


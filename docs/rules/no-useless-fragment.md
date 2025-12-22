# Prevent unnecessary use of React fragments (`@blumintinc/blumint/no-useless-fragment`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces that React fragments (`<>...</>`) are only used when necessary. A fragment is deemed unnecessary if it wraps only a single child.

Fragments exist to group multiple siblings without inserting an extra DOM element. When a fragment wraps a single child, it no longer provides grouping value—developers have to read past extra syntax and React DevTools shows an extra node that does not change the rendered output. Removing the fragment makes the returned tree easier to scan while keeping the UI identical.

## Rule Details

The rule reports fragments with exactly one child and auto-fixes by removing the `<>` and `</>` wrappers so the child is returned directly.

Examples of **incorrect** code for this rule:

```jsx
<><ChildComponent /></>
<><NestedComponent><ChildComponent /></NestedComponent></>
<>{"text"}</>
```

Examples of **correct** code for this rule:

```jsx
<><ChildComponent /><AnotherChild /></>
<><ChildComponent />Some Text<AnotherChild /></>
<ChildComponent />
```


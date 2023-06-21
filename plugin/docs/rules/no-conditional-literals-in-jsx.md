# Disallow use of conditional literals in JSX code (`@blumintinc/blumint/no-conditional-literals-in-jsx`)

<!-- end auto-generated rule header -->

This rule disallows the use of conditional literals in JSX.

## Rule Details

Browser auto-translation will break if pieces of text nodes are be rendered conditionally.

Examples of **incorrect** code for this rule:

```jsx
<div>This will cause {conditional && 'errors'}</div>
<div><span>This will {conditional && 'also'} cause errors </span></div>
```

Examples of **correct** code for this rule:

```jsx
      <div>Foo</div>
      <div>
        Bar {conditional && <span>Baz</span>}
      </div>
```
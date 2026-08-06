# Prevent margin properties (margin, marginLeft, marginRight, marginTop, marginBottom, mx, my, etc.) in MUI styling because margins fight container-controlled spacing, double gutters, and misaligned breakpoints; keep spacing centralized with padding, gap, or spacing props instead (`@blumintinc/blumint/no-margin-properties`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

Margin props push spacing outside a component and bypass MUI's container-controlled spacing model (Stack/Grid spacing, gaps, responsive gutters). When a child sets margins, it can double-count gutters, misalign at breakpoints, and overflow when nested components also add margins. Centralizing spacing in the container keeps layouts predictable and aligned with the design system spacing scale.


### What this rule checks

- Any margin property (`margin`, `marginLeft`, `marginRight`, `marginTop`, `marginBottom`, `mx`, `my`, `mt`, `mb`, `ml`, `mr`, `m`, kebab-case equivalents) used in MUI styling surfaces (`sx`, theme `styleOverrides`, MUI `css`, or direct JSX props like `margin`/`mt`).
- Margin properties found inside objects, conditionals, arrays, spreads, and nested selectors within those MUI styling contexts.
- Type assertions are transparent: `{ margin: 2 } as const`, `… satisfies Styles`, `…!` and `<const>{ … }` report exactly as the bare object literal does. The wrapper asserts a type and changes no value, and a fixer (`global-const-style`) appends `as const` to these very objects, so a check keyed on the wrapper would go silent on code `--fix` just rewrote.
- Non-MUI contexts (plain CSS-in-JS objects, styled-components strings, type declarations) are ignored.


### How to fix

- Move spacing inside the component with padding (`padding`, `pt`, `px`, etc.) so the element owns its internal spacing.
- Let the parent own separation between children by using `gap` or MUI's `spacing` prop on layout primitives (`Stack`, `Grid`, etc.).
- Use `theme.spacing()` or spacing tokens so values stay on the shared spacing scale.

### Why there is no autofix

This rule reports without fixing, and takes no options. #726 established that
rewriting margins automatically risks unintended visual changes, so a violation is
surfaced for a human to resolve rather than rewritten.

## Examples

### ❌ Incorrect

Margin props push spacing outside the component:

```jsx
<Box sx={{ margin: 2, marginTop: 3 }} />
```

Margin shorthands fight Stack spacing/gaps:

```jsx
<Stack sx={{ mx: 2, my: 1 }} />
```

Direct margin props behave the same:

```jsx
<Box margin={2} marginTop={3} />
```

### Exceptions / When Not To Use It

You may want to disable this rule for:

- Third-party layout components that require margin props.
- Legacy components that do not support the recommended spacing API.
- Cases where margins are the only viable option.

In such cases, prefer adding an `eslint-disable` comment with a brief explanation.

### ✅ Correct

Keep spacing inside the component:

```jsx
<Box sx={{ padding: 2, paddingTop: 3 }} />
```

Let the parent own separation between children:

```jsx
<Stack spacing={2} />
```

Use gap for flex/grid gutters instead of margins:

```jsx
<Box sx={{ display: 'flex', gap: 2 }} />
```

In theme overrides, keep spacing on the padding/gap axis:

```jsx
const theme = createTheme({
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          padding: 2,
          gap: 1,
        },
      },
    },
  },
});
```

## Further Reading

- MUI spacing primitives: Stack’s `spacing` prop and the `theme.spacing()` utility.

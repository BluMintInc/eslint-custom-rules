# Prevent margin properties (margin, marginLeft, marginRight, marginTop, marginBottom, mx, my, etc.) in MUI styling because margins fight container-controlled spacing, double gutters, and misaligned breakpoints; keep spacing centralized with padding, gap, or spacing props instead (`@blumintinc/blumint/no-margin-properties`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

Margin props push spacing outside a component and bypass MUI's container-controlled spacing model (Stack/Grid spacing, gaps, responsive gutters). When a child sets margins, it can double-count gutters, misalign at breakpoints, and overflow when nested components also add margins. Centralizing spacing in the container keeps layouts predictable and aligned with the design system spacing scale.


### What this rule checks

- Any margin property (`margin`, `marginLeft`, `marginRight`, `marginTop`, `marginBottom`, `mx`, `my`, `mt`, `mb`, `ml`, `mr`, `m`, kebab-case equivalents) used in MUI styling surfaces (`sx`, MUI `css`, or direct JSX props like `margin`/`mt`).
- Theme `styleOverrides` in `createTheme` are not checked: a theme's margins are the container-controlled styling itself (viewport insets, resets of MUI's built-in margins), not the sibling spacing this rule targets.
- Margin properties found inside objects, conditionals, arrays, spreads, and nested selectors within those MUI styling contexts.
- Type assertions are transparent: `{ margin: 2 } as const`, `… satisfies Styles`, `…!` and `<const>{ … }` report exactly as the bare object literal does. The wrapper asserts a type and changes no value, and a fixer (`global-const-style`) appends `as const` to these very objects, so a check keyed on the wrapper would go silent on code `--fix` just rewrote.
- Non-MUI contexts (plain CSS-in-JS objects, styled-components strings, type declarations) are ignored.

### What this rule exempts

Spacing between siblings is the parent's job, but three margin values are not
spacing, so no parent `gap` could supply them instead:

- **Zero** (`0`, `'0px'`, `'0rem'`, `'0 !important'`): a reset of a margin MUI
  or the user agent bakes in, such as a `Typography` bottom margin or a `ul`'s
  default margin. It removes spacing rather than adding it.
- **`auto`**: distributes free space. `mx: 'auto'` centers a max-width column
  and `ml: 'auto'` pushes an item to the far edge of its row; neither is a
  gutter.
- **Negative offsets** (`-1`, `'-8px'`, `'-0.5rem'`): pull an element into
  space it does not own, as an optical nudge or a bleed.

A `margin` shorthand is exempt when every one of its values is (`'0 auto'`,
`'-0.5rem 0'`), and so is a conditional, a responsive object
(`{ xs: 0, md: 'auto' }`) or a responsive array whose every value is. One
spacing value keeps the report (`'0 8px'`, `isFirst ? 0 : 2`), as does a value
the rule cannot read: a variable, a template substitution or a
`theme.spacing(...)` call. A `calc()` stays spacing even when it opens with a
negative term, since its sign depends on the layout. Each exemption can be
switched off on its own; see [Options](#options).


### How to fix

- Move spacing inside the component with padding (`padding`, `pt`, `px`, etc.) so the element owns its internal spacing.
- Let the parent own separation between children by using `gap` or MUI's `spacing` prop on layout primitives (`Stack`, `Grid`, etc.).
- Use `theme.spacing()` or spacing tokens so values stay on the shared spacing scale.

### Why there is no autofix

This rule reports without fixing. #726 established that rewriting margins
automatically risks unintended visual changes, so a violation is surfaced for a
human to resolve rather than rewritten.

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

One spacing value in a shorthand or a conditional is still spacing:

```jsx
<Box sx={{ margin: '0 8px', mt: isFirst ? 0 : 2 }} />
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

Reset a margin MUI bakes in, center with `auto`, and nudge with a negative
offset:

```jsx
<Box
  sx={{
    '& .MuiChip-icon': { margin: 0 },
    maxWidth: 680,
    mx: 'auto',
    mt: -0.5,
  }}
/>
```

## Options

This rule accepts an options object with the following properties, each
defaulting to `true`:

```ts
{
  "exemptZero": boolean,
  "exemptAuto": boolean,
  "exemptNegative": boolean
}
```

### `exemptZero`

When `true`, a zero margin (`0`, `'0px'`, `'0 !important'`) is not reported.

### `exemptAuto`

When `true`, an `auto` margin is not reported.

### `exemptNegative`

When `true`, a negative margin (`-1`, `'-8px'`) is not reported.

Set any one to `false` to report that kind of value again, with the other two
exemptions left in force:

```json
{
  "rules": {
    "@blumintinc/blumint/no-margin-properties": [
      "error",
      { "exemptNegative": false }
    ]
  }
}
```

## Further Reading

- MUI spacing primitives: Stack’s `spacing` prop and the `theme.spacing()` utility.

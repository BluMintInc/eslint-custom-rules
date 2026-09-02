# Enforce using the MUI `sx` prop instead of deprecated system props (e.g. `mt`, `display`, `flexDirection`) on MUI components (`@blumintinc/blumint/prefer-sx-prop-over-system-props`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

MUI system props (e.g. `mt`, `display`, `flexDirection`) are styling shorthands that map directly onto the `sx` prop. MUI is actively deprecating them and will remove them in the next major release. Using `sx` exclusively improves performance, provides better TypeScript autocomplete, and consolidates all styling in one place.

This rule flags any MUI system prop used as a direct JSX attribute on a configured MUI component and provides an autofix that moves it into the `sx` prop.

### System props flagged

**Spacing:** `m`, `mt`, `mr`, `mb`, `ml`, `mx`, `my`, `p`, `pt`, `pr`, `pb`, `pl`, `px`, `py`

**Sizing:** `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight`, `boxSizing`

**Display / overflow / visibility:** `display`, `displayPrint`, `overflow`, `textOverflow`, `visibility`, `whiteSpace`

**Flexbox:** `flexDirection`, `flexWrap`, `justifyContent`, `justifyItems`, `justifySelf`, `alignItems`, `alignContent`, `alignSelf`, `order`, `flex`, `flexGrow`, `flexShrink`, `flexBasis`

**CSS Grid:** `gap`, `rowGap`, `columnGap`, `gridColumn`, `gridRow`, `gridArea`, `gridAutoFlow`, `gridAutoColumns`, `gridAutoRows`, `gridTemplateColumns`, `gridTemplateRows`, `gridTemplateAreas`

**Positioning:** `position`, `top`, `right`, `bottom`, `left`, `zIndex`

**Color / background:** `color`, `bgcolor`

**Borders:** `border`, `borderTop`, `borderRight`, `borderBottom`, `borderLeft`, `borderColor`, `borderTopColor`, `borderRightColor`, `borderBottomColor`, `borderLeftColor`, `borderRadius`

**Shadow:** `boxShadow`

**Typography:** `typography`, `fontFamily`, `fontSize`, `fontStyle`, `fontWeight`, `letterSpacing`, `lineHeight`, `textAlign`, `textTransform`

### Props that are never flagged

The following are genuine component API props, not system props, and are always preserved:

`direction`, `spacing`, `container`, `item`, `xs`, `sm`, `md`, `lg`, `xl`, `variant`, `component`, `ref`, `key`, `children`, `id`, `className`, `style`, `divider`, `useFlexGap`, `columns`, `wrap`, `rowSpacing`, `columnSpacing`, `zeroMinWidth`, `offset`, `size`, event handlers (`onClick`, `onChange`, etc.), and accessibility/data attributes (`aria-*`, `data-*`).

### Props a specific component owns

Some names are a system prop on one component and that component's own API on another, so these exemptions are keyed on the **(component, prop) pair** rather than on the prop name. The component consumes the value — feeding `ownerState`, selecting a theme value and MUI's internal `.Mui*-*` class selectors — instead of forwarding it as CSS, so moving the prop into `sx` emits a declaration whose value is not a CSS value for that property. The browser drops it, and because `SxProps` accepts `string | number` there is no type error and no runtime warning to catch the loss.

| Component | Prop | Why it is not a system prop |
| --- | --- | --- |
| `Button`, `IconButton`, `Chip`, `Badge` | `color` | A closed palette/variant selector (`'primary' \| 'error' \| …`), never a CSS color. |
| `AppBar` | `color` | Selects the *background* shade from the palette, so `sx` would also target the wrong CSS property. |
| `Container`, `Dialog` | `maxWidth` | A breakpoint **key** (`'xs' \| … \| 'xl' \| false`) resolved against `theme.breakpoints.values`. As CSS, `max-width: xl` is invalid and the element unbounds. |

The pairing matters in both directions. `maxWidth` on a `Box`, `Stack` or `Paper` is a genuine CSS system prop and is still reported and moved into `sx`; likewise `color` on `Typography` or `Box`. And a prop the component owns does not shield the rest of the element — every other system prop on it still moves:

```tsx
// Before
<Container maxWidth="xl" mt={2} minWidth="320px" />

// After
<Container maxWidth="xl" sx={{ mt: 2, minWidth: '320px' }} />
```

For a custom component whose props collide with a system prop name, use the [`allowedProps`](#allowedprops) option.

### Examples of incorrect code

System props used directly — should be in `sx`:

```tsx
<Stack spacing={2} alignItems="center" pb={6} />
```

Multiple system props alongside an existing `sx`:

```tsx
<Box pt={2} display="flex" sx={{ backgroundColor: 'primary.main' }} />
```

### Examples of correct code

All styling in `sx`; Stack's real props (`spacing`, `direction`) left in place:

```tsx
<Stack spacing={2} direction="row" sx={{ alignItems: 'center', pb: 6 }} />
```

Merged correctly into an existing `sx` object:

```tsx
<Box sx={{ pt: 2, display: 'flex', backgroundColor: 'primary.main' }} />
```

A prop the component owns stays where it is — `maxWidth` here is a breakpoint key `Container` resolves itself, not a CSS length:

```tsx
<Container maxWidth="xl" sx={{ py: 4 }} />
```

## Options

```js
'@blumintinc/blumint/prefer-sx-prop-over-system-props': ['error', {
  // MUI components to check (replaces the default list documented below)
  components: ['Box', 'Stack', 'Typography', 'Grid', 'Paper', 'Container'],
  // Additional props to never flag (merged with the built-in allowlist)
  allowedProps: [],
  // Column the autofix wraps the emitted sx object at
  printWidth: 80,
}]
```

### `components`

Type: `string[]`

Default: `['Box', 'Stack', 'Typography', 'Grid', 'Paper', 'Container', 'Card', 'CardContent', 'CardActions', 'Button', 'IconButton', 'Chip', 'Avatar', 'Badge', 'Divider', 'List', 'ListItem', 'ListItemText', 'ListItemIcon', 'Menu', 'MenuItem', 'Drawer', 'Dialog', 'DialogTitle', 'DialogContent', 'DialogActions', 'Tabs', 'Tab', 'AppBar', 'Toolbar']`

The list of MUI component names to check. Only JSX elements whose name matches an entry in this list are inspected. You can extend it with custom MUI-based components or aliases.

### `allowedProps`

Type: `string[]`

Default: `[]`

Additional prop names to never flag, merged with the built-in allowlist. Use this if a prop in the system-prop set is a legitimate API prop in your component.

### `printWidth`

Type: `number`

Default: `80`

The column the autofix wraps at, matching Prettier's option of the same name. Set it to your formatter's `printWidth` so the fixed source is already in the shape the formatter would produce; a lint run carrying `--fix` otherwise leaves the tree failing `prettier --check`.

## Autofix behavior

The autofix moves all detected system props into `sx`:

1. **No existing `sx`** — creates `sx={{ ...systemProps }}` on the first system prop position.
2. **Existing `sx={{ ... }}`** — merges system props at the front of the existing object (preserving all existing keys including string selector keys like `'.MuiInput-root'`).
3. **Existing `sx={[...]}` (array)** — prepends `{ ...systemProps }` as the first array element.
4. **Existing `sx={expr}` (variable/expression)** — wraps it: `sx={{ ...systemProps, ...expr }}`.

When the rule cannot safely determine the shape of `sx`, it still reports the violation but skips the autofix to prevent incorrect merges.

### Formatting of the emitted `sx`

The merged `sx` stays on one line whenever it fits within [`printWidth`](#printwidth). Past that, the object is broken open with one property per line, indented relative to the JSX attribute:

```tsx
// Before
<Stack
  alignItems="center"
  justifyContent="center"
  width="100%"
  bgcolor="red"
  padding={4}
/>

// After
<Stack
  sx={{
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    bgcolor: 'red',
  }}
  padding={4}
/>
```

An `sx` object (or array) the author already broke open keeps that shape at any width — each moved prop gets its own line at the existing members' indentation, never spliced onto the first member's line:

```tsx
// Before
<Stack
  sx={{
    borderRadius: 2,
    p: 4,
  }}
  height="100%"
  width="100%"
/>

// After
<Stack
  sx={{
    height: '100%',
    width: '100%',
    borderRadius: 2,
    p: 4,
  }}
/>
```

When every attribute shares one line and the merged element no longer fits, each attribute moves to a line of its own — the same change a formatter makes. Pure punctuation after the element on that line — the statement's own `;`, an array element's `,`, a closing bracket — sits outside the rewritten range and stays put, landing after the closing `/>` exactly where a formatter leaves it.

A block comment ahead of the attribute on its line does not block the wrap either: only the attribute's own text is replaced, so the comment survives in place and the object breaks open beside it, with the width test charging for the columns the comment already occupies:

```tsx
// Before
<Stack
  /* keep in sync with Sidebar */ alignItems="center"
  justifyContent="center"
  pb={6}
/>

// After
<Stack
  /* keep in sync with Sidebar */ sx={{
    alignItems: 'center',
    justifyContent: 'center',
    pb: 6,
  }}
/>
```

The nesting step used for those emitted lines is read from the file itself — the most common indentation increase between consecutive lines — so a four-space or tab-indented file gets four-space or tab-indented output rather than an assumed two spaces. Lines that continue a block comment are excluded from that measurement: a JSDoc block's ` * ` lines sit one column in from the comment's own indentation, which is comment alignment rather than a nesting step, and counting them makes a doc-heavy file look one-space indented.

One situation leaves the compact form in place on purpose:

- **Ambiguous indentation.** Moving a prop whose value spans lines (a nested object, a template literal) requires re-indenting that value's continuation lines. Where the source mixes tabs and spaces such that neither indentation is a prefix of the other, there is no delta to apply and a guess would corrupt the layout, so the fix falls back to the single-line splice — provided that splice still fits the print width. The interior lines of a **multi-line template literal or string are never moved** in any case: that whitespace is part of the value, not the layout.

When the merged line would run past the print width and no safe rewrite exists inside the opening element's range, the rule still reports every system prop but emits **no fix** — an unfixed report beats authoring a line the formatter immediately rewraps. That covers:

- **An element that does not start its own line** (`const el = <Box ... />;`, `return <Box ... />;`): the only formatter-stable rewrite parenthesizes the whole element, which is outside the opening element.
- **Children on the opening element's line.** A formatter answers an over-long `<Typography sx={...}>text</Typography>` by moving the children, not the attributes, and no rewrite confined to the opening element can undo that. The rule does rewrite the children's surrounding whitespace in one other case, so this is a limit of the over-long path rather than a blanket rule: where a merge collapses an element from more than one attribute to exactly one, the formatter's own layout rule flips and rejoins the children onto the opening element's line, and the fix carries that join with it. `<Box overflow="hidden" textOverflow="ellipsis">` with `hi` on its own line becomes `<Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>hi</Box>`.
- **A comment between the element name and its attributes**: rebuilding the element from its attribute list would drop the comment.

## When to disable

In rare cases where a prop shares a name with a system prop but serves a different purpose in a custom component, add it to the `allowedProps` option rather than disabling the rule.

## Relationship to `no-margin-properties`

This rule is a superset of `no-margin-properties`. Both rules flag margin system props used as direct JSX attributes; the difference is that `no-margin-properties` also checks `sx` object properties for margin usage (layout-debt enforcement), while this rule is focused solely on the system-prop deprecation migration path.

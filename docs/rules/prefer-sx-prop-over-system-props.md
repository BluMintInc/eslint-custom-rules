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

### Examples of incorrect code

```tsx
// System props used directly — should be in sx
<Stack spacing={2} alignItems="center" pb={6}>

// Multiple system props with existing sx
<Box pt={2} display="flex" sx={{ backgroundColor: 'primary.main' }}>
```

### Examples of correct code

```tsx
// All styling in sx; Stack's real props (spacing, direction) left in place
<Stack spacing={2} direction="row" sx={{ alignItems: 'center', pb: 6 }}>

// Merged correctly into existing sx object
<Box sx={{ pt: 2, display: 'flex', backgroundColor: 'primary.main' }}>
```

## Options

```js
'@blumintinc/blumint/prefer-sx-prop-over-system-props': ['error', {
  // MUI components to check (defaults to the list below)
  components: ['Box', 'Stack', 'Typography', 'Grid', 'Paper', 'Container', ...],
  // Additional props to never flag (merged with the built-in allowlist)
  allowedProps: [],
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

## Autofix behavior

The autofix moves all detected system props into `sx`:

1. **No existing `sx`** — creates `sx={{ ...systemProps }}` on the first system prop position.
2. **Existing `sx={{ ... }}`** — merges system props at the front of the existing object (preserving all existing keys including string selector keys like `'.MuiInput-root'`).
3. **Existing `sx={[...]}` (array)** — prepends `{ ...systemProps }` as the first array element.
4. **Existing `sx={expr}` (variable/expression)** — wraps it: `sx={{ ...systemProps, ...expr }}`.

When the rule cannot safely determine the shape of `sx`, it still reports the violation but skips the autofix to prevent incorrect merges.

## When to disable

In rare cases where a prop shares a name with a system prop but serves a different purpose in a custom component, add it to the `allowedProps` option rather than disabling the rule.

## Relationship to `no-margin-properties`

This rule is a superset of `no-margin-properties`. Both rules flag margin system props used as direct JSX attributes; the difference is that `no-margin-properties` also checks `sx` object properties for margin usage (layout-debt enforcement), while this rule is focused solely on the system-prop deprecation migration path.

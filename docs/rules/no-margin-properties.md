# Discourage using margin properties (margin, marginLeft, marginRight, marginTop, marginBottom, mx, my, etc.) for spacing in MUI components. Instead, prefer defining spacing with padding, gap, or the spacing prop for more predictable layouts (`@blumintinc/blumint/no-margin-properties`)

⚠️ This rule is enabled in the ✅ `recommended` config as a warning.

<!-- end auto-generated rule header -->

## Rule Details

This rule discourages the use of margin properties in MUI components to promote more predictable layouts. Instead of using margin properties, prefer using padding, gap, or the spacing prop.

## Options

This rule accepts an options object with the following properties:

- `autofix` (boolean, default: `false`): Controls whether the rule should provide automatic fixes. Currently, no autofix functionality is implemented, but this option is available for future use.

### Default Configuration

```json
{
  "@blumintinc/blumint/no-margin-properties": "warn"
}
```

### Custom Configuration

```json
{
  "@blumintinc/blumint/no-margin-properties": ["warn", { "autofix": false }]
}
```

## Examples

### ❌ Incorrect

```jsx
// Using margin properties in sx prop
<Box sx={{ margin: 2, marginTop: 3 }} />

// Using margin shorthand properties
<Stack sx={{ mx: 2, my: 1 }} />

// Using margin as direct props
<Box margin={2} marginTop={3} />
```

### ✅ Correct

```jsx
// Using padding instead
<Box sx={{ padding: 2, paddingTop: 3 }} />

// Using spacing prop for Stack
<Stack spacing={2} />

// Using gap for layout
<Box sx={{ display: 'flex', gap: 2 }} />
```

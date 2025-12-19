# Prevent margin properties (margin, marginLeft, marginRight, marginTop, marginBottom, mx, my, etc.) in MUI styling because margins fight container-controlled spacing, double gutters, and misaligned breakpoints; keep spacing centralized with padding, gap, or spacing props instead (`@blumintinc/blumint/no-margin-properties`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

This rule discourages the use of margin-related props in MUI components to promote more predictable layouts. Prefer padding, `gap`, or explicit spacing APIs (Stack’s `spacing` or `theme.spacing()`/`sx` spacing helpers) instead.

## Options

This rule accepts an options object with the following properties:

- `autofix` (boolean, default: `false`): Reserved for future automatic fixes. No fixer is implemented yet; toggling this option currently has no effect (experimental).

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

### Exceptions / When Not To Use It

You may want to disable this rule for:

- Third-party layout components that require margin props.
- Legacy components that do not support the recommended spacing API.
- Cases where margins are the only viable option.

In such cases, prefer adding an `eslint-disable` comment with a brief explanation.

### ✅ Correct

```jsx
// Using padding instead
<Box sx={{ padding: 2, paddingTop: 3 }} />

// Using spacing prop for Stack
<Stack spacing={2} />

// Using gap for layout
<Box sx={{ display: 'flex', gap: 2 }} />
```

## Further Reading

- MUI spacing primitives: Stack’s `spacing` prop and the `theme.spacing()` utility.

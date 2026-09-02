# Require `useFlexGap` on a MUI `Stack` that wraps and passes `spacing`, because margin-based spacing leaves the wrapped line with no row gap and a phantom leading indent (`@blumintinc/blumint/enforce-use-flex-gap-on-wrap`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

MUI's `Stack` implements `spacing` with margins rather than with CSS `gap`.
`createStack` defaults `useFlexGap` to `false`, and on that path emits
`& > :not(style) ~ :not(style) { margin-left: <spacing> }`.

That is correct for a single line and wrong the moment the line wraps:

- a margin between adjacent siblings spaces one axis only, so a wrapped line
  gets **no row gap at all**;
- the first child of the wrapped line is still a `~` sibling of the children
  above it, so it keeps a `margin-left` meant for a mid-line neighbour. The
  wrapped line hangs indented by exactly one spacing unit against the line above
  it — a phantom indent.

Passing `useFlexGap` routes the same `spacing` value onto `gap`, which spaces
both axes and applies to no leading edge.

## Rule Details

The rule reports a MUI `Stack` that satisfies all three of:

1. it wraps — `flexWrap` resolves to `'wrap'` or `'wrap-reverse'`, read from the
   JSX attribute or from the `sx` object;
2. it passes a non-zero `spacing` attribute;
3. it omits `useFlexGap`.

Nothing else fails on this shape: no type error, no test failure, no console
warning. The row renders, and the defect appears only at the viewport width that
triggers the wrap.

### `spacing` is the trigger, never the absence of a gap

Two near-miss fixes look deliberate and leave the phantom indent in place, so
neither can exempt a site:

- **`rowGap`** is real CSS and does apply to a flex container regardless of
  `useFlexGap`, so the wrapped line gets vertical separation. The `margin-left`
  on every `~` sibling survives, so the first item of the wrapped line is still
  offset against the first item of the line above.
- **`gap` in `sx` alongside `spacing`** leaves both spacing systems live, usually
  at two unrelated values. The margins apply on top of the gap.

A site that sets `gap` (in `sx` or as a shorthand prop) and passes no `spacing`
is already correct and is never reported: CSS `gap` spaces both axes and has no
leading-edge problem. That is the largest group of compliant wrapping sites.

### What the rule reads

- The element name is resolved to its import binding, so a local component that
  shadows the name, another library's `Stack`, and the copy-paste defect
  `import Stack from '@mui/material/Typography'` are all left alone. Names that
  merely end in `Stack` are not matched.
- `sx` is followed through a module constant, since most wrapping Stacks hoist
  it. Assertion wrappers (`as const`, `satisfies`, `!`, `<T>x`) are peeled first,
  because `global-const-style` writes hoisted style constants as `as const`; a
  plainly annotated `const SX: SxProps = { ... }` reads the same way.
- Spreads of local constants inside `sx` are read through; a spread of an
  imported or caller-supplied value stays opaque. Both branches of a conditional
  `sx` are read, and a call-expression `sx` is skipped silently.
- A responsive `flexWrap` reports when **any** breakpoint wraps. The `spacing`
  value is never interpreted beyond zero versus non-zero.
- `direction` is ignored: a wrapping column `Stack` has the symmetric defect.
  `divider` is not special-cased either — note that under `useFlexGap` the gap
  applies on both sides of a divider.

### The autofix

The fix adds the bare `useFlexGap` attribute and nothing else. It never rewrites
`sx`, removes `rowGap`, or converts `spacing` to `gap`. The attribute is
inserted in alphabetical position, matching how this codebase orders JSX
attributes, so a prop-sorting rule does not report on top of the fix.

### Known limitations

A component that forwards `StackProps` through a spread is invisible to a
syntactic rule, so `<ContentOverlay sx={{ flexWrap: 'wrap' }} spacing={2} />`
is a genuine defect the rule misses. A wrap expressed through a template-literal
`flexFlow` is not statically resolvable and is out of scope; the rule reads
`flexWrap` only.

### Examples of incorrect code

A hoisted `sx` whose `rowGap` reads as a fix and is not one:

```tsx
import Stack from '@mui/material/Stack';

const LEGEND_SX = {
  alignItems: 'center',
  color: 'text.secondary',
  flexWrap: 'wrap',
  paddingBottom: SPACING.space2,
  rowGap: SPACING.space1,
  width: '100%',
} as const;

const BracketLegend = () => (
  <Stack direction="row" spacing={SPACING.space2} sx={LEGEND_SX}>
    {legendItems}
  </Stack>
);
```

Both spacing systems live at two unrelated values:

```tsx
import Stack from '@mui/material/Stack';

const GroupHeader = () => (
  <Stack
    alignItems={'center'}
    direction="row"
    spacing={4}
    sx={{
      flexWrap: 'wrap',
      gap: 1,
    }}
  >
    {children}
  </Stack>
);
```

`flexWrap` as a shorthand prop is the same defect:

```tsx
import Stack from '@mui/material/Stack';

const ActionRow = () => (
  <Stack direction="row" flexWrap="wrap" spacing={2}>
    {actions}
  </Stack>
);
```

A responsive `flexWrap` that wraps at any breakpoint:

```tsx
import Stack from '@mui/material/Stack';

const FilterRow = () => (
  <Stack spacing={2} sx={{ flexWrap: { xs: 'wrap', md: 'nowrap' } }}>
    {filters}
  </Stack>
);
```

### Examples of correct code

The pairing stated, with the `sx` hoisted:

```tsx
import Stack from '@mui/material/Stack';

const HEADER_ROW_SX = {
  minWidth: 0,
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
} as const;

const RegistrationHeader = () => (
  <Stack
    data-testid="registration-header-row"
    direction="row"
    spacing={2}
    sx={HEADER_ROW_SX}
    useFlexGap
  >
    {children}
  </Stack>
);
```

The same contract with `flexWrap` as a shorthand prop and a hoisted responsive
`spacing`:

```tsx
import Stack from '@mui/material/Stack';

const STACK_SPACING = { xs: 1, sm: 2 } as const;

const AuthenticationStack = () => (
  <Stack
    alignItems={'center'}
    direction="row"
    flexWrap="wrap"
    justifyContent={'space-between'}
    spacing={STACK_SPACING}
    sx={TOP_OPTIONS_ROW_SX}
    useFlexGap
  >
    {children}
  </Stack>
);
```

CSS `gap` in place of `spacing` needs no pairing:

```tsx
import Stack from '@mui/material/Stack';

const ROW_SX = { flexWrap: 'wrap', gap: SPACING.space1 } as const;

const TokenRow = () => (
  <Stack aria-label="Insert a token" direction="row" role="group" sx={ROW_SX}>
    {tokens}
  </Stack>
);
```

A single-line row, where margin-based spacing renders correctly:

```tsx
import Stack from '@mui/material/Stack';

const HEADER_SX = { alignItems: 'center', flexWrap: 'nowrap' } as const;

const SectionHeader = () => (
  <Stack direction="row" spacing={2} sx={HEADER_SX}>
    {children}
  </Stack>
);
```

`spacing={0}` exists precisely so the `sx` gap owns the rhythm:

```tsx
import Stack from '@mui/material/Stack';

const BaselineRow = () => (
  <Stack direction="row" spacing={0} sx={{ flexWrap: 'wrap', gap: '6px' }}>
    {children}
  </Stack>
);
```

## Options

Both options exist to keep the rule honest about component identity rather than
to invite configuration; the defaults are the intended setting.

| Option            | Type       | Default                                    | Description                                                                                                                                             |
| ----------------- | ---------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stackComponents` | `string[]` | `['Stack']`                                | Component names treated as MUI `Stack`. A name here is checked only after its binding resolves to an allowed import source, so a local component that shadows the name is not flagged. |
| `importSources`   | `string[]` | `['@mui/material/Stack', '@mui/material']` | Import sources whose `Stack` binding this rule governs. Both forms occur: the deep default path and the barrel.                                          |

```javascript
// .eslintrc.js
{
  rules: {
    '@blumintinc/blumint/enforce-use-flex-gap-on-wrap': [
      'error',
      {
        stackComponents: ['Stack'],
        importSources: ['@mui/material/Stack', '@mui/material'],
      },
    ],
  },
}
```

Extend `importSources` when a design-system barrel re-exports MUI's `Stack`, and
`stackComponents` when such a barrel renames it.

## When Not To Use It

Disable this rule only if the project switches `Stack` to gap-based spacing
globally — a `MuiStack.defaultProps.useFlexGap: true` theme default makes the
pairing unconditional and this rule redundant. That change moves every
spacing-bearing `Stack` from margins to `gap` at once and owes a full visual
sweep, so the rule is what applies until then.

For a single site that must keep margin-based spacing while wrapping, write
`useFlexGap={false}` — an explicit opt-out the rule accepts as a decision — or
suppress with `eslint-disable-next-line` and state the reason.

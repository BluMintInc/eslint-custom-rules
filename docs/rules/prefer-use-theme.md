# Enforce reading MUI theme values via useTheme() or the sx theme callback instead of importing theme constants directly from src/styles/* modules (`@blumintinc/blumint/prefer-use-theme`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

MUI provides a `useTheme()` hook (and the `sx` theme callback `(theme) => ({ ... })`) that gives React components runtime access to the assembled theme object. BluMint's theme is built from constant modules in `src/styles/` and assembled into a single MUI theme object in `src/styles/theme.ts`.

This rule flags direct imports of theme constants from `src/styles/*` modules inside components, hooks, contexts, and pages. These files should access theme values via `useTheme()` to stay compatible with runtime theme switching (dark/light mode, white-label theming) and to remain consistent with the MUI idiomatic approach that the rest of the codebase follows.

### Why This Matters

- **Themability**: Direct constant imports hardcode values at module-load time, making runtime theme switching impossible without refactoring every import site.
- **Consistency with MUI idioms**: The overwhelming majority of the codebase already uses `useTheme()`, but AI-generated code and newer components sometimes import constants directly.
- **Single source of truth**: `useTheme()` ensures components read from the assembled theme object, which may apply transformations, overrides, or responsive adjustments that raw constants do not reflect.
- **Refactoring safety**: If a constant is renamed or restructured, `useTheme()` callers are insulated by the theme object's stable API.

### Exemptions

- Files inside `src/styles/` are always exempt — they _build_ the theme object and cannot use `useTheme()`.
- Test and spec files (`.test.ts`, `.test.tsx`, `.spec.ts`, `.spec.tsx`, `__tests__/`) are exempt.
- Files outside `src/components/`, `src/hooks/`, `src/contexts/`, and `src/pages/` are not flagged.
- `import type` declarations and individual `type` specifiers are never flagged.
- Constants that are not exposed on the MUI theme object (e.g. `COLORS`, `EASING`) are not flagged.

### Banned Imports

| Constant | Source Module | Theme Equivalent |
|----------|--------------|------------------|
| `PALETTE` | `src/styles/palette` | `theme.palette` |
| `RARITIES` | `src/styles/palette` | `theme.palette.rarity` |
| `RARITIES_HOVER` | `src/styles/palette` | `theme.palette.rarityHover` |
| `RARITIES_BACKGROUND` | `src/styles/palette` | `theme.palette.rarityBackground` |
| `ELEVATION` | `src/styles/elevations` | `theme.palette.background.elevation` |
| `ELEVATIONS` | `src/styles/elevations` | `theme.palette.background.elevation` |
| `SHADOWS` | `src/styles/shadows` | `theme.shadows` |
| `SHADOWS_HARD` | `src/styles/shadows` | `theme.shadowsHard` |
| `BACKDROP_FILTERS` | `src/styles/shadows` | `theme.glass` |
| `GLOWS` | `src/styles/shadows` | `theme.glow` |
| `SCROLLBARS` | `src/styles/scrollbars` | `theme.scrollbars` |
| `PANELS` | `src/styles/panels` | `theme.panels` |
| `LINE_CLAMP` | `src/styles/lineClamp` | `theme.lineClamp` |
| `TYPOGRAPHY` | `src/styles/typography` | `theme.typography` |
| `ZINDEX` | `src/styles/system` | `theme.zIndex` |
| `ASPECT_RATIO` | `src/styles/system` | `theme.aspectRatio` |
| `BREAKPOINTS` | `src/styles/system` | `theme.breakpoints` |
| `BORDER_RADIUS` | `src/styles/layout` | _no direct equivalent_ — reuse a token that carries the value (e.g. `theme.panels[n].borderRadius`) or add it to the theme |
| `CONTAINER_WIDTH` | `src/styles/layout` | _no direct equivalent_ — add it to the theme and read via `useTheme()` |

## Examples

### Incorrect

```tsx
// src/components/wallet/withdraw/ListItemWithdrawMethod.tsx
import { PALETTE } from '../../../styles/palette';
import { BORDER_RADIUS } from '../../../styles/layout';

const ListItemWithdrawMethod = () => {
  return (
    <Box
      sx={{
        borderRadius: BORDER_RADIUS.full,
        border: `1px solid ${PALETTE.primary.main}`,
        color: PALETTE.text.primary,
      }}
    >
      ...
    </Box>
  );
};
```

```tsx
// src/components/avatar/AvatarStatus.tsx
import { ELEVATION } from '../../styles/elevations';

const AvatarStatus = ({ sx }) => {
  const borderColor = ELEVATION.level3;
  return <AvatarNext sx={{ borderColor }} />;
};
```

### Correct

```tsx
// src/components/wallet/withdraw/ListItemWithdrawMethod.tsx
import { useTheme } from '@mui/material/styles';

const ListItemWithdrawMethod = () => {
  const theme = useTheme();
  return (
    <Box
      sx={{
        border: `1px solid ${theme.palette.primary.main}`,
        color: theme.palette.text.primary,
      }}
    >
      ...
    </Box>
  );
};
```

```tsx
// Using sx callback pattern (also correct)
const ListItemWithdrawMethod = () => {
  return (
    <Box
      sx={(theme) => ({
        border: `1px solid ${theme.palette.primary.main}`,
        color: theme.palette.text.primary,
      })}
    >
      ...
    </Box>
  );
};
```

```tsx
// src/styles/theme.ts -- allowed, this is the theme definition file
import { PALETTE, RARITIES } from './palette';
import { ELEVATION } from './elevations';
import { SCROLLBARS } from './scrollbars';
```

## When to Disable

This rule should rarely be disabled. The only legitimate reason is in a file that is temporarily exempt due to an ongoing migration. If you need to disable the rule, add a narrowly scoped `eslint-disable-next-line` comment and a brief explanation.

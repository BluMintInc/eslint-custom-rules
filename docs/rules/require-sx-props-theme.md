# Require MUI `SxProps` to carry the app theme as `SxProps<Theme>`, because the bare type defaults to `SxProps<{}>`: `sx` callbacks lose the theme's typing and TypeScript pays for a structural comparison against MUI's own `SxProps<Theme>` (`@blumintinc/blumint/require-sx-props-theme`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

MUI types the `sx` prop as `SxProps<Theme>`: a style object, an array of them,
or a callback that receives the app theme. `SxProps` takes the theme as a type
argument and **defaults it to `{}`**, so a component that declares its own
`sx?: SxProps` types the `theme` its callbacks receive as the empty object type.

That default costs twice:

- **Type-check time.** TypeScript compares the bare `SxProps<{}>` against MUI's
  `SxProps<Theme>` structurally, across every CSS property, wherever the two
  meet. One bare annotation in BluMint's web app measured 38.3 s on a cold check
  and 1.5 s once it read `SxProps<Theme>`. An intersection such as
  `BadgeProps & { sx?: SxProps }` is the worst case: the prop becomes
  `SxProps<Theme> & SxProps<{}>` and every literal passed to it is checked
  against both CSS type sets.
- **Theme callbacks lose their types.** With a bare `SxProps` prop,
  `(theme) => theme.shadows[7]` sees `theme: {}`, and under `strictFunctionTypes`
  a callback annotated `(theme: Theme) => …` is not assignable to it, so authors
  stop naming the theme they are styling against.

## Rule Details

The rule reports every type reference to MUI's `SxProps` that has no type
argument. It is syntactic: it resolves the `SxProps` binding through scope and
never builds type information, so it runs in local lint and per-edit gates.

`SxProps` counts when it resolves to an import from any of:

- `@mui/material`
- `@mui/material/styles`
- `@mui/system`
- `@mui/system/styleFunctionSx`

The rule takes no options: the import sources and the fix target are fixed by
MUI's module layout, not by the consuming project.

Renamed imports (`SxProps as Sx`, reported on `Sx`), namespace-qualified
references (`Styles.SxProps` through `import * as Styles`), `import type` and
inline `import { type SxProps }` all count. Every type position counts:
annotations, `as` and `satisfies`, generic arguments, intersections, unions,
arrays, `Omit<SxProps, …>`, `Record<K, SxProps>`, and declaration files.

The rule leaves alone:

- `SxProps` with any explicit argument (`SxProps<Theme>`,
  `SxProps<typeof theme>`, even `SxProps<{}>`). An explicit argument is a
  decision, and the rule does not grade which one.
- A locally declared `SxProps`, or one imported from any other module.
- Aliases built on top, such as `type SxPropsTheme = SxProps<typeof theme>`:
  references to the alias are not references to `SxProps`.
- The import specifier itself, comments, JSDoc and strings.

### The autofix

The fix appends `<Theme>` directly after the type name and makes sure `Theme`
is bound to `@mui/material/styles`, the module a MUI app augments its theme
through, whatever module `SxProps` came from. It never rewrites the module
`SxProps` is imported from.

1. `Theme` is already imported from `@mui/material/styles`: the fix reuses that
   binding under its local name (`<MuiTheme>` for
   `import type { Theme as MuiTheme }`) and adds no import.
2. The file has a named import from `@mui/material/styles`: `Theme` joins it,
   following the declaration's own convention. `import type { SxProps }` gains a
   plain `Theme`, a declaration using inline `type` specifiers gains
   `type Theme`, and a plain value import gains a plain `Theme` (or
   `type Theme` when `SxProps` itself arrived type-only from another module).
3. The file has only a namespace import of `@mui/material/styles`: the fix
   writes `<Styles.Theme>` and adds no import.
4. Otherwise it inserts `import type { Theme } from '@mui/material/styles';`
   after the last import declaration, matching the file's quotes and
   semicolons.

Every report carries its own import edit, so each fix is complete on its own.
When several sites in one file need the same import edit, ESLint applies one per
pass and the next pass finds `Theme` imported, so `eslint --fix` ends with every
site converted and exactly one `Theme` import.

### Reported without a fix

- **A different `Theme` is in scope at the reference**: `import { Theme } from
  '@mui/material'`, Emotion's `Theme`, a local `interface Theme` or
  `const Theme`, or a type parameter named `Theme`. The rule cannot prove
  syntactically that such a `Theme` is MUI's styles `Theme`, and adding a second
  `Theme` import would collide with it. A namespace import of
  `@mui/material/styles` still yields a fix (`<Styles.Theme>`), since it adds no
  binding.
- **An unresolved `Theme` elsewhere in the file**, such as a global: a new
  module-level import would silently change what it refers to.
- **Inside `declare module '@mui/material/styles' { … }`**: there `Theme` is the
  interface being augmented, and an import added around the ambient block
  changes what the declaration file means. Write `SxProps<Theme>` by hand.
- **A file with no top-level import**, such as a global declaration script whose
  `SxProps` import sits inside an ambient module block: a new top-level import
  would turn the script into a module.

### Examples of incorrect code

```tsx
import Badge, { BadgeProps } from '@mui/material/Badge';
import { SxProps } from '@mui/material/styles';

export type FriendRequestsBadgeProps = Readonly<
  BadgeProps & {
    sx?: SxProps;
  }
>;
```

```tsx
import { SxProps } from '@mui/material';

export const BASE_SX: SxProps = { p: 1 };
export type Props = { sx?: SxProps; iconSx?: Omit<SxProps, 'gap'> };
```

```tsx
import { SxProps as Sx } from '@mui/material/styles';
import * as Styles from '@mui/material/styles';

export type P = { sx?: Sx; wrapperSx?: Styles.SxProps };
export const style = { m: 1 } satisfies Sx;
```

### Examples of correct code

```tsx
import Badge, { BadgeProps } from '@mui/material/Badge';
import { SxProps, Theme } from '@mui/material/styles';

export type FriendRequestsBadgeProps = Readonly<
  BadgeProps & {
    sx?: SxProps<Theme>;
  }
>;
```

```tsx
import { SxProps } from '@mui/material';
import type { Theme } from '@mui/material/styles';

export const BASE_SX: SxProps<Theme> = { p: 1 };
export type Props = { sx?: SxProps<Theme>; iconSx?: Omit<SxProps<Theme>, 'gap'> };
```

```tsx
import type { SxProps } from '@mui/material/styles';
import { theme } from './theme';

// An explicit argument is a decision the rule does not grade.
export type SxPropsTheme = SxProps<typeof theme>;
export const PANEL_SX: SxPropsTheme = {};
```

## When Not To Use It

When your project does not use MUI, or does not augment or customize MUI's
`Theme` and accepts the type-checking cost of comparing `SxProps<{}>` against
`SxProps<Theme>`.

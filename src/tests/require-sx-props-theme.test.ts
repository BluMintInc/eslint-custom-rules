import { Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import { ruleTesterJsx, ruleTesterTs } from '../utils/ruleTester';
import { requireSxPropsTheme } from '../rules/require-sx-props-theme';

const RULE_NAME = 'require-sx-props-theme';
const ERROR = { messageId: 'requireSxPropsTheme' as const };

ruleTesterJsx.run(RULE_NAME, requireSxPropsTheme, {
  valid: [
    // An explicit argument is a decision; the rule does not grade which one.
    `
import type { SxProps, Theme } from '@mui/material/styles';
const B = x as SxProps<Theme>;
`,
    `
import type { SxProps } from '@mui/material/styles';
import { theme } from './theme';
type S = SxProps<typeof theme>;
`,
    `
import type { SxProps } from '@mui/material/styles';
type E = SxProps<{}>;
`,
    // An alias with an argument; references to it are not references to SxProps.
    `
import type { SxProps } from '@mui/material/styles';
import { theme } from './theme';
export type SxPropsTheme = SxProps<typeof theme>;
const C: SxPropsTheme = {};
`,
    // A locally declared type named SxProps.
    `
type SxProps = { color: string };
const D: SxProps = { color: 'red' };
`,
    // An SxProps from a module outside MUI's four entry points.
    `
import { SxProps } from './mySxShim';
const F: SxProps = {};
`,
    `
import type { SxProps } from '@mui/joy/styles/types';
const G: SxProps = {};
`,
    // Mentions that are not type references.
    `
import { SxProps } from '@mui/material/styles';
//       const styles: SxProps = {
/** Accepts any \`SxProps\` the caller passes. */
const label = 'SxProps';
export type { SxProps };
`,
    // A type parameter named SxProps shadows the import.
    `
import { SxProps } from '@mui/material/styles';
function wrap<SxProps>(value: SxProps): SxProps {
  return value;
}
`,
    // A namespace import that already passes the theme.
    `
import * as Styles from '@mui/material/styles';
type Q = { sx?: Styles.SxProps<Styles.Theme> };
`,
    // A namespace from a module that is not MUI.
    `
import * as Styles from './styles';
type Q = { sx?: Styles.SxProps };
`,
    // A qualified name whose left side is a local namespace, not an import.
    `
namespace Styles {
  export type SxProps = { color: string };
}
type Q = { sx?: Styles.SxProps };
`,
    // A qualified name that is not SxProps itself.
    `
import * as Styles from '@mui/material/styles';
type Q = Styles.Theme;
`,
    // The file never imports SxProps, so nothing can resolve to MUI's.
    `
import { useTheme } from '@mui/material/styles';
type SxLike = Record<string, unknown>;
const x: SxLike = {};
`,
    // JSX that passes sx without naming the type.
    `
import Box from '@mui/material/Box';
import { SxProps, Theme } from '@mui/material/styles';
export const Panel = ({ sx }: { sx?: SxProps<Theme> }) => <Box sx={sx} />;
`,
  ],
  invalid: [
    // Edge case 1: @mui/material/styles, plain named import.
    {
      code: `
import { SxProps } from '@mui/material/styles';
const A: SxProps = {};
`,
      errors: [{ ...ERROR, data: { typeName: 'SxProps' } }],
      output: `
import { SxProps, Theme } from '@mui/material/styles';
const A: SxProps<Theme> = {};
`,
    },
    // The 38.3 s site from the issue.
    {
      code: `
import Badge, { BadgeProps } from '@mui/material/Badge';
import { SxProps } from '@mui/material/styles';

export type FriendRequestsBadgeProps = Readonly<
  BadgeProps & {
    children: ReactNode;
    sx?: SxProps;
  }
>;
`,
      errors: [ERROR],
      output: `
import Badge, { BadgeProps } from '@mui/material/Badge';
import { SxProps, Theme } from '@mui/material/styles';

export type FriendRequestsBadgeProps = Readonly<
  BadgeProps & {
    children: ReactNode;
    sx?: SxProps<Theme>;
  }
>;
`,
    },
    // The barrel, with no @mui/material/styles import in the file.
    {
      code: `
import { SxProps } from '@mui/material';
import { memo } from 'react';

type Props = {
  sx?: SxProps;
};
`,
      errors: [ERROR],
      output: `
import { SxProps } from '@mui/material';
import { memo } from 'react';
import type { Theme } from '@mui/material/styles';

type Props = {
  sx?: SxProps<Theme>;
};
`,
    },
    // @mui/system.
    {
      code: `
import type { SxProps } from '@mui/system';
export const ROW_SX: SxProps = { display: 'flex' };
`,
      errors: [ERROR],
      output: `
import type { SxProps } from '@mui/system';
import type { Theme } from '@mui/material/styles';
export const ROW_SX: SxProps<Theme> = { display: 'flex' };
`,
    },
    // @mui/system/styleFunctionSx keeps its own import; only Theme is added.
    {
      code: `
import { SxProps } from '@mui/system/styleFunctionSx';
import { LinkProps } from '@mui/material/Link';

export type LinkAddressProps = LinkProps & { style?: SxProps };
`,
      errors: [ERROR],
      output: `
import { SxProps } from '@mui/system/styleFunctionSx';
import { LinkProps } from '@mui/material/Link';
import type { Theme } from '@mui/material/styles';

export type LinkAddressProps = LinkProps & { style?: SxProps<Theme> };
`,
    },
    // A renamed import reports on the local name.
    {
      code: `
import { SxProps as Sx } from '@mui/material/styles';
type P = { sx?: Sx };
`,
      errors: [{ ...ERROR, data: { typeName: 'Sx' } }],
      output: `
import { SxProps as Sx, Theme } from '@mui/material/styles';
type P = { sx?: Sx<Theme> };
`,
    },
    // A namespace import of @mui/material/styles draws Theme from itself.
    {
      code: `
import * as Styles from '@mui/material/styles';
type Q = { sx?: Styles.SxProps };
`,
      errors: [{ ...ERROR, data: { typeName: 'Styles.SxProps' } }],
      output: `
import * as Styles from '@mui/material/styles';
type Q = { sx?: Styles.SxProps<Styles.Theme> };
`,
    },
    // A namespace import of the barrel still takes Theme from the styles entry.
    {
      code: `
import * as Mui from '@mui/material';
type Q = { sx?: Mui.SxProps };
`,
      errors: [{ ...ERROR, data: { typeName: 'Mui.SxProps' } }],
      output: `
import * as Mui from '@mui/material';
import type { Theme } from '@mui/material/styles';
type Q = { sx?: Mui.SxProps<Theme> };
`,
    },
    // Edge case 4: import type gains a plain specifier.
    {
      code: `
import type { SxProps } from '@mui/material/styles';
export const OVERLAY_POSITION_SX: Readonly<Record<Position, SxProps>> = {};
`,
      errors: [ERROR],
      output: `
import type { SxProps, Theme } from '@mui/material/styles';
export const OVERLAY_POSITION_SX: Readonly<Record<Position, SxProps<Theme>>> = {};
`,
    },
    // An inline type specifier gains an inline type specifier.
    {
      code: `
import { type SxProps } from '@mui/material/styles';
export const LOGO_SX: SxProps = {};
`,
      errors: [ERROR],
      output: `
import { type SxProps, type Theme } from '@mui/material/styles';
export const LOGO_SX: SxProps<Theme> = {};
`,
    },
    {
      code: `
import { type SxProps, useTheme } from '@mui/material/styles';
export const LOGO_SX: SxProps = {};
`,
      errors: [ERROR],
      output: `
import { type SxProps, useTheme, type Theme } from '@mui/material/styles';
export const LOGO_SX: SxProps<Theme> = {};
`,
    },
    // A plain value import gains a plain specifier.
    {
      code: `
import { CSSObject, SxProps, useTheme } from '@mui/material/styles';
const bodySx = useMemo<SxProps>(() => {
  return {};
}, []);
`,
      errors: [ERROR],
      output: `
import { CSSObject, SxProps, useTheme, Theme } from '@mui/material/styles';
const bodySx = useMemo<SxProps<Theme>>(() => {
  return {};
}, []);
`,
    },
    // A value import that never names SxProps follows how SxProps arrived.
    {
      code: `
import type { SxProps } from '@mui/material';
import { useTheme } from '@mui/material/styles';
type P = { sx?: SxProps };
`,
      errors: [ERROR],
      output: `
import type { SxProps } from '@mui/material';
import { useTheme, type Theme } from '@mui/material/styles';
type P = { sx?: SxProps<Theme> };
`,
    },
    {
      code: `
import { SxProps } from '@mui/material';
import { useTheme } from '@mui/material/styles';
type P = { sx?: SxProps };
`,
      errors: [ERROR],
      output: `
import { SxProps } from '@mui/material';
import { useTheme, Theme } from '@mui/material/styles';
type P = { sx?: SxProps<Theme> };
`,
    },
    // A multi-line import gains a specifier on its own line.
    {
      code: `
import {
  CSSObject,
  SxProps,
  useTheme,
} from '@mui/material/styles';
const s: SxProps = {};
`,
      errors: [ERROR],
      output: `
import {
  CSSObject,
  SxProps,
  useTheme,
  Theme,
} from '@mui/material/styles';
const s: SxProps<Theme> = {};
`,
    },
    // A trailing comment stays on the specifier it annotates.
    {
      code: `
import {
  CSSObject,
  SxProps, // the styling type
} from '@mui/material/styles';
const s: SxProps = {};
`,
      errors: [ERROR],
      output: `
import {
  CSSObject,
  SxProps, // the styling type
  Theme,
} from '@mui/material/styles';
const s: SxProps<Theme> = {};
`,
    },
    // A multi-line import without a trailing comma keeps that style.
    {
      code: `
import {
  CSSObject,
  SxProps
} from '@mui/material/styles';
const s: SxProps = {};
`,
      errors: [ERROR],
      output: `
import {
  CSSObject,
  SxProps,
  Theme
} from '@mui/material/styles';
const s: SxProps<Theme> = {};
`,
    },
    // An existing Theme import is reused and left untouched.
    {
      code: `
import type { SxProps, Theme } from '@mui/material/styles';
const cases = [
  ['object', { marginTop: '8px' } as SxProps],
  [
    'callback',
    ((muiTheme: Readonly<Theme>) => {
      return { marginTop: muiTheme.spacing(1) } as const;
    }) as SxProps,
  ],
  ['array', [{ marginTop: '8px' }] as SxProps],
];
`,
      filename: 'src/components/ContentOverlay.test.tsx',
      errors: [ERROR, ERROR, ERROR],
      output: `
import type { SxProps, Theme } from '@mui/material/styles';
const cases = [
  ['object', { marginTop: '8px' } as SxProps<Theme>],
  [
    'callback',
    ((muiTheme: Readonly<Theme>) => {
      return { marginTop: muiTheme.spacing(1) } as const;
    }) as SxProps<Theme>,
  ],
  ['array', [{ marginTop: '8px' }] as SxProps<Theme>],
];
`,
    },
    // Theme imported in its own declaration.
    {
      code: `
import { SxProps } from '@mui/material';
import type { Theme } from '@mui/material/styles';
type P = { sx?: SxProps };
`,
      errors: [ERROR],
      output: `
import { SxProps } from '@mui/material';
import type { Theme } from '@mui/material/styles';
type P = { sx?: SxProps<Theme> };
`,
    },
    // Theme under an alias is reused under that alias.
    {
      code: `
import type { SxProps, Theme as MuiTheme } from '@mui/material/styles';
type P = { sx?: SxProps };
`,
      errors: [ERROR],
      output: `
import type { SxProps, Theme as MuiTheme } from '@mui/material/styles';
type P = { sx?: SxProps<MuiTheme> };
`,
    },
    // Edge case 2: every type position, the insertion always right after the name.
    {
      code: `
import type { SxProps, Theme } from '@mui/material/styles';
type A = OverridableComponent<SvgIconTypeMap<SxProps & object, 'svg'>>;
type B = { sx?: Omit<SxProps, 'gap'> };
type C = (sx: SxProps | undefined) => void;
const list: SxProps[] = [];
const s = { m: 1 } satisfies SxProps;
function merge<T extends SxProps = SxProps>(value: T): SxProps {
  return value;
}
`,
      errors: [ERROR, ERROR, ERROR, ERROR, ERROR, ERROR, ERROR, ERROR],
      output: `
import type { SxProps, Theme } from '@mui/material/styles';
type A = OverridableComponent<SvgIconTypeMap<SxProps<Theme> & object, 'svg'>>;
type B = { sx?: Omit<SxProps<Theme>, 'gap'> };
type C = (sx: SxProps<Theme> | undefined) => void;
const list: SxProps<Theme>[] = [];
const s = { m: 1 } satisfies SxProps<Theme>;
function merge<T extends SxProps<Theme> = SxProps<Theme>>(value: T): SxProps<Theme> {
  return value;
}
`,
    },
    // `SxProps & SxProps` is two reports.
    {
      code: `
import type { SxProps, Theme } from '@mui/material/styles';
type Both = SxProps & SxProps;
`,
      errors: [ERROR, ERROR],
      output: `
import type { SxProps, Theme } from '@mui/material/styles';
type Both = SxProps<Theme> & SxProps<Theme>;
`,
    },
    // A component file with JSX.
    {
      code: `
import Box from '@mui/material/Box';
import { SxProps } from '@mui/material/styles';

export type PanelProps = { sx?: SxProps };

export const Panel = ({ sx }: PanelProps) => {
  return <Box sx={sx} />;
};
`,
      errors: [ERROR],
      output: `
import Box from '@mui/material/Box';
import { SxProps, Theme } from '@mui/material/styles';

export type PanelProps = { sx?: SxProps<Theme> };

export const Panel = ({ sx }: PanelProps) => {
  return <Box sx={sx} />;
};
`,
    },
    // Sites inside a function body, where an inner binding could stand between
    // the reference and the module-level Theme.
    {
      code: `
import { SxProps } from '@mui/material/styles';
export function usePanelSx() {
  const sx: SxProps = { p: 1 };
  return sx;
}
`,
      errors: [ERROR],
      output: `
import { SxProps, Theme } from '@mui/material/styles';
export function usePanelSx() {
  const sx: SxProps<Theme> = { p: 1 };
  return sx;
}
`,
    },
    {
      code: `
import Box from '@mui/material/Box';
import { SxProps } from '@mui/material';
export const Panel = () => {
  const merged = [{ p: 1 }] as SxProps;
  return <Box sx={merged} />;
};
`,
      errors: [ERROR],
      output: `
import Box from '@mui/material/Box';
import { SxProps } from '@mui/material';
import type { Theme } from '@mui/material/styles';
export const Panel = () => {
  const merged = [{ p: 1 }] as SxProps<Theme>;
  return <Box sx={merged} />;
};
`,
    },
    // An inner alias named Theme shadows the import the fix would add.
    {
      code: `
import { SxProps } from '@mui/material/styles';
export function usePanelSx() {
  type Theme = { brand: string };
  const sx: SxProps = { p: 1 };
  return sx;
}
`,
      errors: [ERROR],
      output: null,
    },
    // ...and shadows an existing Theme import just the same.
    {
      code: `
import type { SxProps, Theme } from '@mui/material/styles';
export function usePanelSx() {
  type Theme = { brand: string };
  const sx: SxProps = { p: 1 };
  return sx;
}
`,
      errors: [ERROR],
      output: null,
    },
    // Edge case 5, one fix pass: the second report's import edit overlaps the
    // first and waits for the next pass (the end state is asserted below).
    {
      code: `
import { SxProps } from '@mui/material';

const BASE_SX: SxProps = { p: 1 };
type Props = { sx?: SxProps; iconSx?: SxProps };
`,
      errors: [ERROR, ERROR, ERROR],
      output: `
import { SxProps } from '@mui/material';
import type { Theme } from '@mui/material/styles';

const BASE_SX: SxProps<Theme> = { p: 1 };
type Props = { sx?: SxProps; iconSx?: SxProps };
`,
    },
    // Edge case 6: a foreign Theme in scope withholds the fix.
    {
      code: `
import { SxProps, Theme } from '@mui/material';
type P = { sx?: SxProps; theme: Theme };
`,
      errors: [ERROR],
      output: null,
    },
    {
      code: `
import { Theme } from '@emotion/react';
import { SxProps } from '@mui/material/styles';
type P = { sx?: SxProps; theme: Theme };
`,
      errors: [ERROR],
      output: null,
    },
    {
      code: `
import { SxProps } from '@mui/material/styles';
interface Theme {
  brand: string;
}
type P = { sx?: SxProps };
`,
      errors: [ERROR],
      output: null,
    },
    {
      code: `
import { SxProps } from '@mui/material/styles';
function styled<Theme>(sx: SxProps) {}
`,
      errors: [ERROR],
      output: null,
    },
    {
      code: `
import { SxProps } from '@mui/material/styles';
type Holder<Theme> = { sx: SxProps; theme: Theme };
class Styled<Theme> {
  sx?: SxProps;
}
`,
      errors: [ERROR, ERROR],
      output: null,
    },
    // A value named Theme blocks the import that would collide with it.
    {
      code: `
import { SxProps } from '@mui/material/styles';
const Theme = createTheme();
type P = { sx?: SxProps };
`,
      errors: [ERROR],
      output: null,
    },
    // An unresolved Theme elsewhere in the file would change meaning under a new import.
    {
      code: `
import { SxProps } from '@mui/material';
type P = { sx?: SxProps };
function read(theme: Theme) {
  return theme;
}
`,
      errors: [ERROR],
      output: null,
    },
    // A foreign Theme does not block a namespace import, which adds no binding.
    {
      code: `
import * as Styles from '@mui/material/styles';
import { SxProps, Theme } from '@mui/material';
type P = { sx?: SxProps; theme: Theme };
`,
      errors: [ERROR],
      output: `
import * as Styles from '@mui/material/styles';
import { SxProps, Theme } from '@mui/material';
type P = { sx?: SxProps<Styles.Theme>; theme: Theme };
`,
    },
    // A named import is extended ahead of a namespace import of the same module.
    {
      code: `
import * as Styles from '@mui/material/styles';
import { useTheme } from '@mui/material/styles';
type Q = { sx?: Styles.SxProps };
`,
      errors: [ERROR],
      output: `
import * as Styles from '@mui/material/styles';
import { useTheme, Theme } from '@mui/material/styles';
type Q = { sx?: Styles.SxProps<Theme> };
`,
    },
    // The new import matches the file's quotes and semicolons.
    {
      code: `
import { SxProps } from "@mui/material"
type P = { sx?: SxProps }
`,
      errors: [ERROR],
      output: `
import { SxProps } from "@mui/material"
import type { Theme } from "@mui/material/styles"
type P = { sx?: SxProps<Theme> }
`,
    },
    // A trailing comment stays on the import it annotates.
    {
      code: `
import { SxProps } from '@mui/material'; // barrel on purpose
type P = { sx?: SxProps };
`,
      errors: [ERROR],
      output: `
import { SxProps } from '@mui/material'; // barrel on purpose
import type { Theme } from '@mui/material/styles';
type P = { sx?: SxProps<Theme> };
`,
    },
    // A comment on the following line belongs to the code below, not the import.
    {
      code: `
import { SxProps } from '@mui/material';
// The panel's own styling hook.
type P = { sx?: SxProps };
`,
      errors: [ERROR],
      output: `
import { SxProps } from '@mui/material';
import type { Theme } from '@mui/material/styles';
// The panel's own styling hook.
type P = { sx?: SxProps<Theme> };
`,
    },
    // A 'use client' prologue stays first.
    {
      code: `'use client';
import { SxProps } from '@mui/material';
type P = { sx?: SxProps };
`,
      errors: [ERROR],
      output: `'use client';
import { SxProps } from '@mui/material';
import type { Theme } from '@mui/material/styles';
type P = { sx?: SxProps<Theme> };
`,
    },
    // A global augmentation inside a module can reach a module-level import.
    {
      code: `
import { SxProps } from '@mui/material';
declare global {
  interface Window {
    defaultSx: SxProps;
  }
}
`,
      errors: [ERROR],
      output: `
import { SxProps } from '@mui/material';
import type { Theme } from '@mui/material/styles';
declare global {
  interface Window {
    defaultSx: SxProps<Theme>;
  }
}
`,
    },
  ],
});

ruleTesterTs.run(`${RULE_NAME} (declaration files)`, requireSxPropsTheme, {
  valid: [
    {
      code: `
import type { SxProps, Theme } from '@mui/material/styles';
export declare const PANEL_SX: SxProps<Theme>;
`,
      filename: 'x.d.ts',
    },
  ],
  invalid: [
    // Edge case 8: a bare SxProps in a .d.ts leaks into every importer.
    {
      code: `
import type { SxProps } from '@mui/material/styles';
export declare const PANEL_SX: SxProps;
`,
      filename: 'x.d.ts',
      errors: [ERROR],
      output: `
import type { SxProps, Theme } from '@mui/material/styles';
export declare const PANEL_SX: SxProps<Theme>;
`,
    },
    // Edge case 7: inside the augmentation, reported without a fix.
    {
      code: `
import { Mixins, Shadows, SxProps } from '@mui/material/styles';

declare module '@mui/material/styles' {
  interface Theme {
    mixins: Mixins;
    shadows: Shadows;
  }

  interface Scrollbar {
    primary: SxProps;
  }
}
`,
      filename: 'src/styles/declarations.d.ts',
      errors: [ERROR],
      output: null,
    },
    // Still no fix when the block does not itself redeclare Theme.
    {
      code: `
import { SxProps } from '@mui/material/styles';

declare module '@mui/material/styles' {
  interface Scrollbar {
    primary: SxProps;
  }
}
`,
      filename: 'src/styles/declarations.d.ts',
      errors: [ERROR],
      output: null,
    },
    // Outside the augmentation, the same file is fixed.
    {
      code: `
import { SxProps } from '@mui/material/styles';

declare module '@mui/material/styles' {
  interface Scrollbar {
    primary: SxProps;
  }
}

export type ScrollbarSx = SxProps;
`,
      filename: 'src/styles/declarations.d.ts',
      errors: [ERROR, ERROR],
      output: `
import { SxProps, Theme } from '@mui/material/styles';

declare module '@mui/material/styles' {
  interface Scrollbar {
    primary: SxProps;
  }
}

export type ScrollbarSx = SxProps<Theme>;
`,
    },
    // An import inside an ambient module block of a global script: a new
    // top-level import would turn the script into a module, so no fix.
    {
      code: `
declare module 'panel-kit' {
  import { SxProps } from '@mui/material';
  export const PANEL_SX: SxProps;
}
`,
      filename: 'src/types/panel-kit.d.ts',
      errors: [ERROR],
      output: null,
    },
  ],
});

/**
 * RuleTester applies one fix pass, so the multi-site contract — every site
 * converted and exactly one `Theme` import — is asserted through ESLint's own
 * multipass `verifyAndFix`.
 */
describe(`${RULE_NAME} converges under eslint --fix`, () => {
  const RULE_ID = `@blumintinc/blumint/${RULE_NAME}`;
  const linter = new Linter();
  linter.defineParser('ts', tsParser as never);
  linter.defineRule(RULE_ID, requireSxPropsTheme as never);
  const config = {
    parser: 'ts',
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
    },
    rules: { [RULE_ID]: 'error' },
  } as Linter.Config;

  const fixToEnd = (code: string) =>
    linter.verifyAndFix(code, config, { filename: 'Component.tsx' });

  it('converts three sites with exactly one new import', () => {
    const { output, messages, fixed } = fixToEnd(`
import { SxProps } from '@mui/material';

const BASE_SX: SxProps = { p: 1 };
type Props = { sx?: SxProps; iconSx?: SxProps };
`);
    expect(fixed).toBe(true);
    expect(messages).toEqual([]);
    expect(output).toBe(`
import { SxProps } from '@mui/material';
import type { Theme } from '@mui/material/styles';

const BASE_SX: SxProps<Theme> = { p: 1 };
type Props = { sx?: SxProps<Theme>; iconSx?: SxProps<Theme> };
`);
  });

  it('extends an existing named import exactly once', () => {
    const { output, messages } = fixToEnd(`
import { SxProps, useTheme } from '@mui/material/styles';

export const A: SxProps = {};
export const B = {} as SxProps;
export function c(sx: SxProps[]): SxProps {
  return sx;
}
`);
    expect(messages).toEqual([]);
    expect(output).toBe(`
import { SxProps, useTheme, Theme } from '@mui/material/styles';

export const A: SxProps<Theme> = {};
export const B = {} as SxProps<Theme>;
export function c(sx: SxProps<Theme>[]): SxProps<Theme> {
  return sx;
}
`);
  });

  it('leaves the withheld sites reported and untouched', () => {
    const code = `
import { SxProps, Theme } from '@mui/material';
type P = { sx?: SxProps; iconSx?: SxProps; theme: Theme };
`;
    const { output, messages, fixed } = fixToEnd(code);
    expect(fixed).toBe(false);
    expect(output).toBe(code);
    expect(messages.map((message) => message.ruleId)).toEqual([
      RULE_ID,
      RULE_ID,
    ]);
  });
});

import { ruleTesterTs } from '../utils/ruleTester';
import { preferUseTheme } from '../rules/prefer-use-theme';

const COMPONENT_FILE = 'src/components/ui/MyComponent.tsx';
const HOOK_FILE = 'src/hooks/useMyHook.ts';
const CONTEXT_FILE = 'src/contexts/MyContext.tsx';
const PAGE_FILE = 'src/pages/dashboard/index.tsx';
const STYLES_FILE = 'src/styles/theme.ts';
const STYLES_UTIL_FILE = 'src/styles/util/button/variant.ts';
const UTIL_FILE = 'src/util/string.ts';
const TEST_FILE = 'src/components/wallet/WithdrawFee.test.tsx';

ruleTesterTs.run('prefer-use-theme', preferUseTheme, {
  valid: [
    // Using useTheme() from @mui/material/styles — the correct pattern
    {
      filename: COMPONENT_FILE,
      code: `
import { useTheme } from '@mui/material/styles';
const MyComponent = () => {
  const theme = useTheme();
  return null;
};
`,
    },

    // Using useTheme() from @mui/material
    {
      filename: COMPONENT_FILE,
      code: `
import { useTheme } from '@mui/material';
const MyComponent = () => {
  const theme = useTheme();
  return null;
};
`,
    },

    // File inside src/styles/ is exempt — it builds the theme
    {
      filename: STYLES_FILE,
      code: `
import { PALETTE, RARITIES } from './palette';
import { ELEVATION } from './elevations';
import { SCROLLBARS } from './scrollbars';
`,
    },

    // Nested file inside src/styles/ subdirectory is also exempt
    {
      filename: STYLES_UTIL_FILE,
      code: `
import { PALETTE } from '../../palette';
`,
    },

    // Issue #1259: a Windows backslash path inside src\styles\ must stay exempt
    // after separator normalization — the file builds the theme, so importing a
    // banned constant is legitimate and must not be flagged.
    {
      filename: 'C:\\repo\\src\\styles\\theme.ts',
      code: `
import { PALETTE } from './palette';
`,
    },

    // Test file is exempt — uses raw constants to assert expected values
    {
      filename: TEST_FILE,
      code: `
import { PALETTE } from '../../../styles/palette';
describe('component', () => {
  it('renders with correct color', () => {
    expect(element).toHaveStyle({ color: PALETTE.text.muted });
  });
});
`,
    },

    // File outside target directories (src/util/) is not flagged
    {
      filename: UTIL_FILE,
      code: `
import { PALETTE } from '../styles/palette';
`,
    },

    // Type-only import declaration — never bypasses theme system
    {
      filename: COMPONENT_FILE,
      code: `
import type { PaletteShape } from '../../styles/palette';
`,
    },

    // Individual type specifier in a value import — type-only specifiers are exempt
    {
      filename: COMPONENT_FILE,
      code: `
import { type Palette } from '../../styles/palette';
`,
    },

    // Importing a non-banned export from a style module (e.g. COLORS is not on theme)
    {
      filename: COMPONENT_FILE,
      code: `
import { COLORS } from '../../styles/colors';
`,
    },

    // Importing EASING from motion — not in the banned-constant list
    {
      filename: HOOK_FILE,
      code: `
import { EASING } from '../styles/motion';
`,
    },

    // Importing from a non-styles module that has a similar name
    {
      filename: COMPONENT_FILE,
      code: `
import { PALETTE } from '../../config/palette';
`,
    },

    // Importing ELEVATION from a non-styles path (functions/src — different module)
    {
      filename: COMPONENT_FILE,
      code: `
import { ELEVATION } from 'functions/src/types/elevations';
`,
    },

    // Importing TYPOGRAPHY from a content directory (not styles/typography)
    {
      filename: COMPONENT_FILE,
      code: `
import { TYPOGRAPHY } from '../../../content/typography';
`,
    },

    // MUI imports are always fine
    {
      filename: COMPONENT_FILE,
      code: `
import { Typography, Box } from '@mui/material';
`,
    },

    // Dynamic import — rule only targets static ImportDeclaration nodes
    {
      filename: COMPONENT_FILE,
      code: `
const loadPalette = async () => {
  const { PALETTE } = await import('../../styles/palette');
  return PALETTE;
};
`,
    },

    // Spec file is also exempt (like test files)
    {
      filename: 'src/components/wallet/WithdrawFee.spec.tsx',
      code: `
import { BORDER_RADIUS } from '../../../styles/layout';
`,
    },
  ],

  invalid: [
    // PALETTE imported in a component file
    {
      filename: COMPONENT_FILE,
      code: `
import { PALETTE } from '../../../styles/palette';
`,
      errors: [
        {
          messageId: 'preferUseTheme',
          data: {
            importName: 'PALETTE',
            sourceModule: '../../../styles/palette',
            themeEquivalent: 'theme.palette',
          },
        },
      ],
    },

    // BORDER_RADIUS imported in a component file
    {
      filename: COMPONENT_FILE,
      code: `
import { BORDER_RADIUS } from '../../styles/layout';
`,
      errors: [
        {
          messageId: 'preferUseTheme',
          data: {
            importName: 'BORDER_RADIUS',
            sourceModule: '../../styles/layout',
            themeEquivalent: 'theme.shape.borderRadius',
          },
        },
      ],
    },

    // ELEVATION imported in a component file
    {
      filename: COMPONENT_FILE,
      code: `
import { ELEVATION } from '../../styles/elevations';
`,
      errors: [
        {
          messageId: 'preferUseTheme',
          data: {
            importName: 'ELEVATION',
            sourceModule: '../../styles/elevations',
            themeEquivalent: 'theme.palette.background.elevation',
          },
        },
      ],
    },

    // Multiple banned constants in a single import — each reported separately
    {
      filename: COMPONENT_FILE,
      code: `
import { ZINDEX, BREAKPOINTS } from '../../styles/system';
`,
      errors: [
        {
          messageId: 'preferUseTheme',
          data: {
            importName: 'ZINDEX',
            sourceModule: '../../styles/system',
            themeEquivalent: 'theme.zIndex',
          },
        },
        {
          messageId: 'preferUseTheme',
          data: {
            importName: 'BREAKPOINTS',
            sourceModule: '../../styles/system',
            themeEquivalent: 'theme.breakpoints',
          },
        },
      ],
    },

    // PALETTE imported in a hook file
    {
      filename: HOOK_FILE,
      code: `
import { PALETTE } from '../styles/palette';
`,
      errors: [{ messageId: 'preferUseTheme' }],
    },

    // ELEVATION imported in a context file
    {
      filename: CONTEXT_FILE,
      code: `
import { ELEVATION } from '../../styles/elevations';
`,
      errors: [{ messageId: 'preferUseTheme' }],
    },

    // PALETTE imported in a page file
    {
      filename: PAGE_FILE,
      code: `
import { PALETTE } from '../../styles/palette';
`,
      errors: [{ messageId: 'preferUseTheme' }],
    },

    // SHADOWS imported in a component file
    {
      filename: COMPONENT_FILE,
      code: `
import { SHADOWS } from '../styles/shadows';
`,
      errors: [{ messageId: 'preferUseTheme' }],
    },

    // SHADOWS_HARD imported in a component file
    {
      filename: COMPONENT_FILE,
      code: `
import { SHADOWS_HARD } from '../styles/shadows';
`,
      errors: [{ messageId: 'preferUseTheme' }],
    },

    // BACKDROP_FILTERS imported in a component file
    {
      filename: COMPONENT_FILE,
      code: `
import { BACKDROP_FILTERS } from '../styles/shadows';
`,
      errors: [{ messageId: 'preferUseTheme' }],
    },

    // GLOWS imported in a component file
    {
      filename: COMPONENT_FILE,
      code: `
import { GLOWS } from '../styles/shadows';
`,
      errors: [{ messageId: 'preferUseTheme' }],
    },

    // SCROLLBARS imported in a component file
    {
      filename: COMPONENT_FILE,
      code: `
import { SCROLLBARS } from '../styles/scrollbars';
`,
      errors: [{ messageId: 'preferUseTheme' }],
    },

    // PANELS imported in a component file
    {
      filename: COMPONENT_FILE,
      code: `
import { PANELS } from '../styles/panels';
`,
      errors: [{ messageId: 'preferUseTheme' }],
    },

    // LINE_CLAMP imported in a component file
    {
      filename: COMPONENT_FILE,
      code: `
import { LINE_CLAMP } from '../styles/lineClamp';
`,
      errors: [{ messageId: 'preferUseTheme' }],
    },

    // TYPOGRAPHY imported in a component file
    {
      filename: COMPONENT_FILE,
      code: `
import { TYPOGRAPHY } from '../styles/typography';
`,
      errors: [{ messageId: 'preferUseTheme' }],
    },

    // RARITIES imported from palette module
    {
      filename: COMPONENT_FILE,
      code: `
import { RARITIES } from '../../styles/palette';
`,
      errors: [{ messageId: 'preferUseTheme' }],
    },

    // RARITIES_HOVER imported from palette module
    {
      filename: COMPONENT_FILE,
      code: `
import { RARITIES_HOVER } from '../../styles/palette';
`,
      errors: [{ messageId: 'preferUseTheme' }],
    },

    // RARITIES_BACKGROUND imported from palette module
    {
      filename: COMPONENT_FILE,
      code: `
import { RARITIES_BACKGROUND } from '../../styles/palette';
`,
      errors: [{ messageId: 'preferUseTheme' }],
    },

    // ELEVATIONS (deprecated alias) imported in a component file
    {
      filename: COMPONENT_FILE,
      code: `
import { ELEVATIONS } from '../../styles/elevations';
`,
      errors: [{ messageId: 'preferUseTheme' }],
    },

    // ASPECT_RATIO imported from system module
    {
      filename: COMPONENT_FILE,
      code: `
import { ASPECT_RATIO } from '../../styles/system';
`,
      errors: [{ messageId: 'preferUseTheme' }],
    },

    // CONTAINER_WIDTH imported from layout module
    {
      filename: COMPONENT_FILE,
      code: `
import { CONTAINER_WIDTH } from '../../styles/layout';
`,
      errors: [{ messageId: 'preferUseTheme' }],
    },

    // Mixed import: banned constant alongside a type specifier — only the value is flagged
    {
      filename: COMPONENT_FILE,
      code: `
import { PALETTE, type Palette } from '../../styles/palette';
`,
      errors: [
        {
          messageId: 'preferUseTheme',
          data: {
            importName: 'PALETTE',
            sourceModule: '../../styles/palette',
            themeEquivalent: 'theme.palette',
          },
        },
      ],
    },

    // Namespace import from a banned style module
    {
      filename: COMPONENT_FILE,
      code: `
import * as PaletteStyles from '../../styles/palette';
`,
      errors: [{ messageId: 'preferUseTheme' }],
    },

    // Absolute-from-src style path
    {
      filename: COMPONENT_FILE,
      code: `
import { PALETTE } from 'src/styles/palette';
`,
      errors: [{ messageId: 'preferUseTheme' }],
    },

    // Issue #1259: Windows backslash filename in a target directory. Before
    // normalization the forward-slash `src/components/` fragment never matched a
    // backslash path, so the rule silently no-op'd and this sailed through.
    {
      filename: 'C:\\repo\\src\\components\\ui\\Foo.tsx',
      code: `
import { BORDER_RADIUS } from 'src/styles/layout';
`,
      errors: [
        {
          messageId: 'preferUseTheme',
          data: {
            importName: 'BORDER_RADIUS',
            sourceModule: 'src/styles/layout',
            themeEquivalent: 'theme.shape.borderRadius',
          },
        },
      ],
    },

    // Issue #1259: Windows backslash filename under src\hooks — also a target dir.
    {
      filename: 'C:\\repo\\src\\hooks\\useFoo.ts',
      code: `
import { PALETTE } from '../../styles/palette';
`,
      errors: [{ messageId: 'preferUseTheme' }],
    },
  ],
});

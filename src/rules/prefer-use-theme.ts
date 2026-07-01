import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferUseTheme';

/**
 * The style module path fragments that contain theme constants. Matching is
 * done via substring check on the raw import source value, so relative paths
 * like `../../../styles/palette` and absolute-from-src paths like
 * `src/styles/palette` both match `styles/palette`.
 */
const BANNED_STYLE_MODULE_FRAGMENTS = new Set([
  'styles/palette',
  'styles/elevations',
  'styles/shadows',
  'styles/scrollbars',
  'styles/panels',
  'styles/lineClamp',
  'styles/typography',
  'styles/system',
  'styles/layout',
]);

/**
 * The named export constants that are exposed on the MUI theme object and must
 * be accessed via `useTheme()` (or the `sx` theme callback) rather than direct
 * import. Only these specific names are flagged to avoid false positives from
 * other exports (e.g. `COLORS`, `EASING`) that are NOT on the theme object.
 */
const BANNED_CONSTANTS = new Set([
  'PALETTE',
  'RARITIES',
  'RARITIES_HOVER',
  'RARITIES_BACKGROUND',
  'ELEVATION',
  'ELEVATIONS',
  'SHADOWS',
  'SHADOWS_HARD',
  'BACKDROP_FILTERS',
  'GLOWS',
  'SCROLLBARS',
  'PANELS',
  'LINE_CLAMP',
  'TYPOGRAPHY',
  'ZINDEX',
  'ASPECT_RATIO',
  'BREAKPOINTS',
  'BORDER_RADIUS',
  'CONTAINER_WIDTH',
]);

/**
 * Map from constant name to its theme-object equivalent path, used in the
 * error message so that developers know exactly where to find the value on the
 * theme object.
 */
const THEME_EQUIVALENTS: Record<string, string> = {
  PALETTE: 'theme.palette',
  RARITIES: 'theme.palette.rarity',
  RARITIES_HOVER: 'theme.palette.rarityHover',
  RARITIES_BACKGROUND: 'theme.palette.rarityBackground',
  ELEVATION: 'theme.palette.background.elevation',
  ELEVATIONS: 'theme.palette.background.elevation',
  SHADOWS: 'theme.shadows',
  SHADOWS_HARD: 'theme.shadowsHard',
  BACKDROP_FILTERS: 'theme.glass',
  GLOWS: 'theme.glow',
  SCROLLBARS: 'theme.scrollbars',
  PANELS: 'theme.panels',
  LINE_CLAMP: 'theme.lineClamp',
  TYPOGRAPHY: 'theme.typography',
  ZINDEX: 'theme.zIndex',
  ASPECT_RATIO: 'theme.aspectRatio',
  BREAKPOINTS: 'theme.breakpoints',
  BORDER_RADIUS: 'theme.shape.borderRadius',
  CONTAINER_WIDTH: 'theme.mixins',
};

/**
 * Target file path fragments that the rule enforces inside. Files outside
 * these directories are not flagged — this avoids false positives in utility
 * or configuration modules that may have legitimate reasons to reference
 * constants outside of a React rendering context.
 */
const TARGET_PATH_FRAGMENTS = [
  'src/components/',
  'src/hooks/',
  'src/contexts/',
  'src/pages/',
];

/** Returns true when the file is inside one of the target directories. */
function isInTargetPath(filename: string): boolean {
  return TARGET_PATH_FRAGMENTS.some((fragment) => filename.includes(fragment));
}

/**
 * Returns true when the file is inside `src/styles/`. These files BUILD the
 * theme object and cannot use `useTheme()` because the hook is unavailable
 * outside React component rendering context.
 */
function isInStylesDir(filename: string): boolean {
  return filename.includes('src/styles/');
}

/** Returns true when the file is a test or spec file. */
function isTestFile(filename: string): boolean {
  return (
    filename.endsWith('.test.ts') ||
    filename.endsWith('.test.tsx') ||
    filename.endsWith('.spec.ts') ||
    filename.endsWith('.spec.tsx') ||
    filename.includes('__tests__/')
  );
}

/**
 * Returns true when the import source resolves to one of the banned style
 * modules. Matching is done via substring check, so both relative paths
 * (`../../../styles/palette`) and paths with a `src/` prefix
 * (`src/styles/palette`) are detected.
 */
function isBannedStyleModule(source: string): boolean {
  for (const fragment of BANNED_STYLE_MODULE_FRAGMENTS) {
    if (source.includes(fragment)) {
      return true;
    }
  }
  return false;
}

export const preferUseTheme = createRule<[], MessageIds>({
  name: 'prefer-use-theme',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce reading MUI theme values via useTheme() or the sx theme callback instead of importing theme constants directly from src/styles/* modules.',
      recommended: 'error',
    },
    schema: [],
    messages: {
      preferUseTheme:
        "Import '{{importName}}' from '{{sourceModule}}' bypasses the MUI theme system. Use useTheme() and access {{themeEquivalent}} instead.",
    },
  },
  defaultOptions: [],
  create(context) {
    const filename =
      context.getFilename?.() ??
      (context as { filename?: string }).filename ??
      '';

    // Files that build the theme are always exempt.
    if (isInStylesDir(filename)) {
      return {};
    }

    // Test/spec files are exempt — they often assert against raw constant values.
    if (isTestFile(filename)) {
      return {};
    }

    // Only enforce inside the four target directories.
    if (!isInTargetPath(filename)) {
      return {};
    }

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        // Type-only import declarations never bypass the theme system.
        if (node.importKind === 'type') {
          return;
        }

        const source = node.source.value as string;

        if (!isBannedStyleModule(source)) {
          return;
        }

        // Namespace imports (`import * as X from '...'`) expose all exports,
        // so we flag the entire namespace specifier when the source is banned.
        for (const specifier of node.specifiers) {
          if (specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
            context.report({
              node: specifier,
              messageId: 'preferUseTheme',
              data: {
                importName: `* as ${specifier.local.name}`,
                sourceModule: source,
                themeEquivalent: 'the theme object via useTheme()',
              },
            });
            continue;
          }

          // Named imports: only flag specifiers that are in the banned set.
          if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
            // Skip type-only specifiers within a value import statement.
            if (specifier.importKind === 'type') {
              continue;
            }

            const importedName =
              specifier.imported.type === AST_NODE_TYPES.Identifier
                ? specifier.imported.name
                : '';

            if (!BANNED_CONSTANTS.has(importedName)) {
              continue;
            }

            const themeEquivalent =
              THEME_EQUIVALENTS[importedName] ??
              'the theme object via useTheme()';

            context.report({
              node: specifier,
              messageId: 'preferUseTheme',
              data: {
                importName: importedName,
                sourceModule: source,
                themeEquivalent,
              },
            });
          }
        }
      },
    };
  },
});

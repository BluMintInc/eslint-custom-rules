import { createRule } from '../utils/createRule';
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';

type Options = [];
type MessageIds = 'enforceRoundedVariant';

const MUI_ICONS_BARREL = '@mui/icons-material';
const MUI_ICONS_DEEP_PREFIX = `${MUI_ICONS_BARREL}/`;

/**
 * Non-Rounded MUI variant suffixes. An icon imported as one of these variants
 * (e.g. `AddReactionOutlined`) maps to the Rounded variant of its BASE name
 * (`AddReactionRounded`), not `AddReactionOutlinedRounded` (which doesn't exist).
 * Matched exactly, so a distinct icon like `MailOutline` (ends in "Outline", not
 * "Outlined") is left intact → `MailOutlineRounded`, which does exist.
 */
const VARIANT_SUFFIXES = ['Outlined', 'Sharp', 'TwoTone'] as const;

/**
 * @mui/icons-material brand icons that ship in a single (Filled) variant only —
 * they have no Rounded counterpart, so the rule must not demand one. Computed
 * from @mui/icons-material (the only base icons lacking a `*Rounded` sibling).
 */
const ICONS_WITHOUT_ROUNDED = new Set([
  'Apple',
  'GitHub',
  'Google',
  'Instagram',
  'LinkedIn',
  'Microsoft',
  'Pinterest',
  'Reddit',
  'Telegram',
  'Twitter',
  'WhatsApp',
  'X',
  'YouTube',
]);

/**
 * Names the @mui/icons-material barrel exports that are not icons, so a
 * `*Rounded` sibling never exists for them. `SvgIconComponent` is the icon
 * component *type*, reached through the same barrel as the icons themselves.
 */
const NON_ICON_EXPORTS = new Set(['SvgIconComponent']);

/** Strips a trailing non-Rounded variant suffix to recover the base icon name. */
const toBaseIconName = (iconName: string): string => {
  const suffix = VARIANT_SUFFIXES.find((variant) => iconName.endsWith(variant));
  return suffix ? iconName.slice(0, -suffix.length) : iconName;
};

/**
 * Single source of truth for both import forms: maps the name an icon is
 * imported under to the Rounded name that should replace it, or null when the
 * name needs no change — it is already Rounded, it is not an icon, or MUI ships
 * that icon without a Rounded variant.
 */
const toRoundedIconName = (iconName: string): string | null => {
  if (
    !iconName ||
    iconName.endsWith('Rounded') ||
    NON_ICON_EXPORTS.has(iconName)
  ) {
    return null;
  }

  // Map a non-Rounded variant to its base icon so the suggestion/fix targets a
  // name that actually exists.
  const baseIconName = toBaseIconName(iconName);

  // Brand icons have no Rounded variant — demanding one is a false positive and
  // the fix would point at a name that does not exist.
  if (ICONS_WITHOUT_ROUNDED.has(baseIconName)) {
    return null;
  }

  return `${baseIconName}Rounded`;
};

export const enforceMuiRoundedIcons = createRule<Options, MessageIds>({
  name: 'enforce-mui-rounded-icons',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce the use of -Rounded variant for MUI icons',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      enforceRoundedVariant:
        'Use the -Rounded variant for MUI icons (e.g., LogoutRounded instead of Logout)',
    },
  },
  defaultOptions: [],
  create(context) {
    /** `import LogoutIcon from '@mui/icons-material/Logout'` — the icon is named by the module path. */
    const checkDeepImport = (
      node: TSESTree.ImportDeclaration,
      iconPath: string,
    ) => {
      const iconName = iconPath.split('/').pop();
      const roundedVariant = iconName ? toRoundedIconName(iconName) : null;

      if (!roundedVariant) {
        return;
      }

      context.report({
        node,
        messageId: 'enforceRoundedVariant',
        // The local binding is untouched: only the module the icon comes from
        // changes.
        fix: (fixer) =>
          fixer.replaceText(
            node.source,
            `'${MUI_ICONS_DEEP_PREFIX}${roundedVariant}'`,
          ),
      });
    };

    /** `import { Logout } from '@mui/icons-material'` — the icon is named by each specifier. */
    const checkBarrelImport = (node: TSESTree.ImportDeclaration) => {
      // A type-only import names a type, and the barrel's type exports are not
      // icons; nothing it introduces can be rendered.
      if (node.importKind === 'type') {
        return;
      }

      for (const specifier of node.specifiers) {
        // Default and namespace imports name no individual icon.
        if (
          specifier.type !== AST_NODE_TYPES.ImportSpecifier ||
          specifier.importKind === 'type'
        ) {
          continue;
        }

        const importedName = specifier.imported.name;
        const roundedVariant = toRoundedIconName(importedName);

        if (!roundedVariant) {
          continue;
        }

        // An alias keeps the local binding independent of the imported name, so
        // swapping the imported name is a self-contained edit. Without one, a
        // fix would rename the binding and would have to rewrite every
        // reference to it (shorthand properties, export specifiers, JSX) — so
        // that form is reported without a fix rather than risking a corrupting
        // edit.
        const isAliased = specifier.local.name !== importedName;

        context.report({
          node: specifier,
          messageId: 'enforceRoundedVariant',
          fix: isAliased
            ? (fixer) => fixer.replaceText(specifier.imported, roundedVariant)
            : null,
        });
      }
    };

    return {
      ImportDeclaration(node) {
        if (
          node.source.type !== AST_NODE_TYPES.Literal ||
          typeof node.source.value !== 'string'
        ) {
          return;
        }

        const source = node.source.value;

        if (source.startsWith(MUI_ICONS_DEEP_PREFIX)) {
          checkDeepImport(node, source);
          return;
        }

        if (source === MUI_ICONS_BARREL) {
          checkBarrelImport(node);
        }
      },
    };
  },
});

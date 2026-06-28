import { createRule } from '../utils/createRule';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

type Options = [];
type MessageIds = 'enforceRoundedVariant';

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

/** Strips a trailing non-Rounded variant suffix to recover the base icon name. */
const toBaseIconName = (iconName: string): string => {
  const suffix = VARIANT_SUFFIXES.find((variant) => iconName.endsWith(variant));
  return suffix ? iconName.slice(0, -suffix.length) : iconName;
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
    return {
      ImportDeclaration(node) {
        // Only check imports from @mui/icons-material
        if (
          node.source.type === AST_NODE_TYPES.Literal &&
          typeof node.source.value === 'string' &&
          node.source.value.startsWith('@mui/icons-material/')
        ) {
          const iconPath = node.source.value;

          // Skip if already using -Rounded variant
          if (iconPath.endsWith('Rounded')) {
            return;
          }

          // Extract the icon name from the path
          const iconName = iconPath.split('/').pop();

          // Skip if the icon name is not a string (shouldn't happen)
          if (!iconName) {
            return;
          }

          // Map a non-Rounded variant import to its base icon so the Rounded
          // suggestion/fix targets a name that actually exists.
          const baseIconName = toBaseIconName(iconName);

          // Brand icons have no Rounded variant — demanding one is a false
          // positive and the fix would point at a non-existent module.
          if (ICONS_WITHOUT_ROUNDED.has(baseIconName)) {
            return;
          }

          // Create the rounded variant name
          const roundedVariant = `${baseIconName}Rounded`;

          context.report({
            node,
            messageId: 'enforceRoundedVariant',
            fix: (fixer) => {
              // Replace the import path with the rounded variant
              return fixer.replaceText(
                node.source,
                `'@mui/icons-material/${roundedVariant}'`,
              );
            },
          });
        }
      },
    };
  },
});

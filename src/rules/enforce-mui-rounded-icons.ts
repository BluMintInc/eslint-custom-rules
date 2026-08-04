import { createRule } from '../utils/createRule';
import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import {
  renameIdentifierToken,
  renameWouldCollide,
} from '../utils/renameFixes';
import { ASTHelpers } from '../utils/ASTHelpers';

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

/** The icon a deep module path names, e.g. `AddReactionOutlined`. */
const deepImportIconName = (source: string): string | undefined =>
  source.split('/').pop();

/** The binding a deep import introduces for the icon its path names. */
const deepImportBinding = (
  node: TSESTree.ImportDeclaration,
): TSESTree.Identifier | null => {
  const defaultSpecifier = node.specifiers.find(
    (specifier) => specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier,
  );
  return defaultSpecifier ? defaultSpecifier.local : null;
};

/**
 * The Rounded names this declaration would give to *bindings* if its fix ran.
 *
 * Only a binding whose name is the icon name being replaced is ever renamed, so
 * an aliased specifier — whose fix touches the imported name alone — claims no
 * name here. Collected across the file so two variants of one icon
 * (`PersonOutlined` and `PersonSharp`, both retargeting to `PersonRounded`) can
 * be spotted before either fix runs: renaming both bindings would declare the
 * same name twice.
 */
const claimedRoundedNames = (
  node: TSESTree.ImportDeclaration,
): readonly string[] => {
  if (
    node.source.type !== AST_NODE_TYPES.Literal ||
    typeof node.source.value !== 'string'
  ) {
    return [];
  }

  const source = node.source.value;

  if (source.startsWith(MUI_ICONS_DEEP_PREFIX)) {
    const iconName = deepImportIconName(source);
    const roundedVariant = iconName ? toRoundedIconName(iconName) : null;
    const local = deepImportBinding(node);
    return roundedVariant && local?.name === iconName ? [roundedVariant] : [];
  }

  if (source !== MUI_ICONS_BARREL || node.importKind === 'type') {
    return [];
  }

  const claimed: string[] = [];
  for (const specifier of node.specifiers) {
    if (
      specifier.type !== AST_NODE_TYPES.ImportSpecifier ||
      specifier.importKind === 'type' ||
      specifier.local.name !== specifier.imported.name
    ) {
      continue;
    }
    const roundedVariant = toRoundedIconName(specifier.imported.name);
    if (roundedVariant) {
      claimed.push(roundedVariant);
    }
  }
  return claimed;
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
    const sourceCode = context.getSourceCode();

    /**
     * Rounded names that more than one binding in the file would take. Renaming
     * every claimant would declare the same name twice, so no claimant of a
     * contested name is renamed.
     */
    const contestedNames = new Set<string>();

    /**
     * Rewrites one reference to a renamed binding, or answers null when that
     * site cannot be rewritten without changing more than the name.
     */
    const referenceRenameFixes = (
      fixer: TSESLint.RuleFixer,
      referenceId: TSESTree.Node,
      newName: string,
    ): TSESLint.RuleFix[] | null => {
      const parent = referenceId.parent;

      // `export { PersonOutlined }` binds the module's public export name to
      // this token, so renaming it would change an API contract whose importers
      // a single-file fix cannot reach.
      if (parent?.type === AST_NODE_TYPES.ExportSpecifier) {
        return null;
      }

      // A shorthand property is one token serving as both key and value:
      // rewriting it renames the key too, and expanding it to `key: value`
      // reshapes source the rule has no business reshaping.
      if (parent?.type === AST_NODE_TYPES.Property && parent.shorthand) {
        return null;
      }

      // `<Icon.Sub />` and `<svg:icon />` name the binding through a compound
      // tag whose closing half is not a scope reference, so the two tags cannot
      // be kept in sync from here.
      if (
        parent?.type === AST_NODE_TYPES.JSXMemberExpression ||
        parent?.type === AST_NODE_TYPES.JSXNamespacedName
      ) {
        return null;
      }

      const fix = renameIdentifierToken(
        fixer,
        sourceCode,
        referenceId,
        newName,
      );
      if (!fix) {
        return null;
      }

      if (
        parent?.type !== AST_NODE_TYPES.JSXOpeningElement ||
        parent.name !== referenceId
      ) {
        return [fix];
      }

      // The scope manager records the opening tag's name as a reference but not
      // the closing tag's, so renaming the opening half alone would leave
      // `<PersonRounded></PersonOutlined>` — code that no longer parses.
      const element = parent.parent;
      const closingName =
        element?.type === AST_NODE_TYPES.JSXElement
          ? element.closingElement?.name
          : undefined;
      if (!closingName) {
        return [fix];
      }
      // JSX requires the closing name to spell the opening one, so its first
      // token is the same name this rename replaces.
      const closingFix = renameIdentifierToken(
        fixer,
        sourceCode,
        closingName,
        newName,
      );
      return closingFix ? [fix, closingFix] : null;
    };

    /**
     * Builds the rewrites that rename the binding an icon import introduces:
     * the declaring token(s) plus every in-file reference to it.
     *
     * Answers null when the rename cannot be applied everywhere — the caller
     * then keeps the retarget that leaves the binding alone, or reports without
     * a fix where no such retarget exists.
     */
    const bindingRenameFixes = (
      fixer: TSESLint.RuleFixer,
      declaration: TSESTree.ImportDeclaration,
      localIdentifier: TSESTree.Identifier,
      declarationTokens: readonly TSESTree.Node[],
      newName: string,
    ): TSESLint.RuleFix[] | null => {
      if (contestedNames.has(newName)) {
        return null;
      }

      // Resolved by declaration identity rather than by name: a file may bind
      // the same name in several scopes, and only this declaration's symbol
      // carries the references the fix has to rewrite.
      const variable = ASTHelpers.getDeclaredVariables(
        context,
        declaration,
      ).find((candidate) =>
        candidate.defs.some((def) => def.name === localIdentifier),
      );

      if (!variable || renameWouldCollide(variable, newName)) {
        return null;
      }

      const fixes: TSESLint.RuleFix[] = [];
      for (const token of declarationTokens) {
        const fix = renameIdentifierToken(fixer, sourceCode, token, newName);
        if (!fix) {
          return null;
        }
        fixes.push(fix);
      }

      for (const reference of variable.references) {
        if (reference.identifier === localIdentifier) {
          continue;
        }
        const referenceFixes = referenceRenameFixes(
          fixer,
          reference.identifier,
          newName,
        );
        if (!referenceFixes) {
          return null;
        }
        fixes.push(...referenceFixes);
      }

      return fixes;
    };

    /** `import LogoutIcon from '@mui/icons-material/Logout'` — the icon is named by the module path. */
    const checkDeepImport = (
      node: TSESTree.ImportDeclaration,
      iconPath: string,
    ) => {
      const iconName = deepImportIconName(iconPath);
      const roundedVariant = iconName ? toRoundedIconName(iconName) : null;

      if (!roundedVariant) {
        return;
      }

      const local = deepImportBinding(node);
      // A hand-chosen alias (`import BellIcon from '.../NotificationsActive'`)
      // names the icon's role, not its variant, so only a binding that repeats
      // the icon name is renamed with the path.
      const renamedBinding = local?.name === iconName ? local : null;

      context.report({
        node,
        messageId: 'enforceRoundedVariant',
        fix: (fixer) => {
          const pathFix = fixer.replaceText(
            node.source,
            `'${MUI_ICONS_DEEP_PREFIX}${roundedVariant}'`,
          );

          const renameFixes = renamedBinding
            ? bindingRenameFixes(
                fixer,
                node,
                renamedBinding,
                [renamedBinding],
                roundedVariant,
              )
            : null;

          // Path and binding move together: one fixer emits both, so a binding
          // rename can never land without the retarget that motivates it.
          return renameFixes ? [pathFix, ...renameFixes] : pathFix;
        },
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
        // swapping the imported name is a self-contained edit that leaves the
        // binding — and every reference to it — alone.
        if (specifier.local.name !== importedName) {
          context.report({
            node: specifier,
            messageId: 'enforceRoundedVariant',
            fix: (fixer) =>
              fixer.replaceText(specifier.imported, roundedVariant),
          });
          continue;
        }

        // Without an alias the imported name IS the local binding, so changing
        // it renames the binding: the fix must own every reference to it or not
        // exist at all. `import { Logout }` spells the imported name and the
        // local one with a single token, which is rewritten once; the redundant
        // `import { Logout as Logout }` spells them separately, so both move.
        const declarationTokens =
          specifier.imported.range[0] === specifier.local.range[0]
            ? [specifier.local]
            : [specifier.imported, specifier.local];

        context.report({
          node: specifier,
          messageId: 'enforceRoundedVariant',
          fix: (fixer) =>
            bindingRenameFixes(
              fixer,
              node,
              specifier.local,
              declarationTokens,
              roundedVariant,
            ),
        });
      }
    };

    return {
      // Every import is a top-level statement, so the names the file's fixes
      // would introduce are all knowable before the first report.
      Program(node) {
        const claimCounts = new Map<string, number>();
        for (const statement of node.body) {
          if (statement.type !== AST_NODE_TYPES.ImportDeclaration) {
            continue;
          }
          for (const claimed of claimedRoundedNames(statement)) {
            claimCounts.set(claimed, (claimCounts.get(claimed) ?? 0) + 1);
          }
        }
        for (const [name, count] of claimCounts) {
          if (count > 1) {
            contestedNames.add(name);
          }
        }
      },
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

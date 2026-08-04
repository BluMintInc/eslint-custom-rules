import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';

type MessageIds = 'enforceCssMediaQueries';

/** Hooks whose calls perform JavaScript media detection. */
const MEDIA_HOOKS = new Set(['useMediaQuery', 'useMobile']);

/**
 * Features that describe the viewport's geometry. A stylesheet evaluates these
 * itself, so asking JavaScript for the answer duplicates a CSS breakpoint and
 * the rule's remedy — move the breakpoint into `@media` — applies.
 */
const LAYOUT_FEATURES = new Set([
  'width',
  'min-width',
  'max-width',
  'height',
  'min-height',
  'max-height',
  'aspect-ratio',
  'min-aspect-ratio',
  'max-aspect-ratio',
  'resolution',
  'min-resolution',
  'max-resolution',
  'device-width',
  'min-device-width',
  'max-device-width',
  'device-height',
  'min-device-height',
  'max-device-height',
  'device-aspect-ratio',
  'min-device-aspect-ratio',
  'max-device-aspect-ratio',
]);

/**
 * Features that describe the device's capabilities or the user's preferences.
 * These gate JavaScript behaviour — whether a component mounts, which animation
 * duration a prop carries, which branch a hook takes — and no class name can
 * express that decision, so the rule's remedy is unreachable and the query is
 * exempt.
 */
const NON_LAYOUT_FEATURES = new Set([
  'hover',
  'any-hover',
  'pointer',
  'any-pointer',
  'orientation',
  'display-mode',
  'forced-colors',
  'inverted-colors',
  'update',
  'scripting',
]);

/** Every `prefers-*` feature is a user preference, never a layout measurement. */
const PREFERENCE_FEATURE_PREFIX = 'prefers-';

/**
 * Guards the text a query carries outside its feature groups — media types and
 * combinators such as `screen`, `and`, `not`. A layout name appearing there
 * means the query is shaped in a way the group scanner does not read, so the
 * rule keeps reporting it rather than guessing.
 */
const LAYOUT_NAME = new RegExp([...LAYOUT_FEATURES].join('|'));

const FEATURE_GROUP = /\(([^()]*)\)/g;

/** Follows at most this many indirections while resolving a query argument. */
const MAX_RESOLUTION_DEPTH = 4;

/**
 * The feature a parenthesized query group tests, or `null` when the group's
 * shape leaves it ambiguous (range syntax such as `(width >= 600px)`, a nested
 * `calc()`, an empty group).
 */
function featureNameOf(group: string): string | null {
  const separator = group.indexOf(':');
  const name = (separator === -1 ? group : group.slice(0, separator))
    .trim()
    .toLowerCase();
  if (name === '' || /[^a-z-]/.test(name)) {
    return null;
  }
  return name;
}

function isNonLayoutFeature(name: string): boolean {
  return (
    NON_LAYOUT_FEATURES.has(name) || name.startsWith(PREFERENCE_FEATURE_PREFIX)
  );
}

/**
 * Whether every feature the query tests is a capability or preference. An
 * unrecognized feature, a mixed query (`(hover: hover) and (min-width: 600px)`)
 * or a query naming no feature at all is not exempt: the rule reports whenever
 * it cannot prove the query is free of layout.
 */
function testsOnlyNonLayoutFeatures(query: string): boolean {
  const normalized = query.toLowerCase();
  const groups = new RegExp(FEATURE_GROUP.source, FEATURE_GROUP.flags);
  let match: RegExpExecArray | null;
  let sawFeature = false;
  while ((match = groups.exec(normalized)) !== null) {
    const name = featureNameOf(match[1]);
    // A layout feature and an unrecognized one both keep the query reportable:
    // the exemption exists only where the query is provably free of layout.
    if (name === null || !isNonLayoutFeature(name)) {
      return false;
    }
    sawFeature = true;
  }

  const outsideGroups = normalized.replace(
    new RegExp(FEATURE_GROUP.source, FEATURE_GROUP.flags),
    ' ',
  );
  return sawFeature && !LAYOUT_NAME.test(outsideGroups);
}

/**
 * The query string an argument carries, or `null` when the rule cannot see it.
 * A `theme.breakpoints.*` expression, an imported constant, a template with
 * interpolations and a reassignable binding all resolve to `null`, which keeps
 * them reportable.
 */
function resolveQuery(
  node: TSESTree.Node,
  scope: TSESLint.Scope.Scope,
  depth = 0,
): string | null {
  if (depth > MAX_RESOLUTION_DEPTH) {
    return null;
  }

  switch (node.type) {
    case AST_NODE_TYPES.Literal:
      return typeof node.value === 'string' ? node.value : null;
    case AST_NODE_TYPES.TemplateLiteral:
      return node.expressions.length === 0
        ? node.quasis[0]?.value.cooked ?? null
        : null;
    // `as const`, `satisfies` and angle-bracket assertions only annotate the
    // string they wrap, so the query survives them unchanged.
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
    case AST_NODE_TYPES.TSNonNullExpression:
      return resolveQuery(node.expression, scope, depth + 1);
    case AST_NODE_TYPES.Identifier:
      return resolveBinding(node, scope, depth);
    default:
      return null;
  }
}

function resolveBinding(
  node: TSESTree.Identifier,
  scope: TSESLint.Scope.Scope,
  depth: number,
): string | null {
  const variable = ASTHelpers.findVariableInScope(scope, node.name);
  if (!variable || variable.defs.length !== 1) {
    return null;
  }

  const definition = variable.defs[0];
  if (definition.type !== 'Variable' || !definition.node.init) {
    return null;
  }

  // Only a `const` proves the query the call receives is the one declared here;
  // a `let` may hold a width query by the time the hook runs.
  const declaration = definition.parent;
  if (
    declaration?.type !== AST_NODE_TYPES.VariableDeclaration ||
    declaration.kind !== 'const'
  ) {
    return null;
  }

  return resolveQuery(definition.node.init, scope, depth + 1);
}

/**
 * This rule enforces the use of CSS media queries instead of JavaScript-based breakpoints
 * in React components for better performance and separation of concerns.
 */
export const enforceCssMediaQueries = createRule<[], MessageIds>({
  name: 'enforce-css-media-queries',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce CSS media queries over JS breakpoints',
      recommended: 'error',
    },
    messages: {
      enforceCssMediaQueries:
        'Responsive breakpoint "{{source}}" uses JavaScript media detection. JavaScript breakpoints attach resize listeners inside the render path, causing avoidable re-renders and drifting from the single CSS breakpoint source of truth. Move this breakpoint into CSS (@media or container queries) and drive layout changes through class names or CSS-driven props instead of runtime hooks.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    type Usage = { node: TSESTree.Node; source: string };

    /**
     * Import reports are held back until traversal ends: an import whose hook is
     * called in the same file is the same single usage as the call, and one
     * usage earns one report (and therefore one disable comment).
     */
    const pendingImports: (Usage & { localNames: string[] })[] = [];
    const calledHooks = new Set<string>();
    const reportableCalls: Usage[] = [];

    const reportUsage = ({ node, source }: Usage) =>
      context.report({
        node,
        messageId: 'enforceCssMediaQueries',
        data: { source },
      });

    const localNamesOf = (node: TSESTree.ImportDeclaration) =>
      node.specifiers.map((specifier) => specifier.local.name);

    const isExemptCall = (node: TSESTree.CallExpression) => {
      const [argument] = node.arguments;
      if (!argument) {
        return false;
      }
      const query = resolveQuery(argument, ASTHelpers.getScope(context, node));
      return query !== null && testsOnlyNonLayoutFeatures(query);
    };

    return {
      // Only react-responsive is handled at the declaration level to avoid duplicates.
      ImportDeclaration(node) {
        if (
          node.source.value !== 'react-responsive' &&
          !node.source.value.includes('react-responsive/')
        ) {
          return;
        }

        pendingImports.push({
          node,
          source: `react-responsive import "${String(node.source.value)}"`,
          localNames: localNamesOf(node),
        });
      },

      // Handle specific specifiers to avoid duplicate diagnostics.
      ImportSpecifier(node) {
        if (
          node.parent?.type === AST_NODE_TYPES.ImportDeclaration &&
          node.imported.type === AST_NODE_TYPES.Identifier
        ) {
          if (
            node.parent.source.value === '@mui/material' &&
            node.imported.name === 'useMediaQuery'
          ) {
            pendingImports.push({
              node,
              source: 'useMediaQuery import from @mui/material',
              localNames: [node.local.name],
            });
            return;
          }

          if (node.imported.name === 'useMobile') {
            pendingImports.push({
              node,
              source: `useMobile import from ${String(
                node.parent.source.value,
              )}`,
              localNames: [node.local.name],
            });
            return;
          }
        }
      },

      // Check for useMediaQuery and useMobile calls
      CallExpression(node) {
        if (
          node.callee.type !== AST_NODE_TYPES.Identifier ||
          !MEDIA_HOOKS.has(node.callee.name)
        ) {
          return;
        }

        calledHooks.add(node.callee.name);
        if (isExemptCall(node)) {
          return;
        }
        reportableCalls.push({ node, source: `${node.callee.name} call` });
      },

      'Program:exit'() {
        reportableCalls.forEach(reportUsage);

        pendingImports
          // An import the file also calls is covered by the call: reported
          // through it when the query is a breakpoint, and exempt with it when
          // every query is a capability or preference probe. An import with no
          // call — unused, re-exported, passed around as a value — has no call
          // to carry the report, so it keeps its own.
          .filter(
            ({ localNames }) => !localNames.some((n) => calledHooks.has(n)),
          )
          .forEach(reportUsage);
      },
    };
  },
});

import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'enforceCssMediaQueries';

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
    const reportUsage = (node: TSESTree.Node, source: string) =>
      context.report({
        node,
        messageId: 'enforceCssMediaQueries',
        data: { source },
      });

    return {
      // Only react-responsive is handled at the declaration level to avoid duplicates.
      ImportDeclaration(node) {
        if (
          node.source.value !== 'react-responsive' &&
          !node.source.value.includes('react-responsive/')
        ) {
          return;
        }

        reportUsage(
          node,
          `react-responsive import "${String(node.source.value)}"`,
        );
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
            reportUsage(node, 'useMediaQuery import from @mui/material');
            return;
          }

          if (node.imported.name === 'useMobile') {
            reportUsage(
              node,
              `useMobile import from ${String(node.parent.source.value)}`,
            );
            return;
          }
        }
      },

      // Check for useMediaQuery and useMobile calls
      CallExpression(node) {
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          (node.callee.name === 'useMediaQuery' ||
            node.callee.name === 'useMobile')
        ) {
          reportUsage(node, `${node.callee.name} call`);
        }
      },
    };
  },
});

import { AST_NODE_TYPES } from '@typescript-eslint/utils';
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
        'Use CSS media queries instead of JavaScript breakpoints for responsive design. JavaScript breakpoint handling can cause unnecessary re-renders and impact performance.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      // Check for Material-UI's useMediaQuery and react-responsive imports
      ImportDeclaration(node) {
        // Check for @mui/material useMediaQuery
        if (
          node.source.value === '@mui/material' &&
          node.specifiers.some(
            (specifier) =>
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.imported.type === AST_NODE_TYPES.Identifier &&
              specifier.imported.name === 'useMediaQuery'
          )
        ) {
          context.report({
            node,
            messageId: 'enforceCssMediaQueries',
          });
        }

        // Check for react-responsive imports
        if (
          node.source.value === 'react-responsive' ||
          node.source.value.includes('react-responsive/')
        ) {
          context.report({
            node,
            messageId: 'enforceCssMediaQueries',
          });
        }

        // Check for useMobile import from hooks/useMobile
        if (
          node.source.value.includes('hooks/useMobile') &&
          node.specifiers.some(
            (specifier) =>
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.imported.type === AST_NODE_TYPES.Identifier &&
              specifier.imported.name === 'useMobile'
          )
        ) {
          context.report({
            node,
            messageId: 'enforceCssMediaQueries',
          });
        }
      },

      // Check for specific import specifiers
      ImportSpecifier(node) {
        if (
          node.parent &&
          node.parent.type === AST_NODE_TYPES.ImportDeclaration &&
          node.imported.type === AST_NODE_TYPES.Identifier &&
          (
            // Check for useMediaQuery from @mui/material
            (node.parent.source.value === '@mui/material' &&
             node.imported.name === 'useMediaQuery') ||
            // Check for useMobile from any source
            node.imported.name === 'useMobile'
          )
        ) {
          context.report({
            node,
            messageId: 'enforceCssMediaQueries',
          });
        }
      },

      // Check for useMediaQuery and useMobile calls
      CallExpression(node) {
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          (node.callee.name === 'useMediaQuery' || node.callee.name === 'useMobile')
        ) {
          context.report({
            node,
            messageId: 'enforceCssMediaQueries',
          });
        }
      },
    };
  },
});

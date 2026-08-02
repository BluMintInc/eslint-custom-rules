import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'requirePathUtil';

const RTDB_METHODS = new Set(['ref', 'child']);

export const enforceRealtimedbPathUtils = createRule<[], MessageIds>({
  name: 'enforce-realtimedb-path-utils',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce usage of utility functions for Realtime Database paths',
      recommended: 'error',
    },
    schema: [],
    messages: {
      requirePathUtil:
        'Use a utility function for Realtime Database paths to ensure type safety and maintainability. Instead of `admin.database().ref(`users/${userId}`)`, create and use a utility function: `const toUserPath = (id: string) => `users/${id}`; admin.database().ref(toUserPath(userId))`.',
    },
  },
  defaultOptions: [],
  create(context) {
    function isRTDBCall(node: TSESTree.CallExpression): boolean {
      if (node.callee.type !== AST_NODE_TYPES.MemberExpression) {
        return false;
      }

      const property = node.callee.property;
      if (property.type !== AST_NODE_TYPES.Identifier) {
        return false;
      }

      // Check for both frontend and backend SDK patterns
      if (!RTDB_METHODS.has(property.name)) {
        return false;
      }

      // Check if it's a Firebase RTDB call by looking at the chain
      let current = node.callee.object;
      while (current) {
        if (current.type === AST_NODE_TYPES.CallExpression) {
          if (current.callee.type === AST_NODE_TYPES.MemberExpression) {
            const method = current.callee.property;
            if (
              method.type === AST_NODE_TYPES.Identifier &&
              method.name === 'database'
            ) {
              return true;
            }
          }
          current = current.callee;
        } else if (current.type === AST_NODE_TYPES.MemberExpression) {
          // Handle chained calls like ref().child()
          current = current.object;
        } else {
          break;
        }
      }

      return false;
    }

    function isStringLiteralOrTemplate(node: TSESTree.Node): boolean {
      return (
        (node.type === AST_NODE_TYPES.Literal &&
          typeof node.value === 'string') ||
        node.type === AST_NODE_TYPES.TemplateLiteral
      );
    }

    /**
     * A `+` chain qualifies as an inline path only when a string literal or
     * template literal appears somewhere in it: that literal is the hard-coded
     * path fragment the rule exists to push behind a helper. The walk recurses
     * because `'users/' + userId + '/posts'` parses as a left-nested
     * BinaryExpression, which leaves the literals below the outermost operands.
     * A chain of opaque operands (`a + b`) constructs no path fragment inline,
     * so it keeps the same indirection allowance as a bare variable.
     */
    function isInlinePathExpression(node: TSESTree.Node): boolean {
      if (isStringLiteralOrTemplate(node)) {
        return true;
      }

      return (
        node.type === AST_NODE_TYPES.BinaryExpression &&
        node.operator === '+' &&
        (isInlinePathExpression(node.left) ||
          isInlinePathExpression(node.right))
      );
    }

    function isUtilityFunction(node: TSESTree.Node): boolean {
      if (node.type !== AST_NODE_TYPES.CallExpression) {
        return false;
      }

      const callee = node.callee;
      if (callee.type !== AST_NODE_TYPES.Identifier) {
        return false;
      }

      // Match functions starting with 'to' and ending with 'Path'
      return /^to.*Path$/.test(callee.name);
    }

    return {
      CallExpression(node) {
        if (!isRTDBCall(node)) {
          return;
        }

        // Check first argument of ref() or child() call
        const pathArg = node.arguments[0];
        if (!pathArg) {
          return;
        }

        // Skip if it's already using a utility function
        if (isUtilityFunction(pathArg)) {
          return;
        }

        // Skip if it's a variable or other expression that hides construction
        // behind a name rather than assembling the path inline
        if (!isInlinePathExpression(pathArg)) {
          return;
        }

        // Skip test files
        const filename = context.getFilename();
        if (
          filename.includes('__tests__') ||
          filename.includes('.test.') ||
          filename.includes('.spec.') ||
          filename.includes('mocks')
        ) {
          return;
        }

        context.report({
          node: pathArg,
          messageId: 'requirePathUtil',
        });
      },
    };
  },
});

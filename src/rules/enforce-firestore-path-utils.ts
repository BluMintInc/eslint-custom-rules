import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'requirePathUtil';

const FIRESTORE_METHODS = new Set(['doc', 'collection']);

export const enforceFirestorePathUtils = createRule<[], MessageIds>({
  name: 'enforce-firestore-path-utils',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce usage of utility functions for Firestore paths to ensure type safety, maintainability, and consistent path construction. This prevents errors from manual string concatenation and makes path changes easier to manage.',
      recommended: 'error',
    },
    schema: [],
    messages: {
      requirePathUtil:
        'Use a utility function for Firestore paths to ensure type safety and maintainability. Instead of `doc("users/" + userId)`, create and use a utility function: `const toUserPath = (id: string) => `users/${id}`; doc(toUserPath(userId))`.',
    },
  },
  defaultOptions: [],
  create(context) {
    function isFirestoreCall(node: TSESTree.CallExpression): boolean {
      if (node.callee.type !== AST_NODE_TYPES.MemberExpression) {
        return false;
      }

      const property = node.callee.property;
      if (property.type !== AST_NODE_TYPES.Identifier) {
        return false;
      }

      return FIRESTORE_METHODS.has(property.name);
    }

    function isStringLiteralOrTemplate(node: TSESTree.Node): boolean {
      return (
        (node.type === AST_NODE_TYPES.Literal &&
          typeof node.value === 'string') ||
        node.type === AST_NODE_TYPES.TemplateLiteral
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
        if (!isFirestoreCall(node)) {
          return;
        }

        // Check first argument of doc() or collection() call
        const pathArg = node.arguments[0];
        if (!pathArg) {
          return;
        }

        // Skip if it's already using a utility function
        if (isUtilityFunction(pathArg)) {
          return;
        }

        // Skip if it's a variable or other non-literal expression
        if (!isStringLiteralOrTemplate(pathArg)) {
          return;
        }

        // Skip test files
        const filename = context.getFilename();
        if (
          filename.includes('__tests__') ||
          filename.includes('.test.') ||
          filename.includes('.spec.')
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

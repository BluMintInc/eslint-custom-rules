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
      if (
        node.callee.type === AST_NODE_TYPES.MemberExpression &&
        node.callee.property.type === AST_NODE_TYPES.Identifier
      ) {
        return FIRESTORE_METHODS.has(node.callee.property.name);
      }

      if (
        node.callee.type === AST_NODE_TYPES.Identifier &&
        FIRESTORE_METHODS.has(node.callee.name)
      ) {
        return true;
      }

      return false;
    }

    function isStringLiteralOrTemplate(node: TSESTree.Node): boolean {
      if (
        (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') ||
        node.type === AST_NODE_TYPES.TemplateLiteral
      ) {
        return true;
      }

      if (
        node.type === AST_NODE_TYPES.BinaryExpression &&
        node.operator === '+' &&
        (isStringLiteralOrTemplate(node.left) ||
          isStringLiteralOrTemplate(node.right))
      ) {
        return true;
      }

      return false;
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

        const pathArgs = node.arguments;
        if (pathArgs.length === 0) {
          return;
        }

        const [firstPathArg] = pathArgs;

        // Skip if it's already using a utility function
        if (isUtilityFunction(firstPathArg)) {
          return;
        }

        const pathArg = pathArgs.find((arg) => isStringLiteralOrTemplate(arg));
        if (!pathArg) {
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

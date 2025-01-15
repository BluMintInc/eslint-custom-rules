import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'requirePathUtil';

const FIRESTORE_METHODS = new Set(['doc', 'collection']);

export const enforceFirestorePathUtils = createRule<[], MessageIds>({
  name: 'enforce-firestore-path-utils',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce usage of utility functions for Firestore paths',
      recommended: 'error',
    },
    schema: [],
    messages: {
      requirePathUtil: 'Use a utility function (e.g., toUserPath, toCollectionPath) for Firestore paths instead of string literals',
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
        node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string' ||
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
        if (filename.includes('__tests__') || filename.includes('.test.') || filename.includes('.spec.')) {
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

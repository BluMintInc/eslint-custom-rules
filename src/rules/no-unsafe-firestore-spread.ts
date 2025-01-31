import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'unsafeObjectSpread' | 'unsafeArraySpread';

export const noUnsafeFirestoreSpread = createRule<[], MessageIds>({
  name: 'no-unsafe-firestore-spread',
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent unsafe object/array spreads in Firestore updates',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      unsafeObjectSpread: 'Avoid using object spread in Firestore updates. Use dot notation with FieldPath instead.',
      unsafeArraySpread: 'Avoid using array spread in Firestore updates. Use FieldValue.arrayUnion() instead.',
    },
  },
  defaultOptions: [],
  create(context) {
    function isFirestoreSetCall(node: TSESTree.CallExpression): boolean {
      if (node.callee.type !== AST_NODE_TYPES.MemberExpression) return false;
      if (node.callee.property.type !== AST_NODE_TYPES.Identifier) return false;
      return node.callee.property.name === 'set';
    }

    function hasMergeOption(node: TSESTree.CallExpression): boolean {
      if (node.arguments.length < 2) return false;
      const options = node.arguments[1];
      if (options.type !== AST_NODE_TYPES.ObjectExpression) return false;

      return options.properties.some(prop => {
        if (prop.type !== AST_NODE_TYPES.Property) return false;
        if (prop.key.type !== AST_NODE_TYPES.Identifier) return false;
        if (prop.key.name !== 'merge') return false;
        if (prop.value.type !== AST_NODE_TYPES.Literal) return false;
        return prop.value.value === true;
      });
    }

    function checkObjectForSpreads(node: TSESTree.ObjectExpression, parentPath = ''): void {
      for (const property of node.properties) {
        if (property.type === AST_NODE_TYPES.SpreadElement) {
          context.report({
            node: property,
            messageId: 'unsafeObjectSpread',
            fix: null,
          });
        } else if (property.type === AST_NODE_TYPES.Property) {
          const key = property.key.type === AST_NODE_TYPES.Identifier ? property.key.name : '';
          const newPath = parentPath ? `${parentPath}.${key}` : key;

          if (property.value.type === AST_NODE_TYPES.ObjectExpression) {
            checkObjectForSpreads(property.value, newPath);
          } else if (property.value.type === AST_NODE_TYPES.ArrayExpression) {
            checkArrayForSpreads(property.value);
          }
        }
      }
    }

    function checkArrayForSpreads(node: TSESTree.ArrayExpression): void {
      for (const element of node.elements) {
        if (element?.type === AST_NODE_TYPES.SpreadElement) {
          context.report({
            node: element,
            messageId: 'unsafeArraySpread',
            fix: null,
          });
        }
      }
    }

    return {
      CallExpression(node) {
        if (!isFirestoreSetCall(node) || !hasMergeOption(node)) return;

        const [updateArg] = node.arguments;
        if (updateArg.type !== AST_NODE_TYPES.ObjectExpression) return;

        checkObjectForSpreads(updateArg);
      },
    };
  },
});

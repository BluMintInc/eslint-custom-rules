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
      unsafeObjectSpread:
        'Avoid using object spread in Firestore updates. Use dot notation with FieldPath instead.',
      unsafeArraySpread:
        'Avoid using array spread in Firestore updates. Use FieldValue.arrayUnion() instead.',
    },
  },
  defaultOptions: [],
  create(context) {
    function isFirestoreSetMergeCall(node: TSESTree.CallExpression): boolean {
      // Check for merge: true in the last argument
      const lastArg = node.arguments[node.arguments.length - 1];
      if (lastArg?.type === AST_NODE_TYPES.ObjectExpression) {
        const hasMergeTrue = lastArg.properties.some(
          (prop) =>
            prop.type === AST_NODE_TYPES.Property &&
            prop.key.type === AST_NODE_TYPES.Identifier &&
            prop.key.name === 'merge' &&
            prop.value.type === AST_NODE_TYPES.Literal &&
            prop.value.value === true,
        );
        if (!hasMergeTrue) return false;

        // Check if it's a set() method call or setDoc() function call
        if (node.callee.type === AST_NODE_TYPES.MemberExpression) {
          const property = node.callee.property;
          return (
            property.type === AST_NODE_TYPES.Identifier &&
            property.name === 'set'
          );
        } else if (node.callee.type === AST_NODE_TYPES.Identifier) {
          return node.callee.name === 'setDoc';
        }
      }
      return false;
    }

    function checkObjectForSpreads(
      node: TSESTree.ObjectExpression,
      parentPath = '',
    ): void {
      for (const property of node.properties) {
        if (property.type === AST_NODE_TYPES.SpreadElement) {
          context.report({
            node: property,
            messageId: 'unsafeObjectSpread',
            fix: null,
          });
        } else if (property.type === AST_NODE_TYPES.Property) {
          const key =
            property.key.type === AST_NODE_TYPES.Identifier
              ? property.key.name
              : '';
          const newPath = parentPath ? `${parentPath}.${key}` : key;

          if (property.value.type === AST_NODE_TYPES.ObjectExpression) {
            checkObjectForSpreads(property.value, newPath);
          } else if (property.value.type === AST_NODE_TYPES.ArrayExpression) {
            checkArrayForSpreads(property.value);
          } else if (property.value.type === AST_NODE_TYPES.CallExpression) {
            // Handle chained array methods like [...array].filter()
            let current: TSESTree.Node = property.value;
            while (current) {
              if (current.type === AST_NODE_TYPES.ArrayExpression) {
                checkArrayForSpreads(current);
                break;
              } else if (current.type === AST_NODE_TYPES.ObjectExpression) {
                checkObjectForSpreads(current, newPath);
                break;
              }
              // Move up to check the caller if it's a method chain
              if (
                current.type === AST_NODE_TYPES.CallExpression &&
                current.callee.type === AST_NODE_TYPES.MemberExpression
              ) {
                current = current.callee.object;
              } else {
                break;
              }
            }
          }
        }
      }
    }

    function checkArrayForSpreads(node: TSESTree.ArrayExpression): void {
      // Check for spreads in the array expression itself
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
        if (!isFirestoreSetMergeCall(node)) return;

        // For set() calls, the update object can be either the first or second argument
        // If it's a docRef.set(data) call, it's the first argument
        // If it's a docRef.set(docRef, data) call (like in transactions/batches), it's the second argument
        let updateArg: TSESTree.Node | undefined;

        if (node.arguments.length === 2) {
          updateArg = node.arguments[0];
        } else if (node.arguments.length === 3) {
          // In a transaction or batch operation, the data is the second argument
          updateArg = node.arguments[1];
        }

        if (!updateArg || updateArg.type !== AST_NODE_TYPES.ObjectExpression)
          return;

        checkObjectForSpreads(updateArg);
      },
    };
  },
});

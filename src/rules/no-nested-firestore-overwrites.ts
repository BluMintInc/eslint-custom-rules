import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'nestedOverwrite';

// Known Firestore update method that can cause overwrites
const FIRESTORE_UPDATE = 'update';

// Helper to check if node is a Firestore update method call
function isFirestoreUpdateCall(node: TSESTree.CallExpression): boolean {
  if (node.callee.type !== AST_NODE_TYPES.MemberExpression) return false;
  if (node.callee.property.type !== AST_NODE_TYPES.Identifier) return false;
  return node.callee.property.name === FIRESTORE_UPDATE;
}

export const noNestedFirestoreOverwrites = createRule<[], MessageIds>({
  name: 'no-nested-firestore-overwrites',
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent accidental overwrites of nested Firestore objects',
      recommended: 'error',
    },
    schema: [],
    messages: {
      nestedOverwrite: 'Nested object updates in Firestore operations may overwrite existing fields. Ensure all expected fields are included or use dot notation for specific field updates.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        // Check if it's a Firestore update method
        if (!isFirestoreUpdateCall(node)) return;

        // Check the update argument
        const updateArg = node.arguments[0];
        if (!updateArg || updateArg.type !== AST_NODE_TYPES.ObjectExpression) return;

        // Look for nested object assignments
        updateArg.properties.forEach(prop => {
          if (prop.type !== AST_NODE_TYPES.Property) return;
          if (prop.value.type === AST_NODE_TYPES.ObjectExpression) {
            context.report({
              node: prop,
              messageId: 'nestedOverwrite',
            });
          }
        });
      },
    };
  },
});

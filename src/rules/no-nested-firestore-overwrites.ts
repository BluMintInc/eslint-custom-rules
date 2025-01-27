import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'nestedOverwrite';

// Known Firestore update/set methods that can cause overwrites
const FIRESTORE_METHODS = new Set(['update', 'set']);
const DOC_SETTER_METHODS = new Set(['set', 'overwrite', 'setAll', 'overwriteAll']);

// Helper to check if node is a Firestore method call
function isFirestoreMethodCall(node: TSESTree.CallExpression): boolean {
  if (node.callee.type !== AST_NODE_TYPES.MemberExpression) return false;
  if (node.callee.property.type !== AST_NODE_TYPES.Identifier) return false;
  return FIRESTORE_METHODS.has(node.callee.property.name);
}

// Helper to check if node is a DocSetter method call
function isDocSetterMethodCall(node: TSESTree.CallExpression): boolean {
  if (node.callee.type !== AST_NODE_TYPES.MemberExpression) return false;
  if (node.callee.property.type !== AST_NODE_TYPES.Identifier) return false;
  return DOC_SETTER_METHODS.has(node.callee.property.name);
}

// Helper to check if set() call has merge: true option
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

// Helper to check if an object literal has computed properties
function hasComputedProperties(node: TSESTree.ObjectExpression): boolean {
  return node.properties.some(prop =>
    prop.type === AST_NODE_TYPES.Property && prop.computed
  );
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
        // Check if it's a Firestore update/set or DocSetter method
        if (!isFirestoreMethodCall(node) && !isDocSetterMethodCall(node)) return;

        // Skip if it's a set() with merge: true
        if (isFirestoreMethodCall(node) &&
            node.callee.type === AST_NODE_TYPES.MemberExpression &&
            node.callee.property.type === AST_NODE_TYPES.Identifier &&
            node.callee.property.name === 'set' &&
            hasMergeOption(node)) {
          return;
        }

        // Check the update/set argument
        const updateArg = node.arguments[0];
        if (!updateArg || updateArg.type !== AST_NODE_TYPES.ObjectExpression) return;

        // Skip if there are computed properties as we can't statically analyze them
        if (hasComputedProperties(updateArg)) return;

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

import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'nestedOverwrite';

// Known Firestore methods that can cause overwrites
const FIRESTORE_METHODS = new Set(['update', 'set']);

// Known Firestore field value methods that are safe to use
const SAFE_FIELD_VALUES = new Set([
  'serverTimestamp',
  'increment',
  'arrayUnion',
  'arrayRemove',
  'delete',
]);

// Helper to check if node is a Firestore method call that can cause overwrites
function isFirestoreMethodCall(node: TSESTree.CallExpression): boolean {
  if (node.callee.type !== AST_NODE_TYPES.MemberExpression) return false;
  if (node.callee.property.type !== AST_NODE_TYPES.Identifier) return false;

  const methodName = node.callee.property.name;
  if (!FIRESTORE_METHODS.has(methodName)) return false;

  // For set() method, check if merge option is explicitly set to true
  if (methodName === 'set' && node.arguments.length > 1) {
    const mergeOptions = node.arguments[1];
    if (mergeOptions?.type === AST_NODE_TYPES.ObjectExpression) {
      const mergeProperty = mergeOptions.properties.find(
        (prop): prop is TSESTree.Property =>
          prop.type === AST_NODE_TYPES.Property &&
          'name' in prop.key &&
          prop.key.name === 'merge' &&
          prop.value.type === AST_NODE_TYPES.Literal &&
          prop.value.value === true
      );
      if (mergeProperty) return false;
    }
  }

  return true;
}

// Helper to check if node is a DocSetter method call
function isDocSetterMethodCall(node: TSESTree.CallExpression): boolean {
  if (node.callee.type !== AST_NODE_TYPES.MemberExpression) return false;
  if (node.callee.property.type !== AST_NODE_TYPES.Identifier) return false;
  return node.callee.property.name === 'set' || node.callee.property.name === 'overwrite';
}

// Helper to check if node is a safe Firestore field value
function isSafeFieldValue(node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.CallExpression) return false;
  if (node.callee.type !== AST_NODE_TYPES.MemberExpression) return false;
  if (node.callee.object.type !== AST_NODE_TYPES.Identifier) return false;
  if (node.callee.object.name !== 'FieldValue') return false;
  if (node.callee.property.type !== AST_NODE_TYPES.Identifier) return false;
  return SAFE_FIELD_VALUES.has(node.callee.property.name);
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
        // Check if it's a Firestore method or DocSetter method call
        if (!isFirestoreMethodCall(node) && !isDocSetterMethodCall(node)) return;

        // Check the update argument
        const updateArg = node.arguments[0];
        if (!updateArg || updateArg.type !== AST_NODE_TYPES.ObjectExpression) return;

        // Look for nested object assignments
        updateArg.properties.forEach(prop => {
          if (prop.type !== AST_NODE_TYPES.Property) return;
          if (prop.value.type === AST_NODE_TYPES.ObjectExpression) {
            // Skip if the value is a safe Firestore field value
            if (isSafeFieldValue(prop.value)) return;
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

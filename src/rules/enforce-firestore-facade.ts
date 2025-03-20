import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds =
  | 'noDirectGet'
  | 'noDirectSet'
  | 'noDirectUpdate'
  | 'noDirectDelete';

const FIRESTORE_METHODS = new Set(['get', 'set', 'update', 'delete']);

const isMemberExpression = (
  node: TSESTree.Node,
): node is TSESTree.MemberExpression => {
  return node.type === AST_NODE_TYPES.MemberExpression;
};

// Track variables that are assigned realtimeDb references
const realtimeDbRefVariables = new Set<string>();
const realtimeDbChildVariables = new Set<string>();

const isRealtimeDbRefAssignment = (node: TSESTree.Node): boolean => {
  if (node.type !== AST_NODE_TYPES.VariableDeclarator) return false;

  const init = node.init;
  if (!init) return false;

  // Check for direct realtimeDb.ref() assignments
  // e.g., const ref = realtimeDb.ref(path);
  if (init.type === AST_NODE_TYPES.CallExpression &&
      isMemberExpression(init.callee) &&
      isIdentifier(init.callee.property) &&
      init.callee.property.name === 'ref' &&
      isIdentifier(init.callee.object) &&
      (init.callee.object.name === 'realtimeDb' || init.callee.object.name.includes('realtimeDb'))) {

    if (isIdentifier(node.id)) {
      realtimeDbRefVariables.add(node.id.name);
      return true;
    }
  }

  // Check for child() method calls on realtimeDb refs
  // e.g., const childRef = parentRef.child('path');
  if (init.type === AST_NODE_TYPES.CallExpression &&
      isMemberExpression(init.callee) &&
      isIdentifier(init.callee.property) &&
      init.callee.property.name === 'child' &&
      isIdentifier(init.callee.object) &&
      realtimeDbRefVariables.has(init.callee.object.name)) {

    if (isIdentifier(node.id)) {
      realtimeDbChildVariables.add(node.id.name);
      return true;
    }
  }

  return false;
};

const isRealtimeDbReference = (node: TSESTree.Node): boolean => {
  // Check if it's a direct realtimeDb.ref() call
  if (node.type === AST_NODE_TYPES.CallExpression &&
      isMemberExpression(node.callee) &&
      isIdentifier(node.callee.property) &&
      node.callee.property.name === 'ref' &&
      isIdentifier(node.callee.object) &&
      (node.callee.object.name === 'realtimeDb' || node.callee.object.name.includes('realtimeDb'))) {
    return true;
  }

  // Check if it's a variable that holds a realtimeDb reference
  if (isIdentifier(node)) {
    return realtimeDbRefVariables.has(node.name) || realtimeDbChildVariables.has(node.name);
  }

  // Check if it's a child() call on a realtimeDb reference
  if (node.type === AST_NODE_TYPES.CallExpression &&
      isMemberExpression(node.callee) &&
      isIdentifier(node.callee.property) &&
      node.callee.property.name === 'child' &&
      isIdentifier(node.callee.object) &&
      (realtimeDbRefVariables.has(node.callee.object.name) || realtimeDbChildVariables.has(node.callee.object.name))) {
    return true;
  }

  return false;
};

const isFirestoreMethodCall = (node: TSESTree.CallExpression): boolean => {
  if (!isMemberExpression(node.callee)) return false;
  const property = node.callee.property;
  if (!isIdentifier(property) || !FIRESTORE_METHODS.has(property.name)) {
    return false;
  }

  // Check if the method is called on a facade instance
  const object = node.callee.object;
  if (isIdentifier(object)) {
    const name = object.name;
    // Skip if it's a facade instance
    if (
      name.includes('Fetcher') ||
      name.includes('Setter') ||
      name.includes('Tx')
    ) {
      return false;
    }
    // Skip if it's a realtimeDb reference variable
    if (realtimeDbRefVariables.has(name) || realtimeDbChildVariables.has(name)) {
      return false;
    }
    // Check for batch or transaction
    if (/batch|transaction/i.test(name)) {
      return true;
    }
  }

  // Check if the method is called on a realtimeDb reference
  if (isRealtimeDbReference(object)) {
    return false;
  }

  // Handle type assertions (as in the bug report)
  if (object.type === AST_NODE_TYPES.TSAsExpression) {
    return true;
  }

  // Check if it's a Firestore reference
  let current: TSESTree.Node = object;
  let foundDocOrCollection = false;

  while (current) {
    if (isCallExpression(current)) {
      const callee = current.callee;
      if (isMemberExpression(callee)) {
        const property = callee.property;
        if (isIdentifier(property)) {
          // Check for Firestore methods
          if (property.name === 'doc' || property.name === 'collection') {
            foundDocOrCollection = true;
            break;
          }
        }
      }
    }
    if (isMemberExpression(current)) {
      current = current.object;
    } else if (current.type === AST_NODE_TYPES.TSAsExpression) {
      // Handle nested type assertions
      current = (current as TSESTree.TSAsExpression).expression;
    } else {
      break;
    }
  }

  // If we haven't found a doc/collection call yet, check if the object is a variable
  if (!foundDocOrCollection && isIdentifier(object)) {
    const name = object.name;
    // If the variable name contains 'doc' or 'ref', it's likely a Firestore reference
    // But exclude realtimeDb references
    if (
      (name.toLowerCase().includes('doc') || name.toLowerCase().includes('ref')) &&
      !name.includes('realtimeDb') &&
      !realtimeDbRefVariables.has(name) &&
      !realtimeDbChildVariables.has(name)
    ) {
      return true;
    }
  }

  return foundDocOrCollection;
};

const isCallExpression = (
  node: TSESTree.Node,
): node is TSESTree.CallExpression => {
  return node.type === AST_NODE_TYPES.CallExpression;
};

const isIdentifier = (node: TSESTree.Node): node is TSESTree.Identifier => {
  return node.type === AST_NODE_TYPES.Identifier;
};

export const enforceFirestoreFacade = createRule<[], MessageIds>({
  name: 'enforce-firestore-facade',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce usage of Firestore facades instead of direct Firestore methods',
      recommended: 'error',
    },
    schema: [],
    messages: {
      noDirectGet:
        'Use FirestoreFetcher or FirestoreDocFetcher instead of direct .get() calls',
      noDirectSet:
        'Use DocSetter or DocSetterTransaction instead of direct .set() calls',
      noDirectUpdate:
        'Use DocSetter or DocSetterTransaction instead of direct .update() calls',
      noDirectDelete:
        'Use DocSetter or DocSetterTransaction instead of direct .delete() calls',
    },
  },
  defaultOptions: [],
  create(context) {
    // Clear the sets at the beginning of each file analysis
    realtimeDbRefVariables.clear();
    realtimeDbChildVariables.clear();

    return {
      // Track variable declarations that are assigned realtimeDb references
      VariableDeclarator(node) {
        isRealtimeDbRefAssignment(node);
      },

      CallExpression(node) {
        if (!isFirestoreMethodCall(node)) return;

        const callee = node.callee;
        if (!isMemberExpression(callee)) return;
        const property = callee.property;
        if (!isIdentifier(property)) return;

        // Report appropriate error based on method
        switch (property.name) {
          case 'get':
            context.report({
              node,
              messageId: 'noDirectGet',
            });
            break;
          case 'set':
            context.report({
              node,
              messageId: 'noDirectSet',
            });
            break;
          case 'update':
            context.report({
              node,
              messageId: 'noDirectUpdate',
            });
            break;
          case 'delete':
            context.report({
              node,
              messageId: 'noDirectDelete',
            });
            break;
        }
      },
    };
  },
});

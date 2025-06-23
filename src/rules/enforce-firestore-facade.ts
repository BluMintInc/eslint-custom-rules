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
// Track variables that are JavaScript collection objects (Set, Map, WeakSet, WeakMap)
const collectionObjectVariables = new Set<string>();

const COLLECTION_CONSTRUCTORS = new Set(['Set', 'Map', 'WeakSet', 'WeakMap']);

const isCollectionObjectAssignment = (node: TSESTree.Node): boolean => {
  if (node.type !== AST_NODE_TYPES.VariableDeclarator) return false;

  const init = node.init;
  if (!init) return false;

  // Check for direct collection constructor calls
  // e.g., const mySet = new Set<string>(); const myMap = new Map<string, any>();
  if (
    init.type === AST_NODE_TYPES.NewExpression &&
    isIdentifier(init.callee) &&
    COLLECTION_CONSTRUCTORS.has(init.callee.name)
  ) {
    if (isIdentifier(node.id)) {
      collectionObjectVariables.add(node.id.name);
      return true;
    }
  }

  return false;
};

// Track variables that are assigned to DocumentReferences or Firestore objects
const firestoreDocRefVariables = new Set<string>();
const firestoreBatchVariables = new Set<string>();
const firestoreTransactionVariables = new Set<string>();

const isFirestoreAssignment = (node: TSESTree.Node): boolean => {
  if (node.type !== AST_NODE_TYPES.VariableDeclarator) return false;

  const init = node.init;
  if (!init || !isIdentifier(node.id)) return false;

  const varName = node.id.name;

  // Check for Firestore DocumentReference assignments
  // e.g., const docRef = db.collection('users').doc('user123');
  if (isFirestoreDocumentReference(init)) {
    firestoreDocRefVariables.add(varName);
    return true;
  }

  // Check for Firestore batch assignments
  // e.g., const batch = db.batch();
  if (
    init.type === AST_NODE_TYPES.CallExpression &&
    isMemberExpression(init.callee) &&
    isIdentifier(init.callee.property) &&
    init.callee.property.name === 'batch' &&
    isIdentifier(init.callee.object) &&
    init.callee.object.name === 'db'
  ) {
    firestoreBatchVariables.add(varName);
    return true;
  }

  // Check for transaction parameter assignments
  // This is harder to detect statically, but we can check for common patterns
  if (
    init.type === AST_NODE_TYPES.Identifier &&
    (init.name === 'transaction' || init.name.includes('transaction'))
  ) {
    firestoreTransactionVariables.add(varName);
    return true;
  }

  return false;
};

const isFirestoreDocumentReference = (node: TSESTree.Node): boolean => {
  // Check if it's a direct db.collection().doc() call
  if (
    node.type === AST_NODE_TYPES.CallExpression &&
    isMemberExpression(node.callee) &&
    isIdentifier(node.callee.property) &&
    node.callee.property.name === 'doc'
  ) {
    // Check if the object is a collection call
    const object = node.callee.object;
    if (
      object.type === AST_NODE_TYPES.CallExpression &&
      isMemberExpression(object.callee) &&
      isIdentifier(object.callee.property) &&
      object.callee.property.name === 'collection'
    ) {
      return true;
    }
  }

  // Check if it's a type assertion of a DocumentReference
  if (node.type === AST_NODE_TYPES.TSAsExpression) {
    return isFirestoreDocumentReference(node.expression);
  }

  return false;
};

const isRealtimeDbRefAssignment = (node: TSESTree.Node): boolean => {
  if (node.type !== AST_NODE_TYPES.VariableDeclarator) return false;

  const init = node.init;
  if (!init) return false;

  // Check for direct realtimeDb.ref() assignments
  // e.g., const ref = realtimeDb.ref(path);
  if (
    init.type === AST_NODE_TYPES.CallExpression &&
    isMemberExpression(init.callee) &&
    isIdentifier(init.callee.property) &&
    init.callee.property.name === 'ref' &&
    isIdentifier(init.callee.object) &&
    (init.callee.object.name === 'realtimeDb' ||
      init.callee.object.name.includes('realtimeDb'))
  ) {
    if (isIdentifier(node.id)) {
      realtimeDbRefVariables.add(node.id.name);
      return true;
    }
  }

  // Check for child() method calls on realtimeDb refs
  // e.g., const childRef = parentRef.child('path');
  if (
    init.type === AST_NODE_TYPES.CallExpression &&
    isMemberExpression(init.callee) &&
    isIdentifier(init.callee.property) &&
    init.callee.property.name === 'child' &&
    isIdentifier(init.callee.object) &&
    realtimeDbRefVariables.has(init.callee.object.name)
  ) {
    if (isIdentifier(node.id)) {
      realtimeDbChildVariables.add(node.id.name);
      return true;
    }
  }

  return false;
};

const isRealtimeDbReference = (node: TSESTree.Node): boolean => {
  // Check if it's a direct realtimeDb.ref() call
  if (
    node.type === AST_NODE_TYPES.CallExpression &&
    isMemberExpression(node.callee) &&
    isIdentifier(node.callee.property) &&
    node.callee.property.name === 'ref' &&
    isIdentifier(node.callee.object) &&
    (node.callee.object.name === 'realtimeDb' ||
      node.callee.object.name.includes('realtimeDb'))
  ) {
    return true;
  }

  // Check if it's a variable that holds a realtimeDb reference
  if (isIdentifier(node)) {
    return (
      realtimeDbRefVariables.has(node.name) ||
      realtimeDbChildVariables.has(node.name)
    );
  }

  // Check if it's a child() call on a realtimeDb reference
  if (
    node.type === AST_NODE_TYPES.CallExpression &&
    isMemberExpression(node.callee) &&
    isIdentifier(node.callee.property) &&
    node.callee.property.name === 'child' &&
    isIdentifier(node.callee.object) &&
    (realtimeDbRefVariables.has(node.callee.object.name) ||
      realtimeDbChildVariables.has(node.callee.object.name))
  ) {
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

  const object = node.callee.object;

  // Skip if it's a facade instance (based on variable name patterns)
  if (isIdentifier(object)) {
    const name = object.name;
    if (
      name.includes('Fetcher') ||
      name.includes('Setter') ||
      name.includes('Tx')
    ) {
      return false;
    }

    // Skip if it's a realtimeDb reference variable
    if (
      realtimeDbRefVariables.has(name) ||
      realtimeDbChildVariables.has(name)
    ) {
      return false;
    }
    // Skip if it's a JavaScript collection object (Set, Map, WeakSet, WeakMap)
    if (collectionObjectVariables.has(name)) {
      return false;
    }

    // Check if this variable is tracked as a Firestore object
    if (
      firestoreDocRefVariables.has(name) ||
      firestoreBatchVariables.has(name) ||
      firestoreTransactionVariables.has(name)
    ) {
      return true;
    }

    // If it's not tracked as a Firestore object, assume it's a custom wrapper/service
    // and allow it (return false to not flag it)
    // This handles BatchManager and other custom classes
  }

  // Check if the method is called on a realtimeDb reference
  if (isRealtimeDbReference(object)) {
    return false;
  }

  // Check if it's a direct Firestore DocumentReference call
  if (isFirestoreDocumentReference(object)) {
    return true;
  }

  // Handle type assertions
  if (object.type === AST_NODE_TYPES.TSAsExpression) {
    return isFirestoreMethodCall({
      ...node,
      callee: {
        ...node.callee,
        object: object.expression,
      },
    } as TSESTree.CallExpression);
  }

  // Handle member expressions (property access)
  if (isMemberExpression(object)) {
    // Check if the property access leads to a Firestore DocumentReference
    // by traversing the member expression to find the root
    let current: TSESTree.Node = object;
    while (isMemberExpression(current)) {
      if (isFirestoreDocumentReference(current)) {
        return true;
      }
      current = current.object;
    }
    // Check the final object
    if (isFirestoreDocumentReference(current)) {
      return true;
    }
  }

  // Handle array access
  if (
    object.type === AST_NODE_TYPES.MemberExpression &&
    object.computed &&
    object.object.type === AST_NODE_TYPES.Identifier
  ) {
    // For array access like refs[0], we can't easily determine the type
    // but we can check if it's likely a Firestore reference array
    const arrayName = object.object.name;
    if (
      arrayName.toLowerCase().includes('ref') ||
      arrayName.toLowerCase().includes('doc')
    ) {
      return true;
    }
  }

  // Check for direct db.batch() or transaction calls
  if (isIdentifier(object)) {
    const name = object.name;
    // Check for batch or transaction variables that match common patterns
    if (/^(batch|transaction)$/i.test(name)) {
      return true;
    }
  }

  // Check if it's a Firestore reference by traversing the AST
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
      (name.toLowerCase().includes('doc') ||
        name.toLowerCase().includes('ref')) &&
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
    collectionObjectVariables.clear();
    firestoreDocRefVariables.clear();
    firestoreBatchVariables.clear();
    firestoreTransactionVariables.clear();

    return {
      // Track variable declarations that are assigned realtimeDb references, collection objects, or Firestore references
      VariableDeclarator(node) {
        isRealtimeDbRefAssignment(node);
        isCollectionObjectAssignment(node);
        isFirestoreAssignment(node);
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

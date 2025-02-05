import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noDirectGet' | 'noDirectSet' | 'noDirectUpdate' | 'noDirectDelete';

const FIRESTORE_METHODS = new Set(['get', 'set', 'update', 'delete']);

const isFirestoreMethodCall = (node: TSESTree.CallExpression): boolean => {
  if (node.callee.type !== AST_NODE_TYPES.MemberExpression) return false;
  const property = node.callee.property;
  if (property.type !== AST_NODE_TYPES.Identifier || !FIRESTORE_METHODS.has(property.name)) {
    return false;
  }

  // Check if the method is called on a facade instance
  const object = node.callee.object;
  if (object.type === AST_NODE_TYPES.Identifier) {
    const name = object.name;
    if (name.includes('Fetcher') || name.includes('Setter') || name.includes('Tx')) {
      return false;
    }
  }

  return true;
};

const isFirestoreReference = (node: TSESTree.MemberExpression): boolean => {
  const object = node.object;
  if (object.type !== AST_NODE_TYPES.CallExpression) return false;

  const callee = object.callee;
  if (callee.type !== AST_NODE_TYPES.MemberExpression) return false;

  const property = callee.property;
  return (
    property.type === AST_NODE_TYPES.Identifier &&
    (property.name === 'doc' || property.name === 'collection')
  );
};

const isFirestoreBatchOrTransaction = (node: TSESTree.MemberExpression): boolean => {
  const object = node.object;
  if (object.type !== AST_NODE_TYPES.Identifier) return false;

  // Check if variable name contains 'batch' or 'transaction'
  return /batch|transaction/i.test(object.name);
};

export const enforceFirestoreFacade = createRule<[], MessageIds>({
  name: 'enforce-firestore-facade',
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce usage of Firestore facades instead of direct Firestore methods',
      recommended: 'error',
    },
    schema: [],
    messages: {
      noDirectGet: 'Use FirestoreFetcher or FirestoreDocFetcher instead of direct .get() calls',
      noDirectSet: 'Use DocSetter or DocSetterTransaction instead of direct .set() calls',
      noDirectUpdate: 'Use DocSetter or DocSetterTransaction instead of direct .update() calls',
      noDirectDelete: 'Use DocSetter or DocSetterTransaction instead of direct .delete() calls',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        if (!isFirestoreMethodCall(node)) return;

        const callee = node.callee as TSESTree.MemberExpression;
        const methodName = (callee.property as TSESTree.Identifier).name;

        // Skip if the method is called on a valid facade instance
        const objectType = callee.object.type;
        if (
          objectType === AST_NODE_TYPES.MemberExpression &&
          !isFirestoreReference(callee.object as TSESTree.MemberExpression) &&
          !isFirestoreBatchOrTransaction(callee.object as TSESTree.MemberExpression)
        ) {
          return;
        }

        // Report appropriate error based on method
        switch (methodName) {
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

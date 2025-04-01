import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'readsAfterWrites';

// Define the operations that are considered reads and writes
const READ_OPERATIONS = new Set(['get']);
const WRITE_OPERATIONS = new Set(['set', 'update', 'delete']);

export const firestoreTransactionReadsBeforeWrites = createRule<[], MessageIds>({
  name: 'firestore-transaction-reads-before-writes',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce that all Firestore transaction read operations are performed before any write operations',
      recommended: 'error',
    },
    schema: [],
    messages: {
      readsAfterWrites:
        'Firestore transaction read operations must be performed before any write operations. Move this read operation before any write operations.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Track transaction objects and their operations
    const transactionScopes = new Map<
      TSESTree.Node,
      {
        hasWriteOperation: boolean;
        writeNodes: TSESTree.Node[];
      }
    >();

    // Helper to check if a node is a transaction parameter
    function isTransactionParameter(param: TSESTree.Parameter): boolean {
      if (param.type !== AST_NODE_TYPES.Identifier) return false;

      // Check for type annotation
      const typeAnnotation = param.typeAnnotation;
      if (!typeAnnotation || typeAnnotation.type !== AST_NODE_TYPES.TSTypeAnnotation) {
        // If no type annotation, check the parameter name for common patterns
        return /transaction|tx/i.test(param.name);
      }

      const type = typeAnnotation.typeAnnotation;

      // Check for Transaction type
      if (type.type === AST_NODE_TYPES.TSTypeReference) {
        const typeName = type.typeName;

        // Check for FirebaseFirestore.Transaction
        if (typeName.type === AST_NODE_TYPES.TSQualifiedName) {
          return (
            typeName.left.type === AST_NODE_TYPES.Identifier &&
            typeName.left.name === 'FirebaseFirestore' &&
            typeName.right.type === AST_NODE_TYPES.Identifier &&
            typeName.right.name === 'Transaction'
          );
        }

        // Check for Transaction or FirestoreTransaction
        if (typeName.type === AST_NODE_TYPES.Identifier) {
          return /Transaction/i.test(typeName.name);
        }
      }

      return false;
    }

    // Helper to find the transaction scope for a node
    function findTransactionScope(node: TSESTree.Node): TSESTree.Node | null {
      let current: TSESTree.Node | undefined = node;
      while (current) {
        // Check if this node is a transaction scope
        if (transactionScopes.has(current)) {
          return current;
        }

        // Check if this is a function with a transaction parameter
        if (
          current.type === AST_NODE_TYPES.FunctionDeclaration ||
          current.type === AST_NODE_TYPES.FunctionExpression ||
          current.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          const params = current.params;
          if (params.some(isTransactionParameter)) {
            // If this function has a transaction parameter, track it
            if (!transactionScopes.has(current.body)) {
              transactionScopes.set(current.body, {
                hasWriteOperation: false,
                writeNodes: [],
              });
            }
            return current.body;
          }
        }

        current = current.parent;
      }

      return null;
    }

    // Helper to check if a node is a transaction method call
    function isTransactionMethodCall(
      node: TSESTree.CallExpression
    ): { isRead: boolean; isWrite: boolean } {
      const callee = node.callee;
      if (callee.type !== AST_NODE_TYPES.MemberExpression) {
        return { isRead: false, isWrite: false };
      }

      const object = callee.object;
      const property = callee.property;

      // Check if the object is a transaction
      if (
        object.type !== AST_NODE_TYPES.Identifier ||
        !/transaction|tx/i.test(object.name)
      ) {
        return { isRead: false, isWrite: false };
      }

      // Check if the property is a read or write operation
      if (property.type !== AST_NODE_TYPES.Identifier) {
        return { isRead: false, isWrite: false };
      }

      const methodName = property.name;
      const isRead = READ_OPERATIONS.has(methodName);
      const isWrite = WRITE_OPERATIONS.has(methodName);

      return { isRead, isWrite };
    }

    return {
      // Track transaction scopes from runTransaction calls
      'CallExpression[callee.property.name="runTransaction"]'(
        node: TSESTree.CallExpression
      ) {
        const callback = node.arguments[0];
        if (
          callback &&
          (callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            callback.type === AST_NODE_TYPES.FunctionExpression)
        ) {
          transactionScopes.set(callback.body, {
            hasWriteOperation: false,
            writeNodes: [],
          });
        }
      },

      // Clean up transaction scopes when exiting runTransaction calls
      'CallExpression[callee.property.name="runTransaction"]:exit'(
        node: TSESTree.CallExpression
      ) {
        const callback = node.arguments[0];
        if (
          callback &&
          (callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            callback.type === AST_NODE_TYPES.FunctionExpression)
        ) {
          transactionScopes.delete(callback.body);
        }
      },

      // Check all call expressions for transaction operations
      CallExpression(node) {
        const { isRead, isWrite } = isTransactionMethodCall(node);

        if (!isRead && !isWrite) {
          return;
        }

        const transactionScope = findTransactionScope(node);
        if (!transactionScope) {
          return;
        }

        const scopeInfo = transactionScopes.get(transactionScope);
        if (!scopeInfo) {
          return;
        }

        // If it's a write operation, mark the scope as having a write
        if (isWrite) {
          scopeInfo.hasWriteOperation = true;
          scopeInfo.writeNodes.push(node);
        }

        // If it's a read operation and the scope already has a write, report an error
        if (isRead && scopeInfo.hasWriteOperation) {
          context.report({
            node,
            messageId: 'readsAfterWrites',
          });
        }
      },
    };
  },
});

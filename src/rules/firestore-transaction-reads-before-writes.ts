import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import type { TSESLint } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'readsAfterWrites';

// Define the operations that are considered reads and writes
const READ_OPERATIONS = new Set(['get']);
const WRITE_OPERATIONS = new Set(['set', 'update', 'delete']);

export const firestoreTransactionReadsBeforeWrites: TSESLint.RuleModule<
  MessageIds,
  [],
  TSESLint.RuleListener
> = createRule<[], MessageIds>({
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
        'Transaction read "{{method}}" runs after a write in this transaction. Reads must execute before writes so the transaction sees consistent data; move this read before any writes in the callback.',
    },
  },
  defaultOptions: [],
  create(context) {
      // Track transaction objects and their operations
      const transactionScopes = new Map<
        TSESTree.Node,
        {
          hasWriteOperation: boolean;
          transactionVariables: Set<string>; // Track variable names that reference the transaction
        }
      >();

    function isRunTransactionCallback(
      fn:
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression
        | TSESTree.FunctionDeclaration,
    ): boolean {
      const parent = fn.parent;
      if (!parent || parent.type !== AST_NODE_TYPES.CallExpression) {
        return false;
      }

      const callee = parent.callee;
      if (
        callee.type === AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.property.type === AST_NODE_TYPES.Identifier &&
        callee.property.name === 'runTransaction'
      ) {
        return parent.arguments[0] === fn;
      }

      if (
        callee.type === AST_NODE_TYPES.Identifier &&
        callee.name === 'runTransaction'
      ) {
        return parent.arguments[1] === fn;
      }

      return false;
    }

    // Helper to check if a node is a transaction parameter
    function isTransactionParameter(
      param: TSESTree.Parameter,
      options: { allowUntypedT?: boolean } = {},
    ): boolean {
      if (param.type !== AST_NODE_TYPES.Identifier) return false;

      const allowUntypedT = options.allowUntypedT ?? false;
      const typeAnnotation = param.typeAnnotation;

      if (
        typeAnnotation &&
        typeAnnotation.type === AST_NODE_TYPES.TSTypeAnnotation
      ) {
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

        // Typed parameters fall back to name heuristics including bare "t"
        return /^(transaction|tx|t)$/i.test(param.name);
      }

      const namePattern = allowUntypedT
        ? /^(transaction|tx|t)$/i
        : /^(transaction|tx)$/i;

      return namePattern.test(param.name);
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
            const allowUntypedT = isRunTransactionCallback(current);
            const params = current.params;
            if (
              params.some((param) =>
                isTransactionParameter(param, { allowUntypedT }),
              )
            ) {
              // If this function has a transaction parameter, track it
              if (!transactionScopes.has(current.body)) {
                const transactionParam = params.find((param) =>
                  isTransactionParameter(param, { allowUntypedT }),
                );
                const transactionVariables = new Set<string>();
                if (
                  transactionParam &&
                  transactionParam.type === AST_NODE_TYPES.Identifier
                ) {
                  transactionVariables.add(transactionParam.name);
                }
                transactionScopes.set(current.body, {
                  hasWriteOperation: false,
                  transactionVariables,
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
        node: TSESTree.CallExpression,
        transactionScope?: TSESTree.Node | null,
      ): { isRead: boolean; isWrite: boolean; methodName: string | null } {
        const callee = node.callee;
        if (callee.type !== AST_NODE_TYPES.MemberExpression) {
          return { isRead: false, isWrite: false, methodName: null };
        }

        const object = callee.object;
        const property = callee.property;

        // Check if the object is a transaction
        if (object.type !== AST_NODE_TYPES.Identifier) {
          return { isRead: false, isWrite: false, methodName: null };
        }

        // If we have a transaction scope, check if the object name is a known transaction variable
        if (transactionScope) {
          const scopeInfo = transactionScopes.get(transactionScope);
          if (scopeInfo && !scopeInfo.transactionVariables.has(object.name)) {
            return { isRead: false, isWrite: false, methodName: null };
          }
        } else {
          // Fallback to general pattern matching
          if (!/^(transaction|tx|t)$/i.test(object.name)) {
            return { isRead: false, isWrite: false, methodName: null };
          }
        }

        let methodName: string | null = null;

        // Check if the property is a read or write operation
        if (property.type === AST_NODE_TYPES.Identifier && !callee.computed) {
          // Normal property access: transaction.get()
          methodName = property.name;
        } else if (
          callee.computed &&
          property.type === AST_NODE_TYPES.Literal &&
          typeof property.value === 'string'
        ) {
          // Computed property access with string literal: transaction['get']
          methodName = property.value;
        } else if (
          callee.computed &&
          property.type === AST_NODE_TYPES.Identifier
        ) {
          // Computed property access with variable: transaction[methodName]
          // This is tricky to analyze statically. For now, we'll be conservative
          // and assume it could be any method. We'll handle this in the caller.
          return { isRead: true, isWrite: true, methodName: null }; // Could be either - let caller decide
        }

        if (!methodName) {
          return { isRead: false, isWrite: false, methodName: null };
        }

        const isRead = READ_OPERATIONS.has(methodName);
        const isWrite = WRITE_OPERATIONS.has(methodName);

        return { isRead, isWrite, methodName };
      }

      return {
        // Track transaction scopes from runTransaction calls
        'CallExpression[callee.property.name="runTransaction"]'(
          node: TSESTree.CallExpression,
        ) {
          const callback = node.arguments[0];
          if (
            callback &&
            (callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
              callback.type === AST_NODE_TYPES.FunctionExpression)
          ) {
            const transactionParam = callback.params.find((param) =>
              isTransactionParameter(param, { allowUntypedT: true }),
            );
            const transactionVariables = new Set<string>();
            if (
              transactionParam &&
              transactionParam.type === AST_NODE_TYPES.Identifier
            ) {
              transactionVariables.add(transactionParam.name);
            }
            transactionScopes.set(callback.body, {
              hasWriteOperation: false,
              transactionVariables,
            });
          }
        },

        // Clean up transaction scopes when exiting runTransaction calls
        'CallExpression[callee.property.name="runTransaction"]:exit'(
          node: TSESTree.CallExpression,
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

        // Track variable assignments that reference the transaction
        VariableDeclarator(node) {
          if (
            node.id.type === AST_NODE_TYPES.Identifier &&
            node.init &&
            node.init.type === AST_NODE_TYPES.Identifier
          ) {
            const transactionScope = findTransactionScope(node);
            if (transactionScope) {
              const scopeInfo = transactionScopes.get(transactionScope);
              if (
                scopeInfo &&
                scopeInfo.transactionVariables.has(node.init.name)
              ) {
                scopeInfo.transactionVariables.add(node.id.name);
              }
            }
          }
        },

        // Check all call expressions for transaction operations
        CallExpression(node) {
          const transactionScope = findTransactionScope(node);
          const { isRead, isWrite, methodName } = isTransactionMethodCall(
            node,
            transactionScope,
          );

          if (!isRead && !isWrite) {
            return;
          }

          if (!transactionScope) {
            return;
          }

          const scopeInfo = transactionScopes.get(transactionScope);
          if (!scopeInfo) {
            return;
          }

          const methodLabel = methodName ?? 'read operation';

          // Handle computed property access specially
          if (isRead && isWrite) {
            // This is a computed property access - we need to be more careful
            // Only flag as a read if we already have writes in this scope
            if (scopeInfo.hasWriteOperation) {
              context.report({
                node,
                messageId: 'readsAfterWrites',
                data: { method: methodLabel },
              });
            }
            // Don't mark as write since we don't know what method it is
            return;
          }

          // If it's a write operation, mark the scope as having a write
          if (isWrite) {
            scopeInfo.hasWriteOperation = true;
          }

          // If it's a read operation and the scope already has a write, report an error
          if (isRead && scopeInfo.hasWriteOperation) {
            context.report({
              node,
              messageId: 'readsAfterWrites',
              data: { method: methodLabel },
            });
          }
        },
      };
    },
  },
);

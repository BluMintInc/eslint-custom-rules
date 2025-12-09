import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'readsAfterWrites';

// Define the operations that are considered reads and writes
const READ_OPERATIONS = new Set(['get']);
const WRITE_OPERATIONS = new Set(['set', 'update', 'delete']);

export const firestoreTransactionReadsBeforeWrites = createRule<[], MessageIds>(
  {
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
          'Read operation "{{readMethod}}" runs after transaction writes ({{writeMethods}}). Firestore transactions must collect every read before any write to keep a consistent snapshot and avoid Firestore retries that reapply writes with stale data. Move this read before the first write in the same transaction callback.',
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
          transactionVariables: Set<string>; // Track variable names that reference the transaction
        }
      >();

      // Helper to check if a node is a transaction parameter
      function isTransactionParameter(param: TSESTree.Parameter): boolean {
        if (param.type !== AST_NODE_TYPES.Identifier) return false;

        // Check for type annotation
        const typeAnnotation = param.typeAnnotation;
        if (
          !typeAnnotation ||
          typeAnnotation.type !== AST_NODE_TYPES.TSTypeAnnotation
        ) {
          // If no type annotation, check the parameter name for common patterns
          // Include 't' as a valid transaction parameter name
          return /^(transaction|tx|t)$/i.test(param.name);
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
                const transactionParam = params.find(isTransactionParameter);
                const transactionVariables = new Set<string>();
                if (
                  transactionParam &&
                  transactionParam.type === AST_NODE_TYPES.Identifier
                ) {
                  transactionVariables.add(transactionParam.name);
                }
                transactionScopes.set(current.body, {
                  hasWriteOperation: false,
                  writeNodes: [],
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
      ): { isRead: boolean; isWrite: boolean } {
        const callee = node.callee;
        if (callee.type !== AST_NODE_TYPES.MemberExpression) {
          return { isRead: false, isWrite: false };
        }

        const object = callee.object;
        const property = callee.property;

        // Check if the object is a transaction
        if (object.type !== AST_NODE_TYPES.Identifier) {
          return { isRead: false, isWrite: false };
        }

        // If we have a transaction scope, check if the object name is a known transaction variable
        if (transactionScope) {
          const scopeInfo = transactionScopes.get(transactionScope);
          if (scopeInfo && !scopeInfo.transactionVariables.has(object.name)) {
            return { isRead: false, isWrite: false };
          }
        } else {
          // Fallback to general pattern matching
          if (!/^(transaction|tx|t)$/i.test(object.name)) {
            return { isRead: false, isWrite: false };
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
          return { isRead: true, isWrite: true }; // Could be either - let caller decide
        }

        if (!methodName) {
          return { isRead: false, isWrite: false };
        }

        const isRead = READ_OPERATIONS.has(methodName);
        const isWrite = WRITE_OPERATIONS.has(methodName);

        return { isRead, isWrite };
      }

      function formatMethodName(callExpression: TSESTree.CallExpression): string {
        const callee = callExpression.callee;
        if (callee.type !== AST_NODE_TYPES.MemberExpression) {
          return 'this transaction read';
        }

        const objectName =
          callee.object.type === AST_NODE_TYPES.Identifier
            ? callee.object.name
            : 'transaction';

        if (callee.computed) {
          if (callee.property.type === AST_NODE_TYPES.Literal) {
            return `${objectName}[${String(callee.property.value)}]`;
          }
          if (callee.property.type === AST_NODE_TYPES.Identifier) {
            return `${objectName}[${callee.property.name}]`;
          }
          return `${objectName}[computed]`;
        }

        if (callee.property.type === AST_NODE_TYPES.Identifier) {
          return `${objectName}.${callee.property.name}`;
        }

        return `${objectName}.[unknown]`;
      }

      function formatWriteMethods(writeNodes: TSESTree.Node[]): string {
        const methodNames = writeNodes
          .map((node) =>
            node.type === AST_NODE_TYPES.CallExpression
              ? formatMethodName(node)
              : null,
          )
          .filter((name): name is string => Boolean(name));

        if (!methodNames.length) {
          return 'earlier transaction writes';
        }

        const uniqueNames = [...new Set(methodNames)];
        if (uniqueNames.length === 1) {
          return uniqueNames[0];
        }

        if (uniqueNames.length === 2) {
          return `${uniqueNames[0]} and ${uniqueNames[1]}`;
        }

        return `${uniqueNames
          .slice(0, uniqueNames.length - 1)
          .join(', ')} and ${uniqueNames[uniqueNames.length - 1]}`;
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
            const transactionParam = callback.params.find(
              isTransactionParameter,
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
              writeNodes: [],
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
          const { isRead, isWrite } = isTransactionMethodCall(
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

          // Handle computed property access specially
          if (isRead && isWrite) {
            // This is a computed property access - we need to be more careful
            // Only flag as a read if we already have writes in this scope
            if (scopeInfo.hasWriteOperation) {
              const readMethod = formatMethodName(node);
              const writeMethods = formatWriteMethods(scopeInfo.writeNodes);
              context.report({
                node,
                messageId: 'readsAfterWrites',
                data: {
                  readMethod,
                  writeMethods,
                },
              });
            }
            // Don't mark as write since we don't know what method it is
            return;
          }

          // If it's a write operation, mark the scope as having a write
          if (isWrite) {
            scopeInfo.hasWriteOperation = true;
            scopeInfo.writeNodes.push(node);
          }

          // If it's a read operation and the scope already has a write, report an error
          if (isRead && scopeInfo.hasWriteOperation) {
            const readMethod = formatMethodName(node);
            const writeMethods = formatWriteMethods(scopeInfo.writeNodes);
            context.report({
              node,
              messageId: 'readsAfterWrites',
              data: {
                readMethod,
                writeMethods,
              },
            });
          }
        },
      };
    },
  },
);

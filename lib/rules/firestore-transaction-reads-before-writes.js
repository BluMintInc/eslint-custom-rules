"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.firestoreTransactionReadsBeforeWrites = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
// Define the operations that are considered reads and writes
const READ_OPERATIONS = new Set(['get']);
const WRITE_OPERATIONS = new Set(['set', 'update', 'delete']);
exports.firestoreTransactionReadsBeforeWrites = (0, createRule_1.createRule)({
    name: 'firestore-transaction-reads-before-writes',
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce that all Firestore transaction read operations are performed before any write operations',
            recommended: 'error',
        },
        schema: [],
        messages: {
            readsAfterWrites: 'Transaction read "{{method}}" runs after a write in this transaction. Reads must execute before writes so the transaction sees consistent data; move this read before any writes in the callback.',
        },
    },
    defaultOptions: [],
    create(context) {
        // Track transaction objects and their operations
        const transactionScopes = new Map();
        // Helper to check if a node is a transaction parameter
        function isTransactionParameter(param) {
            if (param.type !== utils_1.AST_NODE_TYPES.Identifier)
                return false;
            // Check for type annotation
            const typeAnnotation = param.typeAnnotation;
            if (!typeAnnotation ||
                typeAnnotation.type !== utils_1.AST_NODE_TYPES.TSTypeAnnotation) {
                // If no type annotation, check the parameter name for common patterns
                // Include 't' as a valid transaction parameter name
                return /^(transaction|tx|t)$/i.test(param.name);
            }
            const type = typeAnnotation.typeAnnotation;
            // Check for Transaction type
            if (type.type === utils_1.AST_NODE_TYPES.TSTypeReference) {
                const typeName = type.typeName;
                // Check for FirebaseFirestore.Transaction
                if (typeName.type === utils_1.AST_NODE_TYPES.TSQualifiedName) {
                    return (typeName.left.type === utils_1.AST_NODE_TYPES.Identifier &&
                        typeName.left.name === 'FirebaseFirestore' &&
                        typeName.right.type === utils_1.AST_NODE_TYPES.Identifier &&
                        typeName.right.name === 'Transaction');
                }
                // Check for Transaction or FirestoreTransaction
                if (typeName.type === utils_1.AST_NODE_TYPES.Identifier) {
                    return /Transaction/i.test(typeName.name);
                }
            }
            return false;
        }
        // Helper to find the transaction scope for a node
        function findTransactionScope(node) {
            let current = node;
            while (current) {
                // Check if this node is a transaction scope
                if (transactionScopes.has(current)) {
                    return current;
                }
                // Check if this is a function with a transaction parameter
                if (current.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
                    current.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                    current.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
                    const params = current.params;
                    if (params.some(isTransactionParameter)) {
                        // If this function has a transaction parameter, track it
                        if (!transactionScopes.has(current.body)) {
                            const transactionParam = params.find(isTransactionParameter);
                            const transactionVariables = new Set();
                            if (transactionParam &&
                                transactionParam.type === utils_1.AST_NODE_TYPES.Identifier) {
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
        function isTransactionMethodCall(node, transactionScope) {
            const callee = node.callee;
            if (callee.type !== utils_1.AST_NODE_TYPES.MemberExpression) {
                return { isRead: false, isWrite: false, methodName: null };
            }
            const object = callee.object;
            const property = callee.property;
            // Check if the object is a transaction
            if (object.type !== utils_1.AST_NODE_TYPES.Identifier) {
                return { isRead: false, isWrite: false, methodName: null };
            }
            // If we have a transaction scope, check if the object name is a known transaction variable
            if (transactionScope) {
                const scopeInfo = transactionScopes.get(transactionScope);
                if (scopeInfo && !scopeInfo.transactionVariables.has(object.name)) {
                    return { isRead: false, isWrite: false, methodName: null };
                }
            }
            else {
                // Fallback to general pattern matching
                if (!/^(transaction|tx|t)$/i.test(object.name)) {
                    return { isRead: false, isWrite: false, methodName: null };
                }
            }
            let methodName = null;
            // Check if the property is a read or write operation
            if (property.type === utils_1.AST_NODE_TYPES.Identifier && !callee.computed) {
                // Normal property access: transaction.get()
                methodName = property.name;
            }
            else if (callee.computed &&
                property.type === utils_1.AST_NODE_TYPES.Literal &&
                typeof property.value === 'string') {
                // Computed property access with string literal: transaction['get']
                methodName = property.value;
            }
            else if (callee.computed &&
                property.type === utils_1.AST_NODE_TYPES.Identifier) {
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
            'CallExpression[callee.property.name="runTransaction"]'(node) {
                const callback = node.arguments[0];
                if (callback &&
                    (callback.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                        callback.type === utils_1.AST_NODE_TYPES.FunctionExpression)) {
                    const transactionParam = callback.params.find(isTransactionParameter);
                    const transactionVariables = new Set();
                    if (transactionParam &&
                        transactionParam.type === utils_1.AST_NODE_TYPES.Identifier) {
                        transactionVariables.add(transactionParam.name);
                    }
                    transactionScopes.set(callback.body, {
                        hasWriteOperation: false,
                        transactionVariables,
                    });
                }
            },
            // Clean up transaction scopes when exiting runTransaction calls
            'CallExpression[callee.property.name="runTransaction"]:exit'(node) {
                const callback = node.arguments[0];
                if (callback &&
                    (callback.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                        callback.type === utils_1.AST_NODE_TYPES.FunctionExpression)) {
                    transactionScopes.delete(callback.body);
                }
            },
            // Track variable assignments that reference the transaction
            VariableDeclarator(node) {
                if (node.id.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.init &&
                    node.init.type === utils_1.AST_NODE_TYPES.Identifier) {
                    const transactionScope = findTransactionScope(node);
                    if (transactionScope) {
                        const scopeInfo = transactionScopes.get(transactionScope);
                        if (scopeInfo &&
                            scopeInfo.transactionVariables.has(node.init.name)) {
                            scopeInfo.transactionVariables.add(node.id.name);
                        }
                    }
                }
            },
            // Check all call expressions for transaction operations
            CallExpression(node) {
                const transactionScope = findTransactionScope(node);
                const { isRead, isWrite, methodName } = isTransactionMethodCall(node, transactionScope);
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
});
//# sourceMappingURL=firestore-transaction-reads-before-writes.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noMixedFirestoreTransactions = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const NON_TRANSACTIONAL_CLASSES = new Set([
    'DocSetter',
    'FirestoreDocFetcher',
    'FirestoreFetcher',
]);
exports.noMixedFirestoreTransactions = (0, createRule_1.createRule)({
    name: 'no-mixed-firestore-transactions',
    meta: {
        type: 'problem',
        docs: {
            description: 'Prevent mixing transactional and non-transactional Firestore operations within a transaction',
            recommended: 'error',
        },
        schema: [],
        messages: {
            noMixedTransactions: 'Do not use non-transactional Firestore operations ({{ className }}) inside a transaction. Use {{ transactionalClass }} instead.',
        },
    },
    defaultOptions: [],
    create(context) {
        const transactionScopes = new Set();
        function getTransactionalClassName(className) {
            if (className === 'DocSetter')
                return 'DocSetterTransaction';
            if (className === 'FirestoreDocFetcher')
                return 'FirestoreDocFetcherTransaction';
            if (className === 'FirestoreFetcher')
                return 'FirestoreFetcherTransaction';
            return className;
        }
        function isFirestoreTransaction(node) {
            const callee = node.callee;
            if (callee.type !== utils_1.AST_NODE_TYPES.MemberExpression)
                return false;
            const property = callee.property;
            return property.type === utils_1.AST_NODE_TYPES.Identifier && property.name === 'runTransaction';
        }
        function isNonTransactionalClass(node) {
            const callee = node.callee;
            if (callee.type !== utils_1.AST_NODE_TYPES.Identifier)
                return false;
            return NON_TRANSACTIONAL_CLASSES.has(callee.name);
        }
        function isTransactionParameter(param) {
            if (param.type !== utils_1.AST_NODE_TYPES.Identifier)
                return false;
            const typeAnnotation = param.typeAnnotation;
            if (!typeAnnotation || typeAnnotation.type !== utils_1.AST_NODE_TYPES.TSTypeAnnotation)
                return false;
            const type = typeAnnotation.typeAnnotation;
            if (type.type !== utils_1.AST_NODE_TYPES.TSTypeReference)
                return false;
            const typeName = type.typeName;
            if (typeName.type !== utils_1.AST_NODE_TYPES.TSQualifiedName)
                return false;
            return typeName.left.type === utils_1.AST_NODE_TYPES.Identifier && typeName.left.name === 'FirebaseFirestore' &&
                typeName.right.type === utils_1.AST_NODE_TYPES.Identifier && typeName.right.name === 'Transaction';
        }
        function isInTransactionScope(node) {
            let current = node;
            while (current) {
                if (transactionScopes.has(current)) {
                    return true;
                }
                if (current.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
                    current.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                    current.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
                    const params = current.params;
                    if (params.some(isTransactionParameter)) {
                        return true;
                    }
                }
                current = current.parent;
            }
            return false;
        }
        return {
            'CallExpression[callee.property.name="runTransaction"]'(node) {
                if (!isFirestoreTransaction(node))
                    return;
                const callback = node.arguments[0];
                if (callback.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                    callback.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
                    transactionScopes.add(callback.body);
                }
            },
            'CallExpression[callee.property.name="runTransaction"]:exit'(node) {
                const callback = node.arguments[0];
                if (callback.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                    callback.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
                    transactionScopes.delete(callback.body);
                }
            },
            NewExpression(node) {
                if (!isInTransactionScope(node) || !isNonTransactionalClass(node))
                    return;
                const className = node.callee.name;
                context.report({
                    node,
                    messageId: 'noMixedTransactions',
                    data: {
                        className,
                        transactionalClass: getTransactionalClassName(className),
                    },
                });
            },
        };
    },
});
//# sourceMappingURL=no-mixed-firestore-transactions.js.map
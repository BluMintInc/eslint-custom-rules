"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noUnsafeFirestoreSpread = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const pathLabel = (path) => path || 'the merge payload';
exports.noUnsafeFirestoreSpread = (0, createRule_1.createRule)({
    name: 'no-unsafe-firestore-spread',
    meta: {
        type: 'problem',
        docs: {
            description: 'Prevent unsafe object/array spreads in Firestore updates',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            unsafeObjectSpread: 'Firestore merge update spreads an object at "{{path}}" and rewrites that entire field. Spreading bypasses Firestore field-path merges and can drop sibling data. Update specific fields with dot notation or FieldPath instead.',
            unsafeArraySpread: 'Firestore merge update spreads an array at "{{path}}" and writes a full array value. This bypasses arrayUnion/arrayRemove semantics and can lose concurrent changes. Use FieldValue.arrayUnion/arrayRemove (or the Web SDK equivalents) to add or remove items safely.',
        },
    },
    defaultOptions: [],
    create(context) {
        function isFirestoreSetMergeCall(node) {
            // Check for merge: true in the last argument
            const lastArg = node.arguments[node.arguments.length - 1];
            if (lastArg?.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                const hasMergeTrue = lastArg.properties.some((prop) => prop.type === utils_1.AST_NODE_TYPES.Property &&
                    prop.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                    prop.key.name === 'merge' &&
                    prop.value.type === utils_1.AST_NODE_TYPES.Literal &&
                    prop.value.value === true);
                if (!hasMergeTrue)
                    return false;
                // Check if it's a set() method call or setDoc() function call
                if (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                    const property = node.callee.property;
                    return (property.type === utils_1.AST_NODE_TYPES.Identifier &&
                        property.name === 'set');
                }
                else if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier) {
                    return node.callee.name === 'setDoc';
                }
            }
            return false;
        }
        function checkObjectForSpreads(node, parentPath = '') {
            for (const property of node.properties) {
                if (property.type === utils_1.AST_NODE_TYPES.SpreadElement) {
                    context.report({
                        node: property,
                        messageId: 'unsafeObjectSpread',
                        data: { path: pathLabel(parentPath) },
                        fix: null,
                    });
                }
                else if (property.type === utils_1.AST_NODE_TYPES.Property) {
                    const key = property.key.type === utils_1.AST_NODE_TYPES.Identifier
                        ? property.key.name
                        : '';
                    const newPath = parentPath ? `${parentPath}.${key}` : key;
                    if (property.value.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                        checkObjectForSpreads(property.value, newPath);
                    }
                    else if (property.value.type === utils_1.AST_NODE_TYPES.ArrayExpression) {
                        checkArrayForSpreads(property.value, newPath);
                    }
                    else if (property.value.type === utils_1.AST_NODE_TYPES.CallExpression) {
                        // Handle chained array methods like [...array].filter()
                        let current = property.value;
                        while (current) {
                            if (current.type === utils_1.AST_NODE_TYPES.ArrayExpression) {
                                checkArrayForSpreads(current, newPath);
                                break;
                            }
                            else if (current.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                                checkObjectForSpreads(current, newPath);
                                break;
                            }
                            // Move up to check the caller if it's a method chain
                            if (current.type === utils_1.AST_NODE_TYPES.CallExpression &&
                                current.callee.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                                current = current.callee.object;
                            }
                            else {
                                break;
                            }
                        }
                    }
                }
            }
        }
        function checkArrayForSpreads(node, parentPath = '') {
            // Check for spreads in the array expression itself
            for (const element of node.elements) {
                if (element?.type === utils_1.AST_NODE_TYPES.SpreadElement) {
                    context.report({
                        node: element,
                        messageId: 'unsafeArraySpread',
                        data: { path: pathLabel(parentPath) },
                        fix: null,
                    });
                }
            }
        }
        return {
            CallExpression(node) {
                if (!isFirestoreSetMergeCall(node))
                    return;
                // For set() calls, the update object can be either the first or second argument
                // If it's a docRef.set(data) call, it's the first argument
                // If it's a docRef.set(docRef, data) call (like in transactions/batches), it's the second argument
                let updateArg;
                if (node.arguments.length === 2) {
                    updateArg = node.arguments[0];
                }
                else if (node.arguments.length === 3) {
                    // In a transaction or batch operation, the data is the second argument
                    updateArg = node.arguments[1];
                }
                if (!updateArg || updateArg.type !== utils_1.AST_NODE_TYPES.ObjectExpression)
                    return;
                checkObjectForSpreads(updateArg);
            },
        };
    },
});
//# sourceMappingURL=no-unsafe-firestore-spread.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceFirestoreFacade = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const FIRESTORE_METHODS = new Set(['get', 'set', 'update', 'delete']);
const isMemberExpression = (node) => {
    return node.type === utils_1.AST_NODE_TYPES.MemberExpression;
};
const isFirestoreMethodCall = (node) => {
    if (!isMemberExpression(node.callee))
        return false;
    const property = node.callee.property;
    if (!isIdentifier(property) || !FIRESTORE_METHODS.has(property.name)) {
        return false;
    }
    // Check if the method is called on a facade instance
    const object = node.callee.object;
    if (isIdentifier(object)) {
        const name = object.name;
        // Skip if it's a facade instance
        if (name.includes('Fetcher') || name.includes('Setter') || name.includes('Tx')) {
            return false;
        }
        // Check for batch or transaction
        if (/batch|transaction/i.test(name)) {
            return true;
        }
    }
    // Check if it's a Firestore reference
    let current = object;
    let foundDocOrCollection = false;
    while (current) {
        if (isCallExpression(current)) {
            const callee = current.callee;
            if (isMemberExpression(callee)) {
                const property = callee.property;
                if (isIdentifier(property) && (property.name === 'doc' || property.name === 'collection')) {
                    foundDocOrCollection = true;
                    break;
                }
            }
        }
        if (isMemberExpression(current)) {
            current = current.object;
        }
        else {
            break;
        }
    }
    // If we haven't found a doc/collection call yet, check if the object is a variable
    if (!foundDocOrCollection && isIdentifier(object)) {
        const name = object.name;
        // If the variable name contains 'doc' or 'ref', it's likely a Firestore reference
        if (name.toLowerCase().includes('doc') || name.toLowerCase().includes('ref')) {
            return true;
        }
    }
    return foundDocOrCollection;
};
const isCallExpression = (node) => {
    return node.type === utils_1.AST_NODE_TYPES.CallExpression;
};
const isIdentifier = (node) => {
    return node.type === utils_1.AST_NODE_TYPES.Identifier;
};
exports.enforceFirestoreFacade = (0, createRule_1.createRule)({
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
                if (!isFirestoreMethodCall(node))
                    return;
                const callee = node.callee;
                if (!isMemberExpression(callee))
                    return;
                const property = callee.property;
                if (!isIdentifier(property))
                    return;
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
//# sourceMappingURL=enforce-firestore-facade.js.map
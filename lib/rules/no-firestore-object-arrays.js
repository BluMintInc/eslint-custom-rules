"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noFirestoreObjectArrays = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const PRIMITIVE_TYPES = new Set([
    'string',
    'number',
    'boolean',
    'Date',
    'Timestamp',
    'null',
    'undefined',
    'GeoPoint',
]);
const isInFirestoreTypesDirectory = (filename) => {
    return filename.includes('functions/src/types/firestore');
};
const isObjectType = (node) => {
    switch (node.type) {
        case utils_1.AST_NODE_TYPES.TSTypeLiteral:
            return true;
        case utils_1.AST_NODE_TYPES.TSTypeReference:
            if (node.typeName.type === utils_1.AST_NODE_TYPES.Identifier) {
                const typeName = node.typeName.name;
                return !PRIMITIVE_TYPES.has(typeName);
            }
            else if (node.typeName.type === utils_1.AST_NODE_TYPES.TSQualifiedName) {
                // Handle namespace.Type cases
                return true;
            }
            return true;
        case utils_1.AST_NODE_TYPES.TSIntersectionType:
        case utils_1.AST_NODE_TYPES.TSUnionType:
            return node.types.some(isObjectType);
        case utils_1.AST_NODE_TYPES.TSMappedType:
        case utils_1.AST_NODE_TYPES.TSIndexedAccessType:
            return true;
        default:
            return false;
    }
};
exports.noFirestoreObjectArrays = (0, createRule_1.createRule)({
    name: 'no-firestore-object-arrays',
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow arrays of objects in Firestore type definitions to optimize performance and avoid unnecessary fetches',
            recommended: 'warn',
        },
        schema: [],
        messages: {
            noObjectArrays: 'Arrays of objects are not recommended in Firestore. Use subcollections, arrays of IDs, or structured maps (Record<string, T>) instead.',
        },
    },
    defaultOptions: [],
    create(context) {
        if (!isInFirestoreTypesDirectory(context.getFilename())) {
            return {};
        }
        return {
            TSArrayType(node) {
                if (isObjectType(node.elementType)) {
                    context.report({
                        node,
                        messageId: 'noObjectArrays',
                    });
                }
            },
            TSTypeReference(node) {
                // Handle Array<T> and ReadonlyArray<T> syntax
                const typeName = node.typeName.name;
                if ((typeName === 'Array' || typeName === 'ReadonlyArray') &&
                    node.typeParameters) {
                    const elementType = node.typeParameters.params[0];
                    if (isObjectType(elementType)) {
                        context.report({
                            node,
                            messageId: 'noObjectArrays',
                        });
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=no-firestore-object-arrays.js.map
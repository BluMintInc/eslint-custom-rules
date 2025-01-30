"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const NON_SERIALIZABLE_TYPES = new Set([
    'Date',
    'DocumentReference',
    'Timestamp',
    'Map',
    'Set',
    'Symbol',
    'Function',
    'undefined',
]);
exports.default = (0, createRule_1.createRule)({
    name: 'enforce-serializable-params',
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce serializable parameters in Firebase Callable/HTTPS Cloud Functions to prevent runtime errors. Firebase Functions can only pass JSON-serializable data, so using non-serializable types like Date, DocumentReference, or Map will cause failures. Use primitive types, plain objects, and arrays instead, converting complex types to their serializable representations (e.g., Date to ISO string).',
            recommended: 'error',
        },
        schema: [
            {
                type: 'object',
                properties: {
                    additionalNonSerializableTypes: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                    functionTypes: {
                        type: 'array',
                        items: { type: 'string' },
                        default: ['CallableRequest'],
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            nonSerializableParam: 'Parameter type "{{ type }}" is not serializable in Firebase Cloud Functions. Use JSON-serializable types like string, number, boolean, arrays, or plain objects. Instead of `Date`, use ISO strings: `new Date().toISOString()`.',
            nonSerializableProperty: 'Property "{{ prop }}" has non-serializable type "{{ type }}". Use JSON-serializable types. For example, instead of `{ timestamp: Date }`, use `{ timestamp: string }` with ISO format.',
        },
    },
    defaultOptions: [
        {
            additionalNonSerializableTypes: [],
            functionTypes: ['CallableRequest'],
        },
    ],
    create(context, [options]) {
        const allNonSerializableTypes = new Set([
            ...NON_SERIALIZABLE_TYPES,
            ...(options.additionalNonSerializableTypes || []),
        ]);
        const typeAliasMap = new Map();
        function isNonSerializableType(typeName) {
            return allNonSerializableTypes.has(typeName);
        }
        function checkTypeNode(node, propName) {
            if (!node)
                return;
            switch (node.type) {
                case utils_1.AST_NODE_TYPES.TSTypeReference: {
                    const typeName = node.typeName.name;
                    if (isNonSerializableType(typeName)) {
                        context.report({
                            node,
                            messageId: propName
                                ? 'nonSerializableProperty'
                                : 'nonSerializableParam',
                            data: {
                                type: typeName,
                                prop: propName,
                            },
                        });
                    }
                    // Check type parameters of generic types (like Array<T>)
                    if (node.typeParameters) {
                        node.typeParameters.params.forEach((param) => checkTypeNode(param, propName));
                    }
                    break;
                }
                case utils_1.AST_NODE_TYPES.TSArrayType:
                    checkTypeNode(node.elementType, propName);
                    break;
                case utils_1.AST_NODE_TYPES.TSTypeAnnotation:
                    checkTypeNode(node.typeAnnotation, propName);
                    break;
                case utils_1.AST_NODE_TYPES.TSTypeLiteral:
                    node.members.forEach((member) => {
                        if (member.type === utils_1.AST_NODE_TYPES.TSPropertySignature) {
                            const propertyName = member.key.name;
                            checkTypeNode(member.typeAnnotation, propertyName);
                        }
                    });
                    break;
                case utils_1.AST_NODE_TYPES.TSUnionType:
                    node.types.forEach((type) => checkTypeNode(type, propName));
                    break;
            }
        }
        return {
            TSTypeAliasDeclaration(node) {
                typeAliasMap.set(node.id.name, node);
            },
            TSTypeReference(node) {
                const typeName = node.typeName.name;
                if (options.functionTypes.includes(typeName) &&
                    node.typeParameters?.params[0]) {
                    const typeParam = node.typeParameters.params[0];
                    if (typeParam.type === utils_1.AST_NODE_TYPES.TSTypeReference) {
                        const referencedTypeName = typeParam.typeName.name;
                        const typeAlias = typeAliasMap.get(referencedTypeName);
                        if (typeAlias) {
                            checkTypeNode(typeAlias.typeAnnotation);
                        }
                    }
                    else {
                        checkTypeNode(typeParam);
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-serializable-params.js.map
"use strict";
/**
 * @fileoverview Enforce generic argument for Firestore DocumentReference
 * @author BluMint
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceFirestoreDocRefGeneric = void 0;
/**
 * @type {import('eslint').Rule.RuleModule}
 */
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
/**
 * @type {import('eslint').Rule.RuleModule}
 */
exports.enforceFirestoreDocRefGeneric = (0, createRule_1.createRule)({
    name: 'enforce-firestore-doc-ref-generic',
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce generic argument for Firestore DocumentReference',
            recommended: 'error',
            requiresTypeChecking: true,
        },
        schema: [],
        messages: {
            missingGeneric: 'DocumentReference must specify a generic type argument',
            invalidGeneric: 'DocumentReference must not use "any" or "{}" as generic type argument',
        },
    },
    defaultOptions: [],
    create(context) {
        const typeCache = new Map();
        function hasInvalidType(node) {
            if (!node)
                return false;
            switch (node.type) {
                case utils_1.AST_NODE_TYPES.TSAnyKeyword:
                    return true;
                case utils_1.AST_NODE_TYPES.TSTypeLiteral:
                    if (!node.members || node.members.length === 0) {
                        return true;
                    }
                    return node.members.some((member) => {
                        if (member.type === utils_1.AST_NODE_TYPES.TSPropertySignature &&
                            member.typeAnnotation) {
                            return hasInvalidType(member.typeAnnotation.typeAnnotation);
                        }
                        return false;
                    });
                case utils_1.AST_NODE_TYPES.TSTypeReference:
                    if (node.typeParameters) {
                        return node.typeParameters.params.some(hasInvalidType);
                    }
                    if (node.typeName.type === utils_1.AST_NODE_TYPES.Identifier) {
                        const typeName = node.typeName.name;
                        if (typeCache.has(typeName)) {
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            return typeCache.get(typeName);
                        }
                        // Prevent infinite recursion
                        typeCache.set(typeName, false);
                        const program = context.getSourceCode().ast;
                        const interfaceDecl = program.body.find((n) => n.type === utils_1.AST_NODE_TYPES.TSInterfaceDeclaration &&
                            n.id.name === typeName);
                        if (interfaceDecl) {
                            const result = interfaceDecl.body.body.some((member) => {
                                if (member.type === utils_1.AST_NODE_TYPES.TSPropertySignature &&
                                    member.typeAnnotation) {
                                    return hasInvalidType(member.typeAnnotation.typeAnnotation);
                                }
                                return false;
                            });
                            typeCache.set(typeName, result);
                            return result;
                        }
                    }
                    return false;
                case utils_1.AST_NODE_TYPES.TSIntersectionType:
                case utils_1.AST_NODE_TYPES.TSUnionType:
                    return node.types.some(hasInvalidType);
                case utils_1.AST_NODE_TYPES.TSTypeOperator:
                    if ('typeAnnotation' in node) {
                        return hasInvalidType(node.typeAnnotation);
                    }
                    return false;
                case utils_1.AST_NODE_TYPES.TSMappedType:
                    if ('typeAnnotation' in node) {
                        return hasInvalidType(node.typeAnnotation);
                    }
                    return false;
                case utils_1.AST_NODE_TYPES.TSIndexedAccessType:
                    return (hasInvalidType(node.objectType) || hasInvalidType(node.indexType));
                case utils_1.AST_NODE_TYPES.TSConditionalType:
                    return (hasInvalidType(node.checkType) ||
                        hasInvalidType(node.extendsType) ||
                        hasInvalidType(node.trueType) ||
                        hasInvalidType(node.falseType));
                case utils_1.AST_NODE_TYPES.TSArrayType:
                    return hasInvalidType(node.elementType);
                case utils_1.AST_NODE_TYPES.TSTupleType:
                    return node.elementTypes.some(hasInvalidType);
                case utils_1.AST_NODE_TYPES.TSTypeQuery:
                    return false;
                default:
                    return false;
            }
        }
        return {
            TSTypeReference(node) {
                if (node.typeName.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.typeName.name === 'DocumentReference') {
                    // Check if generic type argument is missing
                    if (!node.typeParameters || node.typeParameters.params.length === 0) {
                        context.report({
                            node,
                            messageId: 'missingGeneric',
                        });
                        return;
                    }
                    // Check for invalid generic type arguments (any or {}) recursively
                    const typeArg = node.typeParameters.params[0];
                    if (hasInvalidType(typeArg)) {
                        context.report({
                            node,
                            messageId: 'invalidGeneric',
                        });
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-firestore-doc-ref-generic.js.map
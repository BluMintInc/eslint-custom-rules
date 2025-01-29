"use strict";
/**
 * @fileoverview Enforce generic argument for Firestore DocumentReference, CollectionReference and CollectionGroup
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
            description: 'Enforce generic argument for Firestore DocumentReference, CollectionReference and CollectionGroup',
            recommended: 'error',
            requiresTypeChecking: true,
        },
        schema: [],
        messages: {
            missingGeneric: '{{ type }} must specify a generic type argument',
            invalidGeneric: '{{ type }} must not use "any" or "{}" as generic type argument',
        },
    },
    defaultOptions: [],
    create(context) {
        const typeCache = new Map();
        const nodeCache = new WeakMap();
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
        function hasTypeAnnotation(node) {
            if (nodeCache.has(node)) {
                return nodeCache.get(node);
            }
            let current = node;
            while (current) {
                // Variable declarations with type annotations
                if (current.type === utils_1.AST_NODE_TYPES.VariableDeclarator && current.id.typeAnnotation) {
                    nodeCache.set(node, true);
                    return true;
                }
                // Class property definitions with type annotations
                if (current.type === utils_1.AST_NODE_TYPES.PropertyDefinition && current.typeAnnotation) {
                    nodeCache.set(node, true);
                    return true;
                }
                // Return statements in functions with return type annotations
                if (current.type === utils_1.AST_NODE_TYPES.ReturnStatement) {
                    const func = current.parent?.parent;
                    if (func?.type === utils_1.AST_NODE_TYPES.FunctionDeclaration && func.returnType) {
                        nodeCache.set(node, true);
                        return true;
                    }
                }
                // Assignment expressions to class properties
                if (current.type === utils_1.AST_NODE_TYPES.AssignmentExpression) {
                    const left = current.left;
                    if (left.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                        const obj = left.object;
                        if (obj.type === utils_1.AST_NODE_TYPES.ThisExpression) {
                            const classNode = findParentClass(current);
                            if (classNode) {
                                const property = classNode.body.body.find((member) => member.type === utils_1.AST_NODE_TYPES.PropertyDefinition &&
                                    member.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                                    member.key.name === left.property.name);
                                if (property?.typeAnnotation) {
                                    nodeCache.set(node, true);
                                    return true;
                                }
                            }
                        }
                    }
                }
                current = current.parent;
            }
            nodeCache.set(node, false);
            return false;
        }
        function findParentClass(node) {
            let current = node;
            while (current) {
                if (current.type === utils_1.AST_NODE_TYPES.ClassDeclaration) {
                    return current;
                }
                current = current.parent;
            }
            return undefined;
        }
        function isPartOfMethodChain(node) {
            if (node.callee.type !== utils_1.AST_NODE_TYPES.MemberExpression) {
                return false;
            }
            // Check if this node is part of a method chain as the object
            const obj = node.callee.object;
            if (obj.type === utils_1.AST_NODE_TYPES.CallExpression) {
                return true;
            }
            // Check if this node is part of a method chain as the callee
            let current = node;
            while (current) {
                if (current.parent?.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    current.parent.parent?.type === utils_1.AST_NODE_TYPES.CallExpression) {
                    return true;
                }
                current = current.parent;
            }
            return false;
        }
        return {
            TSTypeReference(node) {
                if (node.typeName.type === utils_1.AST_NODE_TYPES.Identifier &&
                    (node.typeName.name === 'DocumentReference' ||
                        node.typeName.name === 'CollectionReference' ||
                        node.typeName.name === 'CollectionGroup')) {
                    const typeName = node.typeName.name;
                    // Check if generic type argument is missing
                    if (!node.typeParameters || node.typeParameters.params.length === 0) {
                        context.report({
                            node,
                            messageId: 'missingGeneric',
                            data: { type: typeName }
                        });
                        return;
                    }
                    // Check for invalid generic type arguments (any or {}) recursively
                    const typeArg = node.typeParameters.params[0];
                    if (hasInvalidType(typeArg)) {
                        context.report({
                            node,
                            messageId: 'invalidGeneric',
                            data: { type: typeName }
                        });
                    }
                }
            },
            CallExpression(node) {
                // Only check method calls if there's no type annotation
                if (hasTypeAnnotation(node)) {
                    return;
                }
                // Check for .doc() calls
                if (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.callee.property.name === 'doc') {
                    const typeAnnotation = node.typeParameters;
                    if (!typeAnnotation) {
                        context.report({
                            node,
                            messageId: 'missingGeneric',
                            data: { type: 'DocumentReference' }
                        });
                    }
                    else if (hasInvalidType(typeAnnotation.params[0])) {
                        context.report({
                            node,
                            messageId: 'invalidGeneric',
                            data: { type: 'DocumentReference' }
                        });
                    }
                }
                // Check for .collection() calls
                else if (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.callee.property.name === 'collection' &&
                    !isPartOfMethodChain(node)) {
                    const typeAnnotation = node.typeParameters;
                    if (!typeAnnotation) {
                        context.report({
                            node,
                            messageId: 'missingGeneric',
                            data: { type: 'CollectionReference' }
                        });
                    }
                    else if (hasInvalidType(typeAnnotation.params[0])) {
                        context.report({
                            node,
                            messageId: 'invalidGeneric',
                            data: { type: 'CollectionReference' }
                        });
                    }
                }
                // Check for .collectionGroup() calls
                else if (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.callee.property.name === 'collectionGroup') {
                    const typeAnnotation = node.typeParameters;
                    if (!typeAnnotation) {
                        context.report({
                            node,
                            messageId: 'missingGeneric',
                            data: { type: 'CollectionGroup' }
                        });
                    }
                    else if (hasInvalidType(typeAnnotation.params[0])) {
                        context.report({
                            node,
                            messageId: 'invalidGeneric',
                            data: { type: 'CollectionGroup' }
                        });
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-firestore-doc-ref-generic.js.map
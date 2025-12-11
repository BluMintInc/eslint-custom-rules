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
            missingGeneric: '{{ type }} must specify a generic type argument for type safety. Instead of `const docRef = doc(collection)`, use `const docRef = doc<YourType>(collection)`.',
            invalidGeneric: '{{ type }} must not use "any" or "{}" as generic type argument. Define a proper interface/type for your document: `interface UserDoc { name: string; age: number; }` and use it: `const docRef = doc<UserDoc>(collection)`.',
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
                // Type assertions using 'as' keyword
                if (current.type === utils_1.AST_NODE_TYPES.TSAsExpression) {
                    nodeCache.set(node, true);
                    return true;
                }
                // Variable declarations with type annotations
                if (current.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                    current.id.typeAnnotation) {
                    nodeCache.set(node, true);
                    return true;
                }
                // Class property definitions with type annotations
                if (current.type === utils_1.AST_NODE_TYPES.PropertyDefinition &&
                    current.typeAnnotation) {
                    nodeCache.set(node, true);
                    return true;
                }
                // Return statements in functions with return type annotations
                if (current.type === utils_1.AST_NODE_TYPES.ReturnStatement) {
                    const func = current.parent?.parent;
                    if (func?.type === utils_1.AST_NODE_TYPES.FunctionDeclaration &&
                        func.returnType) {
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
                                    member.key.name ===
                                        left.property.name);
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
        const isTypedCollectionReferenceCache = new Map();
        function isTypedCollectionReference(node) {
            if (!node)
                return false;
            if (isTypedCollectionReferenceCache.has(node)) {
                return isTypedCollectionReferenceCache.get(node);
            }
            let result = false;
            if (node.type === utils_1.AST_NODE_TYPES.CallExpression &&
                node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                node.callee.property.name === 'collection' &&
                node.typeParameters &&
                node.typeParameters.params.length > 0) {
                result = true;
            }
            else if (node.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                result = checkMemberExpressionForCollectionReference(node);
            }
            else if (node.type === utils_1.AST_NODE_TYPES.Identifier) {
                result = checkIdentifierForCollectionReference(node);
            }
            else if (node.type === utils_1.AST_NODE_TYPES.CallExpression) {
                result = checkCallExpressionForCollectionReference(node);
            }
            isTypedCollectionReferenceCache.set(node, result);
            return result;
        }
        function checkMemberExpressionForCollectionReference(node) {
            const obj = node.object;
            const property = node.property;
            // Handle this.property access
            if (obj.type === utils_1.AST_NODE_TYPES.ThisExpression &&
                property.type === utils_1.AST_NODE_TYPES.Identifier) {
                const classNode = findParentClass(node);
                if (classNode) {
                    const classProp = classNode.body.body.find((member) => member.type === utils_1.AST_NODE_TYPES.PropertyDefinition &&
                        member.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                        member.key.name === property.name);
                    if (classProp?.typeAnnotation) {
                        return hasCollectionReferenceType(classProp.typeAnnotation.typeAnnotation);
                    }
                }
            }
            // Handle nested property access like this.collections.tasks
            if (obj.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                const parentType = getTypeOfMemberExpression(obj);
                if (parentType && property.type === utils_1.AST_NODE_TYPES.Identifier) {
                    // Check if the parent object has a property with CollectionReference type
                    return checkObjectPropertyForCollectionReference(parentType, property.name);
                }
            }
            // Handle identifier.property access
            if (obj.type === utils_1.AST_NODE_TYPES.Identifier &&
                property.type === utils_1.AST_NODE_TYPES.Identifier) {
                const objType = getTypeOfIdentifier(obj);
                if (objType) {
                    return checkObjectPropertyForCollectionReference(objType, property.name);
                }
            }
            // Handle getter methods like this.collection where collection is a getter
            if (obj.type === utils_1.AST_NODE_TYPES.ThisExpression &&
                property.type === utils_1.AST_NODE_TYPES.Identifier) {
                const classNode = findParentClass(node);
                if (classNode) {
                    const getter = classNode.body.body.find((member) => member.type === utils_1.AST_NODE_TYPES.MethodDefinition &&
                        member.kind === 'get' &&
                        member.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                        member.key.name === property.name);
                    if (getter) {
                        // Check explicit return type
                        if (getter.value.returnType) {
                            return hasCollectionReferenceType(getter.value.returnType.typeAnnotation);
                        }
                        // Check return statement to infer type
                        if (getter.value.body &&
                            getter.value.body.type === utils_1.AST_NODE_TYPES.BlockStatement) {
                            const returnStmt = getter.value.body.body.find((stmt) => stmt.type === utils_1.AST_NODE_TYPES.ReturnStatement);
                            if (returnStmt?.argument?.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                                return checkMemberExpressionForCollectionReference(returnStmt.argument);
                            }
                        }
                    }
                }
            }
            return false;
        }
        function checkIdentifierForCollectionReference(node) {
            // Check function parameters
            const functionParam = findFunctionParameter(node);
            if (functionParam &&
                'typeAnnotation' in functionParam &&
                functionParam.typeAnnotation) {
                return hasCollectionReferenceType(functionParam.typeAnnotation.typeAnnotation);
            }
            // Check variable declarations in current scope and parent scopes
            if (findVariableDeclaration(node)) {
                return true;
            }
            return false;
        }
        function checkCallExpressionForCollectionReference(node) {
            // Check if this is a method call that returns CollectionReference
            if (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                const obj = node.callee.object;
                const property = node.callee.property;
                if (property.type === utils_1.AST_NODE_TYPES.Identifier) {
                    // Check if this is a getter or method that returns CollectionReference
                    if (obj.type === utils_1.AST_NODE_TYPES.ThisExpression) {
                        const classNode = findParentClass(node);
                        if (classNode) {
                            const method = classNode.body.body.find((member) => member.type === utils_1.AST_NODE_TYPES.MethodDefinition &&
                                member.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                                member.key.name === property.name &&
                                !!member.value.returnType);
                            if (method?.value.returnType) {
                                return hasCollectionReferenceType(method.value.returnType.typeAnnotation);
                            }
                        }
                    }
                }
            }
            return false;
        }
        function getTypeOfMemberExpression(node) {
            if (node.object.type === utils_1.AST_NODE_TYPES.ThisExpression &&
                node.property.type === utils_1.AST_NODE_TYPES.Identifier) {
                const classNode = findParentClass(node);
                if (classNode) {
                    const classProp = classNode.body.body.find((member) => member.type === utils_1.AST_NODE_TYPES.PropertyDefinition &&
                        member.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                        'name' in node.property &&
                        member.key.name === node.property.name);
                    return classProp?.typeAnnotation?.typeAnnotation || null;
                }
            }
            return null;
        }
        function getTypeOfIdentifier(node) {
            const functionParam = findFunctionParameter(node);
            if (functionParam &&
                'typeAnnotation' in functionParam &&
                functionParam.typeAnnotation) {
                return functionParam.typeAnnotation.typeAnnotation;
            }
            const varDecl = findVariableDeclarationNode(node);
            if (varDecl?.typeAnnotation) {
                return varDecl.typeAnnotation.typeAnnotation;
            }
            return null;
        }
        function checkObjectPropertyForCollectionReference(objectType, propertyName) {
            if (objectType.type === utils_1.AST_NODE_TYPES.TSTypeLiteral) {
                const property = objectType.members.find((member) => member.type === utils_1.AST_NODE_TYPES.TSPropertySignature &&
                    member.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                    member.key.name === propertyName &&
                    !!member.typeAnnotation);
                if (property?.typeAnnotation) {
                    return hasCollectionReferenceType(property.typeAnnotation.typeAnnotation);
                }
            }
            // Handle Record<string, CollectionReference<T>> types
            if (objectType.type === utils_1.AST_NODE_TYPES.TSTypeReference &&
                objectType.typeName.type === utils_1.AST_NODE_TYPES.Identifier &&
                objectType.typeName.name === 'Record' &&
                objectType.typeParameters &&
                objectType.typeParameters.params.length === 2) {
                const valueType = objectType.typeParameters.params[1];
                return hasCollectionReferenceType(valueType);
            }
            // Handle array types like CollectionReference<T>[]
            if (objectType.type === utils_1.AST_NODE_TYPES.TSArrayType) {
                return hasCollectionReferenceType(objectType.elementType);
            }
            return false;
        }
        function findFunctionParameter(node) {
            const isFunctionNode = (n) => n.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
                n.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                n.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression;
            const findParamInFunction = (func) => {
                const param = func.params.find((p) => p.type === utils_1.AST_NODE_TYPES.Identifier &&
                    p.name === node.name &&
                    'typeAnnotation' in p &&
                    p.typeAnnotation !== undefined);
                return param || null;
            };
            const functionScopes = [];
            let current = node;
            while (current) {
                if (isFunctionNode(current)) {
                    functionScopes.push(current);
                }
                current = current.parent;
            }
            for (const func of functionScopes) {
                const param = findParamInFunction(func);
                if (param) {
                    return param;
                }
            }
            return null;
        }
        function findVariableDeclaration(node) {
            let current = node;
            while (current) {
                // Check in current scope
                if (current.type === utils_1.AST_NODE_TYPES.Program ||
                    current.type === utils_1.AST_NODE_TYPES.BlockStatement ||
                    current.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
                    current.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                    current.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
                    const varDecl = findVariableInScope(current, node.name);
                    if (varDecl && varDecl.typeAnnotation) {
                        return hasCollectionReferenceType(varDecl.typeAnnotation.typeAnnotation);
                    }
                }
                current = current.parent;
            }
            return false;
        }
        function findVariableDeclarationNode(node) {
            let current = node;
            while (current) {
                if (current.type === utils_1.AST_NODE_TYPES.Program ||
                    current.type === utils_1.AST_NODE_TYPES.BlockStatement ||
                    current.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
                    current.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                    current.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
                    const varDecl = findVariableInScope(current, node.name);
                    if (varDecl) {
                        return varDecl;
                    }
                }
                current = current.parent;
            }
            return null;
        }
        function findVariableInScope(scope, varName) {
            const body = getNodeBody(scope);
            if (!body)
                return null;
            for (const stmt of body) {
                if (stmt.type === utils_1.AST_NODE_TYPES.VariableDeclaration) {
                    for (const decl of stmt.declarations) {
                        if (decl.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                            decl.id.type === utils_1.AST_NODE_TYPES.Identifier &&
                            decl.id.name === varName &&
                            decl.id.typeAnnotation) {
                            return decl.id;
                        }
                    }
                }
            }
            return null;
        }
        function getNodeBody(node) {
            if (node.type === utils_1.AST_NODE_TYPES.Program) {
                return node.body;
            }
            if (node.type === utils_1.AST_NODE_TYPES.BlockStatement) {
                return node.body;
            }
            if (node.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
                node.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
                return node.body?.body || null;
            }
            if (node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
                return node.body.type === utils_1.AST_NODE_TYPES.BlockStatement
                    ? node.body.body
                    : null;
            }
            return null;
        }
        function hasCollectionReferenceType(typeNode) {
            if (typeNode.type === utils_1.AST_NODE_TYPES.TSTypeReference &&
                ((typeNode.typeName.type === utils_1.AST_NODE_TYPES.Identifier &&
                    typeNode.typeName.name === 'CollectionReference') ||
                    (typeNode.typeName.type === utils_1.AST_NODE_TYPES.TSQualifiedName &&
                        typeNode.typeName.right.type === utils_1.AST_NODE_TYPES.Identifier &&
                        typeNode.typeName.right.name === 'CollectionReference')) &&
                typeNode.typeParameters &&
                typeNode.typeParameters.params.length > 0) {
                return true;
            }
            if (typeNode.type === utils_1.AST_NODE_TYPES.TSUnionType) {
                return typeNode.types.some(hasCollectionReferenceType);
            }
            if (typeNode.type === utils_1.AST_NODE_TYPES.TSIntersectionType) {
                return typeNode.types.some(hasCollectionReferenceType);
            }
            // TSParenthesizedType may appear even though AST_NODE_TYPES omits it
            if (typeNode.type === 'TSParenthesizedType') {
                const inner = typeNode
                    .typeAnnotation;
                return hasCollectionReferenceType(inner);
            }
            if (typeNode.type === utils_1.AST_NODE_TYPES.TSArrayType) {
                return hasCollectionReferenceType(typeNode.elementType);
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
                            data: { type: typeName },
                        });
                        return;
                    }
                    // Check for invalid generic type arguments (any or {}) recursively
                    const typeArg = node.typeParameters.params[0];
                    if (hasInvalidType(typeArg)) {
                        context.report({
                            node,
                            messageId: 'invalidGeneric',
                            data: { type: typeName },
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
                    const isOnTypedCollection = isTypedCollectionReference(node.callee.object);
                    // If this is a .doc() call on a typed CollectionReference,
                    // only check for invalid generics, not missing generics
                    if (isOnTypedCollection) {
                        if (typeAnnotation && hasInvalidType(typeAnnotation.params[0])) {
                            context.report({
                                node,
                                messageId: 'invalidGeneric',
                                data: { type: 'DocumentReference' },
                            });
                        }
                        return; // Skip the missing generic check for typed CollectionReference.doc() calls
                    }
                    // For standalone doc() calls or calls on untyped collections
                    if (!typeAnnotation) {
                        context.report({
                            node,
                            messageId: 'missingGeneric',
                            data: { type: 'DocumentReference' },
                        });
                    }
                    else if (hasInvalidType(typeAnnotation.params[0])) {
                        context.report({
                            node,
                            messageId: 'invalidGeneric',
                            data: { type: 'DocumentReference' },
                        });
                    }
                }
                // Check for standalone doc() function calls
                else if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.callee.name === 'doc') {
                    const typeAnnotation = node.typeParameters;
                    if (!typeAnnotation) {
                        context.report({
                            node,
                            messageId: 'missingGeneric',
                            data: { type: 'DocumentReference' },
                        });
                    }
                    else if (hasInvalidType(typeAnnotation.params[0])) {
                        context.report({
                            node,
                            messageId: 'invalidGeneric',
                            data: { type: 'DocumentReference' },
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
                            data: { type: 'CollectionReference' },
                        });
                    }
                    else if (hasInvalidType(typeAnnotation.params[0])) {
                        context.report({
                            node,
                            messageId: 'invalidGeneric',
                            data: { type: 'CollectionReference' },
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
                            data: { type: 'CollectionGroup' },
                        });
                    }
                    else if (hasInvalidType(typeAnnotation.params[0])) {
                        context.report({
                            node,
                            messageId: 'invalidGeneric',
                            data: { type: 'CollectionGroup' },
                        });
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-firestore-doc-ref-generic.js.map
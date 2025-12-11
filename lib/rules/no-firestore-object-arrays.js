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
    if (!filename || filename === '<input>')
        return false;
    const normalized = filename.replace(/\\/g, '/');
    if (normalized.includes('/node_modules/') || normalized.includes('/dist/')) {
        return false;
    }
    // Match typical mono/multi-repo layouts
    return normalized.includes('/types/firestore/');
};
const getRightmostIdentifierName = (name) => {
    let cur = name;
    // Walk rightwards until we reach an Identifier
    while (cur.type !== utils_1.AST_NODE_TYPES.Identifier) {
        cur = cur.right;
    }
    return cur.name;
};
const isArrayGenericReference = (node) => {
    return (node.typeName.type === utils_1.AST_NODE_TYPES.Identifier &&
        (node.typeName.name === 'Array' || node.typeName.name === 'ReadonlyArray'));
};
const isParenthesizedType = (node) => {
    if (!node || typeof node !== 'object')
        return false;
    const candidate = node;
    return (candidate.type === 'TSParenthesizedType' &&
        candidate.typeAnnotation !== undefined);
};
const unwrapArrayElementType = (node) => {
    let current = node;
    // Fixpoint loop: peel wrappers in any order until none remain
    // Cap unwrap iterations to prevent accidental non-terminating edits if new cases are added.
    // Wrappers are finite; 10 is generous but safe.
    for (let i = 0; i < 10; i++) {
        if (current.type === utils_1.AST_NODE_TYPES.TSTypeOperator &&
            current.operator === 'readonly') {
            current = current
                .typeAnnotation;
            continue;
        }
        if (isParenthesizedType(current)) {
            const paren = current;
            current = paren.typeAnnotation;
            continue;
        }
        if (current.type === utils_1.AST_NODE_TYPES.TSArrayType) {
            current = current.elementType;
            continue;
        }
        if (current.type === utils_1.AST_NODE_TYPES.TSTypeReference &&
            isArrayGenericReference(current) &&
            current.typeParameters &&
            current.typeParameters.params.length > 0) {
            current = current.typeParameters.params[0];
            continue;
        }
        break;
    }
    return current;
};
// Determine whether this type node appears in a Firestore model type context
// i.e., within an interface or type alias declaration, and not within variable/function annotations
const isInModelTypeContext = (node) => {
    let current = node.parent;
    while (current) {
        // Hard stop for non-type declaration contexts
        if (current.type === utils_1.AST_NODE_TYPES.VariableDeclarator ||
            current.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
            current.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
            current.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
            current.type === utils_1.AST_NODE_TYPES.MethodDefinition ||
            current.type === utils_1.AST_NODE_TYPES.TSMethodSignature ||
            current.type === utils_1.AST_NODE_TYPES.ClassDeclaration ||
            current.type === utils_1.AST_NODE_TYPES.PropertyDefinition ||
            current.type === utils_1.AST_NODE_TYPES.TSParameterProperty) {
            return false;
        }
        if (current.type === utils_1.AST_NODE_TYPES.TSTypeAliasDeclaration ||
            current.type === utils_1.AST_NODE_TYPES.TSInterfaceDeclaration) {
            return true;
        }
        current = current.parent;
    }
    return false;
};
exports.noFirestoreObjectArrays = (0, createRule_1.createRule)({
    name: 'no-firestore-object-arrays',
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow arrays of object types in Firestore models. Prefer Record maps keyed by id with an index field, or subcollections/arrays of IDs.',
            recommended: 'warn',
            requiresTypeChecking: false,
        },
        schema: [],
        messages: {
            noObjectArrays: `Arrays of objects are problematic in Firestore:
- Not queryable
- Destructive updates
- Concurrency risks

Prefer:
- Record<string, T> keyed by id with an index field for order (use toMap/toArr)
- Subcollections
- Arrays of IDs where appropriate`,
        },
    },
    defaultOptions: [],
    create(context) {
        if (!isInFirestoreTypesDirectory(context.getFilename())) {
            return {};
        }
        const sourceCode = context.getSourceCode();
        // Collect alias/interface/enum information within this file to refine object vs primitive classification
        const aliasNameToType = new Map();
        const interfaceNames = new Set();
        const enumNames = new Set();
        const visitNode = (n) => {
            switch (n.type) {
                case utils_1.AST_NODE_TYPES.TSTypeAliasDeclaration: {
                    aliasNameToType.set(n.id.name, n.typeAnnotation);
                    break;
                }
                case utils_1.AST_NODE_TYPES.TSInterfaceDeclaration: {
                    interfaceNames.add(n.id.name);
                    break;
                }
                case utils_1.AST_NODE_TYPES.TSEnumDeclaration: {
                    enumNames.add(n.id.name);
                    break;
                }
                case utils_1.AST_NODE_TYPES.ExportNamedDeclaration: {
                    if (n.declaration)
                        visitNode(n.declaration);
                    break;
                }
                case utils_1.AST_NODE_TYPES.ExportDefaultDeclaration: {
                    if (n.declaration) {
                        visitNode(n.declaration);
                    }
                    break;
                }
                case utils_1.AST_NODE_TYPES.TSExportAssignment: {
                    if (n.expression) {
                        visitNode(n.expression);
                    }
                    break;
                }
                case utils_1.AST_NODE_TYPES.TSModuleDeclaration: {
                    const body = n.body || null;
                    if (body && body.type === utils_1.AST_NODE_TYPES.TSModuleBlock) {
                        for (const stmt of body.body) {
                            visitNode(stmt);
                        }
                    }
                    else if (body && body.type === utils_1.AST_NODE_TYPES.TSModuleDeclaration) {
                        visitNode(body);
                    }
                    break;
                }
                default: {
                    // Only traverse a shallow subset we care about
                    break;
                }
            }
        };
        for (const stmt of sourceCode.ast.body) {
            visitNode(stmt);
        }
        const seenAlias = new Set();
        const visitingAliases = new Set();
        const isPrimitiveLikeAlias = (name, recursionDepth) => {
            if (seenAlias.has(name))
                return true;
            if (recursionDepth > 50)
                return false;
            if (PRIMITIVE_TYPES.has(name))
                return true;
            if (enumNames.has(name))
                return true; // enums are non-object primitives for our purposes
            const aliased = aliasNameToType.get(name);
            if (!aliased)
                return false;
            if (visitingAliases.has(name)) {
                return false;
            }
            visitingAliases.add(name);
            seenAlias.add(name);
            // Determine if the alias ultimately resolves to only primitive-like/literal types
            const node = aliased;
            const result = isPrimitiveLikeTypeNode(node, recursionDepth + 1);
            visitingAliases.delete(name);
            if (result) {
                seenAlias.add(name);
            }
            else {
                // Remove optimistic marking when resolution fails
                seenAlias.delete(name);
            }
            return result;
        };
        const isPrimitiveLikeTypeNode = (node, recursionDepth = 0) => {
            if (recursionDepth > 25) {
                return false;
            }
            if (isParenthesizedType(node)) {
                const paren = node;
                return isPrimitiveLikeTypeNode(paren.typeAnnotation, recursionDepth + 1);
            }
            switch (node.type) {
                case utils_1.AST_NODE_TYPES.TSStringKeyword:
                case utils_1.AST_NODE_TYPES.TSNumberKeyword:
                case utils_1.AST_NODE_TYPES.TSBooleanKeyword:
                case utils_1.AST_NODE_TYPES.TSNullKeyword:
                case utils_1.AST_NODE_TYPES.TSUndefinedKeyword:
                case utils_1.AST_NODE_TYPES.TSNeverKeyword:
                    return true;
                case utils_1.AST_NODE_TYPES.TSAnyKeyword:
                case utils_1.AST_NODE_TYPES.TSUnknownKeyword:
                    return false;
                case utils_1.AST_NODE_TYPES.TSLiteralType:
                    return true; // string/number/boolean literals
                case utils_1.AST_NODE_TYPES.TSTypeReference: {
                    // Allow known primitive-like references and enums or primitive-like aliases
                    const ref = node;
                    if (ref.typeName.type === utils_1.AST_NODE_TYPES.Identifier) {
                        const name = ref.typeName.name;
                        if (PRIMITIVE_TYPES.has(name) || enumNames.has(name))
                            return true;
                        if (seenAlias.has(name))
                            return true;
                        return isPrimitiveLikeAlias(name, recursionDepth + 1);
                    }
                    if (ref.typeName.type === utils_1.AST_NODE_TYPES.TSQualifiedName) {
                        const name = getRightmostIdentifierName(ref.typeName);
                        if (PRIMITIVE_TYPES.has(name) || enumNames.has(name))
                            return true;
                        if (seenAlias.has(name))
                            return true;
                        return isPrimitiveLikeAlias(name, recursionDepth + 1);
                    }
                    return false;
                }
                case utils_1.AST_NODE_TYPES.TSUnionType: {
                    return node.types.every((t) => isPrimitiveLikeTypeNode(t, recursionDepth + 1));
                }
                case utils_1.AST_NODE_TYPES.TSTypeOperator: {
                    // Treat keyof/unique symbol/etc as primitive-like to avoid false positives
                    if (node.operator !== 'readonly')
                        return true;
                    return isPrimitiveLikeTypeNode(node
                        .typeAnnotation, recursionDepth + 1);
                }
                case utils_1.AST_NODE_TYPES.TSTemplateLiteralType: {
                    // Template literal types behave like strings
                    return true;
                }
                default:
                    return false;
            }
        };
        const isObjectType = (node) => {
            if (isParenthesizedType(node)) {
                const paren = node;
                return isObjectType(paren.typeAnnotation);
            }
            switch (node.type) {
                case utils_1.AST_NODE_TYPES.TSTypeLiteral:
                    return true;
                case utils_1.AST_NODE_TYPES.TSTypeReference: {
                    const tn = node.typeName;
                    if (tn.type !== utils_1.AST_NODE_TYPES.Identifier &&
                        tn.type !== utils_1.AST_NODE_TYPES.TSQualifiedName) {
                        // Unsupported reference (e.g., ThisType) — do not assume object to avoid false positives
                        return false;
                    }
                    const refName = tn.type === utils_1.AST_NODE_TYPES.Identifier
                        ? tn.name
                        : getRightmostIdentifierName(tn);
                    if (PRIMITIVE_TYPES.has(refName))
                        return false;
                    if (interfaceNames.has(refName))
                        return true;
                    if (enumNames.has(refName))
                        return false;
                    if (aliasNameToType.has(refName)) {
                        return !isPrimitiveLikeAlias(refName, 0);
                    }
                    // Unknown reference: do not assume object to avoid false positives
                    return false;
                }
                case utils_1.AST_NODE_TYPES.TSIntersectionType:
                case utils_1.AST_NODE_TYPES.TSUnionType:
                    return node.types.some(isObjectType);
                case utils_1.AST_NODE_TYPES.TSMappedType:
                    return true;
                case utils_1.AST_NODE_TYPES.TSIndexedAccessType:
                    // Treat indexed access as object-like to align with existing tests
                    return true;
                case utils_1.AST_NODE_TYPES.TSTypeOperator:
                    if (node.operator === 'readonly') {
                        return isObjectType(node
                            .typeAnnotation);
                    }
                    return false;
                case utils_1.AST_NODE_TYPES.TSAnyKeyword:
                case utils_1.AST_NODE_TYPES.TSUnknownKeyword:
                    return true;
                default:
                    return false;
            }
        };
        const skipReadonlyAndParens = (parent) => {
            let currentParent = parent;
            while (currentParent) {
                if (currentParent.type === utils_1.AST_NODE_TYPES.TSTypeOperator &&
                    currentParent.operator === 'readonly') {
                    currentParent = currentParent
                        .parent;
                    continue;
                }
                if (isParenthesizedType(currentParent)) {
                    const paren = currentParent;
                    currentParent = paren.parent;
                    continue;
                }
                break;
            }
            return currentParent;
        };
        const isImmediatelyWrappedByArraySyntax = (node) => {
            const parent = skipReadonlyAndParens(node.parent);
            if (!parent)
                return false;
            if (parent.type === utils_1.AST_NODE_TYPES.TSArrayType)
                return true;
            if (parent.type === utils_1.AST_NODE_TYPES.TSTypeReference &&
                isArrayGenericReference(parent))
                return true;
            return false;
        };
        return {
            TSArrayType(node) {
                // Only consider arrays within model type/interface declarations
                if (!isInModelTypeContext(node)) {
                    return;
                }
                if (isImmediatelyWrappedByArraySyntax(node)) {
                    return;
                }
                const base = unwrapArrayElementType(node.elementType);
                if (isObjectType(base)) {
                    context.report({
                        node,
                        messageId: 'noObjectArrays',
                    });
                }
            },
            TSTypeReference(node) {
                if (node.typeName.type === utils_1.AST_NODE_TYPES.Identifier &&
                    (node.typeName.name === 'Array' ||
                        node.typeName.name === 'ReadonlyArray') &&
                    node.typeParameters) {
                    // Only consider arrays within model type/interface declarations
                    if (!isInModelTypeContext(node)) {
                        return;
                    }
                    if (isImmediatelyWrappedByArraySyntax(node)) {
                        return;
                    }
                    const elementType = node.typeParameters.params[0] ?? null;
                    if (!elementType)
                        return;
                    const base = unwrapArrayElementType(elementType);
                    if (isObjectType(base)) {
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
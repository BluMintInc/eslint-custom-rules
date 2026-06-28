"use strict";
/**
 * @fileoverview Enforce the use of event.params over .ref.parent.id in Firebase change handlers
 * @author BluMint
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferParamsOverParentId = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const HANDLER_TYPES = new Set([
    'DocumentChangeHandler',
    'DocumentChangeHandlerTransaction',
    'RealtimeDbChangeHandler',
    'RealtimeDbChangeHandlerTransaction',
]);
const getQualifiedNameIdentifier = (typeName) => {
    if (typeName.type === utils_1.AST_NODE_TYPES.Identifier) {
        return typeName.name;
    }
    if (typeName.type === utils_1.AST_NODE_TYPES.TSQualifiedName &&
        typeName.right.type === utils_1.AST_NODE_TYPES.Identifier) {
        return typeName.right.name;
    }
    return null;
};
const checkTypeAnnotationForHandler = (typeNode) => {
    switch (typeNode.type) {
        case utils_1.AST_NODE_TYPES.TSTypeReference: {
            const typeIdentifier = getQualifiedNameIdentifier(typeNode.typeName);
            return typeIdentifier ? HANDLER_TYPES.has(typeIdentifier) : false;
        }
        case utils_1.AST_NODE_TYPES.TSUnionType:
            return typeNode.types.some(checkTypeAnnotationForHandler);
        case utils_1.AST_NODE_TYPES.TSIntersectionType:
            return typeNode.types.some(checkTypeAnnotationForHandler);
        default:
            return false;
    }
};
const findTypeAnnotationInContext = (node) => {
    if (node.parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
        node.parent.id.type === utils_1.AST_NODE_TYPES.Identifier &&
        node.parent.id.typeAnnotation) {
        return node.parent.id.typeAnnotation;
    }
    if (node.parent?.type === utils_1.AST_NODE_TYPES.AssignmentExpression &&
        node.parent.left.type === utils_1.AST_NODE_TYPES.Identifier &&
        node.parent.left.typeAnnotation) {
        return node.parent.left.typeAnnotation;
    }
    if (node.parent?.type === utils_1.AST_NODE_TYPES.Property &&
        node.parent.value === node) {
        let current = node.parent.parent;
        while (current) {
            if (current.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                current.id.type === utils_1.AST_NODE_TYPES.Identifier &&
                current.id.typeAnnotation) {
                return current.id.typeAnnotation;
            }
            current = current.parent;
        }
    }
    return undefined;
};
const isFirebaseChangeHandler = (node) => {
    if (node.type !== utils_1.AST_NODE_TYPES.ArrowFunctionExpression &&
        node.type !== utils_1.AST_NODE_TYPES.FunctionExpression &&
        node.type !== utils_1.AST_NODE_TYPES.FunctionDeclaration) {
        return false;
    }
    const typeAnnotation = findTypeAnnotationInContext(node);
    if (!typeAnnotation) {
        return false;
    }
    return checkTypeAnnotationForHandler(typeAnnotation.typeAnnotation);
};
const isParentIdAccess = (node) => {
    if (node.property.type !== utils_1.AST_NODE_TYPES.Identifier ||
        node.property.name !== 'id') {
        return { isMatch: false, depth: 0 };
    }
    const chain = [];
    let current = node.object;
    while (current && current.type === utils_1.AST_NODE_TYPES.MemberExpression) {
        if (current.property.type !== utils_1.AST_NODE_TYPES.Identifier) {
            return { isMatch: false, depth: 0 };
        }
        chain.unshift(current.property.name);
        current = current.object;
    }
    if (chain.length < 2) {
        return { isMatch: false, depth: 0 };
    }
    const refIndex = chain.lastIndexOf('ref');
    if (refIndex === -1) {
        return { isMatch: false, depth: 0 };
    }
    const parentSegment = chain.slice(refIndex + 1);
    if (parentSegment.length === 0) {
        return { isMatch: false, depth: 0 };
    }
    const invalidParent = parentSegment.some((segment) => segment !== 'parent');
    if (invalidParent) {
        return { isMatch: false, depth: 0 };
    }
    const depth = parentSegment.length;
    return { isMatch: depth > 0, depth };
};
const getParentParamName = (depth) => {
    if (depth === 1) {
        return 'userId';
    }
    if (depth === 2) {
        return 'parentId';
    }
    return `parent${depth}Id`;
};
const findHandlerFunction = (node, handlerNodes) => {
    let current = node;
    while (current) {
        if (handlerNodes.has(current)) {
            return current;
        }
        current = current.parent;
    }
    return null;
};
const hasOptionalChaining = (node) => {
    let current = node;
    while (current && current.type === utils_1.AST_NODE_TYPES.MemberExpression) {
        if (current.optional) {
            return true;
        }
        current = current.object;
    }
    return false;
};
const findParamsInPattern = (pattern) => {
    for (const prop of pattern.properties) {
        if (prop.type === utils_1.AST_NODE_TYPES.Property &&
            prop.key.type === utils_1.AST_NODE_TYPES.Identifier &&
            prop.key.name === 'params') {
            if (prop.value.type === utils_1.AST_NODE_TYPES.Identifier) {
                return { identifier: prop.value.name };
            }
            if (prop.value.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
                const properties = new Map();
                for (const p of prop.value.properties) {
                    if (p.type === utils_1.AST_NODE_TYPES.Property &&
                        p.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                        p.value.type === utils_1.AST_NODE_TYPES.Identifier) {
                        properties.set(p.key.name, p.value.name);
                    }
                }
                return { properties };
            }
        }
    }
    return null;
};
const getParamsInScope = (handlerNode) => {
    if (handlerNode.type !== utils_1.AST_NODE_TYPES.ArrowFunctionExpression &&
        handlerNode.type !== utils_1.AST_NODE_TYPES.FunctionExpression &&
        handlerNode.type !== utils_1.AST_NODE_TYPES.FunctionDeclaration) {
        return null;
    }
    const firstParam = handlerNode.params[0];
    if (!firstParam) {
        return null;
    }
    if (firstParam.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
        const paramsInScope = findParamsInPattern(firstParam);
        if (paramsInScope) {
            return paramsInScope;
        }
    }
    if (handlerNode.body &&
        handlerNode.body.type === utils_1.AST_NODE_TYPES.BlockStatement) {
        const eventParamName = firstParam.type === utils_1.AST_NODE_TYPES.Identifier ? firstParam.name : 'event';
        for (const statement of handlerNode.body.body) {
            if (statement.type !== utils_1.AST_NODE_TYPES.VariableDeclaration) {
                continue;
            }
            for (const declarator of statement.declarations) {
                if (declarator.id.type !== utils_1.AST_NODE_TYPES.ObjectPattern ||
                    !declarator.init ||
                    declarator.init.type !== utils_1.AST_NODE_TYPES.Identifier ||
                    declarator.init.name !== eventParamName) {
                    continue;
                }
                const paramsInScope = findParamsInPattern(declarator.id);
                if (paramsInScope) {
                    return paramsInScope;
                }
            }
        }
    }
    return null;
};
exports.preferParamsOverParentId = (0, createRule_1.createRule)({
    name: 'prefer-params-over-parent-id',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Prefer event.params over ref.parent.id for type-safe Firebase trigger paths.',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            preferParams: [
                "What's wrong: This code reads an ID via `ref.parent...id` instead of using the trigger's params.",
                '',
                'Why it matters: Walking `ref.parent` ties the handler to the current path depth; when collections change, it can yield the wrong ID (or a collection name) and bypasses the typed params the trigger provides.',
                '',
                'How to fix: Read the ID from `params.{{paramName}}` (or destructure `const { params } = event` and then access `params.{{paramName}}`).',
            ].join('\n'),
        },
    },
    defaultOptions: [],
    create(context) {
        const handlerNodes = new Set();
        return {
            // Track Firebase change handler functions
            'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression'(node) {
                if (isFirebaseChangeHandler(node)) {
                    handlerNodes.add(node);
                }
            },
            // Detect .ref.parent.id patterns
            MemberExpression(node) {
                const parentAccess = isParentIdAccess(node);
                if (parentAccess.isMatch) {
                    const handlerNode = findHandlerFunction(node, handlerNodes);
                    if (handlerNode) {
                        const hasOptional = hasOptionalChaining(node);
                        const paramsInScope = getParamsInScope(handlerNode);
                        if (!paramsInScope) {
                            context.report({
                                node,
                                messageId: 'preferParams',
                                data: {
                                    paramName: getParentParamName(parentAccess.depth),
                                },
                            });
                            return;
                        }
                        const paramSuggestion = getParentParamName(parentAccess.depth);
                        let replacement = null;
                        if (paramsInScope.identifier) {
                            replacement = hasOptional
                                ? `${paramsInScope.identifier}?.${paramSuggestion}`
                                : `${paramsInScope.identifier}.${paramSuggestion}`;
                        }
                        else if (paramsInScope.properties) {
                            const localName = paramsInScope.properties.get(paramSuggestion);
                            if (localName) {
                                replacement = localName;
                            }
                        }
                        context.report({
                            node,
                            messageId: 'preferParams',
                            data: {
                                paramName: paramSuggestion,
                            },
                            fix: replacement
                                ? (fixer) => fixer.replaceText(node, replacement)
                                : undefined,
                        });
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=prefer-params-over-parent-id.js.map
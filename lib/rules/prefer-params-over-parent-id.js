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
exports.preferParamsOverParentId = (0, createRule_1.createRule)({
    name: 'prefer-params-over-parent-id',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Prefer handler params for parent IDs instead of traversing ref.parent.id so Firebase triggers stay aligned with path templates and type-safe.',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            preferParams: 'Accessing parent IDs through `ref.parent.id` bypasses the handler params and breaks when collection nesting changes. Use the params object for stable, typed IDs instead (destructure `const { params: { {{paramName}} } } = event` or read `params.{{paramName}}`).',
        },
    },
    defaultOptions: [],
    create(context) {
        // Track functions that are Firebase change handlers
        const handlerFunctions = new Set();
        function findTypeAnnotationInContext(node) {
            // Check variable declarator type annotation
            if (node.parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                node.parent.id.type === utils_1.AST_NODE_TYPES.Identifier &&
                node.parent.id.typeAnnotation) {
                return node.parent.id.typeAnnotation;
            }
            // Check assignment expression with type annotation
            if (node.parent?.type === utils_1.AST_NODE_TYPES.AssignmentExpression &&
                node.parent.left.type === utils_1.AST_NODE_TYPES.Identifier &&
                node.parent.left.typeAnnotation) {
                return node.parent.left.typeAnnotation;
            }
            // Check property definition type annotation
            if (node.parent?.type === utils_1.AST_NODE_TYPES.Property &&
                node.parent.value === node) {
                // Look up the tree for type annotation
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
        }
        function isFirebaseChangeHandler(node) {
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
        }
        function checkTypeAnnotationForHandler(typeNode) {
            if (typeNode.type === utils_1.AST_NODE_TYPES.TSTypeReference &&
                typeNode.typeName.type === utils_1.AST_NODE_TYPES.Identifier) {
                return HANDLER_TYPES.has(typeNode.typeName.name);
            }
            return false;
        }
        function isParentIdAccess(node) {
            // Check if this is a .ref.parent[.parent...].id pattern
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
            const refIndex = chain.indexOf('ref');
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
        }
        function findHandlerFunction(node) {
            let current = node;
            while (current) {
                if (handlerFunctions.has(current)) {
                    return current;
                }
                current = current.parent;
            }
            return null;
        }
        function hasOptionalChaining(node) {
            let current = node;
            while (current && current.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                if (current.optional) {
                    return true;
                }
                current = current.object;
            }
            return false;
        }
        function isParamsInScope(handlerNode) {
            // Check if params is destructured from the event parameter
            if (handlerNode.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                handlerNode.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                handlerNode.type === utils_1.AST_NODE_TYPES.FunctionDeclaration) {
                const firstParam = handlerNode.params[0];
                if (!firstParam)
                    return false;
                // Check for destructuring pattern: ({ params }) or ({ data, params })
                if (firstParam.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
                    return firstParam.properties.some((prop) => {
                        if (prop.type === utils_1.AST_NODE_TYPES.Property &&
                            prop.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                            prop.key.name === 'params') {
                            return true;
                        }
                        return false;
                    });
                }
                // Check for variable declarations inside the function that destructure params
                if (handlerNode.body &&
                    handlerNode.body.type === utils_1.AST_NODE_TYPES.BlockStatement) {
                    for (const statement of handlerNode.body.body) {
                        if (statement.type === utils_1.AST_NODE_TYPES.VariableDeclaration) {
                            for (const declarator of statement.declarations) {
                                if (declarator.id.type === utils_1.AST_NODE_TYPES.ObjectPattern &&
                                    declarator.init &&
                                    declarator.init.type === utils_1.AST_NODE_TYPES.Identifier) {
                                    // Check if destructuring from event parameter
                                    const eventParamName = firstParam.type === utils_1.AST_NODE_TYPES.Identifier
                                        ? firstParam.name
                                        : 'event';
                                    if (declarator.init.name === eventParamName) {
                                        return declarator.id.properties.some((prop) => {
                                            if (prop.type === utils_1.AST_NODE_TYPES.Property &&
                                                prop.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                                                prop.key.name === 'params') {
                                                return true;
                                            }
                                            return false;
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
            return false;
        }
        return {
            // Track Firebase change handler functions
            'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression'(node) {
                if (isFirebaseChangeHandler(node)) {
                    handlerFunctions.add(node);
                }
            },
            // Detect .ref.parent.id patterns
            MemberExpression(node) {
                const parentAccess = isParentIdAccess(node);
                if (parentAccess.isMatch) {
                    const handlerNode = findHandlerFunction(node);
                    if (handlerNode) {
                        const hasOptional = hasOptionalChaining(node);
                        const paramsInScope = isParamsInScope(handlerNode);
                        // Suggest different parameter names based on depth
                        // Note: These conventions may vary by data model; adjust if needed
                        const paramSuggestion = parentAccess.depth === 1
                            ? 'userId'
                            : parentAccess.depth === 2
                                ? 'parentId'
                                : `parent${parentAccess.depth}Id`;
                        context.report({
                            node,
                            messageId: 'preferParams',
                            data: {
                                paramName: paramSuggestion,
                            },
                            fix: paramsInScope
                                ? (fixer) => {
                                    const replacement = hasOptional
                                        ? `params?.${paramSuggestion}`
                                        : `params.${paramSuggestion}`;
                                    return fixer.replaceText(node, replacement);
                                }
                                : undefined,
                        });
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=prefer-params-over-parent-id.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const createRule_1 = require("../utils/createRule");
const utils_1 = require("@typescript-eslint/utils");
exports.default = (0, createRule_1.createRule)({
    name: 'enforce-callback-memo',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce useCallback or useMemo for inline functions in JSX props',
            recommended: 'error',
        },
        messages: {
            enforceCallback: 'Inline functions in JSX props should be wrapped with useCallback',
            enforceMemo: 'Objects/arrays containing functions in JSX props should be wrapped with useMemo',
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        function isFunction(node) {
            return (node.type === utils_1.TSESTree.AST_NODE_TYPES.ArrowFunctionExpression ||
                node.type === utils_1.TSESTree.AST_NODE_TYPES.FunctionExpression);
        }
        function containsFunction(node) {
            if (isFunction(node)) {
                return true;
            }
            if (node.type === utils_1.TSESTree.AST_NODE_TYPES.ObjectExpression) {
                return node.properties.some((prop) => {
                    if (prop.type === utils_1.TSESTree.AST_NODE_TYPES.Property &&
                        'value' in prop) {
                        return containsFunction(prop.value);
                    }
                    return false;
                });
            }
            if (node.type === utils_1.TSESTree.AST_NODE_TYPES.ArrayExpression) {
                return node.elements.some((element) => element && containsFunction(element));
            }
            return false;
        }
        function checkJSXAttribute(node) {
            if (!node.value ||
                node.value.type !== utils_1.TSESTree.AST_NODE_TYPES.JSXExpressionContainer) {
                return;
            }
            const { expression } = node.value;
            // Skip if the prop is already wrapped in useCallback or useMemo
            if (expression.type === utils_1.TSESTree.AST_NODE_TYPES.CallExpression &&
                expression.callee.type === utils_1.TSESTree.AST_NODE_TYPES.Identifier &&
                (expression.callee.name === 'useCallback' ||
                    expression.callee.name === 'useMemo')) {
                return;
            }
            // Check for direct inline functions
            if (isFunction(expression)) {
                context.report({
                    node,
                    messageId: 'enforceCallback',
                });
                return;
            }
            // Check for objects/arrays containing functions
            if ((expression.type === utils_1.TSESTree.AST_NODE_TYPES.ObjectExpression ||
                expression.type === utils_1.TSESTree.AST_NODE_TYPES.ArrayExpression) &&
                containsFunction(expression)) {
                context.report({
                    node,
                    messageId: 'enforceMemo',
                });
            }
        }
        return {
            JSXAttribute: checkJSXAttribute,
        };
    },
});
//# sourceMappingURL=enforce-callback-memo.js.map
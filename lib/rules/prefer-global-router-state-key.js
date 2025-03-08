"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferGlobalRouterStateKey = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
/**
 * Rule to enforce best practices for the `key` parameter in `useRouterState` hook calls.
 * Encourages type safety and maintainability by using global constants or type-safe functions.
 */
exports.preferGlobalRouterStateKey = (0, createRule_1.createRule)({
    name: 'prefer-global-router-state-key',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce using global constants or type-safe functions for useRouterState key parameter',
            recommended: 'warn',
        },
        schema: [],
        messages: {
            preferGlobalRouterStateKey: 'Prefer using a global constant or type-safe function for useRouterState key parameter instead of string literals',
        },
    },
    defaultOptions: [],
    create(context) {
        /**
         * Checks if a node contains a string literal that should be reported
         */
        function containsStringLiteral(node) {
            // Direct string literal
            if (node.type === utils_1.AST_NODE_TYPES.Literal &&
                typeof node.value === 'string') {
                return true;
            }
            // String concatenation with + operator
            if (node.type === utils_1.AST_NODE_TYPES.BinaryExpression &&
                node.operator === '+' &&
                (containsStringLiteral(node.left) || containsStringLiteral(node.right))) {
                return true;
            }
            // Conditional (ternary) expression with string literals
            if (node.type === utils_1.AST_NODE_TYPES.ConditionalExpression &&
                (containsStringLiteral(node.consequent) ||
                    containsStringLiteral(node.alternate))) {
                return true;
            }
            // Template literal with static parts
            if (node.type === utils_1.AST_NODE_TYPES.TemplateLiteral) {
                // Only report if there's a meaningful static part in the template
                // This allows dynamic templates like `${prefix}-${id}` but catches `static-${id}`
                const hasSignificantStaticPart = node.quasis.some((quasi) => {
                    const content = quasi.value.raw.trim();
                    // Allow common separators like '-', '_', ':', '/' as they're just joining dynamic parts
                    return content.length > 0 && !/^[-_:/.]+$/.test(content);
                });
                return hasSignificantStaticPart;
            }
            return false;
        }
        return {
            CallExpression(node) {
                // Check if this is a call to useRouterState
                if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.callee.name === 'useRouterState') {
                    // Check if there are arguments
                    if (node.arguments.length > 0) {
                        const firstArg = node.arguments[0];
                        // Check if the first argument is an object expression
                        if (firstArg.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                            // Find the key property in the object
                            const keyProperty = firstArg.properties.find((prop) => prop.type === utils_1.AST_NODE_TYPES.Property &&
                                prop.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                                prop.key.name === 'key');
                            // If key property exists, check its value
                            if (keyProperty && keyProperty.value) {
                                const keyValue = keyProperty.value;
                                // Check for string literals in various contexts
                                if (containsStringLiteral(keyValue)) {
                                    context.report({
                                        node: keyValue,
                                        messageId: 'preferGlobalRouterStateKey',
                                    });
                                }
                            }
                        }
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=prefer-global-router-state-key.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noMemoizeOnStatic = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
exports.noMemoizeOnStatic = (0, createRule_1.createRule)({
    name: 'no-memoize-on-static',
    meta: {
        type: 'problem',
        docs: {
            description: 'Prevent using @Memoize() decorator on static methods',
            recommended: 'error',
        },
        schema: [],
        messages: {
            noMemoizeOnStatic: '@Memoize() decorator should not be used on static methods',
        },
    },
    defaultOptions: [],
    create(context) {
        // Track renamed imports of Memoize
        const memoizeAliases = new Set(['Memoize']);
        return {
            ImportSpecifier(node) {
                if (node.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.imported.name === 'Memoize' &&
                    node.local.type === utils_1.AST_NODE_TYPES.Identifier) {
                    memoizeAliases.add(node.local.name);
                }
            },
            'MethodDefinition[static=true]'(node) {
                if (node.decorators) {
                    for (const decorator of node.decorators) {
                        const expr = decorator.expression;
                        if (
                        // Handle @Memoize()
                        (expr.type === utils_1.AST_NODE_TYPES.CallExpression &&
                            expr.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                            memoizeAliases.has(expr.callee.name)) ||
                            // Handle @Memoize (without parentheses)
                            (expr.type === utils_1.AST_NODE_TYPES.Identifier &&
                                memoizeAliases.has(expr.name))) {
                            context.report({
                                node: decorator,
                                messageId: 'noMemoizeOnStatic',
                            });
                        }
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=no-memoize-on-static.js.map
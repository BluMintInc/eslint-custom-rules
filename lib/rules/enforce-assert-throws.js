"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceAssertThrows = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
exports.enforceAssertThrows = (0, createRule_1.createRule)({
    name: 'enforce-assert-throws',
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce that functions with assert- prefix must throw an error or call process.exit(1)',
            recommended: 'error',
        },
        schema: [],
        messages: {
            assertShouldThrow: 'Functions with assert- prefix must throw an error or call process.exit(1). Either rename the function or add a throw/exit statement.',
        },
    },
    defaultOptions: [],
    create(context) {
        function isAssertionCall(node) {
            if (node.type === utils_1.AST_NODE_TYPES.ExpressionStatement) {
                const expression = node.expression;
                if (expression.type === utils_1.AST_NODE_TYPES.CallExpression) {
                    const callee = expression.callee;
                    if (callee.type === utils_1.AST_NODE_TYPES.Identifier) {
                        return callee.name.toLowerCase().startsWith('assert');
                    }
                    if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                        const property = callee.property;
                        if (property.type === utils_1.AST_NODE_TYPES.Identifier) {
                            return property.name.toLowerCase().startsWith('assert');
                        }
                    }
                }
            }
            return false;
        }
        function isProcessExit1(node) {
            if (node.type === utils_1.AST_NODE_TYPES.CallExpression) {
                const callee = node.callee;
                if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                    callee.object.name === 'process' &&
                    callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    callee.property.name === 'exit') {
                    const args = node.arguments;
                    if (args.length === 1) {
                        const arg = args[0];
                        if (arg.type === utils_1.AST_NODE_TYPES.Literal && arg.value === 1) {
                            return true;
                        }
                        // Handle numeric literal 1 in different forms
                        if (arg.type === utils_1.AST_NODE_TYPES.UnaryExpression &&
                            arg.operator === '+' &&
                            arg.argument.type === utils_1.AST_NODE_TYPES.Literal &&
                            arg.argument.value === 1) {
                            return true;
                        }
                    }
                }
            }
            return false;
        }
        function hasThrowStatement(node) {
            let hasThrow = false;
            function walk(node) {
                if (node.type === utils_1.AST_NODE_TYPES.ThrowStatement) {
                    hasThrow = true;
                    return;
                }
                // Check for process.exit(1)
                if (node.type === utils_1.AST_NODE_TYPES.ExpressionStatement) {
                    if (isProcessExit1(node.expression)) {
                        hasThrow = true;
                        return;
                    }
                }
                // Check for assertion function calls
                if (isAssertionCall(node)) {
                    hasThrow = true;
                    return;
                }
                // Don't check throw statements in nested functions
                if (node.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
                    node.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                    node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
                    if (node !== currentFunction) {
                        return;
                    }
                }
                // Check catch blocks for process.exit(1)
                if (node.type === utils_1.AST_NODE_TYPES.CatchClause) {
                    walk(node.body);
                    return;
                }
                // Handle TryStatement specially
                if (node.type === utils_1.AST_NODE_TYPES.TryStatement) {
                    walk(node.block);
                    if (node.handler) {
                        walk(node.handler);
                    }
                    if (node.finalizer) {
                        walk(node.finalizer);
                    }
                    return;
                }
                // Handle BlockStatement specially
                if (node.type === utils_1.AST_NODE_TYPES.BlockStatement) {
                    node.body.forEach((stmt) => walk(stmt));
                    return;
                }
                // Handle IfStatement specially
                if (node.type === utils_1.AST_NODE_TYPES.IfStatement) {
                    walk(node.consequent);
                    if (node.alternate) {
                        walk(node.alternate);
                    }
                    return;
                }
                // Handle other node types
                for (const key of Object.keys(node)) {
                    const value = node[key];
                    if (Array.isArray(value)) {
                        value.forEach((item) => {
                            if (item && typeof item === 'object' && !('parent' in item)) {
                                walk(item);
                            }
                        });
                    }
                    else if (value &&
                        typeof value === 'object' &&
                        !('parent' in value)) {
                        walk(value);
                    }
                }
            }
            walk(node);
            return hasThrow;
        }
        let currentFunction = null;
        function checkFunction(node) {
            let functionName = '';
            if (node.type === utils_1.AST_NODE_TYPES.MethodDefinition) {
                functionName =
                    node.key.type === utils_1.AST_NODE_TYPES.Identifier ? node.key.name : '';
            }
            else if (node.type === utils_1.AST_NODE_TYPES.FunctionDeclaration && node.id) {
                functionName = node.id.name;
            }
            else if (node.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
                const parent = node.parent;
                if (parent &&
                    parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                    parent.id.type === utils_1.AST_NODE_TYPES.Identifier) {
                    functionName = parent.id.name;
                }
            }
            if (functionName.toLowerCase().startsWith('assert')) {
                currentFunction = node;
                const functionBody = node.type === utils_1.AST_NODE_TYPES.MethodDefinition
                    ? node.value.body
                    : node.body;
                if (functionBody && !hasThrowStatement(functionBody)) {
                    context.report({
                        node,
                        messageId: 'assertShouldThrow',
                    });
                }
                currentFunction = null;
            }
        }
        return {
            FunctionDeclaration: checkFunction,
            FunctionExpression: checkFunction,
            ArrowFunctionExpression: checkFunction,
            MethodDefinition: checkFunction,
        };
    },
});
//# sourceMappingURL=enforce-assert-throws.js.map
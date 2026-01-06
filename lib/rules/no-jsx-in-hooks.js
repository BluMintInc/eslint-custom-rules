"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noJsxInHooks = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const isJsxElement = (node) => {
    if (!node)
        return false;
    if (node.type === utils_1.AST_NODE_TYPES.ConditionalExpression) {
        return isJsxElement(node.consequent) || isJsxElement(node.alternate);
    }
    return (node.type === utils_1.AST_NODE_TYPES.JSXElement ||
        node.type === utils_1.AST_NODE_TYPES.JSXFragment ||
        node.type === utils_1.AST_NODE_TYPES.JSXExpressionContainer);
};
const isJsxReturnType = (node) => {
    if (node.typeAnnotation.type === utils_1.AST_NODE_TYPES.TSTypeReference) {
        const typeName = node.typeAnnotation.typeName;
        if (typeName.type === utils_1.AST_NODE_TYPES.Identifier) {
            return ['JSX', 'ReactNode', 'ReactElement'].includes(typeName.name);
        }
        if (typeName.type === utils_1.AST_NODE_TYPES.TSQualifiedName) {
            return (typeName.left.type === utils_1.AST_NODE_TYPES.Identifier &&
                typeName.left.name === 'JSX' &&
                typeName.right.type === utils_1.AST_NODE_TYPES.Identifier &&
                typeName.right.name === 'Element');
        }
    }
    return false;
};
const containsJsxInBlockStatement = (node) => {
    const variablesWithJsx = new Set();
    for (const statement of node.body) {
        // Check variable declarations for JSX assignments
        if (statement.type === utils_1.AST_NODE_TYPES.VariableDeclaration) {
            for (const declarator of statement.declarations) {
                if (declarator.init) {
                    if (declarator.init.type === utils_1.AST_NODE_TYPES.CallExpression &&
                        containsJsxInUseMemo(declarator.init)) {
                        if (declarator.id.type === utils_1.AST_NODE_TYPES.Identifier) {
                            variablesWithJsx.add(declarator.id.name);
                        }
                    }
                }
            }
        }
        // Check return statements
        if (statement.type === utils_1.AST_NODE_TYPES.ReturnStatement &&
            statement.argument) {
            if (isJsxElement(statement.argument)) {
                return true;
            }
            if (statement.argument.type === utils_1.AST_NODE_TYPES.CallExpression) {
                if (containsJsxInUseMemo(statement.argument)) {
                    return true;
                }
            }
            if (statement.argument.type === utils_1.AST_NODE_TYPES.Identifier &&
                variablesWithJsx.has(statement.argument.name)) {
                return true;
            }
        }
        // Check if statements
        if (statement.type === utils_1.AST_NODE_TYPES.IfStatement) {
            if (statement.consequent.type === utils_1.AST_NODE_TYPES.ReturnStatement &&
                statement.consequent.argument) {
                if (isJsxElement(statement.consequent.argument)) {
                    return true;
                }
                if (statement.consequent.argument.type === utils_1.AST_NODE_TYPES.Identifier &&
                    variablesWithJsx.has(statement.consequent.argument.name)) {
                    return true;
                }
            }
            if (statement.consequent.type === utils_1.AST_NODE_TYPES.BlockStatement &&
                containsJsxInBlockStatement(statement.consequent)) {
                return true;
            }
            if (statement.alternate) {
                if (statement.alternate.type === utils_1.AST_NODE_TYPES.ReturnStatement &&
                    statement.alternate.argument) {
                    if (isJsxElement(statement.alternate.argument)) {
                        return true;
                    }
                    if (statement.alternate.argument.type === utils_1.AST_NODE_TYPES.Identifier &&
                        variablesWithJsx.has(statement.alternate.argument.name)) {
                        return true;
                    }
                }
                if (statement.alternate.type === utils_1.AST_NODE_TYPES.BlockStatement &&
                    containsJsxInBlockStatement(statement.alternate)) {
                    return true;
                }
            }
        }
    }
    return false;
};
const containsJsxInUseMemo = (node) => {
    if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
        node.callee.name === 'useMemo' &&
        node.arguments.length > 0) {
        const callback = node.arguments[0];
        if (callback.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
            callback.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
            const body = callback.body;
            if (isJsxElement(body)) {
                return true;
            }
            if (body.type === utils_1.AST_NODE_TYPES.BlockStatement) {
                return containsJsxInBlockStatement(body);
            }
            if (body.type === utils_1.AST_NODE_TYPES.CallExpression &&
                body.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                body.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                body.callee.property.name === 'map') {
                const mapCallback = body.arguments[0];
                if ((mapCallback.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                    mapCallback.type === utils_1.AST_NODE_TYPES.FunctionExpression) &&
                    isJsxElement(mapCallback.body)) {
                    return true;
                }
            }
        }
    }
    return false;
};
exports.noJsxInHooks = (0, createRule_1.createRule)({
    name: 'no-jsx-in-hooks',
    meta: {
        type: 'problem',
        docs: {
            description: 'Prevent hooks from returning JSX',
            recommended: 'error',
        },
        schema: [],
        messages: {
            noJsxInHooks: 'Hook "{{hookName}}" returns JSX. Hooks are meant to expose data and behavior; embedding JSX turns the hook into a hidden component and forces callers to use a hook where a component should render. Move the JSX into a component and have the hook return the values and callbacks that component needs instead.',
        },
    },
    defaultOptions: [],
    create(context) {
        return {
            FunctionDeclaration(node) {
                if (node.id && node.id.name.startsWith('use')) {
                    // Check return type annotation
                    if (node.returnType && isJsxReturnType(node.returnType)) {
                        context.report({
                            node: node.id,
                            messageId: 'noJsxInHooks',
                            data: { hookName: node.id.name },
                        });
                        return;
                    }
                    // Check return statements
                    if (node.body.type === utils_1.AST_NODE_TYPES.BlockStatement) {
                        if (containsJsxInBlockStatement(node.body)) {
                            context.report({
                                node: node.id,
                                messageId: 'noJsxInHooks',
                                data: { hookName: node.id.name },
                            });
                        }
                    }
                }
            },
            ArrowFunctionExpression(node) {
                const parent = node.parent;
                if (parent &&
                    parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                    parent.id.type === utils_1.AST_NODE_TYPES.Identifier &&
                    parent.id.name.startsWith('use')) {
                    // Check return type annotation
                    if (node.returnType && isJsxReturnType(node.returnType)) {
                        context.report({
                            node: parent.id,
                            messageId: 'noJsxInHooks',
                            data: { hookName: parent.id.name },
                        });
                        return;
                    }
                    // Check direct JSX return
                    if (isJsxElement(node.body)) {
                        context.report({
                            node: parent.id,
                            messageId: 'noJsxInHooks',
                            data: { hookName: parent.id.name },
                        });
                        return;
                    }
                    // Check block body returns
                    if (node.body.type === utils_1.AST_NODE_TYPES.BlockStatement) {
                        if (containsJsxInBlockStatement(node.body)) {
                            context.report({
                                node: parent.id,
                                messageId: 'noJsxInHooks',
                                data: { hookName: parent.id.name },
                            });
                        }
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=no-jsx-in-hooks.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reactUseMemoShouldBeComponent = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
/**
 * Checks if a node is a JSX element or fragment
 */
const isJsxElement = (node) => {
    if (!node)
        return false;
    if (node.type === utils_1.AST_NODE_TYPES.ConditionalExpression) {
        return isJsxElement(node.consequent) || isJsxElement(node.alternate);
    }
    return (node.type === utils_1.AST_NODE_TYPES.JSXElement ||
        node.type === utils_1.AST_NODE_TYPES.JSXFragment);
};
/**
 * Checks if an object contains JSX elements in its properties
 */
const containsJsxInObject = (node) => {
    for (const property of node.properties) {
        if (property.type === utils_1.AST_NODE_TYPES.Property && property.value) {
            if (isJsxElement(property.value)) {
                return true;
            }
            // Check nested objects
            if (property.value.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                if (containsJsxInObject(property.value)) {
                    return true;
                }
            }
        }
    }
    return false;
};
/**
 * Checks if a switch statement contains JSX elements
 */
const containsJsxInSwitchStatement = (node) => {
    for (const switchCase of node.cases) {
        for (const statement of switchCase.consequent) {
            if (statement.type === utils_1.AST_NODE_TYPES.ReturnStatement && statement.argument) {
                if (isJsxElement(statement.argument)) {
                    return true;
                }
            }
            if (statement.type === utils_1.AST_NODE_TYPES.BlockStatement) {
                if (containsJsxInBlockStatement(statement)) {
                    return true;
                }
            }
        }
    }
    return false;
};
/**
 * Checks if a function contains JSX elements
 */
const containsJsxInFunction = (node) => {
    const body = node.body;
    // Direct JSX return
    if (isJsxElement(body)) {
        return true;
    }
    // JSX in block statement
    if (body.type === utils_1.AST_NODE_TYPES.BlockStatement) {
        return containsJsxInBlockStatement(body);
    }
    // Check for array methods returning JSX
    if (body.type === utils_1.AST_NODE_TYPES.CallExpression) {
        if (body.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
            body.callee.property.type === utils_1.AST_NODE_TYPES.Identifier) {
            // Check array methods like map, filter, find, etc.
            const arrayMethods = ['map', 'filter', 'find', 'findIndex', 'some', 'every', 'reduce'];
            if (arrayMethods.includes(body.callee.property.name) && body.arguments.length > 0) {
                const callback = body.arguments[0];
                if ((callback.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                    callback.type === utils_1.AST_NODE_TYPES.FunctionExpression) &&
                    containsJsxInFunction(callback)) {
                    return true;
                }
            }
        }
        // Check for IIFE
        if ((body.callee.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
            body.callee.type === utils_1.AST_NODE_TYPES.FunctionExpression) &&
            containsJsxInFunction(body.callee)) {
            return true;
        }
        // Check for IIFE with parentheses
        if (body.callee.type === utils_1.AST_NODE_TYPES.CallExpression) {
            return containsJsxInExpression(body);
        }
    }
    return false;
};
/**
 * Checks if an expression contains JSX elements
 */
const containsJsxInExpression = (node) => {
    if (!node)
        return false;
    if (isJsxElement(node)) {
        return true;
    }
    switch (node.type) {
        case utils_1.AST_NODE_TYPES.ConditionalExpression:
            return containsJsxInExpression(node.consequent) || containsJsxInExpression(node.alternate);
        case utils_1.AST_NODE_TYPES.LogicalExpression:
            return containsJsxInExpression(node.left) || containsJsxInExpression(node.right);
        case utils_1.AST_NODE_TYPES.ObjectExpression:
            return containsJsxInObject(node);
        case utils_1.AST_NODE_TYPES.CallExpression:
            // Check if it's an IIFE
            if (node.callee.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                node.callee.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
                return containsJsxInFunction(node.callee);
            }
            // Check array methods
            if (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier) {
                const arrayMethods = ['map', 'filter', 'find', 'findIndex', 'some', 'every', 'reduce'];
                if (arrayMethods.includes(node.callee.property.name) && node.arguments.length > 0) {
                    const callback = node.arguments[0];
                    if ((callback.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                        callback.type === utils_1.AST_NODE_TYPES.FunctionExpression)) {
                        return containsJsxInFunction(callback);
                    }
                }
            }
            // Check arguments for JSX
            for (const arg of node.arguments) {
                if (arg.type !== utils_1.AST_NODE_TYPES.SpreadElement && containsJsxInExpression(arg)) {
                    return true;
                }
            }
            return false;
        case utils_1.AST_NODE_TYPES.ArrowFunctionExpression:
        case utils_1.AST_NODE_TYPES.FunctionExpression:
            return containsJsxInFunction(node);
        default:
            return false;
    }
};
/**
 * Checks if a block statement contains JSX elements
 */
const containsJsxInBlockStatement = (node) => {
    for (const statement of node.body) {
        // Check return statements
        if (statement.type === utils_1.AST_NODE_TYPES.ReturnStatement && statement.argument) {
            if (containsJsxInExpression(statement.argument)) {
                return true;
            }
        }
        // Check if statements
        if (statement.type === utils_1.AST_NODE_TYPES.IfStatement) {
            if (statement.consequent.type === utils_1.AST_NODE_TYPES.ReturnStatement &&
                statement.consequent.argument && containsJsxInExpression(statement.consequent.argument)) {
                return true;
            }
            if (statement.consequent.type === utils_1.AST_NODE_TYPES.BlockStatement &&
                containsJsxInBlockStatement(statement.consequent)) {
                return true;
            }
            if (statement.alternate) {
                if (statement.alternate.type === utils_1.AST_NODE_TYPES.ReturnStatement &&
                    statement.alternate.argument && containsJsxInExpression(statement.alternate.argument)) {
                    return true;
                }
                if (statement.alternate.type === utils_1.AST_NODE_TYPES.BlockStatement &&
                    containsJsxInBlockStatement(statement.alternate)) {
                    return true;
                }
                if (statement.alternate.type === utils_1.AST_NODE_TYPES.IfStatement) {
                    // Handle else if
                    if (containsJsxInExpression(statement.alternate.test)) {
                        return true;
                    }
                    if (statement.alternate.consequent &&
                        ((statement.alternate.consequent.type === utils_1.AST_NODE_TYPES.ReturnStatement &&
                            statement.alternate.consequent.argument &&
                            containsJsxInExpression(statement.alternate.consequent.argument)) ||
                            (statement.alternate.consequent.type === utils_1.AST_NODE_TYPES.BlockStatement &&
                                containsJsxInBlockStatement(statement.alternate.consequent)))) {
                        return true;
                    }
                }
            }
        }
        // Check switch statements
        if (statement.type === utils_1.AST_NODE_TYPES.SwitchStatement) {
            if (containsJsxInSwitchStatement(statement)) {
                return true;
            }
        }
        // Check variable declarations for JSX
        if (statement.type === utils_1.AST_NODE_TYPES.VariableDeclaration) {
            for (const declarator of statement.declarations) {
                if (declarator.init && containsJsxInExpression(declarator.init)) {
                    return true;
                }
            }
        }
        // Check expressions
        if (statement.type === utils_1.AST_NODE_TYPES.ExpressionStatement &&
            containsJsxInExpression(statement.expression)) {
            return true;
        }
    }
    return false;
};
/**
 * Checks if a useMemo call contains JSX elements
 */
const containsJsxInUseMemo = (node) => {
    if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
        node.callee.name === 'useMemo' &&
        node.arguments.length > 0) {
        const callback = node.arguments[0];
        if (callback.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
            callback.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
            return containsJsxInFunction(callback);
        }
    }
    return false;
};
exports.reactUseMemoShouldBeComponent = (0, createRule_1.createRule)({
    name: 'react-usememo-should-be-component',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce that useMemo hooks returning React nodes should be abstracted into separate React components',
            recommended: 'error',
        },
        schema: [],
        messages: {
            useMemoShouldBeComponent: 'useMemo returning JSX should be extracted into a separate component. Use React.memo() for component memoization instead.',
        },
    },
    defaultOptions: [],
    create(context) {
        return {
            CallExpression(node) {
                if (containsJsxInUseMemo(node)) {
                    context.report({
                        node,
                        messageId: 'useMemoShouldBeComponent',
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=react-usememo-should-be-component.js.map
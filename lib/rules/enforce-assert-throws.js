"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceAssertThrows = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
function isCallbackFunctionNode(node) {
    if (node.type !== utils_1.AST_NODE_TYPES.FunctionExpression &&
        node.type !== utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
        return false;
    }
    const parent = node.parent;
    if (!parent)
        return false;
    if (parent.type === utils_1.AST_NODE_TYPES.CallExpression) {
        const grandParent = parent.parent;
        if (grandParent &&
            (grandParent.type === utils_1.AST_NODE_TYPES.ConditionalExpression ||
                grandParent.type === utils_1.AST_NODE_TYPES.LogicalExpression)) {
            return true;
        }
        return parent.arguments.includes(node) || parent.callee === node;
    }
    if (parent.type === utils_1.AST_NODE_TYPES.ConditionalExpression ||
        parent.type === utils_1.AST_NODE_TYPES.LogicalExpression) {
        return true;
    }
    return false;
}
function isTypeLikeNode(node) {
    return node.type.startsWith('TS') || node.type.endsWith('TypeAnnotation');
}
exports.enforceAssertThrows = (0, createRule_1.createRule)({
    name: 'enforce-assert-throws',
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce that functions with an assert prefix must throw an error or call process.exit(1), and functions that call assert-prefixed methods should themselves be assert-prefixed',
            recommended: 'error',
        },
        schema: [],
        messages: {
            assertShouldThrow: 'Assert helper "{{functionName}}" does not throw, exit, or delegate to another assert helper. Assert-prefixed functions are fail-fast guards; letting them return normally hides failed checks and allows callers to continue with invalid state. Throw an error, call process.exit(1), or rename the function if it should not halt execution.',
            shouldBeAssertPrefixed: 'Function "{{functionName}}" calls an assert-prefixed helper but is not assert-prefixed itself. The assert- prefix signals that the function terminates on failed checks; without it, callers may assume it returns safely and keep running after an assertion aborts. Rename the function to start with "assert" or avoid calling assert helpers from non-assert functions.',
        },
    },
    defaultOptions: [],
    create(context) {
        let currentFunction = null;
        function traverseFunctionBody(root, visitor) {
            const walk = (node) => {
                if (visitor(node))
                    return true;
                if (isTypeLikeNode(node))
                    return false;
                if (node.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
                    node.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                    node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
                    if (node !== currentFunction && !isCallbackFunctionNode(node)) {
                        return false;
                    }
                }
                switch (node.type) {
                    case utils_1.AST_NODE_TYPES.CatchClause:
                        return walk(node.body);
                    case utils_1.AST_NODE_TYPES.TryStatement:
                        if (walk(node.block))
                            return true;
                        if (node.handler && walk(node.handler))
                            return true;
                        if (node.finalizer && walk(node.finalizer))
                            return true;
                        return false;
                    case utils_1.AST_NODE_TYPES.BlockStatement:
                        return node.body.some((stmt) => walk(stmt));
                    case utils_1.AST_NODE_TYPES.IfStatement:
                        if (walk(node.consequent))
                            return true;
                        if (node.alternate && walk(node.alternate))
                            return true;
                        return false;
                    case utils_1.AST_NODE_TYPES.ConditionalExpression:
                        return walk(node.consequent) || walk(node.alternate);
                    case utils_1.AST_NODE_TYPES.LogicalExpression:
                        return walk(node.left) || walk(node.right);
                    case utils_1.AST_NODE_TYPES.ForStatement:
                    case utils_1.AST_NODE_TYPES.ForInStatement:
                    case utils_1.AST_NODE_TYPES.ForOfStatement:
                    case utils_1.AST_NODE_TYPES.WhileStatement:
                    case utils_1.AST_NODE_TYPES.DoWhileStatement:
                        return walk(node.body);
                    case utils_1.AST_NODE_TYPES.SwitchStatement:
                        return node.cases.some((caseNode) => walk(caseNode));
                    case utils_1.AST_NODE_TYPES.SwitchCase:
                        return node.consequent.some((stmt) => walk(stmt));
                    case utils_1.AST_NODE_TYPES.LabeledStatement:
                    case utils_1.AST_NODE_TYPES.WithStatement:
                        return walk(node.body);
                    case utils_1.AST_NODE_TYPES.ExpressionStatement:
                        return walk(node.expression);
                    case utils_1.AST_NODE_TYPES.ReturnStatement:
                        return node.argument ? walk(node.argument) : false;
                    case utils_1.AST_NODE_TYPES.CallExpression:
                        return node.arguments.some((arg) => walk(arg));
                    case utils_1.AST_NODE_TYPES.FunctionExpression:
                    case utils_1.AST_NODE_TYPES.ArrowFunctionExpression:
                        if (isCallbackFunctionNode(node)) {
                            if (node.body.type === utils_1.AST_NODE_TYPES.BlockStatement) {
                                return walk(node.body);
                            }
                            return walk(node.body);
                        }
                        return false;
                    case utils_1.AST_NODE_TYPES.VariableDeclaration:
                        return node.declarations.some((decl) => walk(decl));
                    case utils_1.AST_NODE_TYPES.VariableDeclarator:
                        return node.init ? walk(node.init) : false;
                    case utils_1.AST_NODE_TYPES.AwaitExpression:
                        return walk(node.argument);
                    default:
                        for (const key of Object.keys(node)) {
                            if (key === 'parent' || key === 'range' || key === 'loc')
                                continue;
                            const value = node[key];
                            if (Array.isArray(value)) {
                                for (const item of value) {
                                    if (item &&
                                        typeof item === 'object' &&
                                        'type' in item &&
                                        !isTypeLikeNode(item)) {
                                        if (walk(item))
                                            return true;
                                    }
                                }
                            }
                            else if (value &&
                                typeof value === 'object' &&
                                'type' in value &&
                                !isTypeLikeNode(value)) {
                                if (walk(value))
                                    return true;
                            }
                        }
                        return false;
                }
            };
            return walk(root);
        }
        function callsAssertMethod(node) {
            return traverseFunctionBody(node, (current) => {
                if (current.type !== utils_1.AST_NODE_TYPES.CallExpression)
                    return false;
                const callee = current.callee;
                if (callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                    callee.name.toLowerCase().startsWith('assert')) {
                    return true;
                }
                if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    callee.property.name.toLowerCase().startsWith('assert')) {
                    return true;
                }
                return false;
            });
        }
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
        // Check if a call expression is calling an assert-prefixed method
        function isCallingAssertMethod(node, functionBody) {
            if (node.type === utils_1.AST_NODE_TYPES.ReturnStatement && node.argument) {
                return isCallingAssertMethodInExpression(node.argument, functionBody || undefined);
            }
            else if (node.type === utils_1.AST_NODE_TYPES.ExpressionStatement) {
                return isCallingAssertMethodInExpression(node.expression, functionBody || undefined);
            }
            return false;
        }
        function isCallingAssertMethodInExpression(expression, functionBody) {
            // Handle direct call: this.assertSomething()
            if (expression.type === utils_1.AST_NODE_TYPES.CallExpression) {
                const callee = expression.callee;
                if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                    const property = callee.property;
                    if (property.type === utils_1.AST_NODE_TYPES.Identifier) {
                        return property.name.toLowerCase().startsWith('assert');
                    }
                }
                else if (callee.type === utils_1.AST_NODE_TYPES.Identifier) {
                    // Check if it's a direct assert function call
                    if (callee.name.toLowerCase().startsWith('assert')) {
                        return true;
                    }
                    // Check if it's a variable that was assigned an assert method
                    if (functionBody &&
                        isCallingVariableAssignedAssertMethod(expression, functionBody)) {
                        return true;
                    }
                }
                // Handle chained calls: this.assertA().then(() => this.assertB())
                if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    callee.property.type === utils_1.AST_NODE_TYPES.Identifier) {
                    // Check if the method name is 'then' or other promise-related methods
                    if (['then', 'catch', 'finally'].includes(callee.property.name)) {
                        // Check if the first part of the chain is an assert call
                        if (callee.object.type === utils_1.AST_NODE_TYPES.CallExpression) {
                            const objectCallee = callee.object.callee;
                            if (objectCallee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                                objectCallee.property.type === utils_1.AST_NODE_TYPES.Identifier) {
                                if (objectCallee.property.name.toLowerCase().startsWith('assert')) {
                                    return true;
                                }
                            }
                        }
                        // Check if any of the arguments to then/catch/finally are calling assert methods
                        if (expression.arguments.length > 0) {
                            for (const arg of expression.arguments) {
                                if (arg.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                                    arg.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
                                    // Check the function body for assert calls
                                    if (arg.body.type === utils_1.AST_NODE_TYPES.BlockStatement) {
                                        for (const stmt of arg.body.body) {
                                            if (isCallingAssertMethod(stmt)) {
                                                return true;
                                            }
                                        }
                                    }
                                    else if (arg.body.type === utils_1.AST_NODE_TYPES.CallExpression) {
                                        // Arrow function with expression body
                                        const arrowCallee = arg.body.callee;
                                        if (arrowCallee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                                            arrowCallee.property.type === utils_1.AST_NODE_TYPES.Identifier) {
                                            if (arrowCallee.property.name
                                                .toLowerCase()
                                                .startsWith('assert')) {
                                                return true;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            // Handle await expression: await this.assertSomething()
            if (expression.type === utils_1.AST_NODE_TYPES.AwaitExpression) {
                return isCallingAssertMethodInExpression(expression.argument, functionBody);
            }
            // Handle ternary expressions: condition ? this.assertA() : this.assertB()
            if (expression.type === utils_1.AST_NODE_TYPES.ConditionalExpression) {
                return (isCallingAssertMethodInExpression(expression.consequent, functionBody) ||
                    isCallingAssertMethodInExpression(expression.alternate, functionBody));
            }
            // Handle logical expressions: this.assertA() || this.assertB()
            if (expression.type === utils_1.AST_NODE_TYPES.LogicalExpression) {
                return (isCallingAssertMethodInExpression(expression.left, functionBody) ||
                    isCallingAssertMethodInExpression(expression.right, functionBody));
            }
            return false;
        }
        // Special case for the method chaining pattern in the test
        function hasPromiseChainWithAssertMethods(node) {
            const walkChain = (callExpr) => {
                let current = callExpr;
                while (current) {
                    const callee = current.callee;
                    if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                        callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                        callee.property.name.toLowerCase().startsWith('assert')) {
                        return true;
                    }
                    if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                        callee.object.type === utils_1.AST_NODE_TYPES.CallExpression) {
                        // Walk further up any chained call (then/catch/finally or other links).
                        current = callee.object;
                        continue;
                    }
                    break;
                }
                return false;
            };
            if (node.type === utils_1.AST_NODE_TYPES.ReturnStatement && node.argument) {
                if (node.argument.type === utils_1.AST_NODE_TYPES.CallExpression &&
                    walkChain(node.argument)) {
                    return true;
                }
            }
            if (node.type === utils_1.AST_NODE_TYPES.VariableDeclaration) {
                for (const declarator of node.declarations) {
                    if (declarator.init &&
                        declarator.init.type === utils_1.AST_NODE_TYPES.AwaitExpression &&
                        declarator.init.argument.type === utils_1.AST_NODE_TYPES.CallExpression &&
                        walkChain(declarator.init.argument)) {
                        return true;
                    }
                }
            }
            return false;
        }
        // Check if a variable is assigned an assert method
        function isVariableAssignedAssertMethod(node, variableName) {
            if (node.type === utils_1.AST_NODE_TYPES.VariableDeclaration) {
                for (const declarator of node.declarations) {
                    if (declarator.id.type === utils_1.AST_NODE_TYPES.Identifier &&
                        declarator.id.name === variableName &&
                        declarator.init) {
                        if (declarator.init.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                            declarator.init.property.type === utils_1.AST_NODE_TYPES.Identifier) {
                            return declarator.init.property.name
                                .toLowerCase()
                                .startsWith('assert');
                        }
                    }
                }
            }
            return false;
        }
        // Check if a call expression is calling a variable that was assigned an assert method
        function isCallingVariableAssignedAssertMethod(expression, functionBody) {
            if (expression.callee.type === utils_1.AST_NODE_TYPES.Identifier) {
                const variableName = expression.callee.name;
                // Check if this variable was assigned an assert method in the function body
                for (const stmt of functionBody.body) {
                    if (isVariableAssignedAssertMethod(stmt, variableName)) {
                        return true;
                    }
                }
            }
            return false;
        }
        function hasThrowStatement(node) {
            const functionBody = node.type === utils_1.AST_NODE_TYPES.BlockStatement ? node : null;
            return traverseFunctionBody(node, (current) => {
                if (current.type === utils_1.AST_NODE_TYPES.ThrowStatement) {
                    return true;
                }
                if (current.type === utils_1.AST_NODE_TYPES.ExpressionStatement &&
                    isProcessExit1(current.expression)) {
                    return true;
                }
                if (isAssertionCall(current)) {
                    return true;
                }
                if (isCallingAssertMethod(current, functionBody)) {
                    return true;
                }
                if (hasPromiseChainWithAssertMethods(current)) {
                    return true;
                }
                return false;
            });
        }
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
            const displayName = functionName || 'this function';
            currentFunction = node;
            const functionBody = node.type === utils_1.AST_NODE_TYPES.MethodDefinition
                ? node.value.body
                : node.body;
            if (functionName.toLowerCase().startsWith('assert')) {
                // Check that assert-prefixed functions throw or call other assert functions
                if (functionBody && !hasThrowStatement(functionBody)) {
                    context.report({
                        node,
                        messageId: 'assertShouldThrow',
                        data: { functionName: displayName },
                    });
                }
            }
            else if (functionName && functionBody) {
                // Check that functions calling assert-prefixed methods are themselves prefixed with assert
                if (callsAssertMethod(functionBody)) {
                    context.report({
                        node,
                        messageId: 'shouldBeAssertPrefixed',
                        data: { functionName: displayName },
                    });
                }
            }
            currentFunction = null;
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
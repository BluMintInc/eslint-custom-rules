"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reactUseMemoShouldBeComponent = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const ARRAY_RETURNING_METHODS = new Set([
    'map',
    'flatMap',
    'filter',
    'concat',
    'slice',
]);
/**
 * Checks if a node is a JSX element or fragment
 */
const isJsxElement = (node) => {
    if (!node)
        return false;
    if (node.type === utils_1.AST_NODE_TYPES.ConditionalExpression) {
        return isJsxElement(node.consequent) || isJsxElement(node.alternate);
    }
    // For logical expressions like '&&', the result can be a non-JSX value
    if (node.type === utils_1.AST_NODE_TYPES.LogicalExpression) {
        // If it's a logical AND (&&), it can return the left operand which might be non-JSX
        if (node.operator === '&&') {
            return false;
        }
        // For other logical operators, check both sides
        return isJsxElement(node.left) || isJsxElement(node.right);
    }
    return (node.type === utils_1.AST_NODE_TYPES.JSXElement ||
        node.type === utils_1.AST_NODE_TYPES.JSXFragment);
};
/**
 * True if the resolved variable is referenced inside a JSX prop (attribute or spread).
 */
const isUsedAsComponentProp = (context, variableName, node) => {
    // Find containing function for proper scope acquisition
    let current = node;
    let fn;
    while (current?.parent) {
        current = current.parent;
        if (current.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
            current.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
            current.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
            fn = current;
            break;
        }
    }
    const sourceCode = context.sourceCode;
    const scopeManager = sourceCode.scopeManager;
    const scope = scopeManager &&
        ((fn && scopeManager.acquire(fn)) || scopeManager.acquire(node));
    if (!scopeManager || !scope) {
        return true;
    }
    const variable = scope.variables.find((v) => v.name === variableName) ??
        scope.upper?.variables.find((v) => v.name === variableName) ??
        null;
    if (!variable) {
        return true;
    }
    for (const ref of variable.references) {
        let p = ref.identifier.parent ?? null;
        while (p) {
            if (p.type === utils_1.AST_NODE_TYPES.JSXAttribute ||
                p.type === utils_1.AST_NODE_TYPES.JSXSpreadAttribute) {
                return true;
            }
            p = p.parent;
        }
    }
    return false;
};
const isUsedAsJsxChild = (context, variableName, node) => {
    // Traverse the nearest function (or program) to see if the identifier appears
    // as a JSX child expression.
    const sourceCode = context.sourceCode;
    let container = sourceCode.ast;
    let current = node;
    while (current?.parent) {
        current = current.parent;
        if (current.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
            current.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
            current.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
            container = current;
            break;
        }
    }
    let found = false;
    const visited = new Set();
    const visit = (n) => {
        if (found || visited.has(n))
            return;
        visited.add(n);
        if (n.type === utils_1.AST_NODE_TYPES.JSXExpressionContainer &&
            n.expression.type === utils_1.AST_NODE_TYPES.Identifier &&
            n.expression.name === variableName &&
            n.parent &&
            (n.parent.type === utils_1.AST_NODE_TYPES.JSXElement ||
                n.parent.type === utils_1.AST_NODE_TYPES.JSXFragment) &&
            n.parent.children.includes(n)) {
            found = true;
            return;
        }
        for (const key of Object.keys(n)) {
            if (key === 'parent')
                continue;
            const value = n[key];
            if (!value)
                continue;
            if (Array.isArray(value)) {
                for (const child of value) {
                    if (child && typeof child.type === 'string') {
                        visit(child);
                    }
                }
            }
            else if (value && typeof value.type === 'string') {
                visit(value);
            }
        }
    };
    visit(container);
    return found;
};
/**
 * Checks if a variable is used multiple times in a component
 */
const isUsedMultipleTimes = (variableName, node) => {
    // Find the function component that contains this node
    let currentNode = node;
    let functionNode;
    // Walk up the AST to find the function component
    while (currentNode.parent) {
        currentNode = currentNode.parent;
        if (currentNode.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
            currentNode.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
            currentNode.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
            functionNode = currentNode;
            break;
        }
    }
    if (!functionNode) {
        return false;
    }
    // Count occurrences of the variable in the function body
    let count = 0;
    // Function to recursively search for references to the variable
    const findReferences = (searchNode) => {
        if (!searchNode)
            return;
        // Check if this node is a reference to our variable
        if (searchNode.type === utils_1.AST_NODE_TYPES.Identifier &&
            searchNode.name === variableName &&
            // Exclude the declaration itself
            !(searchNode.parent &&
                searchNode.parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                searchNode.parent.id === searchNode)) {
            count++;
        }
        // Recursively check all properties of the node
        for (const key in searchNode) {
            if (key === 'parent')
                continue; // Skip parent to avoid circular references
            const child = searchNode[key];
            if (child && typeof child === 'object') {
                if (Array.isArray(child)) {
                    child.forEach((item) => {
                        if (item && typeof item === 'object') {
                            findReferences(item);
                        }
                    });
                }
                else {
                    findReferences(child);
                }
            }
        }
    };
    // Start the search from the function body
    if (functionNode.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
        findReferences(functionNode.body);
    }
    else if (functionNode.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
        functionNode.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
        findReferences(functionNode.body);
    }
    // Return true if the variable is referenced more than once
    return count > 1;
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
            if (statement.type === utils_1.AST_NODE_TYPES.ReturnStatement &&
                statement.argument) {
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
    // For FunctionDeclaration, we need to check the body
    if (node.type === utils_1.AST_NODE_TYPES.FunctionDeclaration) {
        if (node.body && node.body.type === utils_1.AST_NODE_TYPES.BlockStatement) {
            return containsJsxInBlockStatement(node.body);
        }
        return false;
    }
    const body = node.body;
    // Direct JSX return
    if (isJsxElement(body)) {
        return true;
    }
    // JSX in block statement
    if (body.type === utils_1.AST_NODE_TYPES.BlockStatement) {
        return containsJsxInBlockStatement(body);
    }
    // Check for array methods returning arrays (do not flag arrays of JSX)
    if (body.type === utils_1.AST_NODE_TYPES.CallExpression) {
        if (body.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
            body.callee.property.type === utils_1.AST_NODE_TYPES.Identifier) {
            if (ARRAY_RETURNING_METHODS.has(body.callee.property.name)) {
                // Returning an array (even if its elements are JSX) should not be flagged
                return false;
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
 *
 * This function is used to determine if a useMemo hook is returning JSX directly.
 * We want to avoid flagging useMemo hooks that return data structures that happen to contain JSX,
 * as these are typically used for configuration or data preparation, not for rendering components.
 */
const containsJsxInExpression = (node) => {
    if (!node)
        return false;
    // Direct JSX element or fragment
    if (isJsxElement(node)) {
        return true;
    }
    switch (node.type) {
        case utils_1.AST_NODE_TYPES.ConditionalExpression:
            return (containsJsxInExpression(node.consequent) ||
                containsJsxInExpression(node.alternate));
        case utils_1.AST_NODE_TYPES.LogicalExpression:
            // For logical AND (&&) expressions, if the left side can be falsy,
            // then the expression can return a non-JSX value, so we should not flag it
            if (node.operator === '&&') {
                // If the left side is a boolean expression or can be falsy, this can return a non-JSX value
                return false;
            }
            return (containsJsxInExpression(node.left) ||
                containsJsxInExpression(node.right));
        case utils_1.AST_NODE_TYPES.ObjectExpression:
            // Special case: If this is an object with both JSX and non-JSX properties,
            // it's likely a data structure that happens to contain JSX, not a component
            let hasNonJsxProperties = false;
            let hasJsxProperties = false;
            for (const property of node.properties) {
                if (property.type === utils_1.AST_NODE_TYPES.Property && property.value) {
                    if (isJsxElement(property.value)) {
                        hasJsxProperties = true;
                    }
                    else if (property.value.type !== utils_1.AST_NODE_TYPES.ObjectExpression) {
                        hasNonJsxProperties = true;
                    }
                }
            }
            // If the object has both JSX and non-JSX properties, it's likely a data object
            // that happens to contain JSX, not a component that should be extracted
            if (hasNonJsxProperties && hasJsxProperties) {
                return false;
            }
            // If it only has JSX properties, it might be a collection of components
            if (hasJsxProperties && !hasNonJsxProperties) {
                return true;
            }
            return containsJsxInObject(node);
        case utils_1.AST_NODE_TYPES.CallExpression:
            // Do not flag arrays of JSX: common array-producing patterns
            if (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier) {
                if (ARRAY_RETURNING_METHODS.has(node.callee.property.name)) {
                    return false;
                }
            }
            // Array.from(...) returns an array as well
            if (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                node.callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                node.callee.object.name === 'Array' &&
                node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                node.callee.property.name === 'from') {
                return false;
            }
            // Check if it's an IIFE
            if (node.callee.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                node.callee.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
                return containsJsxInFunction(node.callee);
            }
            // Do not flag based on JSX in arguments of non-IIFE calls
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
        if (statement.type === utils_1.AST_NODE_TYPES.ReturnStatement &&
            statement.argument) {
            if (containsJsxInExpression(statement.argument)) {
                return true;
            }
        }
        // Check if statements
        if (statement.type === utils_1.AST_NODE_TYPES.IfStatement) {
            if (statement.consequent.type === utils_1.AST_NODE_TYPES.ReturnStatement &&
                statement.consequent.argument &&
                containsJsxInExpression(statement.consequent.argument)) {
                return true;
            }
            if (statement.consequent.type === utils_1.AST_NODE_TYPES.BlockStatement &&
                containsJsxInBlockStatement(statement.consequent)) {
                return true;
            }
            if (statement.alternate) {
                if (statement.alternate.type === utils_1.AST_NODE_TYPES.ReturnStatement &&
                    statement.alternate.argument &&
                    containsJsxInExpression(statement.alternate.argument)) {
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
                        ((statement.alternate.consequent.type ===
                            utils_1.AST_NODE_TYPES.ReturnStatement &&
                            statement.alternate.consequent.argument &&
                            containsJsxInExpression(statement.alternate.consequent.argument)) ||
                            (statement.alternate.consequent.type ===
                                utils_1.AST_NODE_TYPES.BlockStatement &&
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
                if (declarator.init) {
                    // Ignore nested function expressions (helpers/callbacks) even if they return JSX
                    if (declarator.init.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                        declarator.init.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
                        continue;
                    }
                    if (containsJsxInExpression(declarator.init)) {
                        return true;
                    }
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
 * Checks if a useMemo call directly returns JSX elements
 *
 * This function distinguishes between:
 * 1. useMemo returning JSX directly (invalid)
 * 2. useMemo returning an object that contains JSX properties (valid)
 * 3. useMemo returning non-JSX values like numbers, strings, etc. (valid)
 *
 * The rule should only fire when useMemo explicitly returns ReactNode from JSX.
 */
const containsJsxInUseMemo = (node) => {
    if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
        node.callee.name === 'useMemo' &&
        node.arguments.length > 0) {
        const callback = node.arguments[0];
        if (callback.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
            callback.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
            // For block statements, we need to check if any return statement contains JSX
            if (callback.body.type === utils_1.AST_NODE_TYPES.BlockStatement) {
                // Check each return statement to see if it returns JSX
                for (const statement of callback.body.body) {
                    if (statement.type === utils_1.AST_NODE_TYPES.ReturnStatement &&
                        statement.argument &&
                        isJsxElement(statement.argument)) {
                        return true;
                    }
                }
                // If we didn't find any return statements with JSX, check for more complex patterns
                return containsJsxInBlockStatement(callback.body);
            }
            else {
                // Direct JSX element - this is the primary case we want to catch
                if (isJsxElement(callback.body)) {
                    return true;
                }
                // Special case for logical expressions that can return non-JSX values
                if (callback.body.type === utils_1.AST_NODE_TYPES.LogicalExpression &&
                    callback.body.operator === '&&') {
                    return false;
                }
                // For non-JSX expressions, we need to check if they contain JSX
                return containsJsxInExpression(callback.body);
            }
        }
    }
    return false;
};
exports.reactUseMemoShouldBeComponent = (0, createRule_1.createRule)({
    name: 'react-usememo-should-be-component',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce that useMemo hooks explicitly returning JSX should be abstracted into separate React components',
            recommended: 'error',
        },
        schema: [],
        messages: {
            useMemoShouldBeComponent: 'useMemo result "{{memoName}}" returns JSX, which hides a component inside a memoized value. JSX needs component identity so React can manage props, state, and dev tooling; wrapping it in useMemo bypasses that boundary and makes reuse/debugging harder. Extract this JSX into its own component and memoize it with React.memo if stability is required.',
        },
    },
    defaultOptions: [],
    create(context) {
        return {
            CallExpression(node) {
                if (containsJsxInUseMemo(node)) {
                    // Check if this is a variable declaration
                    if (node.parent &&
                        node.parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                        node.parent.id.type === utils_1.AST_NODE_TYPES.Identifier) {
                        const variableName = node.parent.id.name;
                        // Only report when the memoized value is used as a JSX child
                        if (!isUsedAsJsxChild(context, variableName, node)) {
                            return;
                        }
                        // Check if the variable is used multiple times in the component
                        if (isUsedMultipleTimes(variableName, node)) {
                            // If the variable is used multiple times, allow it
                            return;
                        }
                        // Check if the variable is used as a prop value in a JSX element
                        if (isUsedAsComponentProp(context, variableName, node)) {
                            // If the variable is used as a prop value, allow it
                            return;
                        }
                    }
                    const memoName = node.parent &&
                        node.parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                        node.parent.id.type === utils_1.AST_NODE_TYPES.Identifier
                        ? node.parent.id.name
                        : 'useMemo return value';
                    context.report({
                        node,
                        messageId: 'useMemoShouldBeComponent',
                        data: {
                            memoName,
                        },
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=react-usememo-should-be-component.js.map
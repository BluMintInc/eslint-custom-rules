"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const createRule_1 = require("../utils/createRule");
const utils_1 = require("@typescript-eslint/utils");
exports.default = (0, createRule_1.createRule)({
    name: 'enforce-callback-memo',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce useCallback for inline functions and useMemo for objects/arrays containing functions in JSX props to prevent unnecessary re-renders. This improves React component performance by ensuring stable function references across renders and memoizing complex objects.',
            recommended: 'error',
        },
        messages: {
            enforceCallback: 'Inline functions in JSX props should be wrapped with useCallback to prevent unnecessary re-renders. Instead of `<Button onClick={() => handleClick(id)} />`, use `<Button onClick={useCallback(() => handleClick(id), [id])} />`.',
            enforceMemo: 'Objects/arrays containing functions in JSX props should be wrapped with useMemo to prevent unnecessary re-renders. Instead of `<Component config={{ onSubmit: () => {...} }} />`, use `<Component config={useMemo(() => ({ onSubmit: () => {...} }), [])} />`.',
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        function isFunction(node) {
            return (node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                node.type === utils_1.AST_NODE_TYPES.FunctionExpression);
        }
        function isInsideUseCallback(node) {
            let current = node.parent;
            while (current) {
                if (current.type === utils_1.AST_NODE_TYPES.CallExpression) {
                    const { callee } = current;
                    const isDirectUseCallback = callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                        callee.name === 'useCallback';
                    const isMemberUseCallback = callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                        !callee.computed &&
                        callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                        callee.property.name === 'useCallback';
                    if (isDirectUseCallback || isMemberUseCallback) {
                        return true;
                    }
                }
                current = current.parent;
            }
            return false;
        }
        function collectBoundNames(param, out) {
            if (param.type === utils_1.AST_NODE_TYPES.Identifier) {
                out.push(param.name);
                return;
            }
            if (param.type === utils_1.AST_NODE_TYPES.AssignmentPattern) {
                collectBoundNames(param.left, out);
                return;
            }
            if (param.type === utils_1.AST_NODE_TYPES.RestElement) {
                if (param.argument.type === utils_1.AST_NODE_TYPES.Identifier) {
                    out.push(param.argument.name);
                }
                return;
            }
            if (param.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
                for (const property of param.properties) {
                    if (property.type === utils_1.AST_NODE_TYPES.RestElement) {
                        collectBoundNames(property, out);
                        continue;
                    }
                    if (property.type !== utils_1.AST_NODE_TYPES.Property)
                        continue;
                    collectBoundNames(property.value, out);
                }
                return;
            }
            if (param.type === utils_1.AST_NODE_TYPES.ArrayPattern) {
                for (const element of param.elements) {
                    if (element)
                        collectBoundNames(element, out);
                }
            }
        }
        function getParentFunctionParams(node) {
            let current = node.parent;
            while (current) {
                if (isFunction(current)) {
                    const params = [];
                    for (const param of current.params) {
                        collectBoundNames(param, params);
                    }
                    return params;
                }
                current = current.parent;
            }
            return [];
        }
        function referencesParentScopeVariables(functionNode, parentParams) {
            const scopeManager = context.getSourceCode().scopeManager;
            if (!scopeManager)
                return false;
            const scope = scopeManager.acquire(functionNode);
            if (!scope)
                return false;
            // "through" holds references that are not resolved within the function scope
            for (const ref of scope.through) {
                const { identifier } = ref;
                const parent = identifier.parent;
                const isPropertyKey = parent &&
                    ((parent.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                        !parent.computed &&
                        parent.property === identifier) ||
                        (parent.type === utils_1.AST_NODE_TYPES.Property &&
                            parent.key === identifier &&
                            parent.kind === 'init'));
                if (isPropertyKey) {
                    continue;
                }
                if (parentParams.includes(identifier.name)) {
                    return true;
                }
            }
            return false;
        }
        function containsFunction(node) {
            if (isFunction(node)) {
                return true;
            }
            if (node.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                return node.properties.some((prop) => {
                    if (prop.type === utils_1.AST_NODE_TYPES.Property && 'value' in prop) {
                        return containsFunction(prop.value);
                    }
                    if (prop.type === utils_1.AST_NODE_TYPES.SpreadElement) {
                        return containsFunction(prop.argument);
                    }
                    return false;
                });
            }
            if (node.type === utils_1.AST_NODE_TYPES.ArrayExpression) {
                return node.elements.some((element) => element && containsFunction(element));
            }
            // Check ternary expressions (conditional expressions)
            if (node.type === utils_1.AST_NODE_TYPES.ConditionalExpression) {
                return (containsFunction(node.consequent) || containsFunction(node.alternate));
            }
            // Check logical expressions (&&, ||)
            if (node.type === utils_1.AST_NODE_TYPES.LogicalExpression) {
                return containsFunction(node.left) || containsFunction(node.right);
            }
            return false;
        }
        function hasJSXWithFunction(node) {
            if (node.type === utils_1.AST_NODE_TYPES.JSXElement) {
                return node.openingElement.attributes.some((attr) => {
                    if (attr.type === utils_1.AST_NODE_TYPES.JSXAttribute && attr.value) {
                        if (attr.value.type === utils_1.AST_NODE_TYPES.JSXExpressionContainer) {
                            return containsFunction(attr.value.expression);
                        }
                    }
                    else if (attr.type === utils_1.AST_NODE_TYPES.JSXSpreadAttribute &&
                        attr.argument.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                        // Only inspect literal objects to avoid heavy/static-unsafe analysis on identifiers.
                        return containsFunction(attr.argument);
                    }
                    return false;
                });
            }
            return false;
        }
        function checkJSXAttribute(node) {
            if (!node.value ||
                node.value.type !== utils_1.AST_NODE_TYPES.JSXExpressionContainer) {
                return;
            }
            const { expression } = node.value;
            // Skip if the prop is already wrapped in useCallback or useMemo
            if (expression.type === utils_1.AST_NODE_TYPES.CallExpression &&
                expression.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                (expression.callee.name === 'useCallback' ||
                    expression.callee.name === 'useMemo')) {
                return;
            }
            // Check for direct inline functions
            if (isFunction(expression)) {
                // Skip reporting if this callback is inside a useCallback and references parent scope variables
                const isInUseCallback = isInsideUseCallback(expression);
                const parentParams = getParentFunctionParams(expression);
                const referencesParentVars = referencesParentScopeVariables(expression, parentParams);
                if (isInUseCallback && referencesParentVars) {
                    // Skip reporting - this is a nested callback that needs access to parent scope
                    return;
                }
                context.report({
                    node,
                    messageId: 'enforceCallback',
                });
                return;
            }
            // Check for ternary expressions and logical expressions containing functions
            if ((expression.type === utils_1.AST_NODE_TYPES.ConditionalExpression ||
                expression.type === utils_1.AST_NODE_TYPES.LogicalExpression) &&
                containsFunction(expression)) {
                context.report({
                    node,
                    messageId: 'enforceCallback',
                });
                return;
            }
            // Check for objects/arrays/JSX elements containing functions
            if ((expression.type === utils_1.AST_NODE_TYPES.ObjectExpression ||
                expression.type === utils_1.AST_NODE_TYPES.ArrayExpression ||
                expression.type === utils_1.AST_NODE_TYPES.JSXElement) &&
                (containsFunction(expression) || hasJSXWithFunction(expression))) {
                // Skip reporting if this is a JSX element and we already reported an inline function
                if (expression.type === utils_1.AST_NODE_TYPES.JSXElement &&
                    hasJSXWithFunction(expression)) {
                    return;
                }
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
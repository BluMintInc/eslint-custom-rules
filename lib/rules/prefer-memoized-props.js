"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferMemoizedProps = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const HOOK_NAMES = new Set(['useMemo', 'useCallback']);
exports.preferMemoizedProps = (0, createRule_1.createRule)({
    name: 'prefer-memoized-props',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Require memoizing reference props (objects, arrays, functions) inside React.memo components while avoiding unnecessary useMemo for pass-through values.',
            recommended: 'error',
        },
        schema: [],
        messages: {
            memoizeReferenceProp: 'Prop "{{propName}}" in a React.memo component receives a {{kind}} that is recreated every render, so memoized children lose referential equality and re-render. Memoize this {{kind}} with useMemo/useCallback or hoist a stable constant so the prop reference stays stable.',
            avoidPrimitiveMemo: 'useMemo around "{{value}}" only wraps a pass-through value. Primitives already compare by value, and wrapping existing references without creating new objects does not improve stability. Return the value directly instead of adding memoization noise.',
        },
    },
    defaultOptions: [],
    create(context) {
        const sourceCode = context.getSourceCode();
        const visitorKeys = sourceCode.visitorKeys;
        const memoizedComponents = new WeakSet();
        const memoScopes = [];
        const componentStack = [];
        const scopedFunctions = new WeakSet();
        function pushMemoScope() {
            memoScopes.push(new Map());
        }
        function popMemoScope() {
            memoScopes.pop();
        }
        function currentMemoScope() {
            return memoScopes[memoScopes.length - 1];
        }
        function declareFunctionBinding(name, node) {
            const scope = currentMemoScope();
            if (!scope)
                return;
            scope.set(name, node);
        }
        function resolveFunctionBinding(name) {
            for (let i = memoScopes.length - 1; i >= 0; i -= 1) {
                const binding = memoScopes[i].get(name);
                if (binding) {
                    return binding;
                }
            }
            return undefined;
        }
        function hoistFunctionDeclarations(statements) {
            const scope = currentMemoScope();
            if (!scope)
                return;
            for (const statement of statements) {
                if (statement.type === utils_1.AST_NODE_TYPES.FunctionDeclaration &&
                    statement.id?.type === utils_1.AST_NODE_TYPES.Identifier) {
                    scope.set(statement.id.name, statement);
                }
            }
        }
        function registerFunctionVariable(node) {
            if (node.id.type !== utils_1.AST_NODE_TYPES.Identifier)
                return;
            const { init } = node;
            if (init &&
                (init.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                    init.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression)) {
                declareFunctionBinding(node.id.name, init);
            }
        }
        function isReactMemoCallee(callee) {
            if (callee.type === utils_1.AST_NODE_TYPES.Identifier && callee.name === 'memo') {
                return true;
            }
            if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                !callee.computed &&
                callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                callee.property.name === 'memo') {
                return true;
            }
            return false;
        }
        function isHookCall(node, name) {
            if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                node.callee.name === name) {
                return true;
            }
            return (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                !node.callee.computed &&
                node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                node.callee.property.name === name);
        }
        function collectMemoizedComponents(node) {
            pushMemoScope();
            if (node.type === utils_1.AST_NODE_TYPES.Program) {
                hoistFunctionDeclarations(node.body);
            }
            function traverse(current) {
                const isFunctionLike = current.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
                    current.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                    current.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression;
                if (current.type === utils_1.AST_NODE_TYPES.FunctionDeclaration &&
                    current.id?.type === utils_1.AST_NODE_TYPES.Identifier) {
                    declareFunctionBinding(current.id.name, current);
                }
                let pushedScope = false;
                if (current.type === utils_1.AST_NODE_TYPES.BlockStatement || isFunctionLike) {
                    pushMemoScope();
                    pushedScope = true;
                    if (isFunctionLike &&
                        'id' in current &&
                        current.id?.type === utils_1.AST_NODE_TYPES.Identifier) {
                        declareFunctionBinding(current.id.name, current);
                    }
                    if (current.type === utils_1.AST_NODE_TYPES.BlockStatement) {
                        hoistFunctionDeclarations(current.body);
                    }
                    else if (isFunctionLike &&
                        current.body.type === utils_1.AST_NODE_TYPES.BlockStatement) {
                        hoistFunctionDeclarations(current.body.body);
                    }
                }
                if (current.type === utils_1.AST_NODE_TYPES.VariableDeclarator) {
                    registerFunctionVariable(current);
                }
                if (current.type === utils_1.AST_NODE_TYPES.CallExpression &&
                    isReactMemoCallee(current.callee)) {
                    const [firstArg] = current.arguments;
                    if (firstArg &&
                        (firstArg.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                            firstArg.type === utils_1.AST_NODE_TYPES.FunctionExpression)) {
                        memoizedComponents.add(firstArg);
                    }
                    else if (firstArg && firstArg.type === utils_1.AST_NODE_TYPES.Identifier) {
                        const binding = resolveFunctionBinding(firstArg.name);
                        if (binding) {
                            memoizedComponents.add(binding);
                        }
                    }
                }
                const keys = visitorKeys[current.type] ?? [];
                for (const key of keys) {
                    const value = current[key];
                    if (Array.isArray(value)) {
                        for (const child of value) {
                            if (child && typeof child === 'object') {
                                traverse(child);
                            }
                        }
                    }
                    else if (value && typeof value === 'object') {
                        traverse(value);
                    }
                }
                if (pushedScope) {
                    popMemoScope();
                }
            }
            traverse(node);
            popMemoScope();
        }
        collectMemoizedComponents(sourceCode.ast);
        function isMemoizedComponent(node) {
            return memoizedComponents.has(node);
        }
        function pushComponent(node) {
            componentStack.push({ node, scopes: [new Map()] });
        }
        function popComponent(node) {
            const top = componentStack[componentStack.length - 1];
            if (top && top.node === node) {
                componentStack.pop();
            }
        }
        function currentComponent() {
            return componentStack[componentStack.length - 1];
        }
        function currentScope() {
            const component = currentComponent();
            if (!component)
                return undefined;
            return component.scopes[component.scopes.length - 1];
        }
        function pushScopeForNestedFunction(node) {
            const component = currentComponent();
            if (!component)
                return;
            component.scopes.push(new Map());
            scopedFunctions.add(node);
        }
        function popScopeForNestedFunction(node) {
            const component = currentComponent();
            if (!component)
                return;
            if (!scopedFunctions.has(node))
                return;
            component.scopes.pop();
            scopedFunctions.delete(node);
        }
        function unwrapExpression(expression) {
            let current = expression;
            while (true) {
                if (current.type === utils_1.AST_NODE_TYPES.TSAsExpression ||
                    current.type === utils_1.AST_NODE_TYPES.TSSatisfiesExpression ||
                    current.type === utils_1.AST_NODE_TYPES.TSTypeAssertion) {
                    current = current.expression;
                    continue;
                }
                if (current.type === utils_1.AST_NODE_TYPES.TSNonNullExpression) {
                    current = current.expression;
                    continue;
                }
                break;
            }
            return current;
        }
        function getBindingKind(init) {
            if (!init) {
                return null;
            }
            const unwrapped = unwrapExpression(init);
            if (unwrapped.type === utils_1.AST_NODE_TYPES.CallExpression &&
                ((unwrapped.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                    HOOK_NAMES.has(unwrapped.callee.name)) ||
                    (unwrapped.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                        !unwrapped.callee.computed &&
                        unwrapped.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                        HOOK_NAMES.has(unwrapped.callee.property.name)))) {
                return null;
            }
            if (unwrapped.type === utils_1.AST_NODE_TYPES.ObjectExpression)
                return 'object';
            if (unwrapped.type === utils_1.AST_NODE_TYPES.ArrayExpression)
                return 'array';
            if (unwrapped.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                unwrapped.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
                return 'function';
            }
            return null;
        }
        function recordBinding(node) {
            const scope = currentScope();
            if (!scope)
                return;
            if (node.id.type !== utils_1.AST_NODE_TYPES.Identifier || !node.init) {
                return;
            }
            const initializer = unwrapExpression(node.init);
            const aliasKind = initializer.type === utils_1.AST_NODE_TYPES.Identifier
                ? findBindingKind(initializer.name)
                : null;
            const kind = aliasKind ?? getBindingKind(initializer);
            if (kind)
                scope.set(node.id.name, kind);
        }
        function findBindingKind(name) {
            for (let i = componentStack.length - 1; i >= 0; i -= 1) {
                const component = componentStack[i];
                for (let j = component.scopes.length - 1; j >= 0; j -= 1) {
                    const binding = component.scopes[j].get(name);
                    if (binding)
                        return binding;
                }
            }
            return null;
        }
        function getAttributeName(name) {
            if (name.type === utils_1.AST_NODE_TYPES.JSXIdentifier) {
                return name.name;
            }
            if (name.type === utils_1.AST_NODE_TYPES.JSXNamespacedName) {
                return name.name.name;
            }
            return 'prop';
        }
        function reportReference(node, propName, kind) {
            context.report({
                node,
                messageId: 'memoizeReferenceProp',
                data: { propName, kind },
            });
        }
        function isEnvironmentFreeLiteral(expression) {
            const unwrapped = unwrapExpression(expression);
            if (unwrapped.type === utils_1.AST_NODE_TYPES.Literal)
                return true;
            if (unwrapped.type === utils_1.AST_NODE_TYPES.TemplateLiteral &&
                unwrapped.expressions.length === 0) {
                return true;
            }
            return false;
        }
        function isStableReference(expression) {
            const unwrapped = unwrapExpression(expression);
            if (unwrapped.type === utils_1.AST_NODE_TYPES.Literal)
                return true;
            if (unwrapped.type === utils_1.AST_NODE_TYPES.TemplateLiteral) {
                return unwrapped.expressions.every((expr) => isStableReference(expr));
            }
            if (unwrapped.type === utils_1.AST_NODE_TYPES.Identifier)
                return true;
            if (unwrapped.type === utils_1.AST_NODE_TYPES.MemberExpression)
                return true;
            if (unwrapped.type === utils_1.AST_NODE_TYPES.ChainExpression &&
                unwrapped.expression.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                return true;
            }
            return false;
        }
        function extractReturnExpression(callback) {
            if (callback.body.type !== utils_1.AST_NODE_TYPES.BlockStatement) {
                return callback.body;
            }
            const [statement] = callback.body.body;
            if (statement &&
                statement.type === utils_1.AST_NODE_TYPES.ReturnStatement &&
                statement.argument) {
                return statement.argument;
            }
            return null;
        }
        function handleUseMemo(node) {
            if (!currentComponent() || !isHookCall(node, 'useMemo')) {
                return;
            }
            const [callback, deps] = node.arguments;
            if (!callback ||
                (callback.type !== utils_1.AST_NODE_TYPES.ArrowFunctionExpression &&
                    callback.type !== utils_1.AST_NODE_TYPES.FunctionExpression)) {
                return;
            }
            const returnExpression = extractReturnExpression(callback);
            if (!returnExpression)
                return;
            const dependencies = deps && deps.type === utils_1.AST_NODE_TYPES.ArrayExpression ? deps : null;
            if (dependencies &&
                dependencies.elements.length === 0 &&
                !isEnvironmentFreeLiteral(returnExpression)) {
                return;
            }
            if (isStableReference(returnExpression)) {
                const valueText = sourceCode.getText(returnExpression).slice(0, 80);
                context.report({
                    node,
                    messageId: 'avoidPrimitiveMemo',
                    data: { value: valueText },
                });
            }
        }
        function handleJSXAttribute(node) {
            if (!currentComponent())
                return;
            if (!node.value ||
                node.value.type !== utils_1.AST_NODE_TYPES.JSXExpressionContainer) {
                return;
            }
            const rawExpression = node.value.expression;
            if (rawExpression.type === utils_1.AST_NODE_TYPES.JSXEmptyExpression) {
                return;
            }
            const expression = unwrapExpression(rawExpression);
            const propName = getAttributeName(node.name);
            if (expression.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                reportReference(expression, propName, 'object');
                return;
            }
            if (expression.type === utils_1.AST_NODE_TYPES.ArrayExpression) {
                reportReference(expression, propName, 'array');
                return;
            }
            if (expression.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                expression.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
                reportReference(expression, propName, 'function');
                return;
            }
            if (expression.type === utils_1.AST_NODE_TYPES.Identifier) {
                const bindingKind = findBindingKind(expression.name);
                if (bindingKind) {
                    reportReference(expression, propName, bindingKind);
                }
            }
        }
        return {
            FunctionDeclaration(node) {
                if (isMemoizedComponent(node)) {
                    pushComponent(node);
                    return;
                }
                const scope = currentScope();
                if (scope && node.id?.type === utils_1.AST_NODE_TYPES.Identifier) {
                    scope.set(node.id.name, 'function');
                }
                if (currentComponent()) {
                    pushScopeForNestedFunction(node);
                }
            },
            'FunctionDeclaration:exit'(node) {
                if (isMemoizedComponent(node)) {
                    popComponent(node);
                    return;
                }
                popScopeForNestedFunction(node);
            },
            FunctionExpression(node) {
                if (isMemoizedComponent(node)) {
                    pushComponent(node);
                    return;
                }
                if (currentComponent()) {
                    pushScopeForNestedFunction(node);
                }
            },
            'FunctionExpression:exit'(node) {
                if (isMemoizedComponent(node)) {
                    popComponent(node);
                    return;
                }
                popScopeForNestedFunction(node);
            },
            ArrowFunctionExpression(node) {
                if (isMemoizedComponent(node)) {
                    pushComponent(node);
                    return;
                }
                if (currentComponent()) {
                    pushScopeForNestedFunction(node);
                }
            },
            'ArrowFunctionExpression:exit'(node) {
                if (isMemoizedComponent(node)) {
                    popComponent(node);
                    return;
                }
                popScopeForNestedFunction(node);
            },
            VariableDeclarator: recordBinding,
            CallExpression: handleUseMemo,
            JSXAttribute: handleJSXAttribute,
        };
    },
});
//# sourceMappingURL=prefer-memoized-props.js.map
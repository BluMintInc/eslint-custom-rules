"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceTransformMemoization = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
exports.enforceTransformMemoization = (0, createRule_1.createRule)({
    name: 'enforce-transform-memoization',
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce memoization of adaptValue transformValue/transformOnChange so the adapted component receives stable handlers and avoids unnecessary re-renders.',
            recommended: 'error',
        },
        schema: [],
        messages: {
            memoizeTransformValue: 'transformValue is recreated on every render. Wrap it in useMemo (or reference a memoized helper) so adaptValue passes a stable transformer and avoids rerendering the adapted component.',
            memoizeTransformOnChange: 'transformOnChange handler is recreated on every render. Wrap it in useCallback (or another memoized helper) so adaptValue passes a stable onChange and prevents extra renders and stale closures.',
            useCorrectHook: '{{propName}} should be memoized with {{expectedHook}}. {{actualHook}} recreates a new transform on every render and hides intent; wrap the transform with {{expectedHook}} so React preserves its identity and avoids churn.',
            missingDependencies: '{{hook}} for {{propName}} is missing {{deps}} in its dependency array. Include every external value the transform closes over so the memoized function stays in sync and does not capture stale data.',
        },
    },
    defaultOptions: [],
    create(context) {
        const sourceCode = context.getSourceCode();
        const scopeManager = sourceCode.scopeManager;
        const adaptValueNames = new Set(['adaptValue']);
        const memoizingHooks = new Set(['useMemo', 'useCallback']);
        const stabilizingUtilities = new Set(['useEvent']);
        const getPropertyName = (key) => {
            if (key.type === utils_1.AST_NODE_TYPES.Identifier) {
                return key.name;
            }
            if (key.type === utils_1.AST_NODE_TYPES.Literal &&
                typeof key.value === 'string') {
                return key.value;
            }
            return null;
        };
        const isFunctionExpression = (node) => node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
            node.type === utils_1.AST_NODE_TYPES.FunctionExpression;
        const unwrapExpression = (node) => {
            if (node.type === utils_1.AST_NODE_TYPES.TSAsExpression ||
                node.type === utils_1.AST_NODE_TYPES.TSTypeAssertion) {
                return unwrapExpression(node.expression);
            }
            if (node.type === utils_1.AST_NODE_TYPES.ChainExpression) {
                return unwrapExpression(node.expression);
            }
            return node;
        };
        const getCalleeName = (callee) => {
            if (callee.type === utils_1.AST_NODE_TYPES.Identifier) {
                return callee.name;
            }
            if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                !callee.computed &&
                callee.property.type === utils_1.AST_NODE_TYPES.Identifier) {
                return callee.property.name;
            }
            return '';
        };
        const isTopLevelScope = (scope) => scope.type === 'global' || scope.type === 'module';
        const findVariableInScopeChain = (identifier) => {
            if (!scopeManager)
                return null;
            let currentNode = identifier;
            let scope = null;
            while (currentNode && !scope) {
                scope = scopeManager.acquire(currentNode, true);
                currentNode = currentNode.parent ?? undefined;
            }
            if (!scope) {
                scope = scopeManager.globalScope;
            }
            if (!scope)
                return null;
            let currentScope = scope;
            while (currentScope) {
                const variable = currentScope.variables.find((v) => v.name === identifier.name);
                if (variable)
                    return variable;
                currentScope = currentScope.upper;
            }
            return null;
        };
        const isPropertyKeyIdentifier = (identifier) => identifier.parent?.type === utils_1.AST_NODE_TYPES.MemberExpression &&
            identifier.parent.property === identifier &&
            !identifier.parent.computed;
        const isScopeAncestor = (maybeAncestor, scope) => {
            let current = scope.upper;
            while (current) {
                if (current === maybeAncestor)
                    return true;
                current = current.upper;
            }
            return false;
        };
        const collectExternalDependencies = (callback) => {
            const deps = new Set();
            if (!scopeManager)
                return deps;
            const rootScope = scopeManager.acquire(callback);
            if (!rootScope)
                return deps;
            const walkScopes = (scope) => {
                for (const ref of scope.references) {
                    const resolved = ref.resolved;
                    if (!resolved)
                        continue;
                    if (isPropertyKeyIdentifier(ref.identifier))
                        continue;
                    const resolvedScope = resolved.scope;
                    if (isScopeAncestor(resolvedScope, rootScope) &&
                        !isTopLevelScope(resolvedScope)) {
                        deps.add(ref.identifier.name);
                    }
                }
                for (const child of scope.childScopes) {
                    walkScopes(child);
                }
            };
            walkScopes(rootScope);
            return deps;
        };
        const extractDependencyNames = (depsArg) => {
            const dependencyNames = new Set();
            const addName = (name) => {
                if (name)
                    dependencyNames.add(name);
            };
            const extractFromExpression = (expression) => {
                if (expression.type === utils_1.AST_NODE_TYPES.Identifier) {
                    return expression.name;
                }
                if (expression.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    !expression.computed) {
                    const objectExpr = expression.object;
                    if (objectExpr.type === utils_1.AST_NODE_TYPES.Identifier) {
                        return objectExpr.name;
                    }
                }
                if (expression.type === utils_1.AST_NODE_TYPES.ChainExpression) {
                    return extractFromExpression(expression.expression);
                }
                return null;
            };
            for (const element of depsArg.elements) {
                if (!element)
                    continue;
                if (element.type === utils_1.AST_NODE_TYPES.SpreadElement)
                    continue;
                addName(extractFromExpression(element));
            }
            return dependencyNames;
        };
        const formatMissingDeps = (missing, hasArray) => {
            if (missing.size === 0 && !hasArray) {
                return 'a dependency array (use [] when the transform has no external values)';
            }
            if (missing.size === 0) {
                return 'all external values referenced by the transform';
            }
            return Array.from(missing).join(', ');
        };
        const getVariableInitializer = (variable) => {
            for (const def of variable.defs) {
                if (def.type === 'Variable' && def.node.init) {
                    return def.node.init;
                }
                if (def.type === 'FunctionName') {
                    return def.node;
                }
            }
            return null;
        };
        const resolveValueForKey = (expression, key, depth = 0) => {
            if (!expression || depth > 5)
                return null;
            const unwrapped = unwrapExpression(expression);
            if (unwrapped.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                let found = null;
                for (const prop of unwrapped.properties) {
                    if (prop.type === utils_1.AST_NODE_TYPES.Property) {
                        const keyName = getPropertyName(prop.key);
                        if (keyName === key) {
                            found = prop.value;
                        }
                    }
                    else if (prop.type === utils_1.AST_NODE_TYPES.SpreadElement) {
                        const nested = resolveValueForKey(prop.argument, key, depth + 1);
                        if (nested) {
                            found = nested;
                        }
                    }
                }
                if (found)
                    return found;
            }
            if (unwrapped.type === utils_1.AST_NODE_TYPES.Identifier) {
                const variable = findVariableInScopeChain(unwrapped);
                const init = variable ? getVariableInitializer(variable) : null;
                if (init) {
                    return resolveValueForKey(init, key, depth + 1);
                }
            }
            if (unwrapped.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                !unwrapped.computed) {
                const propertyName = getPropertyName(unwrapped.property);
                if (!propertyName)
                    return null;
                if (unwrapped.object.type !== utils_1.AST_NODE_TYPES.Super) {
                    const resolvedMember = resolveValueForKey(unwrapped.object, propertyName, depth + 1);
                    if (!resolvedMember)
                        return null;
                    if (propertyName !== key &&
                        resolvedMember.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                        return resolveValueForKey(resolvedMember, key, depth + 1);
                    }
                    return resolvedMember;
                }
            }
            return null;
        };
        const resolveOptionsObject = (node) => {
            if (!node)
                return null;
            const unwrapped = unwrapExpression(node);
            if (unwrapped.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                return unwrapped;
            }
            if (unwrapped.type === utils_1.AST_NODE_TYPES.Identifier) {
                const variable = findVariableInScopeChain(unwrapped);
                const init = variable ? getVariableInitializer(variable) : null;
                if (init && init.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                    return init;
                }
            }
            if (unwrapped.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                !unwrapped.computed) {
                const objectExpression = unwrapped.object.type === utils_1.AST_NODE_TYPES.Super
                    ? null
                    : resolveOptionsObject(unwrapped.object);
                if (objectExpression) {
                    const propertyName = getPropertyName(unwrapped.property);
                    if (propertyName) {
                        const nested = resolveValueForKey(objectExpression, propertyName);
                        if (nested && nested.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                            return nested;
                        }
                    }
                }
            }
            return null;
        };
        const analyzeMemoization = (node, propName, expectedHook, seenIdentifiers) => {
            const unwrapped = unwrapExpression(node);
            if (isFunctionExpression(unwrapped)) {
                return {
                    ok: false,
                    messageId: propName === 'transformValue'
                        ? 'memoizeTransformValue'
                        : 'memoizeTransformOnChange',
                };
            }
            if (unwrapped.type === utils_1.AST_NODE_TYPES.FunctionDeclaration) {
                return {
                    ok: false,
                    messageId: propName === 'transformValue'
                        ? 'memoizeTransformValue'
                        : 'memoizeTransformOnChange',
                };
            }
            if (unwrapped.type === utils_1.AST_NODE_TYPES.CallExpression) {
                const calleeName = getCalleeName(unwrapped.callee);
                if (memoizingHooks.has(calleeName)) {
                    if ((expectedHook === 'useMemo' && calleeName === 'useCallback') ||
                        (expectedHook === 'useCallback' && calleeName === 'useMemo')) {
                        return {
                            ok: false,
                            messageId: 'useCorrectHook',
                            data: {
                                propName,
                                expectedHook,
                                actualHook: calleeName,
                            },
                        };
                    }
                    const callback = unwrapped.arguments[0];
                    const depsArg = unwrapped.arguments[unwrapped.arguments.length - 1];
                    const externalDeps = callback && isFunctionExpression(callback)
                        ? collectExternalDependencies(callback)
                        : new Set();
                    if (!depsArg || depsArg.type !== utils_1.AST_NODE_TYPES.ArrayExpression) {
                        return {
                            ok: false,
                            messageId: 'missingDependencies',
                            data: {
                                hook: calleeName,
                                propName,
                                deps: formatMissingDeps(externalDeps, false),
                            },
                        };
                    }
                    if (externalDeps.size > 0) {
                        const declaredDeps = extractDependencyNames(depsArg);
                        const missingDeps = new Set();
                        for (const dep of externalDeps) {
                            if (!declaredDeps.has(dep)) {
                                missingDeps.add(dep);
                            }
                        }
                        if (missingDeps.size > 0) {
                            return {
                                ok: false,
                                messageId: 'missingDependencies',
                                data: {
                                    hook: calleeName,
                                    propName,
                                    deps: formatMissingDeps(missingDeps, true),
                                },
                            };
                        }
                    }
                    return { ok: true };
                }
                if (stabilizingUtilities.has(calleeName)) {
                    return { ok: true };
                }
                return {
                    ok: false,
                    messageId: propName === 'transformValue'
                        ? 'memoizeTransformValue'
                        : 'memoizeTransformOnChange',
                };
            }
            if (unwrapped.type === utils_1.AST_NODE_TYPES.Identifier) {
                if (seenIdentifiers.has(unwrapped.name)) {
                    return { ok: true };
                }
                seenIdentifiers.add(unwrapped.name);
                const variable = findVariableInScopeChain(unwrapped);
                if (!variable) {
                    return { ok: true };
                }
                if (variable.defs.some((def) => def.type === 'Parameter') ||
                    isTopLevelScope(variable.scope)) {
                    return { ok: true };
                }
                const init = getVariableInitializer(variable);
                if (!init) {
                    return {
                        ok: false,
                        messageId: propName === 'transformValue'
                            ? 'memoizeTransformValue'
                            : 'memoizeTransformOnChange',
                    };
                }
                return analyzeMemoization(init, propName, expectedHook, seenIdentifiers);
            }
            return {
                ok: false,
                messageId: propName === 'transformValue'
                    ? 'memoizeTransformValue'
                    : 'memoizeTransformOnChange',
            };
        };
        const checkTransformProperty = (node, propName, expectedHook) => {
            const result = analyzeMemoization(node, propName, expectedHook, new Set());
            if (result.ok)
                return;
            context.report({
                node,
                messageId: result.messageId,
                data: result.data,
            });
        };
        return {
            ImportDeclaration(node) {
                const sourceValue = typeof node.source.value === 'string' ? node.source.value : '';
                for (const specifier of node.specifiers) {
                    if (specifier.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                        specifier.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
                        specifier.imported.name === 'adaptValue') {
                        adaptValueNames.add(specifier.local.name);
                    }
                    if (specifier.type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier &&
                        (specifier.local.name === 'adaptValue' ||
                            sourceValue.includes('adaptValue'))) {
                        adaptValueNames.add(specifier.local.name);
                    }
                }
            },
            CallExpression(node) {
                if (node.callee.type !== utils_1.AST_NODE_TYPES.Identifier ||
                    !adaptValueNames.has(node.callee.name)) {
                    return;
                }
                const optionsArg = node.arguments[0];
                if (!optionsArg)
                    return;
                const optionsObject = resolveOptionsObject(optionsArg);
                if (!optionsObject)
                    return;
                const transformValueNode = resolveValueForKey(optionsObject, 'transformValue');
                if (transformValueNode) {
                    checkTransformProperty(transformValueNode, 'transformValue', 'useMemo');
                }
                const transformOnChangeNode = resolveValueForKey(optionsObject, 'transformOnChange');
                if (transformOnChangeNode) {
                    checkTransformProperty(transformOnChangeNode, 'transformOnChange', 'useCallback');
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-transform-memoization.js.map
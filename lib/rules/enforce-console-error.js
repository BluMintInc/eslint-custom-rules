"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceConsoleError = void 0;
const createRule_1 = require("../utils/createRule");
const utils_1 = require("@typescript-eslint/utils");
exports.enforceConsoleError = (0, createRule_1.createRule)({
    name: 'enforce-console-error',
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce proper logging for useAlertDialog based on severity. When severity is "error", console.error must be included. When severity is "warning", console.warn must be included. This ensures all user-facing errors and warnings are properly logged to monitoring systems.',
            recommended: 'error',
        },
        messages: {
            missingConsoleError: 'useAlertDialog with severity "error" requires a console.error statement in the same function scope for proper monitoring.',
            missingConsoleWarn: 'useAlertDialog with severity "warning" requires a console.warn statement in the same function scope for proper monitoring.',
            missingConsoleBoth: 'useAlertDialog with dynamic severity requires both console.error and console.warn statements in the same function scope for proper monitoring.',
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        // Track all open calls and console calls in the entire file
        const openCalls = [];
        const consoleCalls = [];
        let hasUseAlertDialog = false;
        const functionScopeStack = [];
        let currentFunctionScope = null;
        // Track renamed open functions from useAlertDialog destructuring
        const openFunctionNames = new Set();
        // Track aliased useAlertDialog function names
        const useAlertDialogNames = new Set(['useAlertDialog']);
        function isUseAlertDialogCall(node) {
            return (node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                useAlertDialogNames.has(node.callee.name));
        }
        function isConsoleCall(node, method) {
            return (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                node.callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                node.callee.object.name === 'console' &&
                node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                node.callee.property.name === method);
        }
        function getSeverityFromObjectExpression(node) {
            for (const prop of node.properties) {
                if (prop.type === utils_1.AST_NODE_TYPES.Property) {
                    // Handle both computed and non-computed properties
                    let isSeverityProperty = false;
                    if (!prop.computed &&
                        prop.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                        prop.key.name === 'severity') {
                        isSeverityProperty = true;
                    }
                    else if (prop.computed &&
                        prop.key.type === utils_1.AST_NODE_TYPES.Literal &&
                        prop.key.value === 'severity') {
                        isSeverityProperty = true;
                    }
                    if (isSeverityProperty) {
                        if (prop.value.type === utils_1.AST_NODE_TYPES.Literal &&
                            typeof prop.value.value === 'string') {
                            return prop.value.value;
                        }
                        // If severity is not a literal, treat as dynamic
                        return 'dynamic';
                    }
                }
            }
            return null;
        }
        const enterFunction = (node) => {
            functionScopeStack.push(node);
            currentFunctionScope = functionScopeStack[functionScopeStack.length - 1];
        };
        const exitFunction = () => {
            functionScopeStack.pop();
            currentFunctionScope =
                functionScopeStack[functionScopeStack.length - 1] ?? null;
        };
        return {
            ImportDeclaration(node) {
                // Track aliased imports of useAlertDialog
                const importPath = String(node.source.value);
                const isAlertDialogImport = importPath === '../useAlertDialog' ||
                    importPath === './useAlertDialog' ||
                    importPath === 'useAlertDialog' ||
                    importPath.endsWith('/useAlertDialog') ||
                    importPath.endsWith('/useAlertDialog/index') ||
                    importPath === '@/hooks/useAlertDialog' ||
                    importPath === 'src/hooks/useAlertDialog';
                if (!isAlertDialogImport)
                    return;
                for (const specifier of node.specifiers) {
                    // Named imports
                    if (specifier.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                        specifier.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
                        specifier.imported.name === 'useAlertDialog' &&
                        specifier.local.type === utils_1.AST_NODE_TYPES.Identifier) {
                        useAlertDialogNames.add(specifier.local.name);
                    }
                    // Default or namespace imports still imply useAlertDialog is available via the local name
                    if (specifier.type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier ||
                        specifier.type === utils_1.AST_NODE_TYPES.ImportNamespaceSpecifier) {
                        if (specifier.local.type === utils_1.AST_NODE_TYPES.Identifier) {
                            useAlertDialogNames.add(specifier.local.name);
                        }
                    }
                }
            },
            'Program:exit'() {
                // Only check if we have useAlertDialog in the file
                if (!hasUseAlertDialog)
                    return;
                // Group open calls by their containing function
                const functionGroups = new Map();
                // Group open calls by function
                openCalls.forEach(({ node, severity, functionScope }) => {
                    if (!functionGroups.has(functionScope)) {
                        functionGroups.set(functionScope, {
                            openCalls: [],
                            consoleCalls: [],
                        });
                    }
                    functionGroups.get(functionScope).openCalls.push({ node, severity });
                });
                // Group console calls by function
                consoleCalls.forEach(({ node, method, functionScope }) => {
                    if (!functionGroups.has(functionScope)) {
                        functionGroups.set(functionScope, {
                            openCalls: [],
                            consoleCalls: [],
                        });
                    }
                    functionGroups
                        .get(functionScope)
                        .consoleCalls.push({ node, method });
                });
                // Check each function for violations
                functionGroups.forEach((group) => {
                    const hasError = group.openCalls.some((call) => call.severity === 'error');
                    const hasWarning = group.openCalls.some((call) => call.severity === 'warning');
                    const hasDynamic = group.openCalls.some((call) => call.severity === 'dynamic');
                    const hasConsoleError = group.consoleCalls.some((call) => call.method === 'error');
                    const hasConsoleWarn = group.consoleCalls.some((call) => call.method === 'warn');
                    const needsConsoleError = hasError || hasDynamic;
                    const needsConsoleWarn = hasWarning || hasDynamic;
                    if (hasDynamic && (!hasConsoleError || !hasConsoleWarn)) {
                        const dynamicCall = group.openCalls.find((call) => call.severity === 'dynamic');
                        if (dynamicCall) {
                            context.report({
                                node: dynamicCall.node,
                                messageId: 'missingConsoleBoth',
                            });
                        }
                    }
                    else {
                        if (needsConsoleError && !hasConsoleError) {
                            const errorCall = group.openCalls.find((call) => call.severity === 'error');
                            if (errorCall) {
                                context.report({
                                    node: errorCall.node,
                                    messageId: 'missingConsoleError',
                                });
                            }
                        }
                        if (needsConsoleWarn && !hasConsoleWarn) {
                            const warningCall = group.openCalls.find((call) => call.severity === 'warning');
                            if (warningCall) {
                                context.report({
                                    node: warningCall.node,
                                    messageId: 'missingConsoleWarn',
                                });
                            }
                        }
                    }
                });
            },
            FunctionDeclaration: enterFunction,
            FunctionExpression: enterFunction,
            ArrowFunctionExpression: enterFunction,
            'FunctionDeclaration:exit': exitFunction,
            'FunctionExpression:exit': exitFunction,
            'ArrowFunctionExpression:exit': exitFunction,
            VariableDeclarator(node) {
                // Track destructuring of open functions from useAlertDialog
                if (node.init &&
                    node.init.type === utils_1.AST_NODE_TYPES.CallExpression &&
                    isUseAlertDialogCall(node.init) &&
                    node.id.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
                    // Look for destructured open properties
                    for (const prop of node.id.properties) {
                        if (prop.type === utils_1.AST_NODE_TYPES.Property &&
                            prop.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                            prop.key.name === 'open') {
                            if (prop.value.type === utils_1.AST_NODE_TYPES.Identifier) {
                                // Track the renamed function name
                                openFunctionNames.add(prop.value.name);
                            }
                        }
                    }
                }
            },
            CallExpression(node) {
                // Track useAlertDialog calls
                if (isUseAlertDialogCall(node)) {
                    hasUseAlertDialog = true;
                }
                // Track open method calls (both member expressions and direct calls)
                const isOpenCall = ((node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.callee.property.name === 'open') ||
                    (node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                        (node.callee.name === 'open' ||
                            openFunctionNames.has(node.callee.name)))) &&
                    node.arguments.length > 0;
                if (isOpenCall) {
                    const firstArg = node.arguments[0];
                    if (firstArg.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                        const severity = getSeverityFromObjectExpression(firstArg);
                        if (severity && currentFunctionScope) {
                            openCalls.push({
                                node,
                                severity,
                                functionScope: currentFunctionScope,
                            });
                        }
                    }
                }
                // Track console calls
                if (currentFunctionScope) {
                    if (isConsoleCall(node, 'error')) {
                        consoleCalls.push({
                            node,
                            method: 'error',
                            functionScope: currentFunctionScope,
                        });
                    }
                    if (isConsoleCall(node, 'warn')) {
                        consoleCalls.push({
                            node,
                            method: 'warn',
                            functionScope: currentFunctionScope,
                        });
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-console-error.js.map
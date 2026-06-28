"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useLatestCallback = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
exports.useLatestCallback = (0, createRule_1.createRule)({
    name: 'use-latest-callback',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce using useLatestCallback from use-latest-callback instead of React useCallback',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            useLatestCallback: 'Replace {{currentHook}} with {{recommendedHook}} from "use-latest-callback" so the callback keeps a stable reference while still reading the latest props/state. useCallback recreates functions whenever dependencies change, which can trigger needless renders and stale closures. Drop the dependency array when switching to {{recommendedHook}}.',
        },
    },
    defaultOptions: [],
    create(context) {
        const filename = context.getFilename();
        if (filename.includes('/node_modules/')) {
            return {};
        }
        // Track if the file already has a useLatestCallback import
        let hasUseLatestCallbackImport = false;
        let useLatestCallbackImportName = 'useLatestCallback';
        // Track if any useCallback calls should be replaced
        let hasNonJsxUseCallbacks = false;
        const useCallbackLocalNames = new Set();
        const reactNamespaceNames = new Set();
        const reactDefaultLikeNames = new Set();
        let hasReactMemberUseCallback = false;
        const isJSXLikeReturn = (node) => {
            if (!node)
                return false;
            if (node.type === utils_1.AST_NODE_TYPES.JSXElement ||
                node.type === utils_1.AST_NODE_TYPES.JSXFragment ||
                node.type === utils_1.AST_NODE_TYPES.JSXExpressionContainer) {
                return true;
            }
            if (node.type === 'ParenthesizedExpression') {
                return isJSXLikeReturn(node.expression);
            }
            if (node.type === utils_1.AST_NODE_TYPES.SequenceExpression) {
                return isJSXLikeReturn(node.expressions[node.expressions.length - 1]);
            }
            if (node.type === utils_1.AST_NODE_TYPES.ArrayExpression) {
                return node.elements.some((el) => isJSXLikeReturn(el && el.type === utils_1.AST_NODE_TYPES.SpreadElement
                    ? el.argument
                    : el));
            }
            if (node.type === utils_1.AST_NODE_TYPES.ConditionalExpression) {
                return (isJSXLikeReturn(node.consequent) || isJSXLikeReturn(node.alternate));
            }
            if (node.type === utils_1.AST_NODE_TYPES.LogicalExpression) {
                return isJSXLikeReturn(node.left) || isJSXLikeReturn(node.right);
            }
            if (node.type === utils_1.AST_NODE_TYPES.CallExpression) {
                if (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    node.callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    reactNamespaceNames.has(node.callee.object.name) &&
                    node.callee.property.name === 'createElement') {
                    return true;
                }
            }
            return false;
        };
        return {
            // First pass: check imports
            ImportDeclaration(node) {
                if (node.importKind && node.importKind !== 'value')
                    return;
                if (node.source.value === 'use-latest-callback') {
                    // Check if useLatestCallback is imported
                    const specifiers = node.specifiers.filter((specifier) => {
                        if (specifier.type === utils_1.AST_NODE_TYPES.ImportSpecifier) {
                            return (specifier.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
                                specifier.imported.name === 'useLatestCallback');
                        }
                        return (specifier.type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier ||
                            specifier.type === utils_1.AST_NODE_TYPES.ImportNamespaceSpecifier);
                    });
                    if (specifiers.length > 0) {
                        hasUseLatestCallbackImport = true;
                        // Get the local name of the import (in case it's renamed)
                        if (specifiers[0].type === utils_1.AST_NODE_TYPES.ImportSpecifier) {
                            useLatestCallbackImportName = specifiers[0].local.name;
                        }
                        else if (specifiers[0].type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier) {
                            useLatestCallbackImportName = specifiers[0].local.name;
                        }
                        else if (specifiers[0].type === utils_1.AST_NODE_TYPES.ImportNamespaceSpecifier) {
                            useLatestCallbackImportName = `${specifiers[0].local.name}.useLatestCallback`;
                        }
                    }
                }
                else if (node.source.value === 'react') {
                    // Check if useCallback is imported from React
                    const useCallbackSpecifiers = node.specifiers.filter((specifier) => {
                        return (specifier.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                            specifier.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
                            specifier.imported.name === 'useCallback');
                    });
                    node.specifiers.forEach((specifier) => {
                        if (specifier.type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier ||
                            specifier.type === utils_1.AST_NODE_TYPES.ImportNamespaceSpecifier) {
                            reactNamespaceNames.add(specifier.local.name);
                            reactDefaultLikeNames.add(specifier.local.name);
                        }
                    });
                    if (useCallbackSpecifiers.length > 0) {
                        useCallbackSpecifiers.forEach((spec) => {
                            useCallbackLocalNames.add(spec.local.name);
                        });
                    }
                }
            },
            // Check for useCallback usage and identify JSX-returning callbacks
            CallExpression(node) {
                const isUseCallbackIdentifierCall = node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                    useCallbackLocalNames.has(node.callee.name);
                const isUseCallbackMemberCall = node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    node.callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                    reactDefaultLikeNames.has(node.callee.object.name) &&
                    node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.callee.property.name === 'useCallback';
                if ((isUseCallbackIdentifierCall || isUseCallbackMemberCall) &&
                    node.arguments.length >= 1) {
                    if (isUseCallbackMemberCall) {
                        hasReactMemberUseCallback = true;
                    }
                    // Check if this is a JSX-returning callback (edge case where we shouldn't replace)
                    const callback = node.arguments[0];
                    let isJsxReturning = false;
                    if ((callback.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                        callback.type === utils_1.AST_NODE_TYPES.FunctionExpression) &&
                        callback.body) {
                        // For arrow functions with implicit return
                        if (callback.body.type !== utils_1.AST_NODE_TYPES.BlockStatement) {
                            if (isJSXLikeReturn(callback.body)) {
                                isJsxReturning = true;
                            }
                        }
                        // For functions with block body - check all return statements
                        else if (callback.body.type === utils_1.AST_NODE_TYPES.BlockStatement) {
                            const returnStatements = callback.body.body.filter((statement) => statement.type === utils_1.AST_NODE_TYPES.ReturnStatement);
                            // If there are return statements, check if any return JSX
                            if (returnStatements.length > 0) {
                                isJsxReturning = returnStatements.some((returnStatement) => returnStatement.argument &&
                                    isJSXLikeReturn(returnStatement.argument));
                            }
                        }
                    }
                    if (!isJsxReturning) {
                        hasNonJsxUseCallbacks = true;
                        const currentCallbackName = node.callee.type === utils_1.AST_NODE_TYPES.Identifier
                            ? node.callee.name
                            : node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                                node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier
                                ? node.callee.property.name
                                : 'useCallback';
                        const replacementName = hasUseLatestCallbackImport
                            ? useLatestCallbackImportName
                            : currentCallbackName === 'useCallback'
                                ? 'useLatestCallback'
                                : currentCallbackName;
                        // Report the useCallback call for replacement
                        context.report({
                            node,
                            messageId: 'useLatestCallback',
                            data: {
                                currentHook: currentCallbackName,
                                recommendedHook: replacementName,
                            },
                            fix(fixer) {
                                const sourceCode = context.sourceCode;
                                const callbackText = sourceCode.getText(node.arguments[0]);
                                const typeParams = node.typeParameters
                                    ? sourceCode.getText(node.typeParameters)
                                    : '';
                                // Replace useCallback with useLatestCallback and remove the dependency array
                                return fixer.replaceText(node, `${replacementName}${typeParams}(${callbackText})`);
                            },
                        });
                    }
                }
            },
            // Final pass: check for useCallback import from react (only if there are non-JSX callbacks)
            'Program:exit'() {
                if (!hasNonJsxUseCallbacks) {
                    return; // Don't modify imports if all useCallback calls return JSX
                }
                const sourceCode = context.sourceCode;
                const program = sourceCode.ast;
                for (const statement of program.body) {
                    if (statement.type === utils_1.AST_NODE_TYPES.ImportDeclaration &&
                        statement.source.value === 'react') {
                        if (statement.importKind && statement.importKind !== 'value') {
                            continue;
                        }
                        const specifiers = statement.specifiers.filter((specifier) => specifier.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                            specifier.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
                            specifier.imported.name === 'useCallback');
                        if (specifiers.length > 0 || hasReactMemberUseCallback) {
                            const useCallbackLocalName = specifiers[0]?.local.name ?? 'useCallback';
                            const recommendedHook = hasUseLatestCallbackImport
                                ? useLatestCallbackImportName
                                : useCallbackLocalName === 'useCallback'
                                    ? 'useLatestCallback'
                                    : useCallbackLocalName;
                            context.report({
                                node: statement,
                                messageId: 'useLatestCallback',
                                data: {
                                    currentHook: useCallbackLocalName,
                                    recommendedHook,
                                },
                                fix(fixer) {
                                    const importText = `import ${useCallbackLocalName === 'useCallback'
                                        ? 'useLatestCallback'
                                        : useCallbackLocalName} from 'use-latest-callback';`;
                                    if (specifiers.length === 0) {
                                        if (hasUseLatestCallbackImport)
                                            return null;
                                        return fixer.insertTextBefore(statement, `${importText}\n`);
                                    }
                                    const defaultOrNamespace = statement.specifiers.find((s) => s.type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier ||
                                        s.type === utils_1.AST_NODE_TYPES.ImportNamespaceSpecifier);
                                    const remainingNamed = statement.specifiers.filter((s) => s.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                                        s.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
                                        s.imported.name !== 'useCallback');
                                    const prefix = statement.importKind && statement.importKind !== 'value'
                                        ? 'import type'
                                        : 'import';
                                    if (remainingNamed.length === 0 && !defaultOrNamespace) {
                                        if (!hasUseLatestCallbackImport) {
                                            return fixer.replaceText(statement, importText);
                                        }
                                        return fixer.remove(statement);
                                    }
                                    const parts = [];
                                    if (defaultOrNamespace) {
                                        parts.push(sourceCode.getText(defaultOrNamespace));
                                    }
                                    if (remainingNamed.length > 0) {
                                        parts.push(`{ ${remainingNamed
                                            .map((s) => sourceCode.getText(s))
                                            .join(', ')} }`);
                                    }
                                    const replacement = `${prefix} ${parts.join(', ')} from 'react';`;
                                    const fixes = [];
                                    if (!hasUseLatestCallbackImport) {
                                        fixes.push(fixer.insertTextBefore(statement, `${importText}\n`));
                                    }
                                    fixes.push(fixer.replaceText(statement, replacement));
                                    return fixes;
                                },
                            });
                        }
                        break;
                    }
                }
            },
        };
    },
});
exports.default = exports.useLatestCallback;
//# sourceMappingURL=use-latest-callback.js.map
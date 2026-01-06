"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferUseDeepCompareMemo = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
// Consider these as memoizing hooks producing stable references
const MEMOIZING_HOOKS = new Set([
    'useMemo',
    'useCallback',
    'useDeepCompareMemo',
    'useLatestCallback',
]);
function isUseMemoCallee(callee) {
    if (callee.type === utils_1.AST_NODE_TYPES.Identifier) {
        return callee.name === 'useMemo';
    }
    if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.property.type === utils_1.AST_NODE_TYPES.Identifier) {
        return callee.property.name === 'useMemo';
    }
    return false;
}
function isIdentifierMemoizedAbove(name, memoizedIds) {
    return memoizedIds.has(name);
}
function containsJsx(node) {
    if (!node)
        return false;
    const stack = [node];
    while (stack.length) {
        const cur = stack.pop();
        if (cur.type === utils_1.AST_NODE_TYPES.JSXElement ||
            cur.type === utils_1.AST_NODE_TYPES.JSXFragment) {
            return true;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const key of Object.keys(cur)) {
            if (key === 'parent')
                continue;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const child = cur[key];
            if (!child)
                continue;
            if (Array.isArray(child)) {
                for (const c of child) {
                    if (c && typeof c === 'object' && 'type' in c) {
                        stack.push(c);
                    }
                }
            }
            else if (typeof child === 'object' && 'type' in child) {
                stack.push(child);
            }
        }
    }
    return false;
}
function isNonPrimitiveWithoutTypes(expr) {
    switch (expr.type) {
        case utils_1.AST_NODE_TYPES.ArrayExpression:
        case utils_1.AST_NODE_TYPES.ObjectExpression:
        case utils_1.AST_NODE_TYPES.FunctionExpression:
        case utils_1.AST_NODE_TYPES.ArrowFunctionExpression:
        case utils_1.AST_NODE_TYPES.NewExpression:
        case utils_1.AST_NODE_TYPES.ClassExpression:
            return true;
        case utils_1.AST_NODE_TYPES.Identifier:
        case utils_1.AST_NODE_TYPES.Literal:
        case utils_1.AST_NODE_TYPES.TemplateLiteral:
        case utils_1.AST_NODE_TYPES.UnaryExpression:
        case utils_1.AST_NODE_TYPES.BinaryExpression:
        case utils_1.AST_NODE_TYPES.LogicalExpression:
        case utils_1.AST_NODE_TYPES.MemberExpression:
        case utils_1.AST_NODE_TYPES.ChainExpression:
        case utils_1.AST_NODE_TYPES.CallExpression:
        default:
            return false;
    }
}
// TypeScript-aware check. Defensive and conservative.
function isNonPrimitiveWithTypes(context, expr) {
    const services = context.parserServices;
    if (!services?.program || !services?.esTreeNodeToTSNodeMap) {
        return false;
    }
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ts = require('typescript');
        const checker = services.program.getTypeChecker();
        const tsNode = services.esTreeNodeToTSNodeMap.get(expr);
        if (!tsNode)
            return false;
        const type = checker.getTypeAtLocation(tsNode);
        // Only consider explicit functions as non-primitive here
        if (type.getCallSignatures().length > 0)
            return true;
        // Avoid guessing for unknown/any or non-function types
        if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown))
            return false;
        return false;
    }
    catch {
        return false;
    }
}
function collectMemoizedIdentifiers(context) {
    const memoized = new Set();
    const sourceCode = context.sourceCode;
    const program = sourceCode.ast;
    function visit(node) {
        if (node.type === utils_1.AST_NODE_TYPES.VariableDeclarator) {
            const id = node.id;
            const init = node.init;
            if (!init)
                return;
            if (init.type === utils_1.AST_NODE_TYPES.CallExpression) {
                let calleeName = null;
                if (init.callee.type === utils_1.AST_NODE_TYPES.Identifier) {
                    calleeName = init.callee.name;
                }
                else if (init.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    !init.callee.computed &&
                    init.callee.property.type === utils_1.AST_NODE_TYPES.Identifier) {
                    calleeName = init.callee.property.name;
                }
                if (calleeName && MEMOIZING_HOOKS.has(calleeName)) {
                    if (id.type === utils_1.AST_NODE_TYPES.Identifier) {
                        memoized.add(id.name);
                    }
                }
            }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const key of Object.keys(node)) {
            if (key === 'parent')
                continue;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const child = node[key];
            if (!child)
                continue;
            if (Array.isArray(child)) {
                for (const c of child) {
                    if (c && typeof c === 'object' && 'type' in c) {
                        visit(c);
                    }
                }
            }
            else if (typeof child === 'object' && 'type' in child) {
                visit(child);
            }
        }
    }
    visit(program);
    return memoized;
}
function ensureDeepCompareImportFixes(context, fixer) {
    const fixes = [];
    const sourceCode = context.sourceCode;
    const program = sourceCode.ast;
    // If already imported anywhere, skip adding
    const hasImport = program.body.some((n) => n.type === utils_1.AST_NODE_TYPES.ImportDeclaration &&
        n.source.value === '@blumintinc/use-deep-compare' &&
        n.specifiers.some((s) => s.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
            s.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
            s.imported.name === 'useDeepCompareMemo'));
    if (hasImport)
        return fixes;
    // Determine insertion point and indentation
    const importDecls = program.body.filter((n) => n.type === utils_1.AST_NODE_TYPES.ImportDeclaration);
    const fullText = sourceCode.getText();
    let importText = `import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';\n`;
    if (importDecls.length === 0) {
        fixes.push(fixer.insertTextBeforeRange([0, 0], importText));
    }
    else {
        const firstImport = importDecls[0];
        const before = fullText.slice(0, firstImport.range[0]);
        const lastNewline = before.lastIndexOf('\n');
        const indent = lastNewline >= 0 ? before.slice(lastNewline + 1) : '';
        importText = `${indent}${importText}`;
        fixes.push(fixer.insertTextBefore(firstImport, importText));
    }
    return fixes;
}
function findVariableInScope(scope, name) {
    if (!scope)
        return null;
    const found = scope.variables?.find((v) => v.name === name);
    if (found)
        return found;
    if (Array.isArray(scope.childScopes)) {
        for (const child of scope.childScopes) {
            const v = findVariableInScope(child, name);
            if (v)
                return v;
        }
    }
    return null;
}
function isIdentifierReferenced(sourceCode, name) {
    const scope = sourceCode.scopeManager?.globalScope;
    if (!scope)
        return true;
    const variable = findVariableInScope(scope, name);
    if (!variable)
        return false;
    return variable.references.some((ref) => ref.identifier && ref.identifier.name === name);
}
function removeImportSpecifierFixes(sourceCode, fixer, importDecl, specifier) {
    const fixes = [];
    if (importDecl.specifiers.length === 1) {
        fixes.push(fixer.remove(importDecl));
        return fixes;
    }
    const tokenAfter = sourceCode.getTokenAfter(specifier);
    const tokenBefore = sourceCode.getTokenBefore(specifier);
    if (tokenAfter && tokenAfter.value === ',') {
        fixes.push(fixer.removeRange([specifier.range[0], tokenAfter.range[1]]));
    }
    else if (tokenBefore && tokenBefore.value === ',') {
        fixes.push(fixer.removeRange([tokenBefore.range[0], specifier.range[1]]));
    }
    else {
        fixes.push(fixer.remove(specifier));
    }
    return fixes;
}
function isImportedIdentifier(context, name) {
    const sourceCode = context.sourceCode;
    const program = sourceCode.ast;
    for (const node of program.body) {
        if (node.type === utils_1.AST_NODE_TYPES.ImportDeclaration) {
            for (const spec of node.specifiers) {
                if (spec.type === utils_1.AST_NODE_TYPES.ImportSpecifier ||
                    spec.type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier ||
                    spec.type === utils_1.AST_NODE_TYPES.ImportNamespaceSpecifier) {
                    if (spec.local.name === name)
                        return true;
                }
            }
        }
    }
    return false;
}
function identifierUsedAsObjectOrFunction(callback, name) {
    const stack = [callback.body];
    while (stack.length) {
        const node = stack.pop();
        if (node.type === utils_1.AST_NODE_TYPES.MemberExpression) {
            let base = node.object;
            while (base.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                base = base.object;
            }
            if (base.type === utils_1.AST_NODE_TYPES.Identifier && base.name === name) {
                return true; // object/array usage via property access
            }
        }
        if (node.type === utils_1.AST_NODE_TYPES.ChainExpression) {
            const expr = node.expression;
            if (expr.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                let base = expr.object;
                while (base.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                    base = base.object;
                }
                if (base.type === utils_1.AST_NODE_TYPES.Identifier && base.name === name) {
                    return true;
                }
            }
        }
        if (node.type === utils_1.AST_NODE_TYPES.CallExpression) {
            const callee = node.callee;
            if (callee.type === utils_1.AST_NODE_TYPES.Identifier && callee.name === name) {
                return true; // function usage
            }
        }
        if (node.type === utils_1.AST_NODE_TYPES.JSXSpreadAttribute) {
            if (node.argument.type === utils_1.AST_NODE_TYPES.Identifier &&
                node.argument.name === name) {
                return true;
            }
        }
        if (node.type === utils_1.AST_NODE_TYPES.SpreadElement) {
            if (node.argument.type === utils_1.AST_NODE_TYPES.Identifier &&
                node.argument.name === name) {
                return true;
            }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const key of Object.keys(node)) {
            if (key === 'parent')
                continue;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const child = node[key];
            if (!child)
                continue;
            if (Array.isArray(child)) {
                for (const c of child) {
                    if (c && typeof c === 'object' && 'type' in c) {
                        stack.push(c);
                    }
                }
            }
            else if (typeof child === 'object' && 'type' in child) {
                stack.push(child);
            }
        }
    }
    return false;
}
exports.preferUseDeepCompareMemo = (0, createRule_1.createRule)({
    name: 'prefer-use-deep-compare-memo',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce using useDeepCompareMemo when dependency array contains non-primitive values (objects, arrays, functions) that are not already memoized. This prevents unnecessary re-renders due to reference changes.',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            preferUseDeepCompareMemo: 'Dependency array for "{{hook}}" includes objects/arrays/functions that change identity each render, so React treats them as changed and reruns the memoized computation, triggering avoidable renders. Use useDeepCompareMemo (or memoize those dependencies first) so comparisons use deep equality and the memo stays stable.',
        },
    },
    defaultOptions: [],
    create(context) {
        const memoizedIds = collectMemoizedIdentifiers(context);
        return {
            CallExpression(node) {
                if (!isUseMemoCallee(node.callee))
                    return;
                if (node.arguments.length === 0)
                    return;
                const callback = node.arguments[0];
                if (callback.type !== utils_1.AST_NODE_TYPES.ArrowFunctionExpression &&
                    callback.type !== utils_1.AST_NODE_TYPES.FunctionExpression) {
                    return;
                }
                // Ignore if JSX is present inside the memo callback
                if (containsJsx(callback))
                    return;
                // Get dependency array (last argument)
                const depsArg = node.arguments[node.arguments.length - 1];
                if (!depsArg || depsArg.type !== utils_1.AST_NODE_TYPES.ArrayExpression)
                    return;
                // Empty dependency arrays should be ignored
                if (depsArg.elements.length === 0)
                    return;
                // Determine if any dependency is a non-primitive and not already memoized
                let hasUnmemoizedNonPrimitive = false;
                for (const el of depsArg.elements) {
                    if (!el)
                        continue; // holes
                    if (el.type === utils_1.AST_NODE_TYPES.SpreadElement)
                        continue;
                    const expr = el;
                    // TS-aware check first
                    let isNonPrimitive = isNonPrimitiveWithTypes(context, expr);
                    // Fallback heuristic without type info for literals/arrays/objects/functions
                    if (!isNonPrimitive) {
                        isNonPrimitive = isNonPrimitiveWithoutTypes(expr);
                    }
                    // Identifier-specific heuristic: consider non-primitive only if used as object or function in callback
                    if (!isNonPrimitive && expr.type === utils_1.AST_NODE_TYPES.Identifier) {
                        // Imported identifiers are treated as stable
                        if (isImportedIdentifier(context, expr.name)) {
                            isNonPrimitive = false;
                        }
                        else if (identifierUsedAsObjectOrFunction(callback, expr.name) &&
                            !isIdentifierMemoizedAbove(expr.name, memoizedIds)) {
                            isNonPrimitive = true;
                        }
                    }
                    if (!isNonPrimitive)
                        continue;
                    // If identifier and memoized above, skip
                    if (expr.type === utils_1.AST_NODE_TYPES.Identifier &&
                        isIdentifierMemoizedAbove(expr.name, memoizedIds)) {
                        continue;
                    }
                    hasUnmemoizedNonPrimitive = true;
                    break;
                }
                if (!hasUnmemoizedNonPrimitive)
                    return;
                context.report({
                    node,
                    messageId: 'preferUseDeepCompareMemo',
                    data: {
                        hook: 'useMemo',
                    },
                    fix(fixer) {
                        const fixes = [];
                        // Replace callee
                        if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier) {
                            fixes.push(fixer.replaceText(node.callee, 'useDeepCompareMemo'));
                        }
                        else if (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                            fixes.push(fixer.replaceText(node.callee, 'useDeepCompareMemo'));
                        }
                        // Ensure import exists
                        fixes.push(...ensureDeepCompareImportFixes(context, fixer));
                        // Clean up now-unused React/useMemo imports if safe
                        const sourceCode = context.sourceCode;
                        const program = sourceCode.ast;
                        const reactImport = program.body.find((n) => n.type === utils_1.AST_NODE_TYPES.ImportDeclaration &&
                            n.source.value === 'react');
                        if (reactImport) {
                            // remove named useMemo if unused
                            const useMemoSpec = reactImport.specifiers.find((s) => s.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                                s.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
                                s.imported.name === 'useMemo');
                            if (useMemoSpec &&
                                !isIdentifierReferenced(sourceCode, useMemoSpec.local.name)) {
                                fixes.push(...removeImportSpecifierFixes(sourceCode, fixer, reactImport, useMemoSpec));
                            }
                            const defaultSpec = reactImport.specifiers.find((s) => s.type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier);
                            if (defaultSpec &&
                                !isIdentifierReferenced(sourceCode, defaultSpec.local.name)) {
                                fixes.push(...removeImportSpecifierFixes(sourceCode, fixer, reactImport, defaultSpec));
                            }
                        }
                        return fixes;
                    },
                });
            },
        };
    },
});
exports.default = exports.preferUseDeepCompareMemo;
//# sourceMappingURL=prefer-use-deep-compare-memo.js.map
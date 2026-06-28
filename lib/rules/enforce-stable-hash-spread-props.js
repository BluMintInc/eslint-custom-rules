"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceStableHashSpreadProps = void 0;
const utils_1 = require("@typescript-eslint/utils");
const ASTHelpers_1 = require("../utils/ASTHelpers");
const createRule_1 = require("../utils/createRule");
const DEFAULT_HASH_IMPORT = {
    source: 'functions/src/util/hash/stableHash',
    importName: 'stableHash',
};
const DEFAULT_HOOKS = new Set([
    'useEffect',
    'useLayoutEffect',
    'useCallback',
    'useInsertionEffect',
]);
const IGNORED_MEMO_HOOKS = new Set(['useMemo', 'useDeepCompareMemo']);
function getFunctionName(node) {
    if ('id' in node && node.id?.name) {
        return node.id.name;
    }
    if (node.type === utils_1.AST_NODE_TYPES.FunctionExpression &&
        node.parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
        node.parent.id.type === utils_1.AST_NODE_TYPES.Identifier) {
        return node.parent.id.name;
    }
    if (node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression &&
        node.parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
        node.parent.id.type === utils_1.AST_NODE_TYPES.Identifier) {
        return node.parent.id.name;
    }
    return null;
}
function isProbablyComponent(node, context) {
    const name = getFunctionName(node);
    if (name && /^[A-Z]/.test(name)) {
        return true;
    }
    if (ASTHelpers_1.ASTHelpers.returnsJSX(node.body, context)) {
        return true;
    }
    return false;
}
function collectRestNamesFromPattern(pattern, restNames) {
    if (pattern.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
        for (const prop of pattern.properties) {
            if (prop.type === utils_1.AST_NODE_TYPES.RestElement &&
                prop.argument.type === utils_1.AST_NODE_TYPES.Identifier) {
                restNames.add(prop.argument.name);
            }
            else if (prop.type === utils_1.AST_NODE_TYPES.Property &&
                prop.value.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
                collectRestNamesFromPattern(prop.value, restNames);
            }
        }
    }
    else if (pattern.type === utils_1.AST_NODE_TYPES.RestElement) {
        if (pattern.argument.type === utils_1.AST_NODE_TYPES.Identifier) {
            restNames.add(pattern.argument.name);
        }
    }
    else if (pattern.type === utils_1.AST_NODE_TYPES.AssignmentPattern) {
        collectRestNamesFromPattern(pattern.left, restNames);
    }
}
function collectPropsIdentifiersFromParam(param, propsIdentifiers) {
    if (param.type === utils_1.AST_NODE_TYPES.Identifier) {
        propsIdentifiers.add(param.name);
    }
    else if (param.type === utils_1.AST_NODE_TYPES.AssignmentPattern &&
        param.left.type === utils_1.AST_NODE_TYPES.Identifier) {
        propsIdentifiers.add(param.left.name);
    }
}
function getHookName(node) {
    const callee = node.callee;
    if (callee.type === utils_1.AST_NODE_TYPES.Identifier) {
        return callee.name;
    }
    if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.property.type === utils_1.AST_NODE_TYPES.Identifier) {
        return callee.property.name;
    }
    return null;
}
function stripTypeWrappers(expression) {
    if (expression.type === utils_1.AST_NODE_TYPES.TSNonNullExpression) {
        return stripTypeWrappers(expression.expression);
    }
    if (expression.type === utils_1.AST_NODE_TYPES.TSAsExpression) {
        return stripTypeWrappers(expression.expression);
    }
    if (expression.type === utils_1.AST_NODE_TYPES.TSTypeAssertion) {
        return stripTypeWrappers(expression.expression);
    }
    if (expression.type === utils_1.AST_NODE_TYPES.ChainExpression) {
        return stripTypeWrappers(expression.expression);
    }
    if (expression.type === 'ParenthesizedExpression') {
        return stripTypeWrappers(expression.expression);
    }
    return expression;
}
function isWrappedWithAllowedHash(expression, allowedHashes) {
    const unwrapped = stripTypeWrappers(expression);
    if (unwrapped.type === utils_1.AST_NODE_TYPES.CallExpression) {
        const callee = unwrapped.callee;
        if (callee.type === utils_1.AST_NODE_TYPES.Identifier &&
            allowedHashes.has(callee.name)) {
            return true;
        }
        if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
            !callee.computed &&
            callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
            allowedHashes.has(callee.property.name)) {
            return true;
        }
    }
    return false;
}
function getIdentifierFromExpression(expression) {
    const unwrapped = stripTypeWrappers(expression);
    if (unwrapped.type === utils_1.AST_NODE_TYPES.Identifier) {
        return unwrapped;
    }
    return null;
}
function getStableHashLocalNames(sourceCode, hashImport) {
    const localNames = [];
    const program = sourceCode.ast;
    for (const node of program.body) {
        if (node.type === utils_1.AST_NODE_TYPES.ImportDeclaration &&
            node.source.value === hashImport.source) {
            for (const spec of node.specifiers) {
                if (spec.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                    spec.imported.name === hashImport.importName) {
                    localNames.push(spec.local.name);
                }
            }
        }
    }
    return localNames;
}
function isStableHashImported(sourceCode, hashImport) {
    return getStableHashLocalNames(sourceCode, hashImport).length > 0;
}
function getIndentBeforeNode(sourceCode, node) {
    const lineText = sourceCode.lines[node.loc.start.line - 1] ?? '';
    const match = lineText.match(/^[ \t]*/);
    return match ? match[0] : '';
}
function hasExhaustiveDepsDisable(sourceCode, callNode, depsNode) {
    const [start, end] = [callNode.range[0], depsNode.range[1]];
    const callStartLine = callNode.loc.start.line;
    const depsStartLine = depsNode.loc.start.line;
    return sourceCode
        .getAllComments()
        .some((comment) => comment.value.includes('react-hooks/exhaustive-deps') &&
        ((comment.range[0] >= start && comment.range[1] <= end) ||
            comment.loc.end.line === callStartLine - 1 ||
            comment.loc.end.line === depsStartLine - 1));
}
exports.enforceStableHashSpreadProps = (0, createRule_1.createRule)({
    name: 'enforce-stable-hash-spread-props',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Require stableHash wrapping when spread props rest objects are used in React hook dependency arrays to avoid re-renders triggered by new object references on every render.',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [
            {
                type: 'object',
                properties: {
                    hashImport: {
                        type: 'object',
                        properties: {
                            source: { type: 'string' },
                            importName: { type: 'string' },
                        },
                        additionalProperties: false,
                    },
                    allowedHashFunctions: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                    hookNames: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            wrapSpreadPropsWithStableHash: 'Rest props object(s) "{{names}}" are recreated on every render, so using them directly in a dependency array makes React rerun the hook on every render. Wrap each in stableHash() (or a memoized hash) and depend on that stable value instead to avoid noisy re-renders.',
        },
    },
    defaultOptions: [{}],
    create(context) {
        const sourceCode = context.sourceCode ??
            context.getSourceCode();
        const [options = {}] = context.options;
        const hashImport = {
            source: options.hashImport?.source ?? DEFAULT_HASH_IMPORT.source,
            importName: options.hashImport?.importName ?? DEFAULT_HASH_IMPORT.importName,
        };
        const existingHashLocalNames = getStableHashLocalNames(sourceCode, hashImport);
        const userHookNames = new Set(options.hookNames ?? []);
        const allowedHashes = new Set([
            ...existingHashLocalNames,
            hashImport.importName,
            ...(options.allowedHashFunctions ?? []),
        ]);
        const hookNames = new Set([...DEFAULT_HOOKS, ...userHookNames]);
        let importPlanned = false;
        const hashIdentifier = existingHashLocalNames[0] ?? hashImport.importName;
        const functionStack = [];
        function getCurrentComponentContext() {
            for (let i = functionStack.length - 1; i >= 0; i -= 1) {
                if (functionStack[i].isComponent) {
                    return functionStack[i];
                }
            }
            return undefined;
        }
        return {
            ':function'(node) {
                const restNames = new Set();
                const propsIdentifiers = new Set();
                for (const param of node.params) {
                    collectRestNamesFromPattern(param, restNames);
                    collectPropsIdentifiersFromParam(param, propsIdentifiers);
                }
                functionStack.push({
                    node,
                    isComponent: isProbablyComponent(node, context),
                    restNames,
                    propsIdentifiers,
                });
            },
            'FunctionDeclaration:exit'() {
                functionStack.pop();
            },
            'FunctionExpression:exit'() {
                functionStack.pop();
            },
            'ArrowFunctionExpression:exit'() {
                functionStack.pop();
            },
            VariableDeclarator(node) {
                const current = getCurrentComponentContext();
                if (!current || !current.isComponent)
                    return;
                if (node.id.type === utils_1.AST_NODE_TYPES.ObjectPattern &&
                    node.init &&
                    node.init.type === utils_1.AST_NODE_TYPES.Identifier &&
                    current.propsIdentifiers.has(node.init.name)) {
                    collectRestNamesFromPattern(node.id, current.restNames);
                }
            },
            CallExpression(node) {
                const current = getCurrentComponentContext();
                if (!current || !current.isComponent)
                    return;
                const hookName = getHookName(node);
                if (!hookName || !hookNames.has(hookName))
                    return;
                if (IGNORED_MEMO_HOOKS.has(hookName) && !userHookNames.has(hookName))
                    return;
                if (node.arguments.length < 2)
                    return;
                const depsArg = node.arguments[node.arguments.length - 1];
                if (depsArg.type !== utils_1.AST_NODE_TYPES.ArrayExpression)
                    return;
                const offendingElements = [];
                for (const element of depsArg.elements) {
                    if (!element || element.type === utils_1.AST_NODE_TYPES.SpreadElement) {
                        continue;
                    }
                    if (isWrappedWithAllowedHash(element, allowedHashes)) {
                        continue;
                    }
                    const identifier = getIdentifierFromExpression(element);
                    if (!identifier) {
                        continue;
                    }
                    if (current.restNames.has(identifier.name)) {
                        offendingElements.push({ node: element, name: identifier.name });
                    }
                }
                if (offendingElements.length === 0)
                    return;
                const offendingNames = Array.from(new Set(offendingElements.map(({ name }) => name)));
                context.report({
                    node: depsArg,
                    messageId: 'wrapSpreadPropsWithStableHash',
                    data: { names: offendingNames.join(', ') },
                    fix(fixer) {
                        const fixes = [];
                        const seen = new Set();
                        for (const { node: targetNode } of offendingElements) {
                            if (seen.has(targetNode.range[0]))
                                continue;
                            seen.add(targetNode.range[0]);
                            const original = sourceCode.getText(targetNode);
                            fixes.push(fixer.replaceText(targetNode, `${hashIdentifier}(${original})`));
                        }
                        if (!isStableHashImported(sourceCode, hashImport) &&
                            !importPlanned) {
                            const importText = `import { ${hashImport.importName} } from '${hashImport.source}';\n`;
                            const program = sourceCode.ast;
                            const firstImport = program.body.find((n) => n.type === utils_1.AST_NODE_TYPES.ImportDeclaration);
                            if (firstImport) {
                                fixes.push(fixer.insertTextBefore(firstImport, importText));
                            }
                            else {
                                fixes.push(fixer.insertTextBeforeRange([0, 0], importText));
                            }
                            importPlanned = true;
                        }
                        if (!hasExhaustiveDepsDisable(sourceCode, node, depsArg)) {
                            const indent = getIndentBeforeNode(sourceCode, depsArg);
                            const tokenBefore = sourceCode.getTokenBefore(depsArg, {
                                includeComments: true,
                            });
                            const needsLeadingNewline = tokenBefore?.loc.end.line === depsArg.loc.start.line;
                            const commentText = needsLeadingNewline
                                ? `\n${indent}// eslint-disable-next-line react-hooks/exhaustive-deps\n${indent}`
                                : `// eslint-disable-next-line react-hooks/exhaustive-deps\n${indent}`;
                            fixes.push(fixer.insertTextBefore(depsArg, commentText));
                        }
                        return fixes;
                    },
                });
            },
        };
    },
});
//# sourceMappingURL=enforce-stable-hash-spread-props.js.map
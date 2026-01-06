"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noArrayLengthInDeps = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
// React hooks to check
const HOOK_NAMES = new Set(['useEffect', 'useCallback', 'useMemo']);
const DEFAULT_HASH_IMPORT = {
    source: 'functions/src/util/hash/stableHash',
    importName: 'stableHash',
};
function isHookCall(node) {
    const callee = node.callee;
    return (callee.type === utils_1.AST_NODE_TYPES.Identifier && HOOK_NAMES.has(callee.name));
}
function isLengthMemberExpression(node) {
    if (node.type === utils_1.AST_NODE_TYPES.MemberExpression) {
        return (!node.computed &&
            node.property.type === utils_1.AST_NODE_TYPES.Identifier &&
            node.property.name === 'length');
    }
    if (node.type === utils_1.AST_NODE_TYPES.ChainExpression) {
        return isLengthMemberExpression(node.expression);
    }
    return false;
}
function getLengthMember(node) {
    if (node.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        isLengthMemberExpression(node)) {
        return node;
    }
    if (node.type === utils_1.AST_NODE_TYPES.ChainExpression) {
        const expr = node.expression;
        return getLengthMember(expr);
    }
    return null;
}
function getBaseExpression(member) {
    // For foo?.bar.length we want foo?.bar as base
    return member.object;
}
function getLastPropertyName(expr) {
    let current = expr;
    while (current.type === utils_1.AST_NODE_TYPES.ChainExpression) {
        current = current.expression;
    }
    if (current.type === utils_1.AST_NODE_TYPES.Identifier) {
        return current.name;
    }
    if (current.type === utils_1.AST_NODE_TYPES.MemberExpression) {
        if (!current.computed &&
            current.property.type === utils_1.AST_NODE_TYPES.Identifier) {
            return current.property.name;
        }
        // Fallback to walking further up the chain
        return getLastPropertyName(current.object);
    }
    return null;
}
function generateUniqueName(base, taken) {
    let candidate = `${base}Hash`;
    if (!taken.has(candidate))
        return candidate;
    let i = 2;
    while (taken.has(`${candidate}${i}`)) {
        i++;
    }
    return `${candidate}${i}`;
}
function collectAllTakenNames(sourceCode) {
    const names = new Set();
    const scopeManager = sourceCode.scopeManager;
    const visit = (scope) => {
        if (!scope)
            return;
        for (const v of scope.variables) {
            names.add(v.name);
        }
        if (Array.isArray(scope.childScopes)) {
            for (const child of scope.childScopes)
                visit(child);
        }
    };
    visit(scopeManager?.globalScope);
    return names;
}
function findEnclosingFunction(node) {
    let current = node;
    while (current) {
        if (current.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
            current.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
            current.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
            return current;
        }
        current = current.parent;
    }
    return null;
}
function ensureWeakMapEntry(map, key, factory) {
    const existing = map.get(key);
    if (existing)
        return existing;
    const next = factory();
    map.set(key, next);
    return next;
}
function isUseMemoImported(sourceCode) {
    const program = sourceCode.ast;
    for (const node of program.body) {
        if (node.type === utils_1.AST_NODE_TYPES.ImportDeclaration &&
            node.source.value === 'react') {
            for (const spec of node.specifiers) {
                if (spec.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                    spec.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
                    spec.imported.name === 'useMemo') {
                    return true;
                }
            }
        }
    }
    return false;
}
function isStableHashImported(sourceCode, hashSource, hashImportName) {
    const program = sourceCode.ast;
    for (const node of program.body) {
        if (node.type === utils_1.AST_NODE_TYPES.ImportDeclaration &&
            node.source.value === hashSource) {
            for (const spec of node.specifiers) {
                if (spec.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                    spec.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
                    spec.imported.name === hashImportName) {
                    return true;
                }
            }
        }
    }
    return false;
}
exports.noArrayLengthInDeps = (0, createRule_1.createRule)({
    name: 'no-array-length-in-deps',
    meta: {
        type: 'problem',
        docs: {
            description: 'Detects array.length entries in React hook dependency arrays because length ignores content changes; auto-fixes by memoizing stableHash(array) with useMemo and depending on the hash instead.',
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
                },
                additionalProperties: false,
            },
        ],
        messages: {
            noArrayLengthInDeps: 'Dependency array includes length-based entries ({{dependencies}}). Array length only changes when items are added or removed, so hooks miss updates when array contents change at the same size. Memoize a stableHash of each array with useMemo and depend on that hash so the hook reruns when contents change.',
        },
    },
    defaultOptions: [{}],
    create(context) {
        const [options = {}] = context.options;
        const { hashImport } = options;
        const hashImportConfig = {
            source: hashImport?.source ?? DEFAULT_HASH_IMPORT.source,
            importName: hashImport?.importName ?? DEFAULT_HASH_IMPORT.importName,
        };
        // Track planned file-wide changes to avoid overlapping fixers
        let importsPlanned = false;
        const perFuncDeclaredBases = new WeakMap();
        const perFuncBaseToVar = new WeakMap();
        return {
            CallExpression(node) {
                if (!isHookCall(node))
                    return;
                if (node.arguments.length < 2)
                    return;
                const depsArg = node.arguments[node.arguments.length - 1];
                if (depsArg.type !== utils_1.AST_NODE_TYPES.ArrayExpression)
                    return;
                // Collect .length deps
                const lengthDeps = [];
                for (const el of depsArg.elements) {
                    if (!el)
                        continue;
                    if (el.type === utils_1.AST_NODE_TYPES.SpreadElement)
                        continue;
                    const member = getLengthMember(el);
                    if (member) {
                        lengthDeps.push({ element: el, member });
                    }
                }
                if (lengthDeps.length === 0)
                    return;
                const sourceCode = context.getSourceCode();
                const dependencies = lengthDeps
                    .map(({ element }) => sourceCode.getText(element))
                    .join(', ');
                // Report once on the dependency array
                context.report({
                    node: depsArg,
                    messageId: 'noArrayLengthInDeps',
                    data: {
                        dependencies,
                    },
                    fix(fixer) {
                        const fixes = [];
                        const hostFn = findEnclosingFunction(node) ?? sourceCode.ast;
                        const declaredBases = ensureWeakMapEntry(perFuncDeclaredBases, hostFn, () => new Set());
                        const baseToVar = ensureWeakMapEntry(perFuncBaseToVar, hostFn, () => new Map());
                        // Prepare variable names (consistent across file) and taken names (across all scopes)
                        const allTaken = collectAllTakenNames(sourceCode);
                        for (const name of baseToVar.values()) {
                            allTaken.add(name);
                        }
                        for (const { member } of lengthDeps) {
                            const baseExpr = getBaseExpression(member);
                            const baseText = sourceCode.getText(baseExpr);
                            if (!baseToVar.has(baseText)) {
                                const lastPropName = getLastPropertyName(baseExpr) || 'array';
                                const varName = generateUniqueName(lastPropName, allTaken);
                                baseToVar.set(baseText, varName);
                                allTaken.add(varName);
                            }
                        }
                        // Build declarations text (one per base)
                        let declText = '';
                        for (const { member } of lengthDeps) {
                            const baseExpr = getBaseExpression(member);
                            const baseText = sourceCode.getText(baseExpr);
                            if (!declaredBases.has(baseText)) {
                                const varName = baseToVar.get(baseText);
                                declText += `const ${varName} = useMemo(() => ${hashImportConfig.importName}(${baseText}), [${baseText}]);\n`;
                                declaredBases.add(baseText);
                            }
                        }
                        if (declText) {
                            // Add a blank line after declarations block
                            declText += `\n`;
                        }
                        // Determine import text and insertion strategy
                        const program = sourceCode.ast;
                        const importDecls = program.body.filter((n) => n.type === utils_1.AST_NODE_TYPES.ImportDeclaration);
                        // Compute indentation based on the whitespace before the first token
                        const fullText = sourceCode.getText();
                        const prefixBeforeProgram = fullText.slice(0, program.range[0]);
                        const lastNewlineIndex = prefixBeforeProgram.lastIndexOf('\n');
                        const indent = lastNewlineIndex >= 0
                            ? prefixBeforeProgram.slice(lastNewlineIndex + 1)
                            : prefixBeforeProgram;
                        let importText = '';
                        const needUseMemo = !isUseMemoImported(sourceCode);
                        const needStableHash = !isStableHashImported(sourceCode, hashImportConfig.source, hashImportConfig.importName);
                        if (needUseMemo)
                            importText += `${indent}import { useMemo } from 'react';\n`;
                        if (needStableHash)
                            importText += `${indent}import { ${hashImportConfig.importName} } from '${hashImportConfig.source}';\n`;
                        if (importDecls.length === 0) {
                            // No existing imports. Normalize by removing leading whitespace and inserting at file start with no indentation.
                            if (declText || importText) {
                                // Build non-indented versions of import and decl blocks
                                let importTextNoIndent = '';
                                if (needUseMemo)
                                    importTextNoIndent += `import { useMemo } from 'react';\n`;
                                if (needStableHash)
                                    importTextNoIndent += `import { ${hashImportConfig.importName} } from '${hashImportConfig.source}';\n`;
                                const declNoIndent = declText;
                                const combined = `${importTextNoIndent}${importTextNoIndent && declNoIndent ? '\n' : ''}${declNoIndent}`;
                                // Remove leading whitespace
                                fixes.push(fixer.replaceTextRange([0, program.range[0]], ''));
                                // Insert at column 0
                                fixes.push(fixer.insertTextBeforeRange([0, 0], combined));
                            }
                            importsPlanned = true;
                        }
                        else {
                            // Existing imports present: insert missing import lines before the first import, and declarations after the last import
                            const firstImport = importDecls[0];
                            const lastImport = importDecls[importDecls.length - 1];
                            if (importText && !importsPlanned) {
                                fixes.push(fixer.insertTextBefore(firstImport, importText));
                                importsPlanned = true;
                            }
                            if (declText) {
                                const declWithIndent = declText
                                    .split('\n')
                                    .map((line) => (line ? `${indent}${line}` : line))
                                    .join('\n');
                                fixes.push(fixer.insertTextAfter(lastImport, `\n${declWithIndent}`));
                            }
                        }
                        // Replace each .length dep with the corresponding var name
                        for (const { element, member } of lengthDeps) {
                            const baseExpr = getBaseExpression(member);
                            const baseText = sourceCode.getText(baseExpr);
                            const varName = baseToVar.get(baseText);
                            fixes.push(fixer.replaceText(element, varName));
                        }
                        return fixes;
                    },
                });
            },
        };
    },
});
//# sourceMappingURL=no-array-length-in-deps.js.map
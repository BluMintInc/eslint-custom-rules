"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferNextDynamic = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const DEFAULT_USE_DYNAMIC_SOURCES = [
    'useDynamic',
    './useDynamic',
    '../hooks/useDynamic',
    '../../hooks/useDynamic',
];
function matchesAllowedSource(source, allowedSources) {
    return allowedSources.some((pattern) => source === pattern || source.endsWith(`/${pattern}`));
}
function hasNodeStructure(value) {
    return (!!value &&
        typeof value === 'object' &&
        'type' in value &&
        typeof value.type === 'string');
}
/**
 * Walks the AST and invokes the visitor on each node.
 * Uses WeakSet to prevent infinite cycles.
 *
 * @param visitor - Callback invoked on each node. Return `false` to stop
 * traversal; return `undefined` (or nothing) to continue walking.
 * @returns `false` if traversal stopped early; `true` when traversal completes.
 */
function walkAst(node, visitor, visited = new WeakSet()) {
    if (visited.has(node))
        return true;
    visited.add(node);
    const shouldContinue = visitor(node);
    if (shouldContinue === false)
        return false;
    const anyNode = node;
    for (const key of Object.keys(anyNode)) {
        if (key === 'parent')
            continue;
        const child = anyNode[key];
        if (Array.isArray(child)) {
            for (const c of child) {
                if (hasNodeStructure(c)) {
                    if (!walkAst(c, visitor, visited))
                        return false;
                }
            }
        }
        else if (hasNodeStructure(child)) {
            if (!walkAst(child, visitor, visited))
                return false;
        }
    }
    return true;
}
function isUseDynamicCall(node) {
    const { callee, arguments: args } = node;
    if (callee.type === utils_1.AST_NODE_TYPES.Identifier &&
        callee.name === 'useDynamic' &&
        args.length === 1 &&
        args[0].type === utils_1.AST_NODE_TYPES.ImportExpression) {
        return true;
    }
    return false;
}
function findProgramNode(node) {
    let current = node;
    while (current && current.type !== utils_1.AST_NODE_TYPES.Program) {
        current = current.parent;
    }
    return current || null;
}
function getImportDeclarations(program) {
    return program.body.filter((n) => n.type === utils_1.AST_NODE_TYPES.ImportDeclaration);
}
function findUseDynamicImport(program, allowedSources) {
    const imports = getImportDeclarations(program);
    for (const imp of imports) {
        if (typeof imp.source.value !== 'string')
            continue;
        const source = imp.source.value;
        if (!matchesAllowedSource(source, allowedSources))
            continue;
        const importedUseDynamic = imp.specifiers.find((s) => (s.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
            s.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
            s.imported.name === 'useDynamic') ||
            s.type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier ||
            (s.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                s.local.name === 'useDynamic'));
        if (importedUseDynamic && importedUseDynamic.local.name === 'useDynamic') {
            return {
                importNode: imp,
                specifier: importedUseDynamic,
                localName: importedUseDynamic.local.name,
            };
        }
    }
    return null;
}
function getNextDynamicLocalName(program) {
    for (const imp of getImportDeclarations(program)) {
        if (imp.source.value === 'next/dynamic') {
            const def = imp.specifiers.find((s) => s.type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier);
            if (def)
                return def.local.name;
        }
    }
    return null;
}
function buildDynamicReplacement(call, variableKind, variableIdText, namedExportKey, sourceCode, dynamicIdent) {
    const expr = buildDynamicExpression(call, namedExportKey, sourceCode, dynamicIdent);
    return `${variableKind} ${variableIdText} = ${expr};`;
}
function buildDynamicExpression(call, namedExportKey, sourceCode, dynamicIdent) {
    // call.arguments[0] is ImportExpression
    const importExpr = call.arguments[0];
    const importArgText = sourceCode.getText(importExpr.source);
    const returnExpr = namedExportKey ? `mod.${namedExportKey}` : 'mod.default';
    const dynamicText = `${dynamicIdent}(
  async () => {
    const mod = await import(${importArgText});
    return ${returnExpr};
  },
  { ssr: false }
)`;
    return dynamicText;
}
function inferVariableInfo(node) {
    // Support: const Foo = useDynamic(import('...'));
    // or: const { Picker } = useDynamic(import('...'));
    const decl = node;
    if (!decl.init || decl.init.type !== utils_1.AST_NODE_TYPES.CallExpression) {
        return null;
    }
    if (!isUseDynamicCall(decl.init))
        return null;
    let kind = 'const';
    const parent = decl.parent;
    if (parent &&
        parent.type === utils_1.AST_NODE_TYPES.VariableDeclaration &&
        (parent.kind === 'const' || parent.kind === 'let' || parent.kind === 'var')) {
        kind = parent.kind;
    }
    if (decl.id.type === utils_1.AST_NODE_TYPES.Identifier) {
        return { kind, idText: decl.id.name, namedExportKey: null };
    }
    if (decl.id.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
        // Only handle a single-property destructure like { Picker }
        if (decl.id.properties.length !== 1) {
            return null;
        }
        const prop = decl.id.properties[0];
        if (prop && prop.type === utils_1.AST_NODE_TYPES.Property) {
            const key = prop.key.type === utils_1.AST_NODE_TYPES.Identifier ? prop.key.name : null;
            const valueName = prop.value.type === utils_1.AST_NODE_TYPES.Identifier ? prop.value.name : null;
            if (key && valueName) {
                return { kind, idText: valueName, namedExportKey: key };
            }
        }
    }
    return null;
}
exports.preferNextDynamic = (0, createRule_1.createRule)({
    name: 'prefer-next-dynamic',
    meta: {
        type: 'problem',
        docs: {
            description: 'Prefer Next.js dynamic() over custom useDynamic() for component imports',
            recommended: 'error',
            requiresTypeChecking: false,
        },
        fixable: 'code',
        schema: [
            {
                type: 'object',
                properties: {
                    useDynamicSources: {
                        type: 'array',
                        items: { type: 'string' },
                        minItems: 1,
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            preferNextDynamic: 'Component "{{componentName}}" is created with useDynamic(import(...)), which bypasses Next.js dynamic() handling for client-only components and leaves SSR control to a custom wrapper. Wrap the import in dynamic(() => import(...), { ssr: false }) so Next.js manages code-splitting and disables server rendering safely.',
            addNextDynamicImport: "The auto-fix will replace useDynamic(import(...)) with dynamic(() => import(...), { ssr: false }), which references Next.js's dynamic function. Without importing dynamic from 'next/dynamic', the fixed code will throw a ReferenceError at runtime when the module loads. Add `import dynamic from 'next/dynamic'` at the top of the file to make the dynamic identifier available.",
            removeUseDynamicImport: 'Remove the unused useDynamic import after migrating to dynamic(); leaving the custom hook imported invites accidental reuse and keeps dead code in the bundle.',
        },
    },
    defaultOptions: [{}],
    create(context) {
        const [options = {}] = context.options;
        const allowedUseDynamicSources = options.useDynamicSources && options.useDynamicSources.length > 0
            ? options.useDynamicSources
            : DEFAULT_USE_DYNAMIC_SOURCES;
        const sourceCode = context.sourceCode;
        return {
            VariableDeclarator(node) {
                const info = inferVariableInfo(node);
                if (!info)
                    return;
                // For edge case 1 (Non-Component Imports): we conservatively only transform when the LHS is used in JSX.
                // Heuristic: if identifier appears in any JSXOpeningElement as name, consider a component.
                const program = findProgramNode(node);
                if (!program)
                    return;
                const useDynamicImportInfo = findUseDynamicImport(program, allowedUseDynamicSources);
                if (!useDynamicImportInfo)
                    return;
                const identifierName = info.idText;
                // walkAst returns false when visitor returns false (early exit on match)
                const usedInJsx = program.body.some((b) => walkAst(b, (n) => {
                    if (n.type === utils_1.AST_NODE_TYPES.JSXOpeningElement) {
                        const name = n.name;
                        if (name.type === utils_1.AST_NODE_TYPES.JSXIdentifier) {
                            if (name.name === identifierName) {
                                return false;
                            }
                        }
                    }
                    return undefined;
                }) === false);
                if (!usedInJsx) {
                    // Skip to avoid flagging non-component dynamic imports
                    return;
                }
                // Now we are confident enough to report and fix
                const init = node.init;
                const parentDecl = node.parent;
                context.report({
                    node: init,
                    messageId: 'preferNextDynamic',
                    data: { componentName: identifierName },
                    fix(fixer) {
                        const fixes = [];
                        // ensure dynamic import is present
                        const programNode = program;
                        let dynamicLocal = getNextDynamicLocalName(programNode);
                        const hasDynamic = !!dynamicLocal;
                        if (!hasDynamic) {
                            // Insert after directive prologue (e.g., "use client")
                            const insertionIndex = programNode.body.findIndex((stmt) => {
                                return !(stmt.type === utils_1.AST_NODE_TYPES.ExpressionStatement &&
                                    stmt.expression.type === utils_1.AST_NODE_TYPES.Literal &&
                                    typeof stmt.expression.value === 'string');
                            });
                            const target = insertionIndex === -1
                                ? programNode.body[0]
                                : programNode.body[insertionIndex];
                            const indentation = '';
                            fixes.push(fixer.insertTextBefore(target, `${indentation}import dynamic from 'next/dynamic';\n`));
                            dynamicLocal = 'dynamic';
                        }
                        // Replace the variable declarator text with dynamic(...) usage
                        if (parentDecl.declarations.length === 1) {
                            const variableText = buildDynamicReplacement(init, parentDecl.kind, info.idText, info.namedExportKey, sourceCode, dynamicLocal || 'dynamic');
                            fixes.push(fixer.replaceText(parentDecl, variableText));
                        }
                        else {
                            // Multiple declarators:
                            if (node.id.type === utils_1.AST_NODE_TYPES.Identifier) {
                                // Replace only the initializer expression
                                const dynamicExpr = buildDynamicExpression(init, info.namedExportKey, sourceCode, dynamicLocal || 'dynamic');
                                fixes.push(fixer.replaceText(init, dynamicExpr));
                            }
                            else if (node.id.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
                                // Replace the whole declarator with "<localName> = dynamic(...)"
                                const dynamicExpr = buildDynamicExpression(init, info.namedExportKey, sourceCode, dynamicLocal || 'dynamic');
                                const replacement = `${info.idText} = ${dynamicExpr}`;
                                fixes.push(fixer.replaceText(node, replacement));
                            }
                        }
                        // Remove unused useDynamic import if present and no longer referenced
                        const latestUseDynamicImport = findUseDynamicImport(programNode, allowedUseDynamicSources);
                        if (latestUseDynamicImport) {
                            // Abort removal if there are other useDynamic(import(...)) calls in the file
                            const otherUseDynamicCalls = programNode.body.some((b) => walkAst(b, (n) => {
                                if (n.type === utils_1.AST_NODE_TYPES.CallExpression &&
                                    isUseDynamicCall(n) &&
                                    n !== init) {
                                    return false;
                                }
                                return undefined;
                            }) === false);
                            if (otherUseDynamicCalls) {
                                return fixes; // keep the import; other occurrences still rely on it
                            }
                            // If import had only useDynamic, remove entire declaration; else remove just its specifier
                            const specifiers = latestUseDynamicImport.importNode.specifiers;
                            const useDynamicSpecifier = specifiers.find((s) => (s.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                                s.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
                                s.imported.name === 'useDynamic') ||
                                (s.type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier &&
                                    s.local.name === 'useDynamic') ||
                                (s.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                                    s.local.name === 'useDynamic'));
                            if (useDynamicSpecifier) {
                                if (specifiers.length === 1) {
                                    // Remove entire import
                                    fixes.push(fixer.remove(latestUseDynamicImport.importNode));
                                    // If dynamic was already present (we didn't insert), collapse the extra newline left by removal
                                    if (hasDynamic) {
                                        const after = latestUseDynamicImport.importNode.range[1];
                                        if (after < sourceCode.text.length) {
                                            const ch = sourceCode.text[after];
                                            if (ch === '\n' || ch === '\r') {
                                                fixes.push(fixer.removeRange([after, after + 1]));
                                            }
                                        }
                                    }
                                }
                                else {
                                    // If only named specifiers exist, reconstruct a clean import text
                                    const onlyNamed = specifiers.every((s) => s.type === utils_1.AST_NODE_TYPES.ImportSpecifier);
                                    if (onlyNamed) {
                                        const remaining = specifiers.filter((s) => s !== useDynamicSpecifier);
                                        const specText = remaining
                                            .map((s) => s.imported.name === s.local.name
                                            ? s.local.name
                                            : `${s.imported.name} as ${s.local.name}`)
                                            .join(', ');
                                        const newText = `import { ${specText} } from '${latestUseDynamicImport.importNode.source.value}';`;
                                        fixes.push(fixer.replaceText(latestUseDynamicImport.importNode, newText));
                                    }
                                    else {
                                        // Otherwise, remove the specifier with proper comma handling
                                        const tokenAfter = sourceCode.getTokenAfter(useDynamicSpecifier);
                                        const tokenBefore = sourceCode.getTokenBefore(useDynamicSpecifier);
                                        if (tokenAfter && tokenAfter.value === ',') {
                                            fixes.push(fixer.removeRange([
                                                useDynamicSpecifier.range[0],
                                                tokenAfter.range[1],
                                            ]));
                                        }
                                        else if (tokenBefore && tokenBefore.value === ',') {
                                            fixes.push(fixer.removeRange([
                                                tokenBefore.range[0],
                                                useDynamicSpecifier.range[1],
                                            ]));
                                        }
                                        else {
                                            fixes.push(fixer.remove(useDynamicSpecifier));
                                        }
                                    }
                                }
                            }
                        }
                        return fixes;
                    },
                });
            },
        };
    },
});
//# sourceMappingURL=prefer-next-dynamic.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceFirebaseImports = void 0;
const createRule_1 = require("../utils/createRule");
exports.enforceFirebaseImports = (0, createRule_1.createRule)({
    name: 'enforce-dynamic-firebase-imports',
    meta: {
        type: 'problem',
        docs: {
            description: 'Require firebaseCloud modules to be loaded via dynamic import so Firebase code stays out of the initial bundle and only loads when needed.',
            recommended: 'error',
        },
        fixable: 'code',
        hasSuggestions: true,
        schema: [],
        messages: {
            noDynamicImport: 'Static import from firebaseCloud path "{{importPath}}" eagerly bundles Firebase code into the initial client chunk, which inflates startup time and prevents lazy loading. Replace it with an awaited dynamic import so the code only loads when invoked (e.g., `const module = await import(\'{{importPath}}\')` or destructure the exports you need).',
        },
    },
    defaultOptions: [],
    create(context) {
        return {
            ImportDeclaration(node) {
                // Skip third-party files
                const filename = context.getFilename?.();
                if (filename && /(^|[\\/])node_modules([\\/]|$)/.test(filename)) {
                    return;
                }
                // Skip type-only import declarations
                if (node.importKind === 'type') {
                    return;
                }
                const importPath = node.source.value;
                // Check if the import is from firebaseCloud directory
                if (!importPath.includes('firebaseCloud/')) {
                    return;
                }
                // Determine specifiers
                const defaultSpecifier = node.specifiers.find((spec) => spec.type === 'ImportDefaultSpecifier');
                const namespaceSpecifier = node.specifiers.find((spec) => spec.type === 'ImportNamespaceSpecifier');
                const namedSpecifiers = node.specifiers.filter((spec) => spec.type === 'ImportSpecifier' && spec.importKind !== 'type');
                const typeOnlySpecifiers = node.specifiers.filter((spec) => spec.type === 'ImportSpecifier' && spec.importKind === 'type');
                // If there are only type-only specifiers, allow
                if (!defaultSpecifier &&
                    !namespaceSpecifier &&
                    namedSpecifiers.length === 0 &&
                    typeOnlySpecifiers.length > 0) {
                    return;
                }
                const buildTypeNames = () => typeOnlySpecifiers
                    .map((spec) => spec.imported.name === spec.local.name
                    ? spec.imported.name
                    : `${spec.imported.name} as ${spec.local.name}`)
                    .join(', ');
                const buildReplacement = (options = {}) => {
                    const statements = [];
                    if (typeOnlySpecifiers.length > 0) {
                        statements.push(`import type { ${buildTypeNames()} } from '${importPath}';`);
                    }
                    if (namespaceSpecifier) {
                        const nsLocal = namespaceSpecifier.local.name;
                        statements.push(`const ${nsLocal} = await import('${importPath}');`);
                        if (defaultSpecifier) {
                            const defLocal = defaultSpecifier.local.name;
                            statements.push(`const ${defLocal} = ${nsLocal}.default;`);
                        }
                        const destructureFromNamespace = [];
                        if (namedSpecifiers.length > 0) {
                            const destructureParts = namedSpecifiers.map((spec) => {
                                const imported = spec.imported.name;
                                const local = spec.local.name;
                                return imported === local ? imported : `${imported}: ${local}`;
                            });
                            destructureFromNamespace.push(...destructureParts);
                        }
                        if (destructureFromNamespace.length > 0) {
                            statements.push(`const { ${destructureFromNamespace.join(', ')} } = ${nsLocal};`);
                        }
                        return statements.join(' ');
                    }
                    const destructureParts = [];
                    if (defaultSpecifier) {
                        const defLocal = defaultSpecifier.local.name;
                        destructureParts.push(`default: ${defLocal}`);
                    }
                    if (namedSpecifiers.length > 0) {
                        for (const spec of namedSpecifiers) {
                            const imported = spec.imported.name;
                            const local = spec.local.name;
                            destructureParts.push(imported === local ? imported : `${imported}: ${local}`);
                        }
                    }
                    if (destructureParts.length > 0) {
                        statements.push(`const { ${destructureParts.join(', ')} } = await import('${importPath}');`);
                        return statements.join(' ');
                    }
                    if (node.specifiers.length === 0) {
                        return options.allowSideEffectFix !== false
                            ? `await import('${importPath}');`
                            : null;
                    }
                    return null;
                };
                context.report({
                    node,
                    messageId: 'noDynamicImport',
                    data: { importPath },
                    fix(fixer) {
                        const replacement = buildReplacement();
                        return replacement ? fixer.replaceText(node, replacement) : null;
                    },
                    suggest: [
                        {
                            messageId: 'noDynamicImport',
                            fix(fixer) {
                                const replacement = buildReplacement({
                                    allowSideEffectFix: true,
                                });
                                return replacement
                                    ? fixer.replaceText(node, replacement)
                                    : null;
                            },
                        },
                    ],
                });
            },
        };
    },
});
//# sourceMappingURL=enforce-dynamic-firebase-imports.js.map
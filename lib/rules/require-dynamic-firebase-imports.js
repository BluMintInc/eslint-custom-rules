"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RULE_NAME = void 0;
const createRule_1 = require("../utils/createRule");
exports.RULE_NAME = 'require-dynamic-firebase-imports';
exports.default = (0, createRule_1.createRule)({
    name: exports.RULE_NAME,
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce dynamic imports for Firebase dependencies',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            requireDynamicImport: 'Static Firebase import from "{{importSource}}" keeps the Firebase SDK in the initial bundle and blocks route-level code splitting. Use an `await import(\'{{importSource}}\')` dynamic import so Firebase loads only on the code path that needs it; type-only imports remain allowed.',
        },
    },
    defaultOptions: [],
    create(context) {
        const isFirebaseImport = (source) => {
            return (source.startsWith('firebase/') ||
                source.includes('config/firebase-client'));
        };
        const createDynamicImport = (node) => {
            const importSource = node.source.value;
            const importSpecifiers = node.specifiers;
            if (importSpecifiers.length === 0) {
                // For side-effect imports like 'firebase/auth'
                return `await import('${importSource}');`;
            }
            if (importSpecifiers.length === 1) {
                const spec = importSpecifiers[0];
                if (spec.type === 'ImportDefaultSpecifier') {
                    // For default imports
                    return `const ${spec.local.name} = (await import('${importSource}')).default;`;
                }
                if (spec.type === 'ImportSpecifier') {
                    // For single named import
                    const importedName = spec.imported.name;
                    const localName = spec.local.name;
                    if (importedName === localName) {
                        return `const { ${localName} } = await import('${importSource}');`;
                    }
                    return `const { ${importedName}: ${localName} } = await import('${importSource}');`;
                }
            }
            // For multiple named imports
            const importedModule = `await import('${importSource}')`;
            const namedImports = importSpecifiers
                .map((spec) => {
                if (spec.type === 'ImportSpecifier') {
                    const importedName = spec.imported.name;
                    const localName = spec.local.name;
                    return importedName === localName
                        ? localName
                        : `${importedName}: ${localName}`;
                }
                return '';
            })
                .filter(Boolean)
                .join(', ');
            return `const { ${namedImports} } = ${importedModule};`;
        };
        return {
            ImportDeclaration(node) {
                const importSource = node.source.value;
                if (typeof importSource === 'string' &&
                    isFirebaseImport(importSource) &&
                    !node.importKind?.includes('type')) {
                    context.report({
                        node,
                        messageId: 'requireDynamicImport',
                        data: { importSource },
                        fix(fixer) {
                            const dynamicImport = createDynamicImport(node);
                            return fixer.replaceText(node, dynamicImport);
                        },
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=require-dynamic-firebase-imports.js.map
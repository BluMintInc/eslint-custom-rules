"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceFirebaseImports = void 0;
const createRule_1 = require("../utils/createRule");
exports.enforceFirebaseImports = (0, createRule_1.createRule)({
    name: 'enforce-dynamic-firebase-imports',
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce dynamic importing for modules within the firebaseCloud directory',
            recommended: 'error',
        },
        schema: [],
        messages: {
            noDynamicImport: 'Static imports from firebaseCloud directory are not allowed. Use dynamic imports instead.',
        },
    },
    defaultOptions: [],
    create(context) {
        return {
            ImportDeclaration(node) {
                // Skip type-only imports
                if (node.importKind === 'type') {
                    return;
                }
                const importPath = node.source.value;
                // Check if the import is from firebaseCloud directory
                if (importPath.includes('firebaseCloud/')) {
                    context.report({
                        node,
                        messageId: 'noDynamicImport',
                        fix(fixer) {
                            const importSpecifiers = node.specifiers
                                .filter((spec) => spec.type === 'ImportSpecifier')
                                .map((spec) => spec.imported.name);
                            if (importSpecifiers.length === 0) {
                                return null;
                            }
                            const destructuredImports = `{ ${importSpecifiers.join(', ')} }`;
                            const dynamicImport = `const ${destructuredImports} = await import('${importPath}');`;
                            return fixer.replaceText(node, dynamicImport);
                        },
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-dynamic-firebase-imports.js.map
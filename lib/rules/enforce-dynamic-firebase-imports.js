"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceFirebaseImports = void 0;
const createRule_1 = require("../utils/createRule");
exports.enforceFirebaseImports = (0, createRule_1.createRule)({
    name: 'enforce-dynamic-firebase-imports',
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce dynamic importing for modules within the firebaseCloud directory to optimize initial bundle size. This ensures Firebase-related code is only loaded when needed, improving application startup time and reducing the main bundle size.',
            recommended: 'error',
        },
        schema: [],
        messages: {
            noDynamicImport: 'Static imports from firebaseCloud directory are not allowed to reduce initial bundle size. Instead of `import { func } from "./firebaseCloud/module"`, use dynamic import: `const { func } = await import("./firebaseCloud/module")`.',
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
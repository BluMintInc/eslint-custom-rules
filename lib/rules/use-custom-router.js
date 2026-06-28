"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useCustomRouter = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
exports.useCustomRouter = (0, createRule_1.createRule)({
    name: 'use-custom-router',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce using src/hooks/routing/useRouter instead of next/router',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            useCustomRouter: 'useRouter import "{{imports}}" comes from next/router, which bypasses the app-specific hook that applies auth checks, analytics, and redirect helpers. Import it from src/hooks/routing/useRouter so routing code stays consistent with the rest of the app.',
        },
    },
    defaultOptions: [],
    create(context) {
        return {
            ImportDeclaration(node) {
                if (node.source.value === 'next/router') {
                    const specifiers = node.specifiers.filter((specifier) => specifier.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                        specifier.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
                        specifier.imported.name === 'useRouter');
                    if (specifiers.length > 0) {
                        context.report({
                            node,
                            messageId: 'useCustomRouter',
                            data: {
                                imports: specifiers
                                    .map((specifier) => specifier.local.name)
                                    .join(', '),
                            },
                            fix(fixer) {
                                // If there are other imports from next/router, keep them
                                const otherSpecifiers = node.specifiers.filter((specifier) => specifier.type !== utils_1.AST_NODE_TYPES.ImportSpecifier ||
                                    (specifier.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
                                        specifier.imported.name !== 'useRouter'));
                                if (otherSpecifiers.length === 0) {
                                    // If useRouter is the only import, replace the entire import
                                    return fixer.replaceText(node, `import { ${specifiers
                                        .map((s) => s.local.name !== s.imported.name
                                        ? `useRouter as ${s.local.name}`
                                        : 'useRouter')
                                        .join(', ')} } from 'src/hooks/routing/useRouter';`);
                                }
                                else {
                                    // Create a new import for useRouter and keep other imports
                                    const useRouterImport = `import { ${specifiers
                                        .map((s) => s.local.name !== s.imported.name
                                        ? `useRouter as ${s.local.name}`
                                        : 'useRouter')
                                        .join(', ')} } from 'src/hooks/routing/useRouter';\n`;
                                    const otherImports = `import { ${otherSpecifiers
                                        .map((s) => s.local.name)
                                        .join(', ')} } from 'next/router';`;
                                    return fixer.replaceText(node, useRouterImport + otherImports);
                                }
                            },
                        });
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=use-custom-router.js.map
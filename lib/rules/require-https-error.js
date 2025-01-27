"use strict";
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
module.exports = (0, createRule_1.createRule)({
    name: 'require-https-error',
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce using proprietary HttpsError instead of throw new Error or firebase-admin HttpsError in functions/src',
            recommended: 'error',
        },
        schema: [],
        messages: {
            useHttpsError: 'Use HttpsError instead of throw new Error in functions/src directory',
            useProprietaryHttpsError: 'Use our proprietary HttpsError instead of firebase-admin HttpsError',
        },
    },
    defaultOptions: [],
    create(context) {
        const filename = context.getFilename();
        // Only apply rule to files in functions/src directory
        if (!filename.includes('functions/src')) {
            return {};
        }
        let hasFirebaseAdminImport = false;
        let httpsIdentifier = null;
        return {
            ImportDeclaration(node) {
                if (node.source.value === 'firebase-admin' ||
                    node.source.value === 'firebase-admin/lib/https-error') {
                    hasFirebaseAdminImport = true;
                    // Track the local name of the https import
                    const httpsSpecifier = node.specifiers.find((spec) => spec.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                        spec.imported.name === 'https');
                    if (httpsSpecifier && 'local' in httpsSpecifier) {
                        httpsIdentifier = httpsSpecifier.local.name;
                    }
                    context.report({
                        node,
                        messageId: 'useProprietaryHttpsError',
                    });
                }
            },
            ThrowStatement(node) {
                if (!node.argument) {
                    return;
                }
                const argument = node.argument;
                if (argument.type !== utils_1.AST_NODE_TYPES.NewExpression) {
                    return;
                }
                const callee = argument.callee;
                // Check for direct Error usage
                if (callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                    callee.name === 'Error') {
                    context.report({
                        node,
                        messageId: 'useHttpsError',
                    });
                    return;
                }
                // Check for firebase-admin HttpsError usage
                if (!hasFirebaseAdminImport) {
                    return;
                }
                const isHttpsError = callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                    callee.name === 'HttpsError';
                const isFirebaseHttpsError = callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                    callee.object.name === httpsIdentifier &&
                    callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    callee.property.name === 'HttpsError';
                if (isHttpsError || isFirebaseHttpsError) {
                    context.report({
                        node,
                        messageId: 'useProprietaryHttpsError',
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=require-https-error.js.map
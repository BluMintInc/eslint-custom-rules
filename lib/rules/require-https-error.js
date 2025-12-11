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
        let httpsIdentifier = null;
        let httpsErrorIdentifier = null;
        return {
            ImportDeclaration(node) {
                if (node.source.value === 'firebase-admin' ||
                    node.source.value === 'firebase-admin/lib/https-error') {
                    // Check for direct HttpsError import
                    const httpsErrorSpecifier = node.specifiers.find((spec) => spec.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                        spec.imported.name === 'HttpsError');
                    // Check for https import that could be used for https.HttpsError
                    const httpsSpecifier = node.specifiers.find((spec) => spec.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                        spec.imported.name === 'https');
                    if (httpsErrorSpecifier && 'local' in httpsErrorSpecifier) {
                        httpsErrorIdentifier = httpsErrorSpecifier.local.name;
                        context.report({
                            node,
                            messageId: 'useProprietaryHttpsError',
                        });
                    }
                    if (httpsSpecifier && 'local' in httpsSpecifier) {
                        httpsIdentifier = httpsSpecifier.local.name;
                        context.report({
                            node,
                            messageId: 'useProprietaryHttpsError',
                        });
                    }
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
                const isFirebaseHttpsError = callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                    callee.object.name === httpsIdentifier &&
                    callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    callee.property.name === 'HttpsError';
                const isDirectHttpsError = callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                    callee.name === httpsErrorIdentifier;
                if (isFirebaseHttpsError || isDirectHttpsError) {
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
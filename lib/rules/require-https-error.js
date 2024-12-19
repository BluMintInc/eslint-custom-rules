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
                const argument = node.argument;
                if (argument &&
                    argument.type === utils_1.AST_NODE_TYPES.NewExpression &&
                    argument.callee) {
                    if (argument.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                        argument.callee.name === 'Error') {
                        context.report({
                            node,
                            messageId: 'useHttpsError',
                        });
                    }
                    else if (hasFirebaseAdminImport &&
                        ((argument.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                            argument.callee.name === 'HttpsError') ||
                            (argument.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                                argument.callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                                argument.callee.object.name === httpsIdentifier &&
                                argument.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                                argument.callee.property.name === 'HttpsError'))) {
                        context.report({
                            node,
                            messageId: 'useProprietaryHttpsError',
                        });
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=require-https-error.js.map
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
            useHttpsError: 'Throwing "{{constructorName}}" in Cloud Functions returns a generic 500 and drops the structured status code clients rely on. Throw the proprietary HttpsError instead so responses include the correct status, sanitized message, and logging context.',
            useProprietaryHttpsError: '{{reference}} comes from {{source}} and bypasses our proprietary HttpsError wrapper, so responses skip standardized status codes, logging, and client-safe payloads. Import and throw HttpsError from @our-company/errors to keep errors consistent.',
        },
    },
    defaultOptions: [],
    create(context) {
        const filename = context.getFilename();
        // Only apply rule to files in functions/src directory
        if (!filename.includes('functions/src')) {
            return {};
        }
        const httpsIdentifiers = new Map();
        const httpsErrorIdentifiers = new Map();
        const reportProprietary = (node, data) => context.report({
            node,
            messageId: 'useProprietaryHttpsError',
            data,
        });
        return {
            ImportDeclaration(node) {
                if (node.source.value === 'firebase-admin' ||
                    node.source.value === 'firebase-admin/lib/https-error') {
                    const sourceModule = String(node.source.value);
                    // Report imports immediately so the forbidden dependency is blocked even
                    // when unused; throw sites below also report to cover runtime usage.
                    // Check for direct HttpsError import
                    const httpsErrorSpecifier = node.specifiers.find((spec) => spec.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                        spec.imported.name === 'HttpsError');
                    // Check for https import that could be used for https.HttpsError
                    const httpsSpecifier = node.specifiers.find((spec) => spec.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                        spec.imported.name === 'https');
                    if (httpsErrorSpecifier && 'local' in httpsErrorSpecifier) {
                        const localName = httpsErrorSpecifier.local.name;
                        httpsErrorIdentifiers.set(localName, sourceModule);
                        reportProprietary(node, {
                            reference: localName,
                            source: sourceModule,
                        });
                    }
                    if (httpsSpecifier && 'local' in httpsSpecifier) {
                        const localName = httpsSpecifier.local.name;
                        httpsIdentifiers.set(localName, sourceModule);
                        reportProprietary(node, {
                            reference: `${localName}.HttpsError`,
                            source: sourceModule,
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
                        data: {
                            constructorName: callee.name,
                        },
                    });
                    return;
                }
                // Check for firebase-admin HttpsError usage
                if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                    callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    callee.property.name === 'HttpsError') {
                    const objectName = callee.object.name;
                    const source = httpsIdentifiers.get(objectName);
                    if (!source) {
                        return;
                    }
                    reportProprietary(node, {
                        reference: `${objectName}.HttpsError`,
                        source,
                    });
                    return;
                }
                if (callee.type === utils_1.AST_NODE_TYPES.Identifier) {
                    const source = httpsErrorIdentifiers.get(callee.name);
                    if (!source) {
                        return;
                    }
                    reportProprietary(node, { reference: callee.name, source });
                }
            },
        };
    },
});
//# sourceMappingURL=require-https-error.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceFirestorePathUtils = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const FIRESTORE_METHODS = new Set(['doc', 'collection']);
exports.enforceFirestorePathUtils = (0, createRule_1.createRule)({
    name: 'enforce-firestore-path-utils',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce usage of utility functions for Firestore paths',
            recommended: 'error',
        },
        schema: [],
        messages: {
            requirePathUtil: 'Use a utility function (e.g., toUserPath, toCollectionPath) for Firestore paths instead of string literals',
        },
    },
    defaultOptions: [],
    create(context) {
        function isFirestoreCall(node) {
            if (node.callee.type !== utils_1.AST_NODE_TYPES.MemberExpression) {
                return false;
            }
            const property = node.callee.property;
            if (property.type !== utils_1.AST_NODE_TYPES.Identifier) {
                return false;
            }
            return FIRESTORE_METHODS.has(property.name);
        }
        function isStringLiteralOrTemplate(node) {
            return (node.type === utils_1.AST_NODE_TYPES.Literal && typeof node.value === 'string' ||
                node.type === utils_1.AST_NODE_TYPES.TemplateLiteral);
        }
        function isUtilityFunction(node) {
            if (node.type !== utils_1.AST_NODE_TYPES.CallExpression) {
                return false;
            }
            const callee = node.callee;
            if (callee.type !== utils_1.AST_NODE_TYPES.Identifier) {
                return false;
            }
            // Match functions starting with 'to' and ending with 'Path'
            return /^to.*Path$/.test(callee.name);
        }
        return {
            CallExpression(node) {
                if (!isFirestoreCall(node)) {
                    return;
                }
                // Check first argument of doc() or collection() call
                const pathArg = node.arguments[0];
                if (!pathArg) {
                    return;
                }
                // Skip if it's already using a utility function
                if (isUtilityFunction(pathArg)) {
                    return;
                }
                // Skip if it's a variable or other non-literal expression
                if (!isStringLiteralOrTemplate(pathArg)) {
                    return;
                }
                // Skip test files
                const filename = context.getFilename();
                if (filename.includes('__tests__') || filename.includes('.test.') || filename.includes('.spec.')) {
                    return;
                }
                context.report({
                    node: pathArg,
                    messageId: 'requirePathUtil',
                });
            },
        };
    },
});
//# sourceMappingURL=enforce-firestore-path-utils.js.map
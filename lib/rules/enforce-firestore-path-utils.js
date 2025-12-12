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
            description: 'Enforce usage of utility functions for Firestore paths to ensure type safety, maintainability, and consistent path construction. This prevents errors from manual string concatenation and makes path changes easier to manage.',
            recommended: 'error',
        },
        schema: [],
        messages: {
            requirePathUtil: 'Use a utility function for Firestore paths to ensure type safety and maintainability. Instead of `doc("users/" + userId)`, create and use a utility function: `const toUserPath = (id: string) => `users/${id}`; doc(toUserPath(userId))`.',
        },
    },
    defaultOptions: [],
    create(context) {
        function isFirestoreCall(node) {
            if (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier) {
                return FIRESTORE_METHODS.has(node.callee.property.name);
            }
            if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                FIRESTORE_METHODS.has(node.callee.name)) {
                return true;
            }
            return false;
        }
        function isStringLiteralOrTemplate(node) {
            if ((node.type === utils_1.AST_NODE_TYPES.Literal && typeof node.value === 'string') ||
                node.type === utils_1.AST_NODE_TYPES.TemplateLiteral) {
                return true;
            }
            if (node.type === utils_1.AST_NODE_TYPES.BinaryExpression &&
                node.operator === '+' &&
                (isStringLiteralOrTemplate(node.left) ||
                    isStringLiteralOrTemplate(node.right))) {
                return true;
            }
            return false;
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
                const pathArgs = node.arguments;
                if (pathArgs.length === 0) {
                    return;
                }
                const [firstPathArg] = pathArgs;
                // Skip if it's already using a utility function
                if (isUtilityFunction(firstPathArg)) {
                    return;
                }
                const pathArg = pathArgs.find((arg) => isStringLiteralOrTemplate(arg));
                if (!pathArg) {
                    return;
                }
                // Skip test files
                const filename = context.getFilename();
                if (filename.includes('__tests__') ||
                    filename.includes('.test.') ||
                    filename.includes('.spec.')) {
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
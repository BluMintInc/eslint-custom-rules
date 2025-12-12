"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dynamicHttpsErrors = void 0;
const createRule_1 = require("../utils/createRule");
const utils_1 = require("@typescript-eslint/utils");
const isHttpsErrorCall = (callee) => {
    if (callee.type === 'MemberExpression') {
        return (callee.object.type === 'Identifier' &&
            callee.object.name === 'https' &&
            callee.property.type === 'Identifier' &&
            callee.property.name === 'HttpsError');
    }
    else if (callee.type === 'Identifier') {
        return callee.name === 'HttpsError';
    }
    return false;
};
exports.dynamicHttpsErrors = (0, createRule_1.createRule)({
    name: 'dynamic-https-errors',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Dynamic error details should only be in the third argument of the HttpsError constructor. The second argument is hashed to produce a unique id. All HttpsError constructor calls must include a third argument for contextual details.',
            recommended: 'error',
        },
        schema: [],
        messages: {
            dynamicHttpsErrors: 'Found dynamic error details in the second argument of the HttpsError constructor - the "message" field. This field is hashed to produce a unique id for error monitoring. Move any dynamic details to the third argument - the "details" field - to preserve the unique id and to monitor the error correctly.',
            missingThirdArgument: "HttpsError constructor calls must include a third argument for contextual details. The third argument should contain relevant context that aids in debugging without affecting the error's unique identifier.",
        },
    },
    defaultOptions: [],
    create(context) {
        const checkForHttpsError = (node) => {
            const callee = node.callee;
            if (isHttpsErrorCall(callee)) {
                // Check for missing third argument
                if (node.arguments.length < 3) {
                    context.report({
                        node,
                        messageId: 'missingThirdArgument',
                    });
                    return;
                }
                // Check for dynamic content in second argument (existing functionality)
                const secondArg = node.arguments[1];
                if (!secondArg)
                    return;
                if (secondArg.type === utils_1.AST_NODE_TYPES.TemplateLiteral &&
                    secondArg.expressions.length > 0) {
                    context.report({
                        node: secondArg,
                        messageId: 'dynamicHttpsErrors',
                    });
                    return;
                }
                // Only string concatenation with "+" can be static; all other operators
                // are treated as dynamic to avoid hashing non-literal message content.
                const isDynamicBinaryExpression = (expression) => {
                    if (expression.operator !== '+')
                        return true;
                    const isStaticLiteral = (expr) => expr.type === utils_1.AST_NODE_TYPES.Literal &&
                        typeof expr.value === 'string';
                    const isSafe = (expr) => {
                        if (expr.type === utils_1.AST_NODE_TYPES.PrivateIdentifier) {
                            return false;
                        }
                        if (expr.type === utils_1.AST_NODE_TYPES.BinaryExpression) {
                            return !isDynamicBinaryExpression(expr);
                        }
                        return isStaticLiteral(expr);
                    };
                    return !(isSafe(expression.left) && isSafe(expression.right));
                };
                if (secondArg.type === utils_1.AST_NODE_TYPES.BinaryExpression &&
                    isDynamicBinaryExpression(secondArg)) {
                    context.report({
                        node: secondArg,
                        messageId: 'dynamicHttpsErrors',
                    });
                }
            }
        };
        return {
            NewExpression(node) {
                checkForHttpsError(node);
            },
            CallExpression(node) {
                checkForHttpsError(node);
            },
        };
    },
});
//# sourceMappingURL=dynamic-https-errors.js.map
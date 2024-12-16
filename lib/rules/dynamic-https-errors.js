"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dynamicHttpsErrors = void 0;
const createRule_1 = require("../utils/createRule");
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
            description: 'Dynamic error details should only be in the third argument of the HttpsError constructor. The second argument is hashed to produce a unique id.',
            recommended: 'warn',
        },
        schema: [],
        messages: {
            dynamicHttpsErrors: 'Found dynamic error details in the second argument of the HttpsError constructor - the "message" field. This field is hashed to produce a unique id for error monitoring. Move any dynamic details to the third argument - the "details" field - to preserve the unique id and to monitor the error correctly.',
        },
    },
    defaultOptions: [],
    create(context) {
        const checkForHttpsError = (node) => {
            const callee = node.callee;
            if (isHttpsErrorCall(callee)) {
                const secondArg = node.arguments[1];
                if (secondArg && secondArg.type === 'TemplateLiteral') {
                    if (secondArg.expressions.length > 0) {
                        context.report({
                            node: secondArg,
                            messageId: 'dynamicHttpsErrors',
                        });
                    }
                }
            }
        };
        return {
            NewExpression(node) {
                return checkForHttpsError(node);
            },
            CallExpression(node) {
                return checkForHttpsError(node);
            },
        };
    },
});
//# sourceMappingURL=dynamic-https-errors.js.map

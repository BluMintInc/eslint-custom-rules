"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noFilterWithoutReturn = void 0;
const ASTHelpers_1 = require("../utils/ASTHelpers");
const createRule_1 = require("../utils/createRule");
exports.noFilterWithoutReturn = (0, createRule_1.createRule)({
    create(context) {
        return {
            'CallExpression[callee.property.name="filter"]'(node) {
                const callback = node.arguments[0];
                if (callback && callback.type === 'ArrowFunctionExpression') {
                    const { body } = callback;
                    if (body.type !== 'BlockStatement') {
                        // If the body is not a block statement, it's a direct return
                        return;
                    }
                    if (!ASTHelpers_1.ASTHelpers.hasReturnStatement(body)) {
                        context.report({
                            node,
                            messageId: 'unexpected',
                        });
                    }
                }
            },
        };
    },
    name: 'no-filter-without-return',
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow Array.filter callbacks without an explicit return (if part of a block statement)',
            recommended: 'error',
        },
        schema: [],
        messages: {
            unexpected: 'Array.filter callbacks with block statements must contain a return statement. Instead of `array.filter(x => { doSomething(x); })`, use `array.filter(x => { doSomething(x); return someCondition; })` or use implicit return `array.filter(x => someCondition)`.',
        },
    },
    defaultOptions: [],
});
//# sourceMappingURL=no-filter-without-return.js.map
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
                        const filterCall = context.getSourceCode().getText(node.callee);
                        context.report({
                            node,
                            messageId: 'unexpected',
                            data: {
                                filterCall,
                            },
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
            unexpected: 'Callback for {{filterCall}} uses braces but never returns a value, so filter receives undefined for every element and silently drops them all. Return the predicate result from inside the block (e.g., "return matches(item);") or use a concise arrow like {{filterCall}}((item) => matches(item)) to make the keep/remove condition explicit.',
        },
    },
    defaultOptions: [],
});
//# sourceMappingURL=no-filter-without-return.js.map
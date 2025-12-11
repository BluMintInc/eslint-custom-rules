"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noJsxWhitespaceLiteral = void 0;
const createRule_1 = require("../utils/createRule");
exports.noJsxWhitespaceLiteral = (0, createRule_1.createRule)({
    name: 'no-jsx-whitespace-literal',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Disallow the use of {" "} elements in JSX code',
            recommended: 'error',
        },
        schema: [],
        messages: {
            noWhitespaceLiteral: 'Avoid using {" "} for spacing in JSX. Use proper text nodes or CSS spacing instead.',
        },
    },
    defaultOptions: [],
    create(context) {
        return {
            JSXExpressionContainer(node) {
                if (node.expression.type === 'Literal' &&
                    typeof node.expression.value === 'string' &&
                    node.expression.value.trim() === '') {
                    context.report({
                        node,
                        messageId: 'noWhitespaceLiteral',
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=no-jsx-whitespace-literal.js.map
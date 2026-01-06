"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noJsxWhitespaceLiteral = void 0;
const utils_1 = require("@typescript-eslint/utils");
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
            noWhitespaceLiteral: 'Whitespace-only JSX expression {{literal}} inserts fragile spacer nodes → React treats the whitespace as a separate text child that shifts, disappears, or duplicates when child elements are reordered, translated, or dynamically rendered → Place spacing inside text content (e.g., "Hello ") or use CSS spacing such as gap, margin, or padding.',
        },
    },
    defaultOptions: [],
    create(context) {
        const typedContext = context;
        const sourceCode = typedContext.sourceCode ?? context.getSourceCode();
        return {
            JSXExpressionContainer(node) {
                if (node.expression.type === utils_1.AST_NODE_TYPES.Literal &&
                    typeof node.expression.value === 'string' &&
                    node.expression.value.trim() === '') {
                    context.report({
                        node,
                        messageId: 'noWhitespaceLiteral',
                        data: {
                            literal: sourceCode.getText(node),
                        },
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=no-jsx-whitespace-literal.js.map
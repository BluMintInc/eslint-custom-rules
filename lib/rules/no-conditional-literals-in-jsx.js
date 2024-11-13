"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noConditionalLiteralsInJsx = void 0;
/* eslint-disable @blumintinc/blumint/extract-global-constants */
// import { ASTHelpers } from '../utils/ASTHelpers';
const createRule_1 = require("../utils/createRule");
const utils_1 = require("@typescript-eslint/utils");
exports.noConditionalLiteralsInJsx = (0, createRule_1.createRule)({
    name: 'no-conditional-literals-in-jsx',
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow use of conditional literals in JSX code',
            recommended: 'error',
        },
        schema: [],
        messages: {
            unexpected: 'Conditional expression is a sibling of raw text and must be wrapped in <div> or <span>',
        },
    },
    defaultOptions: [],
    create(context) {
        return {
            // Imagine evaluating <div>text {conditional && 'string'}</div>
            JSXExpressionContainer(node) {
                // We start at the expression {conditional && 'string'}
                if (node.expression.type !== 'LogicalExpression') {
                    return;
                }
                const parentChildren = node.parent && 'children' in node.parent ? node.parent.children : [];
                // "text" is one of the siblingTextNodes.
                const siblingTextNodes = parentChildren.filter((n) => {
                    if (n.type === utils_1.TSESTree.AST_NODE_TYPES.Literal ||
                        n.type === utils_1.TSESTree.AST_NODE_TYPES.JSXText) {
                        return !!('value' in n && !!n.value ? `${n.value}`.trim() : false);
                    }
                    return false;
                });
                // If we were evaluating
                //   <div>{property} {conditional && 'string'}</div>
                // Then {property} would be one of the siblingExpressionNodes
                const siblingExpressionNodes = parentChildren.filter((n) => n.type === 'JSXExpressionContainer' &&
                    'expression' in n &&
                    (n.expression.type === 'Identifier' ||
                        n.expression.type === 'MemberExpression'));
                // Operands of {conditional && 'string'} -- the conditional and the
                // literal. We want to make sure we have a text literal, otherwise we'd
                // trigger this rule on the (safe) {conditional && <div>string</div>}.
                const expressionOperandTypes = [
                    node.expression.left.type,
                    node.expression.right.type,
                ];
                if (siblingTextNodes.concat(siblingExpressionNodes).length > 0 &&
                    expressionOperandTypes.includes(utils_1.TSESTree.AST_NODE_TYPES.Literal)) {
                    context.report({ node, messageId: 'unexpected' });
                }
            },
        };
    },
});
//# sourceMappingURL=no-conditional-literals-in-jsx.js.map
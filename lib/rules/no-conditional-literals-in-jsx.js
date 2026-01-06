"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noConditionalLiteralsInJsx = void 0;
// import { ASTHelpers } from '../utils/ASTHelpers';
const createRule_1 = require("../utils/createRule");
const utils_1 = require("@typescript-eslint/utils");
exports.noConditionalLiteralsInJsx = (0, createRule_1.createRule)({
    name: 'no-conditional-literals-in-jsx',
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow conditional string literals beside other JSX text to avoid fragmented text nodes, translation issues, and hydration mismatches.',
            recommended: 'error',
        },
        schema: [],
        messages: {
            unexpected: 'Conditional text literal {{literal}} is rendered next to other JSX text or expressions under condition {{condition}}. ' +
                'This fragments text nodes, confusing translation/i18n tools and potentially causing React hydration mismatches when server and client group the text differently. ' +
                'Wrap the conditional expression in its own element (for example, <span>{ {{expression}} }</span>) or move the entire sentence inside the conditional so it renders as a single text node.',
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
                const hasSiblingContent = siblingTextNodes.concat(siblingExpressionNodes).length > 0;
                if (!hasSiblingContent) {
                    return;
                }
                const logicalExpression = node.expression;
                const literalNode = logicalExpression.right;
                const conditionalNode = logicalExpression.left;
                // Only enforce when the literal is the expression's return value.
                if (literalNode.type !== utils_1.TSESTree.AST_NODE_TYPES.Literal) {
                    return;
                }
                // Only enforce for string literals to avoid misleading messages for
                // numeric or boolean literals rendered conditionally.
                if (typeof literalNode.value !== 'string') {
                    return;
                }
                /**
                 * Ignore logical expressions that do not actually render the literal
                 * conditionally (e.g., literal && condition or literal || condition)
                 * and expressions with two literals.
                 */
                if (conditionalNode.type === utils_1.TSESTree.AST_NODE_TYPES.Literal) {
                    return;
                }
                const sourceCode = context.getSourceCode();
                context.report({
                    node,
                    messageId: 'unexpected',
                    data: {
                        literal: sourceCode.getText(literalNode),
                        condition: sourceCode.getText(conditionalNode),
                        expression: sourceCode.getText(logicalExpression),
                    },
                });
            },
        };
    },
});
//# sourceMappingURL=no-conditional-literals-in-jsx.js.map
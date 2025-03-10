// import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';

export const noConditionalLiteralsInJsx: TSESLint.RuleModule<
  'unexpected',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any[]
> = createRule({
  name: 'no-conditional-literals-in-jsx',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow use of conditional literals in JSX code',
      recommended: 'error',
    },
    schema: [],
    messages: {
      unexpected:
        'Conditional text literals must be wrapped in a container element when next to other text. Instead of `<div>text {condition && "more text"}</div>`, use `<div>text <span>{condition && "more text"}</span></div>` to prevent React hydration issues.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      // Imagine evaluating <div>text {conditional && 'string'}</div>
      JSXExpressionContainer(node: TSESTree.JSXExpressionContainer) {
        // We start at the expression {conditional && 'string'}
        if (node.expression.type !== 'LogicalExpression') {
          return;
        }

        const parentChildren =
          node.parent && 'children' in node.parent ? node.parent.children : [];

        // "text" is one of the siblingTextNodes.
        const siblingTextNodes = parentChildren.filter((n: TSESTree.Node) => {
          if (
            n.type === TSESTree.AST_NODE_TYPES.Literal ||
            n.type === TSESTree.AST_NODE_TYPES.JSXText
          ) {
            return !!('value' in n && !!n.value ? `${n.value}`.trim() : false);
          }
          return false;
        });

        // If we were evaluating
        //   <div>{property} {conditional && 'string'}</div>
        // Then {property} would be one of the siblingExpressionNodes
        const siblingExpressionNodes = parentChildren.filter(
          (n) =>
            n.type === 'JSXExpressionContainer' &&
            'expression' in n &&
            (n.expression.type === 'Identifier' ||
              n.expression.type === 'MemberExpression'),
        );

        // Operands of {conditional && 'string'} -- the conditional and the
        // literal. We want to make sure we have a text literal, otherwise we'd
        // trigger this rule on the (safe) {conditional && <div>string</div>}.
        const expressionOperandTypes = [
          (node.expression as TSESTree.LogicalExpression).left.type,
          (node.expression as TSESTree.LogicalExpression).right.type,
        ];
        if (
          siblingTextNodes.concat(siblingExpressionNodes).length > 0 &&
          expressionOperandTypes.includes(TSESTree.AST_NODE_TYPES.Literal)
        ) {
          context.report({ node, messageId: 'unexpected' });
        }
      },
    };
  },
});

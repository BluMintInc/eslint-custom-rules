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
      description:
        'Disallow conditional string literals beside other JSX text to avoid fragmented text nodes, translation issues, and hydration mismatches.',
      recommended: 'error',
    },
    schema: [],
    messages: {
      unexpected:
        'Conditional text literal {{literal}} is rendered next to other JSX text or expressions under condition {{condition}}. ' +
        'This fragments text nodes, confusing translation/i18n tools and potentially causing React hydration mismatches when server and client group the text differently. ' +
        'Wrap the conditional expression in its own element (for example, <span>{ {{expression}} }</span>) or move the entire sentence inside the conditional so it renders as a single text node.',
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

        const hasSiblingContent =
          siblingTextNodes.concat(siblingExpressionNodes).length > 0;
        if (!hasSiblingContent) {
          return;
        }

        const logicalExpression = node.expression as TSESTree.LogicalExpression;
        const literalNode = logicalExpression.right;
        const conditionalNode = logicalExpression.left;

        // Only enforce when the literal is the expression's return value.
        if (literalNode.type !== TSESTree.AST_NODE_TYPES.Literal) {
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
        if (conditionalNode.type === TSESTree.AST_NODE_TYPES.Literal) {
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

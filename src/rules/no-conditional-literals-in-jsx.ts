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
    /**
     * A template literal without substitutions renders exactly the text its
     * quoted spelling renders, so notation must never decide whether a value
     * counts as JSX text. Substitution-bearing templates are excluded because
     * their rendered value is not decidable syntactically. Numeric and boolean
     * literals are excluded to avoid misleading messages for values that are
     * not text.
     */
    const isTextLiteral = (astNode: TSESTree.Node) =>
      (astNode.type === TSESTree.AST_NODE_TYPES.Literal &&
        typeof astNode.value === 'string') ||
      (astNode.type === TSESTree.AST_NODE_TYPES.TemplateLiteral &&
        astNode.expressions.length === 0);

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
        // Then {property} would be one of the siblingExpressionNodes.
        //
        // Any expression container beside the conditional can render text, and
        // it fragments the text node exactly as adjacent JSX text does, so the
        // shape of the sibling's expression is not a useful discriminator.
        // Whether an arbitrary expression renders text rather than an element
        // (or nothing at all) is not decidable syntactically, so the broad
        // reading of "other text or expressions" wins. The one container that
        // provably renders nothing is a comment ({/* ... */}), whose expression
        // is a JSXEmptyExpression.
        const siblingExpressionNodes = parentChildren.filter(
          (n) =>
            // The container under evaluation is not its own sibling: a sole
            // conditional literal fragments nothing.
            n !== node &&
            n.type === TSESTree.AST_NODE_TYPES.JSXExpressionContainer &&
            n.expression.type !== TSESTree.AST_NODE_TYPES.JSXEmptyExpression,
        );

        const hasSiblingContent =
          siblingTextNodes.concat(siblingExpressionNodes).length > 0;
        if (!hasSiblingContent) {
          return;
        }

        const logicalExpression = node.expression as TSESTree.LogicalExpression;
        const literalNode = logicalExpression.right;
        const conditionalNode = logicalExpression.left;

        // Only enforce when a text literal is the expression's return value.
        if (!isTextLiteral(literalNode)) {
          return;
        }

        /**
         * Ignore logical expressions that do not actually render the literal
         * conditionally (e.g., literal && condition or literal || condition)
         * and expressions with two literals. Any literal on the left is
         * unconditional, including the numeric and boolean ones that are never
         * reported as a rendered value, so this exemption is wider than
         * isTextLiteral on purpose.
         */
        if (
          conditionalNode.type === TSESTree.AST_NODE_TYPES.Literal ||
          isTextLiteral(conditionalNode)
        ) {
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

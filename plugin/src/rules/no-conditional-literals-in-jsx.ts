/* eslint-disable @blumintinc/blumint/extract-global-constants */
// import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';

export const noConditionalLiteralsInJsx: TSESLint.RuleModule<'unexpected', never[]> =
  createRule({
    name: 'no-conditional-literals-in-jsx',
    meta: {
      type: 'problem',
      docs: {
        description:
        'Browser auto-translation will break if pieces of text nodes are be rendered conditionally.',
        recommended: 'error',
      },
      schema: [],
      messages: {
        unexpected:
        'Conditional expression is a sibling of raw text and must be wrapped in <div> or <span>',
      },
    },
    defaultOptions: [],
    create(context) {
        return {
            // Imagine evaluating <div>text {conditional && 'string'}</div>
            JSXExpressionContainer(node: TSESTree.JSXExpressionContainer) {
              // We start at the expression {conditional && 'string'}
              if (node.expression.type !== 'LogicalExpression') {
                return
            }
      
              const parentChildren = node.parent && 'children' in node.parent ? node.parent.children : [];
      
              // "text" is one of the siblingTextNodes.
              const siblingTextNodes = parentChildren.filter(n => {
                // In normal code these are 'Literal', but in test code they are 'JSXText'
                const isText = n.type === 'Literal' || n.type === 'JSXText'
                // Skip empty text nodes, like "   \n   " -- these may be JSX artifacts
                return isText && !!('value' in n ? n.value.trim() : false)
              })
      
              // If we were evaluating
              //   <div>{property} {conditional && 'string'}</div>
              // Then {property} would be one of the siblingExpressionNodes
              const siblingExpressionNodes = parentChildren.filter(n =>
                n.type === 'JSXExpressionContainer' &&
                ('expression' in n &&
                  (n.expression.type === 'Identifier' || n.expression.type === 'MemberExpression'))
              )
      
              // Operands of {conditional && 'string'} -- the conditional and the
              // literal. We want to make sure we have a text literal, otherwise we'd
              // trigger this rule on the (safe) {conditional && <div>string</div>}.
              const expressionOperandTypes = [
                node.expression.left.type,
                node.expression.right.type,
              ]
              if (
                siblingTextNodes.concat(siblingExpressionNodes).length > 0 &&
                expressionOperandTypes.includes('Literal')
              ) {
                context.report({ node, messageId: 'unexpected' })
              }}
          }},
  });

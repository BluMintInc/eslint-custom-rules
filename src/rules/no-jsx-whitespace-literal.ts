import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type Options = [];
type MessageIds = 'noWhitespaceLiteral';

export const noJsxWhitespaceLiteral = createRule<Options, MessageIds>({
  name: 'no-jsx-whitespace-literal',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow the use of {" "} elements in JSX code',
      recommended: 'error',
    },
    schema: [],
    messages: {
      noWhitespaceLiteral:
        'Whitespace-only JSX expression {{literal}} creates fragile spacer nodes that disappear or duplicate when children move or translations change. Place spacing inside text content or use CSS layout spacing such as gap, margin, or padding.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;

    return {
      JSXExpressionContainer(node) {
        if (
          node.expression.type === AST_NODE_TYPES.Literal &&
          typeof node.expression.value === 'string' &&
          node.expression.value.trim() === ''
        ) {
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

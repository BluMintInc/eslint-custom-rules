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
        'Whitespace-only JSX expression {{literal}} inserts an invisible text node that relies on manual spacing. These spacer nodes shift or collapse when translations, formatters, or dynamic rendering rearrange children. Put spacing inside the surrounding text (e.g., "Hello ") or use layout spacing like CSS gap, margin, or padding instead.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();

    return {
      JSXExpressionContainer(node) {
        if (
          node.expression.type === 'Literal' &&
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

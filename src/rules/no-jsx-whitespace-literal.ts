import { createRule } from '../utils/createRule';

export const noJsxWhitespaceLiteral = createRule({
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
        'Avoid using {" "} for spacing in JSX. Use proper text nodes or CSS spacing instead.',
    },
  },
  defaultOptions: [],
  create(context) {
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
          });
        }
      },
    };
  },
});

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
        'What\'s wrong: Whitespace-only JSX expression {{literal}} inserts an invisible text node. Why it matters: Spacer nodes shift or collapse when translations, formatters, or runtime reordering change where children render, leading to missing or doubled spaces. How to fix: Move spacing into the surrounding text (e.g., "Hello ") or rely on layout spacing like CSS gap, margin, or padding.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();

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

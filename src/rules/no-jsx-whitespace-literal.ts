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
        'Whitespace-only JSX expression {{literal}} inserts fragile spacer nodes → React treats the whitespace as a separate text child that shifts, disappears, or duplicates when child elements are reordered, translated, or dynamically rendered → Place spacing inside text content (e.g., "Hello ") or use CSS spacing such as gap, margin, or padding.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typedContext = context as typeof context & {
      sourceCode?: ReturnType<typeof context.getSourceCode>;
    };
    const sourceCode = typedContext.sourceCode ?? context.getSourceCode();

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

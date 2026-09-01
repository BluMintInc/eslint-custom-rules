import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type Options = [];
type MessageIds = 'noWhitespaceLiteral';

/**
 * The only whitespace prettier ever encodes as an expression container. A
 * literal holding anything else — two spaces, a tab, a newline, the empty
 * string — is left exactly where its author put it, on any line and at any
 * column, so it is always a hand-written spacer.
 */
const PRETTIER_JSX_WHITESPACE = ' ';

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
    const sourceCode = context.getSourceCode();

    /**
     * The rule's subject is a CHILD: only a container between an element's
     * tags renders a text node. An attribute value such as `alt={''}` is a
     * prop — React hands the string to the element untouched, no spacer node
     * exists to shift or duplicate, and `alt={''}` is the accessibility idiom
     * for a decorative image — so the message's remedy would be wrong for it.
     */
    const isJsxChild = (node: TSESTree.JSXExpressionContainer) =>
      node.parent?.type === AST_NODE_TYPES.JSXElement ||
      node.parent?.type === AST_NODE_TYPES.JSXFragment;

    const closesItsLine = (node: TSESTree.JSXExpressionContainer) => {
      const line = sourceCode.lines[node.loc.end.line - 1] ?? '';
      return line.slice(node.loc.end.column).trim() === '';
    };

    /**
     * Whether the container is prettier's own encoding of a significant space
     * rather than a hand-written spacer node.
     *
     * JSX drops the whitespace around a line break, so a space that must survive
     * one cannot be written literally. When a JSX line carrying a meaningful
     * space wraps past the print width, prettier therefore emits that space as
     * `{' '}` closing the line — or, for a leading space, alone on its own line,
     * which also closes the line. Both spellings are prettier FIXED POINTS, and
     * this rule ships no autofix, so reporting them is an unactionable failure:
     * folding the space into the adjacent text is exactly the edit prettier
     * reverts on the next format, leaving an inline disable as the only escape.
     *
     * The converse shapes stay reported. Prettier folds a mid-line single-space
     * container back into the surrounding text, so a container with source after
     * it on its own line is one the formatter would have erased — a hand-written
     * spacer, which is what this rule is about.
     */
    const isPrettierLineBreakWhitespace = (
      node: TSESTree.JSXExpressionContainer,
      value: string,
    ) =>
      value === PRETTIER_JSX_WHITESPACE &&
      node.loc.start.line === node.loc.end.line &&
      closesItsLine(node);

    return {
      JSXExpressionContainer(node) {
        if (!isJsxChild(node)) {
          return;
        }
        if (
          node.expression.type === AST_NODE_TYPES.Literal &&
          typeof node.expression.value === 'string' &&
          node.expression.value.trim() === ''
        ) {
          if (isPrettierLineBreakWhitespace(node, node.expression.value)) {
            return;
          }
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

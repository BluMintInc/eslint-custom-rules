import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

/**
 * Normalizes JSX child node types into short descriptors used inside lint messages.
 * Keeps message phrasing consistent regardless of the specific child node shape.
 * @param child - The JSX child node to describe.
 * @returns Human-readable descriptor for the child type used in lint messages.
 */
const describeChild = (child: TSESTree.JSXChild): string => {
  switch (child.type) {
    case 'JSXElement':
      return 'JSX element';
    case 'JSXFragment':
      return 'fragment';
    case 'JSXText':
      return 'text node';
    case 'JSXSpreadChild':
      return 'spread child';
    default:
      return 'child node';
  }
};

/**
 * A `JSXText` child that is pure whitespace AND spans a line break is
 * formatting padding — the newline + indentation prettier inserts around a
 * single-line child in the multi-line fragment form — and renders no output.
 * A whitespace-only child WITHOUT a newline (e.g. `<> <Foo /> </>`) renders
 * an actual space between siblings, so it still counts as meaningful.
 */
const isFormattingWhitespace = (child: TSESTree.JSXChild): boolean =>
  child.type === 'JSXText' &&
  /^\s*$/.test(child.value) &&
  child.value.includes('\n');

export const noUselessFragment = createRule<[], 'noUselessFragment'>({
  name: 'no-useless-fragment',
  create(context) {
    return {
      JSXFragment(node: TSESTree.JSXFragment) {
        const meaningfulChildren = node.children.filter(
          (child) => !isFormattingWhitespace(child),
        );

        if (meaningfulChildren.length !== 1) {
          return;
        }

        const [child] = meaningfulChildren;

        /**
         * A fragment whose only child is an expression container — e.g.
         * `<>{portal}</>` — is NOT useless. Unwrapping it to a bare
         * `{portal}` is invalid in statement/return position, and wrapping a
         * single ReactNode expression in a fragment is the idiomatic way to
         * render it. (Mirrors the upstream rule's `allowExpressions`.)
         */
        if (child.type === 'JSXExpressionContainer') {
          return;
        }

        /**
         * Unwrapping is only sound when the child is itself standalone JSX.
         * A text child (`<>hello</>`) would become a bare identifier
         * reference, and a spread child (`<>{...items}</>`) is not a valid
         * expression on its own — both are report-only so the developer
         * chooses how to restructure the surrounding code.
         */
        const isFixable =
          child.type === 'JSXElement' || child.type === 'JSXFragment';

        context.report({
          node,
          messageId: 'noUselessFragment',
          data: {
            childKind: describeChild(child),
          },
          fix: isFixable
            ? (fixer) =>
                fixer.replaceText(node, context.sourceCode.getText(child))
            : null,
        });
      },
    };
  },
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prevent unnecessary use of React fragments',
      recommended: 'error',
    },
    messages: {
      noUselessFragment:
        'React fragment wraps a single {{childKind}} and does not provide grouping. Fragments exist to wrap multiple siblings; leaving this fragment adds extra syntax and a React tree node without changing the rendered output. Remove the fragment and return the child directly.',
    },
    schema: [],
    fixable: 'code',
  },
  defaultOptions: [],
});

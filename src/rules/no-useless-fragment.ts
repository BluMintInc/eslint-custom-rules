import { TSESLint, TSESTree } from '@typescript-eslint/utils';

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
    case 'JSXExpressionContainer':
      return 'expression result';
    case 'JSXText':
      return 'text node';
    case 'JSXSpreadChild':
      return 'spread child';
    default:
      return 'child node';
  }
};

export const noUselessFragment: TSESLint.RuleModule<'noUselessFragment', []> = {
  create(context) {
    return {
      JSXFragment(node: TSESTree.JSXFragment) {
        if (node.children.length === 1) {
          const [child] = node.children;

          context.report({
            node,
            messageId: 'noUselessFragment',
            data: {
              childKind: describeChild(child),
            },
            fix(fixer) {
              const sourceCode = context.getSourceCode();
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              const openingFragment = sourceCode.getFirstToken(node)!;
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              const closingFragment = sourceCode.getLastToken(node)!;
              return [
                fixer.removeRange([
                  openingFragment.range[0],
                  openingFragment.range[0] + 2,
                ]),
                fixer.removeRange([
                  closingFragment.range[0] - 3,
                  closingFragment.range[0],
                ]),
              ];
            },
          });
        }
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
};

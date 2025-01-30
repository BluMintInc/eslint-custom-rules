import { TSESLint, TSESTree } from '@typescript-eslint/utils';

export const noUselessFragment: TSESLint.RuleModule<'noUselessFragment', []> = {
  create(context) {
    return {
      JSXFragment(node: TSESTree.JSXFragment) {
        if (node.children.length === 1) {
          context.report({
            node,
            messageId: 'noUselessFragment',
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
        'React fragment is unnecessary when wrapping a single child. Instead of `<>{"text"}</> or <Fragment>{"text"}</Fragment>`, use just `{"text"}`. Fragments are only needed when returning multiple elements.',
    },
    schema: [],
    fixable: 'code',
  },
  defaultOptions: [],
};

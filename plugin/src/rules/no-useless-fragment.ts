import { TSESLint, TSESTree } from '@typescript-eslint/utils';

export const disallowUselessFragment: TSESLint.RuleModule<'uselessFragment', []> = {
  create(context) {
    return {
      JSXFragment(node: TSESTree.JSXFragment) {
        if (node.children.length === 1) {
          context.report({
            node,
            messageId: 'uselessFragment',
            fix(fixer) {
              const sourceCode = context.getSourceCode();
              const openingFragment = sourceCode.getFirstToken(node)!;
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
      recommended: 'warn',
    },
    messages: {
      uselessFragment:
        'React fragment is unnecessary when wrapping a single child',
    },
    schema: [],
    fixable: 'code',
  },
  defaultOptions: [],
};


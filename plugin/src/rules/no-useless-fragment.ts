import { TSESLint, TSESTree } from '@typescript-eslint/utils';

export const noUselessFragment: TSESLint.RuleModule<'noUselessFragment', []> = {
  create(context) {
    return {
      JSXFragment(node: TSESTree.JSXFragment) {
        if (node.children.length === 1) {
          context.report({
            node,
            messageId: 'noUselessFragment',
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
      noUselessFragment:
        'React fragment is unnecessary when wrapping a single child',
    },
    schema: [],
  },
  defaultOptions: [],
};

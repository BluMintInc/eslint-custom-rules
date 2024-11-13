import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';

export const genericStartsWithT: TSESLint.RuleModule<
  'genericStartsWithT',
  never[]
> = createRule({
  create(context) {
    return {
      TSTypeParameterDeclaration(node: TSESTree.TSTypeParameterDeclaration) {
        for (const param of node.params) {
          if (
            typeof param.name.name === 'string' &&
            param.name.name[0] !== 'T'
          ) {
            context.report({
              node: param,
              messageId: 'genericStartsWithT',
            });
          }
        }
      },
    };
  },

  name: 'generic-starts-with-t',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce TypeScript generic types to start with T',
      recommended: 'error',
    },
    schema: [],
    messages: {
      genericStartsWithT: 'Generic type parameter should start with T.',
    },
  },
  defaultOptions: [],
});

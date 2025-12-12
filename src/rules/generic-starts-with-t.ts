import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';

export const genericStartsWithT: TSESLint.RuleModule<
  'genericStartsWithT',
  never[],
  TSESLint.RuleListener
> = createRule({
  create(context) {
    return {
      TSTypeParameterDeclaration(node: TSESTree.TSTypeParameterDeclaration) {
        for (const param of node.params) {
          if (
            typeof param.name.name === 'string' &&
            param.name.name[0] !== 'T'
          ) {
            const name = param.name.name;
            const suggestedName = `T${name}`;

            context.report({
              node: param,
              messageId: 'genericStartsWithT',
              data: {
                name,
                suggestedName,
              },
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
      description:
        'Enforce TypeScript generic type parameters to start with T so they stand out from runtime values.',
      recommended: 'error',
    },
    schema: [],
    messages: {
      genericStartsWithT:
        'Generic type parameter "{{name}}" should start with "T" (e.g., "{{suggestedName}}") so readers immediately recognize it as a generic type rather than a concrete value. T-prefixed generics make type parameters stand out in signatures and prevent confusion with runtime parameters.',
    },
  },
  defaultOptions: [],
});

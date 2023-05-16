import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';

export const preferTypeOverInterface: TSESLint.RuleModule<'preferType', never[]> =
  createRule({
    name: 'prefer-type-over-interface',
    meta: {
      type: 'suggestion',
      docs: {
        description: 'Prefer using type alias over interface',
        recommended: 'warn',
      },
      schema: [],
      messages: {
        preferType: 'Prefer using type alias over interface.',
      },
    },
    defaultOptions: [],

    create(context) {
      return {
        TSInterfaceDeclaration(node: TSESTree.TSInterfaceDeclaration) {
          context.report({
            node,
            messageId: 'preferType',
          });
        },
      };
    },
  });
import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';

export const noFilterWithoutReturn: TSESLint.RuleModule<'unexpected', never[]> =
  createRule({
    create(context) {
      return {
        'CallExpression[callee.property.name="filter"]'(
          node: TSESTree.CallExpression,
        ) {
          const callback = node.arguments[0];
          if (callback && callback.type === 'ArrowFunctionExpression') {
            const { body } = callback;
            if (body.type !== 'BlockStatement') {
              // If the body is not a block statement, it's a direct return
              return;
            }
            if (!ASTHelpers.hasReturnStatement(body)) {
              context.report({
                node,
                messageId: 'unexpected',
              });
            }
          }
        },
      };
    },

    name: 'no-filter-without-return',
    meta: {
      type: 'problem',
      docs: {
        description:
          'Disallow Array.filter callbacks without an explicit return (if part of a block statement)',
        recommended: 'error',
      },
      schema: [],
      messages: {
        unexpected:
          'An array filter callback with a block statement must contain a return statement',
      },
    },
    defaultOptions: [],
  });

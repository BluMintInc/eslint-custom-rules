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
          'Array.filter callbacks with block statements must contain a return statement. Instead of `array.filter(x => { doSomething(x); })`, use `array.filter(x => { doSomething(x); return someCondition; })` or use implicit return `array.filter(x => someCondition)`.',
      },
    },
    defaultOptions: [],
  });

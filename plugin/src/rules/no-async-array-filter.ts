import { createRule } from '../utils/createRule';
import { TSESLint } from '@typescript-eslint/utils';

export const noAsyncArrayFilter: TSESLint.RuleModule<'unexpected', never[]> =
  createRule({
    create(context) {
      return {
        CallExpression(node) {
          if (
            node.callee.type === 'MemberExpression' &&
            node.callee.property.type === 'Identifier' &&
            node.callee.property.name === 'filter' &&
            node.arguments.length > 0
          ) {
            const callback = node.arguments[0];
            if (
              (callback.type === 'FunctionExpression' ||
                callback.type === 'ArrowFunctionExpression') &&
              callback.async === true
            ) {
              context.report({
                node: callback,
                messageId: 'unexpected',
              });
            }
          }
        },
      };
    },

    name: 'no-async-array-filter',
    meta: {
      type: 'problem',
      docs: {
        description: 'Disallow async callbacks for Array.filter',
        recommended: 'error',
      },
      schema: [],
      messages: {
        unexpected:
          'Async array filter is dangerous as a Promise object will always be truthy. You should move the asynchronous logic elsewhere.',
      },
    },
    defaultOptions: [],
  });

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
        description:
          "Disallow async callbacks in Array.filter() as they lead to incorrect filtering. Since async functions return Promises which are always truthy, the filter will keep all elements regardless of the async check's result. Use Promise.all() with map() first, then filter based on the resolved results.",
        recommended: 'error',
      },
      schema: [],
      messages: {
        unexpected:
          'Async array filter is dangerous as a Promise object will always be truthy. Instead of `array.filter(async x => await someCheck(x))`, first resolve the promises with `Promise.all()` or move the async logic elsewhere: `const results = await Promise.all(array.map(x => someCheck(x))); array.filter((_, i) => results[i])`.',
      },
    },
    defaultOptions: [],
  });

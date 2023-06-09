import { TSESLint, TSESTree } from '@typescript-eslint/utils';

export const noAsyncForEach: TSESLint.RuleModule<'noAsyncForEach', []> = {
  create(context) {
    return {
      CallExpression(node: TSESTree.CallExpression) {
        const callee = node.callee;
        if (
          callee.type === 'MemberExpression' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'forEach' &&
          node.arguments[0] &&
          (node.arguments[0].type === 'ArrowFunctionExpression' ||
            node.arguments[0].type === 'FunctionExpression') &&
          node.arguments[0].async
        ) {
          context.report({
            node,
            messageId: 'noAsyncForEach',
          });
        }
      },
    };
  },
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow Array.forEach with an async callback function',
      recommended: 'error',
    },
    messages: {
      noAsyncForEach:
        'Do not use async function as callback in Array.forEach. Use a standard for loop for sequential execution or Promise.all for concurrent execution.',
    },
    schema: [],
  },
  defaultOptions: [],
};

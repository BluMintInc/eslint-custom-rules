import { TSESLint, TSESTree } from '@typescript-eslint/utils';

export const noAsyncForEach: TSESLint.RuleModule<'noAsyncForEach', []> = {
  create(context) {
    return {
      CallExpression(node: TSESTree.CallExpression) {
        const callee = node.callee;
        const callback = node.arguments[0];
        if (
          callee.type === 'MemberExpression' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'forEach' &&
          callback &&
          (callback.type === 'ArrowFunctionExpression' ||
            callback.type === 'FunctionExpression') &&
          callback.async
        ) {
          const callbackLabel =
            callback.type === 'FunctionExpression' && callback.id?.name
              ? `function "${callback.id.name}"`
              : callback.type === 'ArrowFunctionExpression'
                ? 'arrow function'
                : 'function expression';

          context.report({
            node,
            messageId: 'noAsyncForEach',
            data: {
              callbackLabel,
            },
          });
        }
      },
    };
  },
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow Array.forEach with async callbacks because forEach ignores returned promises, leading to parallel execution and unhandled rejections. Use a for...of loop when you need to await each iteration or map with Promise.all when concurrency is intended.',
      recommended: 'error',
    },
    messages: {
      noAsyncForEach:
        'Async {{callbackLabel}} passed to Array.forEach runs without awaiting each item. Array.forEach ignores returned promises, so async work executes in parallel and rejections go unhandled. Use a for...of loop to await sequentially or map with Promise.all when you want controlled concurrency.',
    },
    schema: [],
  },
  defaultOptions: [],
};

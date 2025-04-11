import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';

const isHttpsErrorCall = (callee: TSESTree.LeftHandSideExpression): boolean => {
  if (callee.type === 'MemberExpression') {
    return (
      callee.object.type === 'Identifier' &&
      callee.object.name === 'https' &&
      callee.property.type === 'Identifier' &&
      callee.property.name === 'HttpsError'
    );
  } else if (callee.type === 'Identifier') {
    return callee.name === 'HttpsError';
  }
  return false;
};

export const dynamicHttpsErrors: TSESLint.RuleModule<
  'dynamicHttpsErrors' | 'missingDetailsArg',
  never[]
> = createRule({
  name: 'dynamic-https-errors',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Dynamic error details should only be in the third argument of the HttpsError constructor. The second argument is hashed to produce a unique id. The third argument (details) is required for context information.',
      recommended: 'error',
    },
    schema: [],
    messages: {
      dynamicHttpsErrors:
        'Found dynamic error details in the second argument of the HttpsError constructor - the "message" field. This field is hashed to produce a unique id for error monitoring. Move any dynamic details to the third argument - the "details" field - to preserve the unique id and to monitor the error correctly.',
      missingDetailsArg:
        'Missing third argument (details) in HttpsError constructor. Always provide a third argument with contextual information to aid in debugging.',
    },
  },
  defaultOptions: [],
  create(context) {
    const checkForHttpsError = (
      node: TSESTree.CallExpression | TSESTree.NewExpression,
    ) => {
      const callee = node.callee;
      if (isHttpsErrorCall(callee)) {
        // Check for dynamic content in second argument
        const secondArg = node.arguments[1];
        if (secondArg && secondArg.type === 'TemplateLiteral') {
          if (secondArg.expressions.length > 0) {
            context.report({
              node: secondArg,
              messageId: 'dynamicHttpsErrors',
            });
          }
        }

        // Check for missing third argument
        const thirdArg = node.arguments[2];
        if (!thirdArg) {
          context.report({
            node,
            messageId: 'missingDetailsArg',
          });
        }
      }
    };
    return {
      NewExpression(node: TSESTree.NewExpression) {
        return checkForHttpsError(node);
      },
      CallExpression(node: TSESTree.CallExpression) {
        return checkForHttpsError(node);
      },
    };
  },
});

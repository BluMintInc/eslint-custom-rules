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

type MessageIds = 'dynamicHttpsErrors' | 'missingThirdArgument';

export const dynamicHttpsErrors: TSESLint.RuleModule<MessageIds, never[]> =
  createRule({
    name: 'dynamic-https-errors',
    meta: {
      type: 'suggestion',
      docs: {
        description:
          'Keep HttpsError messages static and move request-specific details to the third argument so error identifiers remain stable and debugging context is preserved.',
        recommended: 'error',
      },
      schema: [],
      messages: {
        dynamicHttpsErrors:
          'The HttpsError message (second argument) must stay static. Template expressions here change the hashed message and explode the number of error ids for the same failure. Keep this argument constant and move interpolated values into the third "details" argument so monitoring groups the error while still capturing request context.',
        missingThirdArgument:
          'HttpsError calls must include a third "details" argument. The message (second argument) is hashed into a stable identifier, so omitting details leaves errors hard to debug and encourages packing variables into the hashed message. Provide a third argument with the request-specific context (object or string) to keep identifiers stable and diagnostics useful.',
      },
    },
    defaultOptions: [],
    create(context) {
      const checkForHttpsError = (
        node: TSESTree.CallExpression | TSESTree.NewExpression,
      ) => {
        const callee = node.callee;
        if (isHttpsErrorCall(callee)) {
          // Check for missing third argument
          if (node.arguments.length < 3) {
            context.report({
              node,
              messageId: 'missingThirdArgument',
            });
          }

          // Check for dynamic content in second argument (existing functionality)
          const secondArg = node.arguments[1];
          if (secondArg && secondArg.type === 'TemplateLiteral') {
            if (secondArg.expressions.length > 0) {
              context.report({
                node: secondArg,
                messageId: 'dynamicHttpsErrors',
              });
            }
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

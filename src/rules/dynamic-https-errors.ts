import { createRule } from '../utils/createRule';
import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';

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
          'Dynamic error details should only be in the third argument of the HttpsError constructor. The second argument is hashed to produce a unique id. All HttpsError constructor calls must include a third argument for contextual details.',
        recommended: 'error',
      },
      schema: [],
      messages: {
        dynamicHttpsErrors:
          'Found dynamic error details in the second argument of the HttpsError constructor - the "message" field. This field is hashed to produce a unique id for error monitoring. Move any dynamic details to the third argument - the "details" field - to preserve the unique id and to monitor the error correctly.',
        missingThirdArgument:
          "HttpsError constructor calls must include a third argument for contextual details. The third argument should contain relevant context that aids in debugging without affecting the error's unique identifier.",
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
            return;
          }

          // Check for dynamic content in second argument (existing functionality)
          const secondArg = node.arguments[1];
          if (!secondArg) return;

          if (
            secondArg.type === AST_NODE_TYPES.TemplateLiteral &&
            secondArg.expressions.length > 0
          ) {
            context.report({
              node: secondArg,
              messageId: 'dynamicHttpsErrors',
            });
            return;
          }

          const isDynamicBinaryExpression = (
            expression: TSESTree.BinaryExpression,
          ): boolean => {
            if (expression.operator !== '+') return true;

            const isStaticLiteral = (expr: TSESTree.Node): boolean =>
              expr.type === AST_NODE_TYPES.Literal &&
              typeof expr.value === 'string';

            const isSafe = (
              expr: TSESTree.Expression | TSESTree.PrivateIdentifier,
            ): boolean => {
              if (expr.type === AST_NODE_TYPES.PrivateIdentifier) {
                return false;
              }
              if (expr.type === AST_NODE_TYPES.BinaryExpression) {
                return !isDynamicBinaryExpression(expr);
              }
              return isStaticLiteral(expr);
            };

            return !(isSafe(expression.left) && isSafe(expression.right));
          };

          if (
            secondArg.type === AST_NODE_TYPES.BinaryExpression &&
            isDynamicBinaryExpression(secondArg)
          ) {
            context.report({
              node: secondArg,
              messageId: 'dynamicHttpsErrors',
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

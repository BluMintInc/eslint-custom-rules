import { createRule } from '../utils/createRule';
import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';

const isHttpsErrorCall = (callee: TSESTree.LeftHandSideExpression): boolean => {
  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    return (
      callee.object.type === AST_NODE_TYPES.Identifier &&
      callee.object.name === 'https' &&
      callee.property.type === AST_NODE_TYPES.Identifier &&
      callee.property.name === 'HttpsError'
    );
  } else if (callee.type === AST_NODE_TYPES.Identifier) {
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
      // Only string concatenation with "+" can be static; all other operators
      // are treated as dynamic to avoid hashing non-literal message content.
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

      const checkMessageIsStatic = (messageNode: TSESTree.Expression) => {
        if (
          messageNode.type === AST_NODE_TYPES.TemplateLiteral &&
          messageNode.expressions.length > 0
        ) {
          context.report({
            node: messageNode,
            messageId: 'dynamicHttpsErrors',
          });
          return;
        }

        if (
          messageNode.type === AST_NODE_TYPES.BinaryExpression &&
          isDynamicBinaryExpression(messageNode)
        ) {
          context.report({
            node: messageNode,
            messageId: 'dynamicHttpsErrors',
          });
        }
      };

      const checkForHttpsError = (
        node: TSESTree.CallExpression | TSESTree.NewExpression,
      ) => {
        const callee = node.callee;
        if (!isHttpsErrorCall(callee)) return;

        // Signature 1: Object-based constructor (HttpsErrorProps)
        if (
          node.arguments.length === 1 &&
          node.arguments[0].type === AST_NODE_TYPES.ObjectExpression
        ) {
          const props = node.arguments[0];

          const findPropertyByName = (
            properties: (TSESTree.Property | TSESTree.SpreadElement)[],
            name: string,
          ): TSESTree.Property | undefined =>
            properties.find(
              (p): p is TSESTree.Property =>
                p.type === AST_NODE_TYPES.Property &&
                !p.computed &&
                ((p.key.type === AST_NODE_TYPES.Identifier &&
                  p.key.name === name) ||
                  (p.key.type === AST_NODE_TYPES.Literal &&
                    p.key.value === name)),
            );

          const messageProperty = findPropertyByName(props.properties, 'message');
          const detailsProperty = findPropertyByName(props.properties, 'details');

          if (!detailsProperty) {
            context.report({
              node,
              messageId: 'missingThirdArgument',
            });
          }

          if (
            messageProperty &&
            messageProperty.value.type !== AST_NODE_TYPES.Identifier
          ) {
            checkMessageIsStatic(messageProperty.value as TSESTree.Expression);
          }
          return;
        }

        // Signature 2: Positional arguments (code, message, details)
        // Check for missing third argument
        if (node.arguments.length < 3) {
          context.report({
            node,
            messageId: 'missingThirdArgument',
          });
        }

        // Check for dynamic content in second argument
        const secondArg = node.arguments[1];
        if (secondArg && secondArg.type !== AST_NODE_TYPES.Identifier) {
          checkMessageIsStatic(secondArg as TSESTree.Expression);
        }
      };

      return {
        NewExpression(node: TSESTree.NewExpression) {
          checkForHttpsError(node);
        },
        CallExpression(node: TSESTree.CallExpression) {
          checkForHttpsError(node);
        },
      };
    },
  });

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

const findPropertyByName = (
  properties: (TSESTree.Property | TSESTree.SpreadElement)[],
  name: string,
): TSESTree.Property | undefined =>
  properties.find(
    (p): p is TSESTree.Property =>
      p.type === AST_NODE_TYPES.Property &&
      !p.computed &&
      ((p.key.type === AST_NODE_TYPES.Identifier && p.key.name === name) ||
        (p.key.type === AST_NODE_TYPES.Literal && p.key.value === name)),
  );

type MessageIds =
  | 'dynamicHttpsErrors'
  | 'missingThirdArgument'
  | 'missingDetailsProperty'
  | 'missingDetailsDueToSpread'
  | 'unexpectedExtraArgumentForObjectCall';

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
        missingDetailsProperty:
          'HttpsError calls must include a "details" property. The message is hashed into a stable identifier, so omitting details leaves errors hard to debug and encourages packing variables into the hashed message. Provide a details property with the request-specific context (object or string) to keep identifiers stable and diagnostics useful.',
        missingDetailsDueToSpread:
          'HttpsError calls must include a "details" property. This call uses an object spread, which prevents static verification that "details" is present. Ensure the spread object contains "details" or provide it explicitly to keep identifiers stable and diagnostics useful.',
        unexpectedExtraArgumentForObjectCall:
          'Object-based HttpsError calls must have exactly one argument containing code, message, and details properties. Remove extra arguments or use the positional signature (code, message, details).',
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

      /**
       * Determines if a node should be validated for staticness.
       *
       * Pragmatic Exception: Identifier and MemberExpression nodes (e.g., `props.message`, `ERROR_MSG`)
       * are excluded from staticness validation. While they can be dynamic and may affect message
       * stability, they are permitted to support common React/props patterns and constants,
       * preserving developer ergonomics as an intentional trade-off.
       */
      const shouldValidateForStaticness = (
        node: TSESTree.Node,
      ): node is TSESTree.Expression => {
        return (
          node.type !== AST_NODE_TYPES.ArrayPattern &&
          node.type !== AST_NODE_TYPES.AssignmentPattern &&
          node.type !== AST_NODE_TYPES.Identifier &&
          node.type !== AST_NODE_TYPES.MemberExpression &&
          node.type !== AST_NODE_TYPES.ObjectPattern &&
          node.type !== AST_NODE_TYPES.RestElement &&
          node.type !== AST_NODE_TYPES.TSEmptyBodyFunctionExpression &&
          node.type !== AST_NODE_TYPES.SpreadElement
        );
      };

      /**
       * Checks if the message node is static.
       *
       * A message is considered static if it's a Literal (string), a TemplateLiteral with no expressions,
       * or a BinaryExpression (string concatenation with '+') where all parts are static.
       *
       * This function reports `dynamicHttpsErrors` for all other expression types (CallExpression,
       * ConditionalExpression, etc.) that reach it, except for those explicitly excluded by
       * `shouldValidateForStaticness`.
       */
      const checkMessageIsStatic = (messageNode: TSESTree.Expression) => {
        if (messageNode.type === AST_NODE_TYPES.Literal) {
          return;
        }

        if (
          messageNode.type === AST_NODE_TYPES.TemplateLiteral &&
          messageNode.expressions.length === 0
        ) {
          return;
        }

        if (messageNode.type === AST_NODE_TYPES.BinaryExpression) {
          if (isDynamicBinaryExpression(messageNode)) {
            context.report({
              node: messageNode,
              messageId: 'dynamicHttpsErrors',
            });
          }
          return;
        }

        // Catch-all for other dynamic forms (CallExpression, ConditionalExpression, etc.)
        context.report({
          node: messageNode,
          messageId: 'dynamicHttpsErrors',
        });
      };

      const checkForHttpsError = (
        node: TSESTree.CallExpression | TSESTree.NewExpression,
      ) => {
        const callee = node.callee;
        if (!isHttpsErrorCall(callee)) return;

        // Signature 1: Object-based constructor (HttpsErrorProps)
        if (
          node.arguments.length >= 1 &&
          node.arguments[0].type === AST_NODE_TYPES.ObjectExpression
        ) {
          if (node.arguments.length > 1) {
            context.report({
              node,
              messageId: 'unexpectedExtraArgumentForObjectCall',
            });
            return;
          }

          const props = node.arguments[0];

          const messageProperty = findPropertyByName(props.properties, 'message');
          const detailsProperty = findPropertyByName(props.properties, 'details');

          if (!detailsProperty) {
            const hasSpread = props.properties.some(
              (p) => p.type === AST_NODE_TYPES.SpreadElement,
            );

            context.report({
              node,
              messageId: hasSpread
                ? 'missingDetailsDueToSpread'
                : 'missingDetailsProperty',
            });
          }

          if (
            messageProperty &&
            shouldValidateForStaticness(messageProperty.value)
          ) {
            checkMessageIsStatic(messageProperty.value);
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
        if (secondArg && shouldValidateForStaticness(secondArg)) {
          checkMessageIsStatic(secondArg);
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

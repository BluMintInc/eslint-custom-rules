import { createRule } from '../utils/createRule';
import { TSESLint } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

export const noObjectValuesOnStrings: TSESLint.RuleModule<'unexpected', never[]> =
  createRule({
    create(context) {
      return {
        CallExpression(node) {
          // Check if the call is Object.values()
          if (
            node.callee.type === AST_NODE_TYPES.MemberExpression &&
            node.callee.object.type === AST_NODE_TYPES.Identifier &&
            node.callee.object.name === 'Object' &&
            node.callee.property.type === AST_NODE_TYPES.Identifier &&
            node.callee.property.name === 'values' &&
            node.arguments.length > 0
          ) {
            const argument = node.arguments[0];

            // Check if the argument is a string literal
            if (
              argument.type === AST_NODE_TYPES.Literal &&
              typeof argument.value === 'string'
            ) {
              context.report({
                node,
                messageId: 'unexpected',
              });
              return;
            }

            // Check if the argument is a template literal
            if (argument.type === AST_NODE_TYPES.TemplateLiteral) {
              context.report({
                node,
                messageId: 'unexpected',
              });
              return;
            }
          }
        },
      };
    },

    name: 'no-object-values-on-strings',
    meta: {
      type: 'problem',
      docs: {
        description: 'Disallow Object.values() on strings as it treats strings as arrays of characters, which is likely unintended behavior.',
        recommended: 'error',
      },
      schema: [],
      messages: {
        unexpected:
          'Object.values() should not be used on strings. It treats strings as arrays of characters, which is likely unintended. Use Object.values() only on objects.',
      },
    },
    defaultOptions: [],
  });

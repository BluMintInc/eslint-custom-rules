import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferGlobalRouterStateKey';

/**
 * Rule to enforce best practices for the `key` parameter in `useRouterState` hook calls.
 * Encourages type safety and maintainability by using global constants or type-safe functions.
 */
export const preferGlobalRouterStateKey = createRule<[], MessageIds>({
  name: 'prefer-global-router-state-key',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using global constants or type-safe functions for useRouterState key parameter',
      recommended: 'warn',
    },
    schema: [],
    messages: {
      preferGlobalRouterStateKey:
        'Prefer using a global constant or type-safe function for useRouterState key parameter instead of string literals',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node: TSESTree.CallExpression) {
        // Check if this is a call to useRouterState
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === 'useRouterState'
        ) {
          // Check if there are arguments
          if (node.arguments.length > 0) {
            const firstArg = node.arguments[0];

            // Check if the first argument is an object expression
            if (firstArg.type === AST_NODE_TYPES.ObjectExpression) {
              // Find the key property in the object
              const keyProperty = firstArg.properties.find(
                (prop): prop is TSESTree.Property =>
                  prop.type === AST_NODE_TYPES.Property &&
                  prop.key.type === AST_NODE_TYPES.Identifier &&
                  prop.key.name === 'key'
              );

              // If key property exists, check its value
              if (keyProperty && keyProperty.value) {
                const keyValue = keyProperty.value;

                // Check if the key is a string literal
                if (keyValue.type === AST_NODE_TYPES.Literal && typeof keyValue.value === 'string') {
                  context.report({
                    node: keyValue,
                    messageId: 'preferGlobalRouterStateKey',
                  });
                }
              }
            }
          }
        }
      },
    };
  },
});

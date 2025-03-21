import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'useGlobalConstant';

export const enforceGlobalConstants = createRule<[], MessageIds>({
  name: 'enforce-global-constants',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using global static constants instead of useMemo with empty dependency arrays for object literals',
      recommended: 'error',
    },
    schema: [],
    messages: {
      useGlobalConstant:
        'Use a global static constant instead of useMemo with an empty dependency array for object literals',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        // Check if it's a useMemo call
        if (
          node.callee.type !== AST_NODE_TYPES.Identifier ||
          node.callee.name !== 'useMemo'
        ) {
          return;
        }

        // Check if it has exactly two arguments
        if (node.arguments.length !== 2) {
          return;
        }

        // Check if the second argument is an empty array
        const depsArray = node.arguments[1];
        if (
          depsArray.type !== AST_NODE_TYPES.ArrayExpression ||
          depsArray.elements.length !== 0
        ) {
          return;
        }

        // Check if the first argument is an arrow function
        const callback = node.arguments[0];
        if (callback.type !== AST_NODE_TYPES.ArrowFunctionExpression) {
          return;
        }

        // Check if the arrow function body is a block statement with a return statement
        // or a direct expression (implicit return)
        let returnValue: TSESTree.Expression | null = null;

        if (callback.body.type === AST_NODE_TYPES.BlockStatement) {
          // If it's a block, find the return statement
          const returnStatement = callback.body.body.find(
            (stmt) => stmt.type === AST_NODE_TYPES.ReturnStatement
          ) as TSESTree.ReturnStatement | undefined;

          if (!returnStatement || !returnStatement.argument) {
            return;
          }

          returnValue = returnStatement.argument;
        } else {
          // If it's an expression (implicit return)
          returnValue = callback.body;
        }

        // Handle 'as const' type assertions
        let actualReturnValue = returnValue;
        if (returnValue.type === AST_NODE_TYPES.TSAsExpression) {
          actualReturnValue = returnValue.expression;
        }

        // Check if the return value is an object literal or an array of object literals
        if (
          actualReturnValue.type === AST_NODE_TYPES.ObjectExpression ||
          (actualReturnValue.type === AST_NODE_TYPES.ArrayExpression &&
            actualReturnValue.elements.some(
              (element) =>
                element !== null &&
                element.type === AST_NODE_TYPES.ObjectExpression
            ))
        ) {
          context.report({
            node,
            messageId: 'useGlobalConstant',
          });
        }
      },
    };
  },
});

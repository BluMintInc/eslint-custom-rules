import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'missingCause' | 'wrongCause';

export const enforceHttpsErrorCause = createRule<[], MessageIds>({
  name: 'enforce-https-error-cause',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require HttpsError calls inside catch blocks to pass the caught error as the 4th cause argument',
      recommended: 'error',
    },
    fixable: undefined,
    schema: [],
    messages: {
      missingCause:
        'HttpsError inside catch block must pass the caught error as the 4th argument (cause)',
      wrongCause:
        'HttpsError cause argument must reference the caught error "{{catchParam}}"',
    },
  },
  defaultOptions: [],
  create(context) {
    /**
     * Finds the nearest catch clause that contains the given node
     */
    function findContainingCatchClause(node: TSESTree.Node): TSESTree.CatchClause | null {
      let current: TSESTree.Node | undefined = node.parent;

      while (current) {
        if (current.type === AST_NODE_TYPES.CatchClause) {
          return current;
        }
        current = current.parent;
      }

      return null;
    }

    /**
     * Checks if a node is lexically inside a catch block
     * This means the node is directly in the catch block, not inside nested functions
     */
    function isInsideCatchBlock(node: TSESTree.Node): boolean {
      const catchClause = findContainingCatchClause(node);
      if (!catchClause || !catchClause.body) {
        return false;
      }

      // Check if the node is inside the catch block body, but not inside nested functions
      let current: TSESTree.Node | undefined = node.parent;
      while (current && current !== catchClause.body) {
        // If we encounter a function declaration or expression, the HttpsError is not directly in catch block
        if (
          current.type === AST_NODE_TYPES.FunctionDeclaration ||
          current.type === AST_NODE_TYPES.FunctionExpression ||
          current.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          return false;
        }
        current = current.parent;
      }

      return current === catchClause.body;
    }

    /**
     * Checks if the given node is a HttpsError constructor call
     */
    function isHttpsErrorCall(node: TSESTree.NewExpression): boolean {
      const { callee } = node;

      // Direct HttpsError call
      if (callee.type === AST_NODE_TYPES.Identifier && callee.name === 'HttpsError') {
        return true;
      }

      // Member expression like someModule.HttpsError
      if (
        callee.type === AST_NODE_TYPES.MemberExpression &&
        callee.property.type === AST_NODE_TYPES.Identifier &&
        callee.property.name === 'HttpsError'
      ) {
        return true;
      }

      return false;
    }

    return {
      NewExpression(node: TSESTree.NewExpression) {
        // Only check HttpsError calls
        if (!isHttpsErrorCall(node)) {
          return;
        }

        // Only check calls inside catch blocks
        if (!isInsideCatchBlock(node)) {
          return;
        }

        const catchClause = findContainingCatchClause(node);
        if (!catchClause || !catchClause.param) {
          return;
        }

        // Get the catch parameter name
        let catchParamName: string;
        if (catchClause.param.type === AST_NODE_TYPES.Identifier) {
          catchParamName = catchClause.param.name;
        } else {
          // Handle destructuring or other patterns - for now, skip
          return;
        }

        const args = node.arguments;

        // HttpsError signature: (code, message, details?, cause?, stackOverride?)
        // We need at least 4 arguments for the cause to be present
        if (args.length < 4) {
          context.report({
            node,
            messageId: 'missingCause',
          });
          return;
        }

        // Check if the 4th argument (index 3) references the catch parameter
        const causeArg = args[3];
        if (
          causeArg.type !== AST_NODE_TYPES.Identifier ||
          causeArg.name !== catchParamName
        ) {
          context.report({
            node,
            messageId: 'wrongCause',
            data: {
              catchParam: catchParamName,
            },
          });
        }
      },
    };
  },
});

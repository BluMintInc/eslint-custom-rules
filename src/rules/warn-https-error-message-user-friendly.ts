import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';

type MessageIds = 'warnHttpsErrorMessageUserFriendly';

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

const isToHttpsErrorCall = (
  callee: TSESTree.LeftHandSideExpression,
): boolean => {
  return (
    callee.type === AST_NODE_TYPES.Identifier && callee.name === 'toHttpsError'
  );
};

export const warnHttpsErrorMessageUserFriendly = createRule<[], MessageIds>({
  name: 'warn-https-error-message-user-friendly',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Warn when messageUserFriendly is used in HttpsError or toHttpsError to ensure it is truly a user-caused error.',
      recommended: 'warn',
    },
    schema: [],
    messages: {
      warnHttpsErrorMessageUserFriendly:
        "It's likely that 'messageUserFriendly' is being misused here. Consider whether this error is truly user-caused; misuse suppresses automated error monitoring and QA issue creation for real bugs. If this is truly a user-caused error, use '// eslint-disable-next-line' to acknowledge this warning.",
    },
  },
  defaultOptions: [],
  create(context) {
    /**
     * Traces a variable to see if its initializer contains messageUserFriendly.
     */
    const traceVariable = (
      identifier: TSESTree.Identifier,
      visited: Set<string> = new Set(),
    ): boolean => {
      if (visited.has(identifier.name)) return false;
      visited.add(identifier.name);

      const scope = ASTHelpers.getScope(context, identifier);
      const variable = ASTHelpers.findVariableInScope(scope, identifier.name);

      if (!variable) return false;

      for (const def of variable.defs) {
        if (def.type === 'Variable' && def.node.init) {
          if (checkNode(def.node.init, visited)) {
            return true;
          }
        }
      }
      return false;
    };

    /**
     * Checks a node (expression) for messageUserFriendly.
     */
    const checkNode = (
      node: TSESTree.Node,
      visited: Set<string> = new Set(),
    ): boolean => {
      if (node.type === AST_NODE_TYPES.ObjectExpression) {
        for (const prop of node.properties) {
          if (prop.type === AST_NODE_TYPES.Property) {
            if (
              !prop.computed &&
              ((prop.key.type === AST_NODE_TYPES.Identifier &&
                prop.key.name === 'messageUserFriendly') ||
                (prop.key.type === AST_NODE_TYPES.Literal &&
                  prop.key.value === 'messageUserFriendly'))
            ) {
              return true;
            }
          } else if (prop.type === AST_NODE_TYPES.SpreadElement) {
            if (checkNode(prop.argument, visited)) {
              return true;
            }
          }
        }
      } else if (node.type === AST_NODE_TYPES.Identifier) {
        return traceVariable(node, visited);
      } else if (node.type === AST_NODE_TYPES.LogicalExpression) {
        return checkNode(node.left, visited) || checkNode(node.right, visited);
      } else if (node.type === AST_NODE_TYPES.ConditionalExpression) {
        return (
          checkNode(node.consequent, visited) || checkNode(node.alternate, visited)
        );
      }
      return false;
    };

    const validateOptions = (node: TSESTree.Node) => {
      if (node.type === AST_NODE_TYPES.ObjectExpression) {
        for (const prop of node.properties) {
          if (prop.type === AST_NODE_TYPES.Property) {
            if (
              !prop.computed &&
              ((prop.key.type === AST_NODE_TYPES.Identifier &&
                prop.key.name === 'messageUserFriendly') ||
                (prop.key.type === AST_NODE_TYPES.Literal &&
                  prop.key.value === 'messageUserFriendly'))
            ) {
              context.report({
                node: prop.key,
                messageId: 'warnHttpsErrorMessageUserFriendly',
              });
            }
          } else if (prop.type === AST_NODE_TYPES.SpreadElement) {
            if (checkNode(prop.argument)) {
              context.report({
                node: prop,
                messageId: 'warnHttpsErrorMessageUserFriendly',
              });
            }
          }
        }
      } else if (node.type === AST_NODE_TYPES.Identifier) {
        if (traceVariable(node)) {
          context.report({
            node,
            messageId: 'warnHttpsErrorMessageUserFriendly',
          });
        }
      }
    };

    return {
      NewExpression(node) {
        if (isHttpsErrorCall(node.callee)) {
          if (node.arguments.length > 0) {
            validateOptions(node.arguments[0]);
          }
        }
      },
      CallExpression(node) {
        if (isHttpsErrorCall(node.callee)) {
          if (node.arguments.length > 0) {
            validateOptions(node.arguments[0]);
          }
        } else if (isToHttpsErrorCall(node.callee)) {
          if (node.arguments.length > 1) {
            validateOptions(node.arguments[1]);
          }
        }
      },
    };
  },
});

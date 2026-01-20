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
    fixable: undefined,
    schema: [],
    messages: {
      warnHttpsErrorMessageUserFriendly:
        "What's wrong: '{{propertyName}}' is set on an HttpsError/toHttpsError options object. " +
        "Why it matters: this marks the error as user-caused and can suppress automated error monitoring and QA issue creation for real defects. " +
        "How to fix: remove '{{propertyName}}' unless the error is genuinely user-caused; if it is, keep it and add // eslint-disable-next-line to document the exception.",
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
        } else if (
          def.type === 'FunctionName' &&
          def.node.type === AST_NODE_TYPES.FunctionDeclaration
        ) {
          if (traceFunctionReturn(def.node, visited)) {
            return true;
          }
        }
      }
      return false;
    };

    /**
     * Traces function returns to see if any return an object with messageUserFriendly.
     */
    const traceFunctionReturn = (
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression,
      visited: Set<string> = new Set(),
    ): boolean => {
      if (node.body.type === AST_NODE_TYPES.BlockStatement) {
        return node.body.body.some((statement) => {
          if (statement.type === AST_NODE_TYPES.ReturnStatement && statement.argument) {
            return checkNode(statement.argument, visited);
          }
          return false;
        });
      } else {
        // Arrow function with expression body
        return checkNode(node.body, visited);
      }
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
      } else if (
        node.type === AST_NODE_TYPES.CallExpression ||
        node.type === AST_NODE_TYPES.NewExpression
      ) {
        if (node.callee.type === AST_NODE_TYPES.Identifier) {
          const scope = ASTHelpers.getScope(context, node.callee);
          const variable = ASTHelpers.findVariableInScope(scope, node.callee.name);
          if (variable) {
            for (const def of variable.defs) {
              if (
                def.type === 'FunctionName' &&
                def.node.type === AST_NODE_TYPES.FunctionDeclaration
              ) {
                return traceFunctionReturn(def.node, visited);
              } else if (def.type === 'Variable' && def.node.init) {
                if (
                  def.node.init.type === AST_NODE_TYPES.FunctionExpression ||
                  def.node.init.type === AST_NODE_TYPES.ArrowFunctionExpression
                ) {
                  return traceFunctionReturn(def.node.init, visited);
                }
              }
            }
          }
        }
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
                data: { propertyName: 'messageUserFriendly' },
              });
            }
          } else if (prop.type === AST_NODE_TYPES.SpreadElement) {
            if (checkNode(prop.argument)) {
              context.report({
                node: prop,
                messageId: 'warnHttpsErrorMessageUserFriendly',
                data: { propertyName: 'messageUserFriendly' },
              });
            }
          }
        }
      } else if (node.type === AST_NODE_TYPES.Identifier) {
        if (traceVariable(node)) {
          context.report({
            node,
            messageId: 'warnHttpsErrorMessageUserFriendly',
            data: { propertyName: 'messageUserFriendly' },
          });
        }
      } else if (
        node.type === AST_NODE_TYPES.CallExpression ||
        node.type === AST_NODE_TYPES.NewExpression
      ) {
        if (checkNode(node)) {
          context.report({
            node,
            messageId: 'warnHttpsErrorMessageUserFriendly',
            data: { propertyName: 'messageUserFriendly' },
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

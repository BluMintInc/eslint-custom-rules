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
    fixable: undefined, // Not automatically fixable
    schema: [],
    messages: {
      warnHttpsErrorMessageUserFriendly:
        "What's wrong: '{{propertyName}}' is set on an HttpsError/toHttpsError options object. " +
        'Why it matters: this marks the error as user-caused and can suppress automated error monitoring and QA issue creation for real defects. ' +
        "How to fix: remove '{{propertyName}}' unless the error is genuinely user-caused; if it is, keep it and add // eslint-disable-next-line to document the exception.",
    },
  },
  defaultOptions: [],
  create(context) {
    /**
     * Finds properties or spread elements that contain messageUserFriendly in an object expression.
     */
    const findMessageUserFriendlyProperties = (
      node: TSESTree.ObjectExpression,
      visited: Set<string> = new Set(),
    ): (TSESTree.Property | TSESTree.SpreadElement)[] => {
      const matches: (TSESTree.Property | TSESTree.SpreadElement)[] = [];
      for (const prop of node.properties) {
        if (prop.type === AST_NODE_TYPES.Property) {
          if (
            !prop.computed &&
            ((prop.key.type === AST_NODE_TYPES.Identifier &&
              prop.key.name === 'messageUserFriendly') ||
              (prop.key.type === AST_NODE_TYPES.Literal &&
                prop.key.value === 'messageUserFriendly'))
          ) {
            matches.push(prop);
          }
        } else if (prop.type === AST_NODE_TYPES.SpreadElement) {
          if (checkNode(prop.argument, visited)) {
            matches.push(prop);
          }
        }
      }
      return matches;
    };

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
      if (!node.body) return false;
      const sourceCode = context.sourceCode ?? context.getSourceCode();
      const walk = (current: TSESTree.Node): boolean => {
        if (
          current !== node &&
          (current.type === AST_NODE_TYPES.FunctionDeclaration ||
            current.type === AST_NODE_TYPES.FunctionExpression ||
            current.type === AST_NODE_TYPES.ArrowFunctionExpression)
        ) {
          return false;
        }

        if (
          current.type === AST_NODE_TYPES.ReturnStatement &&
          current.argument
        ) {
          return checkNode(current.argument, visited);
        }

        const keys = sourceCode.visitorKeys[current.type] ?? [];
        return keys.some((key) => {
          const value = (current as unknown as Record<string, unknown>)[key];
          if (Array.isArray(value)) {
            return value.some(
              (child) =>
                child &&
                typeof child === 'object' &&
                'type' in child &&
                walk(child as TSESTree.Node),
            );
          }
          if (value && typeof value === 'object' && 'type' in value) {
            return walk(value as TSESTree.Node);
          }
          return false;
        });
      };

      if (node.body.type === AST_NODE_TYPES.BlockStatement) {
        return walk(node.body);
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
        return findMessageUserFriendlyProperties(node, visited).length > 0;
      } else if (node.type === AST_NODE_TYPES.Identifier) {
        return traceVariable(node, visited);
      } else if (node.type === AST_NODE_TYPES.LogicalExpression) {
        return checkNode(node.left, visited) || checkNode(node.right, visited);
      } else if (node.type === AST_NODE_TYPES.ConditionalExpression) {
        return (
          checkNode(node.consequent, visited) ||
          checkNode(node.alternate, visited)
        );
      } else if (
        node.type === AST_NODE_TYPES.CallExpression ||
        node.type === AST_NODE_TYPES.NewExpression
      ) {
        if (node.callee.type === AST_NODE_TYPES.Identifier) {
          const scope = ASTHelpers.getScope(context, node.callee);
          const variable = ASTHelpers.findVariableInScope(
            scope,
            node.callee.name,
          );
          if (variable) {
            for (const def of variable.defs) {
              if (
                def.type === 'FunctionName' &&
                def.node.type === AST_NODE_TYPES.FunctionDeclaration
              ) {
                if (traceFunctionReturn(def.node, visited)) {
                  return true;
                }
              } else if (def.type === 'Variable' && def.node.init) {
                if (
                  def.node.init.type === AST_NODE_TYPES.FunctionExpression ||
                  def.node.init.type === AST_NODE_TYPES.ArrowFunctionExpression
                ) {
                  if (traceFunctionReturn(def.node.init, visited)) {
                    return true;
                  }
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
        findMessageUserFriendlyProperties(node).forEach((prop) => {
          context.report({
            node: prop.type === AST_NODE_TYPES.Property ? prop.key : prop,
            messageId: 'warnHttpsErrorMessageUserFriendly',
            data: { propertyName: 'messageUserFriendly' },
          });
        });
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
      } else if (node.type === AST_NODE_TYPES.LogicalExpression) {
        validateOptions(node.left);
        validateOptions(node.right);
      } else if (node.type === AST_NODE_TYPES.ConditionalExpression) {
        validateOptions(node.consequent);
        validateOptions(node.alternate);
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

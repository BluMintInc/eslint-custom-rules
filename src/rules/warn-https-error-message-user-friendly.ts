import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';

type MessageIds = 'warnHttpsErrorMessageUserFriendly';

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
     * Extracts problematic property definitions to provide precise reporting locations,
     * even when properties are deeply nested or mixed via spread elements.
     */
    const findMessageUserFriendlyProperties = (
      node: TSESTree.ObjectExpression,
      visited: Set<string> = new Set(),
    ): (TSESTree.Property | TSESTree.SpreadElement)[] => {
      const matches: (TSESTree.Property | TSESTree.SpreadElement)[] = [];
      for (const prop of node.properties) {
        if (prop.type === AST_NODE_TYPES.Property) {
          if (
            (!prop.computed &&
              ((prop.key.type === AST_NODE_TYPES.Identifier &&
                prop.key.name === 'messageUserFriendly') ||
                (prop.key.type === AST_NODE_TYPES.Literal &&
                  prop.key.value === 'messageUserFriendly'))) ||
            (prop.computed &&
              prop.key.type === AST_NODE_TYPES.Literal &&
              prop.key.value === 'messageUserFriendly')
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
     * Analyzes variable assignments to prevent rule bypass via intermediate identifiers,
     * ensuring that 'messageUserFriendly' cannot be hidden behind a variable name.
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
     * Inspects function bodies to detect cases where the options object is generated
     * dynamically, closing a common bypass pattern where factories or helpers are used.
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
     * Recursively evaluates diverse AST structures (logical, conditional, calls) to ensure
     * that the presence of 'messageUserFriendly' is detected regardless of expression complexity.
     *
     * Note: This implementation intentionally covers only Identifier callees for simplicity,
     * as MemberExpression callees (e.g., optionsFactory.build()) are not currently used in
     * the codebase for HttpsError options. Handling for MemberExpression callees can be
     * added as a future enhancement if such patterns emerge.
     */
    const checkNode = (
      node: TSESTree.Node,
      visited: Set<string> = new Set(),
    ): boolean => {
      const unwrappedNode = ASTHelpers.unwrapTSAssertions(node);
      if (unwrappedNode.type === AST_NODE_TYPES.ObjectExpression) {
        return (
          findMessageUserFriendlyProperties(unwrappedNode, visited).length > 0
        );
      } else if (unwrappedNode.type === AST_NODE_TYPES.Identifier) {
        return traceVariable(unwrappedNode, visited);
      } else if (unwrappedNode.type === AST_NODE_TYPES.LogicalExpression) {
        return (
          checkNode(unwrappedNode.left, visited) ||
          checkNode(unwrappedNode.right, visited)
        );
      } else if (unwrappedNode.type === AST_NODE_TYPES.ConditionalExpression) {
        return (
          checkNode(unwrappedNode.consequent, visited) ||
          checkNode(unwrappedNode.alternate, visited)
        );
      } else if (
        unwrappedNode.type === AST_NODE_TYPES.CallExpression ||
        unwrappedNode.type === AST_NODE_TYPES.NewExpression
      ) {
        if (unwrappedNode.callee.type === AST_NODE_TYPES.Identifier) {
          const calleeName = unwrappedNode.callee.name;
          if (visited.has(calleeName)) return false;
          visited.add(calleeName);

          const scope = ASTHelpers.getScope(context, unwrappedNode.callee);
          const variable = ASTHelpers.findVariableInScope(
            scope,
            calleeName,
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
      const unwrappedNode = ASTHelpers.unwrapTSAssertions(node);
      if (unwrappedNode.type === AST_NODE_TYPES.ObjectExpression) {
        findMessageUserFriendlyProperties(unwrappedNode).forEach((prop) => {
          context.report({
            node: prop.type === AST_NODE_TYPES.Property ? prop.key : prop,
            messageId: 'warnHttpsErrorMessageUserFriendly',
            data: { propertyName: 'messageUserFriendly' },
          });
        });
      } else if (unwrappedNode.type === AST_NODE_TYPES.Identifier) {
        if (traceVariable(unwrappedNode)) {
          context.report({
            node: unwrappedNode,
            messageId: 'warnHttpsErrorMessageUserFriendly',
            data: { propertyName: 'messageUserFriendly' },
          });
        }
      } else if (
        unwrappedNode.type === AST_NODE_TYPES.CallExpression ||
        unwrappedNode.type === AST_NODE_TYPES.NewExpression
      ) {
        if (checkNode(unwrappedNode)) {
          context.report({
            node,
            messageId: 'warnHttpsErrorMessageUserFriendly',
            data: { propertyName: 'messageUserFriendly' },
          });
        }
      } else if (unwrappedNode.type === AST_NODE_TYPES.LogicalExpression) {
        validateOptions(unwrappedNode.left);
        validateOptions(unwrappedNode.right);
      } else if (unwrappedNode.type === AST_NODE_TYPES.ConditionalExpression) {
        validateOptions(unwrappedNode.consequent);
        validateOptions(unwrappedNode.alternate);
      }
    };

    return {
      NewExpression(node) {
        if (ASTHelpers.isHttpsErrorCall(node.callee)) {
          if (node.arguments.length > 0) {
            validateOptions(node.arguments[0]);
          }
        }
      },
      CallExpression(node) {
        if (ASTHelpers.isHttpsErrorCall(node.callee)) {
          if (node.arguments.length > 0) {
            validateOptions(node.arguments[0]);
          }
        } else if (ASTHelpers.isToHttpsErrorCall(node.callee)) {
          if (node.arguments.length > 1) {
            validateOptions(node.arguments[1]);
          }
        }
      },
    };
  },
});

import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'requireDefaultParams';

export const requireHooksDefaultParams = createRule<[], MessageIds>({
  name: 'require-hooks-default-params',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce React hooks with optional parameters to default to an empty object',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      requireDefaultParams:
        'Hook "{{hookName}}" accepts an options object where every property is optional, but the parameter is not defaulted. When callers omit the argument the hook receives undefined, so destructuring or property access throws even though the fields are optional. Default the parameter to an empty object (e.g., "({ option } = {})") so the hook stays safe to call with no arguments.',
    },
  },
  defaultOptions: [],
  create(context) {
    function isHookName(name: string): boolean {
      return name.startsWith('use') && name[3]?.toUpperCase() === name[3];
    }

    function hasAllOptionalProperties(
      typeNode:
        | TSESTree.TypeNode
        | TSESTree.TSTypeAliasDeclaration
        | TSESTree.TSInterfaceDeclaration,
    ): boolean {
      // Handle type literals directly
      if (typeNode.type === AST_NODE_TYPES.TSTypeLiteral) {
        return typeNode.members.every((member) => {
          if (member.type !== AST_NODE_TYPES.TSPropertySignature) {
            return false;
          }
          return member.optional === true;
        });
      }

      // Handle type references
      if (typeNode.type === AST_NODE_TYPES.TSTypeReference) {
        const typeName = typeNode.typeName;
        if (typeName.type !== AST_NODE_TYPES.Identifier) {
          return false;
        }

        const scope = context.getScope();
        const variable = scope.variables.find((v) => v.name === typeName.name);
        if (!variable || !variable.defs[0]?.node) {
          // If we can't find the type definition, assume it's a type with required properties
          // This handles cases where the type is imported from another module
          return false;
        }

        const def = variable.defs[0].node;
        if (def.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
          return hasAllOptionalProperties(def.typeAnnotation);
        } else if (def.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
          return def.body.body.every((member) => {
            if (member.type !== AST_NODE_TYPES.TSPropertySignature) {
              return false;
            }
            return member.optional === true;
          });
        }

        // If we found the type definition but it's not a type alias or interface declaration,
        // assume it's a type with required properties
        // This handles cases where the type is imported from another module
        return false;
      }

      // Handle type alias declarations
      if (typeNode.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
        return hasAllOptionalProperties(typeNode.typeAnnotation);
      }

      // Handle interface declarations
      if (typeNode.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
        return typeNode.body.body.every((member) => {
          if (member.type !== AST_NODE_TYPES.TSPropertySignature) {
            return false;
          }
          return member.optional === true;
        });
      }

      return false;
    }

    return {
      'ArrowFunctionExpression, FunctionDeclaration'(
        node: TSESTree.ArrowFunctionExpression | TSESTree.FunctionDeclaration,
      ): void {
        // Check if it's a hook function
        let isHook = false;
        let hookName: string | undefined;
        if (node.type === AST_NODE_TYPES.FunctionDeclaration) {
          hookName = node.id?.name;
          isHook = hookName ? isHookName(hookName) : false;
        } else {
          const parent = node.parent;
          if (
            parent &&
            parent.type === AST_NODE_TYPES.VariableDeclarator &&
            parent.id &&
            parent.id.type === AST_NODE_TYPES.Identifier
          ) {
            hookName = parent.id.name;
            isHook = isHookName(parent.id.name);
          }
        }

        if (!isHook) {
          return;
        }

        const messageData = { hookName: hookName ?? 'this hook' };

        // Check if it has exactly one parameter
        if (node.params.length !== 1) {
          return;
        }

        // Check if the parameter is already an assignment pattern
        const param = node.params[0];
        if (param.type === AST_NODE_TYPES.AssignmentPattern) {
          return;
        }

        // Check if the parameter has a type annotation
        if (
          param.type === AST_NODE_TYPES.ObjectPattern &&
          param.typeAnnotation
        ) {
          const typeAnnotation = param.typeAnnotation.typeAnnotation;
          if (typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
            const typeName = typeAnnotation.typeName;
            if (typeName.type === AST_NODE_TYPES.Identifier) {
              const scope = context.getScope();
              const variable = scope.variables.find(
                (v) => v.name === typeName.name,
              );
              if (variable && variable.defs[0]?.node) {
                const def = variable.defs[0].node;
                if (def.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
                  if (hasAllOptionalProperties(def.typeAnnotation)) {
                    context.report({
                      node: param,
                      messageId: 'requireDefaultParams',
                      data: messageData,
                      fix(fixer) {
                        const paramText = context.sourceCode.getText(param);
                        return fixer.replaceText(param, `${paramText} = {}`);
                      },
                    });
                  }
                } else if (def.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
                  if (
                    def.body.body.every((member) => {
                      if (member.type !== AST_NODE_TYPES.TSPropertySignature) {
                        return false;
                      }
                      return member.optional === true;
                    })
                  ) {
                    context.report({
                      node: param,
                      messageId: 'requireDefaultParams',
                      data: messageData,
                      fix(fixer) {
                        const paramText = context.sourceCode.getText(param);
                        return fixer.replaceText(param, `${paramText} = {}`);
                      },
                    });
                  }
                }
              } else {
                // If we can't find the type definition, check if it's defined in the same file
                const program = context.sourceCode.ast;
                const typeDefinitions = program.body.filter((node) => {
                  if (
                    node.type === AST_NODE_TYPES.TSTypeAliasDeclaration ||
                    node.type === AST_NODE_TYPES.TSInterfaceDeclaration
                  ) {
                    if (node.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
                      return node.id.name === typeName.name;
                    } else {
                      return node.id.name === typeName.name;
                    }
                  }
                  return false;
                });

                if (typeDefinitions.length > 0) {
                  const def = typeDefinitions[0];
                  if (def.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
                    if (hasAllOptionalProperties(def.typeAnnotation)) {
                      context.report({
                        node: param,
                        messageId: 'requireDefaultParams',
                        data: messageData,
                        fix(fixer) {
                        const paramText = context.sourceCode.getText(param);
                          return fixer.replaceText(param, `${paramText} = {}`);
                        },
                      });
                    }
                  } else if (
                    def.type === AST_NODE_TYPES.TSInterfaceDeclaration
                  ) {
                    if (
                      def.body.body.every((member) => {
                        if (
                          member.type !== AST_NODE_TYPES.TSPropertySignature
                        ) {
                          return false;
                        }
                        return member.optional === true;
                      })
                    ) {
                      context.report({
                        node: param,
                        messageId: 'requireDefaultParams',
                        data: messageData,
                        fix(fixer) {
                        const paramText = context.sourceCode.getText(param);
                          return fixer.replaceText(param, `${paramText} = {}`);
                        },
                      });
                    }
                  }
                }
              }
            }
          } else if (typeAnnotation.type === AST_NODE_TYPES.TSTypeLiteral) {
            if (
              typeAnnotation.members.every((member) => {
                if (member.type !== AST_NODE_TYPES.TSPropertySignature) {
                  return false;
                }
                return member.optional === true;
              })
            ) {
              context.report({
                node: param,
                messageId: 'requireDefaultParams',
                data: messageData,
                fix(fixer) {
                  const paramText = context.sourceCode.getText(param);
                  return fixer.replaceText(param, `${paramText} = {}`);
                },
              });
            }
          }
        }
      },
    };
  },
});

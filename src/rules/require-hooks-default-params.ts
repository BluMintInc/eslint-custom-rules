import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'requireDefaultParams';

export const requireHooksDefaultParams = createRule<[], MessageIds>({
  name: 'require-hooks-default-params',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce React hooks with optional parameters to default to an empty object',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      requireDefaultParams: 'React hooks with all optional parameters should default to an empty object',
    },
  },
  defaultOptions: [],
  create(context) {
    function isHookName(name: string): boolean {
      return name.startsWith('use') && name[3]?.toUpperCase() === name[3];
    }

    function hasAllOptionalProperties(typeNode: TSESTree.TypeNode | TSESTree.TSTypeAliasDeclaration | TSESTree.TSInterfaceDeclaration): boolean {
      // Handle type literals directly
      if (typeNode.type === AST_NODE_TYPES.TSTypeLiteral) {
        return typeNode.members.every(member => {
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
        const variable = scope.variables.find(v => v.name === typeName.name);
        if (!variable || !variable.defs[0]?.node) {
          // If we can't find the type definition, assume it's a type with all optional properties
          // This handles cases where the type is imported from another module
          return true;
        }

        const def = variable.defs[0].node;
        if (def.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
          return hasAllOptionalProperties(def.typeAnnotation);
        } else if (def.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
          return def.body.body.every(member => {
            if (member.type !== AST_NODE_TYPES.TSPropertySignature) {
              return false;
            }
            return member.optional === true;
          });
        }

        // If we found the type definition but it's not a type alias or interface declaration,
        // assume it's a type with all optional properties
        // This handles cases where the type is imported from another module
        return true;
      }

      // Handle type alias declarations
      if (typeNode.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
        return hasAllOptionalProperties(typeNode.typeAnnotation);
      }

      // Handle interface declarations
      if (typeNode.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
        return typeNode.body.body.every(member => {
          if (member.type !== AST_NODE_TYPES.TSPropertySignature) {
            return false;
          }
          return member.optional === true;
        });
      }

      return false;
    }

    function checkHookParam(param: TSESTree.Parameter): void {
      // If it's already an assignment pattern, check if the left side is an object pattern
      if (param.type === AST_NODE_TYPES.AssignmentPattern) {
        if (param.left.type === AST_NODE_TYPES.ObjectPattern && param.left.typeAnnotation) {
          if (hasAllOptionalProperties(param.left.typeAnnotation.typeAnnotation)) {
            return; // Already has a default value and is correctly typed
          }
        }
        return;
      }

      // If it's an object pattern, check if it needs a default value
      if (param.type === AST_NODE_TYPES.ObjectPattern && param.typeAnnotation) {
        const typeAnnotation = param.typeAnnotation.typeAnnotation;
        if (typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
          const typeName = typeAnnotation.typeName;
          if (typeName.type === AST_NODE_TYPES.Identifier) {
            const scope = context.getScope();
            const variable = scope.variables.find(v => v.name === typeName.name);
            if (!variable || !variable.defs[0]?.node) {
              // If we can't find the type definition, assume it's a type with all optional properties
              // This handles cases where the type is imported from another module
              context.report({
                node: param,
                messageId: 'requireDefaultParams',
                fix(fixer) {
                  const paramText = context.getSourceCode().getText(param);
                  return fixer.replaceText(param, `${paramText} = {}`);
                },
              });
              return;
            }

            const def = variable.defs[0].node;
            if (def.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
              if (hasAllOptionalProperties(def.typeAnnotation)) {
                context.report({
                  node: param,
                  messageId: 'requireDefaultParams',
                  fix(fixer) {
                    const paramText = context.getSourceCode().getText(param);
                    return fixer.replaceText(param, `${paramText} = {}`);
                  },
                });
              }
            } else if (def.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
              if (def.body.body.every(member => {
                if (member.type !== AST_NODE_TYPES.TSPropertySignature) {
                  return false;
                }
                return member.optional === true;
              })) {
                context.report({
                  node: param,
                  messageId: 'requireDefaultParams',
                  fix(fixer) {
                    const paramText = context.getSourceCode().getText(param);
                    return fixer.replaceText(param, `${paramText} = {}`);
                  },
                });
              }
            } else {
              // If we found the type definition but it's not a type alias or interface declaration,
              // assume it's a type with all optional properties
              // This handles cases where the type is imported from another module
              context.report({
                node: param,
                messageId: 'requireDefaultParams',
                fix(fixer) {
                  const paramText = context.getSourceCode().getText(param);
                  return fixer.replaceText(param, `${paramText} = {}`);
                },
              });
            }
          }
        } else if (hasAllOptionalProperties(typeAnnotation)) {
          context.report({
            node: param,
            messageId: 'requireDefaultParams',
            fix(fixer) {
              const paramText = context.getSourceCode().getText(param);
              return fixer.replaceText(param, `${paramText} = {}`);
            },
          });
        }
      }
    }

    return {
      FunctionDeclaration(node): void {
        if (!node.id || !isHookName(node.id.name)) {
          return;
        }

        if (node.params.length !== 1) {
          return;
        }

        checkHookParam(node.params[0]);
      },

      ArrowFunctionExpression(node): void {
        const parent = node.parent;
        if (
          !parent ||
          parent.type !== AST_NODE_TYPES.VariableDeclarator ||
          !parent.id ||
          parent.id.type !== AST_NODE_TYPES.Identifier ||
          !isHookName(parent.id.name)
        ) {
          return;
        }

        if (node.params.length !== 1) {
          return;
        }

        checkHookParam(node.params[0]);
      },
    };
  },
});

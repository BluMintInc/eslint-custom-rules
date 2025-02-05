import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noComplexObjects';

export const noComplexCloudParams = createRule<[], MessageIds>({
  name: 'no-complex-cloud-params',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow passing complex objects to cloud functions',
      recommended: 'error',
    },
    schema: [],
    messages: {
      noComplexObjects:
        'Avoid passing complex objects (containing methods or non-serializable properties) to cloud functions',
    },
  },
  defaultOptions: [],
  create(context) {
    // Helper function to check if a node is a cloud function import
    function isCloudFunctionImport(node: TSESTree.ImportExpression): boolean {
      if (node.source.type !== AST_NODE_TYPES.Literal) return false;
      const importPath = node.source.value as string;
      return importPath.includes('firebaseCloud/') || importPath.includes('src/firebaseCloud/');
    }

    // Helper function to check if a node is a cloud function call
    function isCloudFunctionCall(node: TSESTree.CallExpression): boolean {
      if (isIdentifier(node.callee)) {
        return cloudFunctionCalls.has(node.callee.name);
      }
      if (node.callee.type === AST_NODE_TYPES.MemberExpression && isIdentifier(node.callee.property)) {
        return cloudFunctionCalls.has(node.callee.property.name);
      }
      return false;
    }

    // Helper function to check if a node is a function
    function isFunction(node: TSESTree.Node): boolean {
      return node.type === AST_NODE_TYPES.FunctionExpression ||
             node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
             node.type === AST_NODE_TYPES.FunctionDeclaration;
    }

    // Helper function to check if an object has methods or complex properties
    function hasComplexProperties(node: TSESTree.Node): boolean {
      if (!node) return false;

      if (isObjectExpression(node)) {
        return node.properties.some((prop) => {
          if (!isPropertyNode(prop)) return false;

          // Check for method definitions
          if (prop.method || isFunction(prop.value)) {
            return true;
          }

          // Check for arrow functions and function expressions
          if (prop.value.type === AST_NODE_TYPES.ArrowFunctionExpression ||
              prop.value.type === AST_NODE_TYPES.FunctionExpression) {
            return true;
          }

          // Check nested properties recursively
          if (isObjectExpression(prop.value)) {
            return prop.value.properties.some((nestedProp) => {
              if (!isPropertyNode(nestedProp)) return false;

              // Check for method definitions
              if (nestedProp.method || isFunction(nestedProp.value)) {
                return true;
              }

              // Check for arrow functions and function expressions
              if (nestedProp.value.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                  nestedProp.value.type === AST_NODE_TYPES.FunctionExpression) {
                return true;
              }

              return hasComplexProperties(nestedProp.value);
            });
          }

          return hasComplexProperties(prop.value);
        });
      }

      if (node.type === AST_NODE_TYPES.ArrayExpression) {
        return node.elements.some((element) => element !== null && hasComplexProperties(element));
      }

      if (node.type === AST_NODE_TYPES.NewExpression) {
        return true;
      }

      if (isFunction(node)) {
        return true;
      }

      if (node.type === AST_NODE_TYPES.ObjectPattern) {
        return node.properties.some((prop) => hasComplexProperties(prop));
      }

      if (isPropertyNode(node)) {
        return node.method || isFunction(node.value) || hasComplexProperties(node.value);
      }

      if (isIdentifier(node)) {
        // Try to find the variable declaration
        const scope = context.getScope();
        const variable = scope.variables.find((v) => v.name === node.name);
        if (variable && variable.defs.length > 0) {
          const def = variable.defs[0];
          if (def.node.type === AST_NODE_TYPES.VariableDeclarator && def.node.init) {
            return hasComplexProperties(def.node.init);
          }
        }
        return false;
      }

      if (isMemberExpression(node)) {
        // Consider any member access as potentially complex
        return true;
      }

      if (isCallExpression(node)) {
        // Consider any method call as complex
        return true;
      }

      if (node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          node.type === AST_NODE_TYPES.FunctionExpression ||
          node.type === AST_NODE_TYPES.FunctionDeclaration) {
        return true;
      }

      // Check for method shorthand
      if (isPropertyNode(node) && 'method' in node && (node as { method: boolean }).method === true) {
        return true;
      }

      // Check for method properties
      if (isPropertyNode(node) && 'value' in node && isFunction((node as { value: TSESTree.Node }).value)) {
        return true;
      }

      // Check for arrow functions and function expressions
      if (isPropertyNode(node) && 'value' in node && (node as { value: TSESTree.Node }).value.type === AST_NODE_TYPES.ArrowFunctionExpression) {
        return true;
      }

      // Check for object methods
      if (isPropertyNode(node) && 'value' in node && (node as { value: TSESTree.Node }).value.type === AST_NODE_TYPES.FunctionExpression) {
        return true;
      }

      // Check for object properties with methods
      if (isPropertyNode(node) && 'value' in node && (node as { value: TSESTree.Node }).value.type === AST_NODE_TYPES.ObjectExpression) {
        const value = (node as { value: TSESTree.ObjectExpression }).value;
        return value.properties.some((prop) => {
          if (!isPropertyNode(prop)) return false;
          if (prop.method || isFunction(prop.value)) return true;
          return hasComplexProperties(prop.value);
        });
      }

      // Consider literals and other simple types as not complex
      return false;
    }

    // Helper function to check if a node is a property
    function isPropertyNode(node: TSESTree.Node): node is TSESTree.Property {
      return node.type === AST_NODE_TYPES.Property;
    }

    // Helper function to check if a node is an object expression
    function isObjectExpression(node: TSESTree.Node): node is TSESTree.ObjectExpression {
      return node.type === AST_NODE_TYPES.ObjectExpression;
    }

    // Helper function to check if a node is an identifier
    function isIdentifier(node: TSESTree.Node): node is TSESTree.Identifier {
      return node.type === AST_NODE_TYPES.Identifier;
    }

    // Helper function to check if a node is a member expression
    function isMemberExpression(node: TSESTree.Node): node is TSESTree.MemberExpression {
      return node.type === AST_NODE_TYPES.MemberExpression;
    }

    // Helper function to check if a node is a call expression
    function isCallExpression(node: TSESTree.Node): node is TSESTree.CallExpression {
      return node.type === AST_NODE_TYPES.CallExpression;
    }

    const cloudFunctionCalls = new Set<string>();

    return {
      // Track cloud function imports
      ImportExpression(node) {
        if (isCloudFunctionImport(node)) {
          const parent = node.parent;
          if (parent?.type === AST_NODE_TYPES.VariableDeclarator) {
            if (parent.id.type === AST_NODE_TYPES.ObjectPattern) {
              parent.id.properties.forEach((prop) => {
                if (isPropertyNode(prop)) {
                  if (isIdentifier(prop.value)) {
                    cloudFunctionCalls.add(prop.value.name);
                  } else if (isIdentifier(prop.key)) {
                    cloudFunctionCalls.add(prop.key.name);
                  }
                }
              });
            } else if (parent.id.type === AST_NODE_TYPES.Identifier) {
              cloudFunctionCalls.add(parent.id.name);
            }
          }
        }
      },

      // Check call expressions for cloud function calls
      CallExpression(node) {
        if (isCloudFunctionCall(node)) {
          // Check arguments for complex objects
          node.arguments.forEach((arg) => {
            // For object expressions, check each property
            if (isObjectExpression(arg)) {
              arg.properties.forEach((prop) => {
                if (isPropertyNode(prop)) {
                  if (prop.method || isFunction(prop.value)) {
                    context.report({
                      node: arg,
                      messageId: 'noComplexObjects',
                    });
                  } else if (hasComplexProperties(prop.value)) {
                    context.report({
                      node: arg,
                      messageId: 'noComplexObjects',
                    });
                  }
                }
              });
            } else if (isIdentifier(arg)) {
              // For identifiers, check the variable declaration
              const scope = context.getScope();
              const variable = scope.variables.find((v) => v.name === arg.name);
              if (variable && variable.defs.length > 0) {
                const def = variable.defs[0];
                if (def.node.type === AST_NODE_TYPES.VariableDeclarator && def.node.init) {
                  if (def.node.init.type === AST_NODE_TYPES.ObjectExpression) {
                    def.node.init.properties.forEach((prop) => {
                      if (isPropertyNode(prop)) {
                        if (prop.method || isFunction(prop.value)) {
                          context.report({
                            node: arg,
                            messageId: 'noComplexObjects',
                          });
                        } else if (hasComplexProperties(prop.value)) {
                          context.report({
                            node: arg,
                            messageId: 'noComplexObjects',
                          });
                        }
                      }
                    });
                  } else if (def.node.init.type === AST_NODE_TYPES.NewExpression) {
                    context.report({
                      node: arg,
                      messageId: 'noComplexObjects',
                    });
                  } else if (hasComplexProperties(def.node.init)) {
                    context.report({
                      node: arg,
                      messageId: 'noComplexObjects',
                    });
                  }
                }
              }
            } else if (arg.type === AST_NODE_TYPES.ObjectExpression) {
              arg.properties.forEach((prop) => {
                if (isPropertyNode(prop)) {
                  if (prop.method || isFunction(prop.value)) {
                    context.report({
                      node: arg,
                      messageId: 'noComplexObjects',
                    });
                  } else if (hasComplexProperties(prop.value)) {
                    context.report({
                      node: arg,
                      messageId: 'noComplexObjects',
                    });
                  }
                }
              });
            } else if (arg.type === AST_NODE_TYPES.NewExpression) {
              context.report({
                node: arg,
                messageId: 'noComplexObjects',
              });
            } else if (hasComplexProperties(arg)) {
              context.report({
                node: arg,
                messageId: 'noComplexObjects',
              });
            }
          });
        }
      },
    };
  },
});

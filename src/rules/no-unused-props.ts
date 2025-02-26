import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

export const noUnusedProps = createRule({
  name: 'no-unused-props',
  meta: {
    type: 'problem',
    docs: {
      description: 'Detect unused props in React component type definitions',
      recommended: 'error',
    },
    schema: [],
    messages: {
      unusedProp:
        'Prop "{{propName}}" is defined in the Props type but not used in the component. Either use the prop in your component or remove it from the Props type. If you need to forward all props, use a rest spread operator: `const MyComponent = ({ usedProp, ...rest }: Props) => ...`',
    },
    fixable: 'code',
  },
  defaultOptions: [],
  create(context) {
    const propsTypes: Map<string, Record<string, TSESTree.Node>> = new Map();
    const usedProps: Map<string, Set<string>> = new Map();
    let currentComponent: { node: TSESTree.Node; typeName: string } | null =
      null;

    return {
      TSTypeAliasDeclaration(node) {
        if (node.id.name.endsWith('Props')) {
          const props: Record<string, TSESTree.Node> = {};

          function extractProps(typeNode: TSESTree.TypeNode) {
            if (typeNode.type === AST_NODE_TYPES.TSTypeLiteral) {
              typeNode.members.forEach((member) => {
                if (
                  member.type === AST_NODE_TYPES.TSPropertySignature &&
                  member.key.type === AST_NODE_TYPES.Identifier
                ) {
                  props[member.key.name] = member.key;
                }
              });
            } else if (typeNode.type === AST_NODE_TYPES.TSIntersectionType) {
              typeNode.types.forEach((type) => {
                if (type.type === AST_NODE_TYPES.TSTypeReference) {
                  const typeName = type.typeName;
                  if (typeName.type === AST_NODE_TYPES.Identifier) {
                    if (typeName.name === 'Pick' && type.typeParameters) {
                      // Handle Pick utility type in intersection
                      const [baseType, pickedProps] = type.typeParameters.params;
                      if (baseType.type === AST_NODE_TYPES.TSTypeReference &&
                          baseType.typeName.type === AST_NODE_TYPES.Identifier) {
                        // Extract the picked properties from the union type
                        if (pickedProps.type === AST_NODE_TYPES.TSUnionType) {
                          pickedProps.types.forEach((t) => {
                            if (t.type === AST_NODE_TYPES.TSLiteralType &&
                                t.literal.type === AST_NODE_TYPES.Literal &&
                                typeof t.literal.value === 'string') {
                              // Add each picked property as a regular prop
                              props[t.literal.value] = t.literal;
                            }
                          });
                        } else if (pickedProps.type === AST_NODE_TYPES.TSLiteralType &&
                                 pickedProps.literal.type === AST_NODE_TYPES.Literal &&
                                 typeof pickedProps.literal.value === 'string') {
                          // Single property pick
                          props[pickedProps.literal.value] = pickedProps.literal;
                        }
                      }
                    } else {
                      // For referenced types in intersections, we need to find their type declaration
                      const scope = context.getScope();
                      const variable = scope.variables.find(v => v.name === typeName.name);
                      if (variable && variable.defs[0]?.node.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
                        extractProps(variable.defs[0].node.typeAnnotation);
                      } else {
                        // If we can't find the type declaration, it's likely an imported type
                        // Mark it as a forwarded prop
                        props[`...${typeName.name}`] = typeName;
                      }
                    }
                  }
                } else {
                  extractProps(type);
                }
              });
            } else if (typeNode.type === AST_NODE_TYPES.TSTypeReference) {
              if (typeNode.typeName.type === AST_NODE_TYPES.Identifier) {
                if (typeNode.typeName.name === 'Pick' && typeNode.typeParameters) {
                  // Handle Pick utility type
                  const [baseType, pickedProps] = typeNode.typeParameters.params;
                  if (baseType.type === AST_NODE_TYPES.TSTypeReference &&
                      baseType.typeName.type === AST_NODE_TYPES.Identifier) {
                    // Extract the picked properties from the union type
                    if (pickedProps.type === AST_NODE_TYPES.TSUnionType) {
                      pickedProps.types.forEach((type) => {
                        if (type.type === AST_NODE_TYPES.TSLiteralType &&
                            type.literal.type === AST_NODE_TYPES.Literal &&
                            typeof type.literal.value === 'string') {
                          // Add each picked property as a regular prop
                          props[type.literal.value] = type.literal;
                        }
                      });
                    } else if (pickedProps.type === AST_NODE_TYPES.TSLiteralType &&
                             pickedProps.literal.type === AST_NODE_TYPES.Literal &&
                             typeof pickedProps.literal.value === 'string') {
                      // Single property pick
                      props[pickedProps.literal.value] = pickedProps.literal;
                    }
                  }
                } else {
                  // For referenced types like FormControlLabelProps, we need to track that these props should be forwarded
                  props[`...${typeNode.typeName.name}`] = typeNode.typeName;
                }
              }
            }
          }

          extractProps(node.typeAnnotation);
          propsTypes.set(node.id.name, props);
        }
      },

      VariableDeclaration(node) {
        if (node.declarations.length === 1) {
          const declaration = node.declarations[0];
          if (
            declaration.init?.type === AST_NODE_TYPES.ArrowFunctionExpression
          ) {
            const param = declaration.init.params[0];
            if (
              param?.type === AST_NODE_TYPES.ObjectPattern &&
              param.typeAnnotation?.typeAnnotation.type ===
                AST_NODE_TYPES.TSTypeReference &&
              param.typeAnnotation.typeAnnotation.typeName.type ===
                AST_NODE_TYPES.Identifier
            ) {
              const typeName =
                param.typeAnnotation.typeAnnotation.typeName.name;
              if (typeName.endsWith('Props')) {
                currentComponent = { node, typeName };
                const used = new Set<string>();
                param.properties.forEach((prop) => {
                  if (
                    prop.type === AST_NODE_TYPES.Property &&
                    prop.key.type === AST_NODE_TYPES.Identifier
                  ) {
                    used.add(prop.key.name);
                  } else if (
                    prop.type === AST_NODE_TYPES.RestElement &&
                    prop.argument.type === AST_NODE_TYPES.Identifier
                  ) {
                    // Handle rest spread operator {...rest}
                    // When a rest operator is used, all remaining props are considered used
                    const propsType = propsTypes.get(typeName);
                    if (propsType) {
                      Object.keys(propsType).forEach((key) => {
                        if (key.startsWith('...')) {
                          used.add(key);
                        }
                      });
                    }
                  }
                });
                usedProps.set(typeName, used);
              }
            }
          }
        }
      },

      'VariableDeclaration:exit'(node) {
        if (currentComponent?.node === node) {
          const { typeName } = currentComponent;
          const propsType = propsTypes.get(typeName);
          const used = usedProps.get(typeName);

          if (propsType && used) {
            Object.keys(propsType).forEach((prop) => {
              if (!used.has(prop)) {
                // For imported types (props that start with '...'), only report if there's no rest spread operator
                // This allows imported types to be used without being flagged when properly forwarded
                const hasRestSpread = Array.from(used.values()).some(usedProp => usedProp.startsWith('...'));
                if (!prop.startsWith('...') || !hasRestSpread) {
                  context.report({
                    node: propsType[prop],
                    messageId: 'unusedProp',
                    data: { propName: prop },
                  });
                }
              }
            });
          }

          // Reset state for this component
          propsTypes.delete(typeName);
          usedProps.delete(typeName);
          currentComponent = null;
        }
      },
    };
  },
});

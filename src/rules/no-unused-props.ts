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
    const filename = context.getFilename();
    const ruleSettings =
      ((context.settings && context.settings['no-unused-props']) as {
        reactLikeExtensions?: string[];
      }) ?? {};
    const reactLikeExtensions = (ruleSettings.reactLikeExtensions ??
      ['.tsx']).map((ext) => ext.toLowerCase());
    const fileExtension = filename.includes('.')
      ? filename.slice(filename.lastIndexOf('.')).toLowerCase()
      : '';
    const isTsxFile = reactLikeExtensions.includes(fileExtension);
    let hasJsxInFile = false;

    const shouldCheckFile = () => isTsxFile || hasJsxInFile;

    const propsTypes: Map<string, Record<string, TSESTree.Node>> = new Map();
    // Track which spread types have been used in a component
    const usedSpreadTypes: Map<string, Set<string>> = new Map();
    const componentsToCheck: Array<{
      typeName: string;
      used: Set<string>;
      restUsed: boolean;
    }> = [];
    let currentComponent:
      | {
          node: TSESTree.Node;
          typeName: string;
          used: Set<string>;
          restUsed: boolean;
        }
      | null = null;

    const clearState = () => {
      propsTypes.clear();
      usedSpreadTypes.clear();
      componentsToCheck.length = 0;
      currentComponent = null;
    };

    const reportUnusedProps = (
      typeName: string,
      used: Set<string>,
      restUsed: boolean,
    ) => {
      const propsType = propsTypes.get(typeName);

      if (!propsType) {
        return;
      }

      Object.keys(propsType).forEach((prop) => {
        if (!used.has(prop)) {
          // For imported types (props that start with '...'), only report if there's no rest spread operator
          // This allows imported types to be used without being flagged when properly forwarded
          const hasRestSpread =
            restUsed ||
            Array.from(used.values()).some((usedProp) =>
              usedProp.startsWith('...'),
            );

          // Don't report unused props if:
          // 1. It's a spread type and there's a rest spread operator, OR
          // 2. It's a property from a spread type and any property from that spread type is used, OR
          // 3. It's a spread type and any of its properties are used in the component

          let shouldReport = true;

          // List of TypeScript utility types that should not be reported
          const utilityTypes = [
            'Pick',
            'Partial',
            'Required',
            'Record',
            'Exclude',
            'Extract',
            'NonNullable',
            'ReturnType',
            'InstanceType',
            'ThisType',
          ];

          // Skip reporting for generic type parameters (T, K, etc.)
          if (
            prop.startsWith('...') &&
            prop.length === 4 &&
            /^\.\.\.([A-Z])$/.test(prop)
          ) {
            // This is a generic type parameter like ...T, ...K, etc.
            shouldReport = false;
          } else if (prop.startsWith('...') && hasRestSpread) {
            shouldReport = false;
          } else if (prop.startsWith('...')) {
            // For spread types like "...GroupInfoBasic", check if any properties from this spread type are used
            const spreadTypeName = prop.substring(3); // Remove the "..." prefix

            // Skip reporting for TypeScript utility types
            if (utilityTypes.includes(spreadTypeName)) {
              shouldReport = false;
            } else {
              // Get the properties that belong to this spread type
              const spreadTypeProps = usedSpreadTypes.get(spreadTypeName);

              if (spreadTypeProps) {
                // Check if any property from this spread type is being used in the component
                const anyPropFromSpreadTypeUsed = Array.from(
                  spreadTypeProps,
                ).some((spreadProp) => used.has(spreadProp));

                if (anyPropFromSpreadTypeUsed) {
                  shouldReport = false;
                }
              }
            }
          } else {
            // Check if this prop might be from a spread type that has other properties being used
            for (const [spreadType, props] of usedSpreadTypes.entries()) {
              // Skip the current props type
              if (spreadType === typeName) continue;

              // If this prop is from a spread type
              if (props.has(prop)) {
                // Check if any other prop from this spread type is being used
                const anyPropFromSpreadTypeUsed = Array.from(props).some(
                  (spreadProp) => used.has(spreadProp),
                );

                if (anyPropFromSpreadTypeUsed) {
                  shouldReport = false;
                  break;
                }
              }
            }
          }

          if (shouldReport) {
            context.report({
              node: propsType[prop],
              messageId: 'unusedProp',
              data: { propName: prop },
            });
          }
        }
      });
    };

    return {
      TSTypeAliasDeclaration(node) {
        if (node.id.name.endsWith('Props')) {
          const props: Record<string, TSESTree.Node> = {};
          // Track which properties come from which spread type
          const spreadTypeProps: Record<string, string[]> = {};

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
                      const [baseType, pickedProps] =
                        type.typeParameters.params;
                      if (
                        baseType.type === AST_NODE_TYPES.TSTypeReference &&
                        baseType.typeName.type === AST_NODE_TYPES.Identifier
                      ) {
                        const baseTypeName = baseType.typeName.name;
                        // Extract the picked properties from the union type
                        if (pickedProps.type === AST_NODE_TYPES.TSUnionType) {
                          pickedProps.types.forEach((t) => {
                            if (
                              t.type === AST_NODE_TYPES.TSLiteralType &&
                              t.literal.type === AST_NODE_TYPES.Literal &&
                              typeof t.literal.value === 'string'
                            ) {
                              // Add each picked property as a regular prop
                              const propName = t.literal.value;
                              props[propName] = t.literal;
                              // Track that this prop comes from the base type
                              if (!spreadTypeProps[baseTypeName]) {
                                spreadTypeProps[baseTypeName] = [];
                              }
                              spreadTypeProps[baseTypeName].push(propName);
                            }
                          });
                        } else if (
                          pickedProps.type === AST_NODE_TYPES.TSLiteralType &&
                          pickedProps.literal.type === AST_NODE_TYPES.Literal &&
                          typeof pickedProps.literal.value === 'string'
                        ) {
                          // Single property pick
                          const propName = pickedProps.literal.value;
                          props[propName] = pickedProps.literal;
                          // Track that this prop comes from the base type
                          if (!spreadTypeProps[baseTypeName]) {
                            spreadTypeProps[baseTypeName] = [];
                          }
                          spreadTypeProps[baseTypeName].push(propName);
                        }
                      }
                    } else if (
                      typeName.name === 'Omit' &&
                      type.typeParameters &&
                      type.typeParameters.params.length === 2
                    ) {
                      // Handle Omit utility type in intersection
                      const [baseType, omittedProps] =
                        type.typeParameters.params;
                      if (
                        baseType.type === AST_NODE_TYPES.TSTypeReference &&
                        baseType.typeName.type === AST_NODE_TYPES.Identifier
                      ) {
                        const baseTypeName = baseType.typeName.name;

                        // Find the base type definition
                        const scope = context.getScope();
                        const variable = scope.variables.find(
                          (v) => v.name === baseTypeName,
                        );

                        if (
                          variable &&
                          variable.defs[0]?.node.type ===
                            AST_NODE_TYPES.TSTypeAliasDeclaration
                        ) {
                          // Get the list of properties to omit
                          const omittedPropNames = new Set<string>();
                          if (
                            omittedProps.type === AST_NODE_TYPES.TSUnionType
                          ) {
                            omittedProps.types.forEach((t) => {
                              if (
                                t.type === AST_NODE_TYPES.TSLiteralType &&
                                t.literal.type === AST_NODE_TYPES.Literal &&
                                typeof t.literal.value === 'string'
                              ) {
                                omittedPropNames.add(t.literal.value);
                              }
                            });
                          } else if (
                            omittedProps.type ===
                              AST_NODE_TYPES.TSLiteralType &&
                            omittedProps.literal.type ===
                              AST_NODE_TYPES.Literal &&
                            typeof omittedProps.literal.value === 'string'
                          ) {
                            omittedPropNames.add(omittedProps.literal.value);
                          }

                          // Add all properties from base type except omitted ones
                          function addBaseTypePropsInIntersection(
                            typeNode: TSESTree.TypeNode,
                          ) {
                            if (
                              typeNode.type === AST_NODE_TYPES.TSTypeLiteral
                            ) {
                              typeNode.members.forEach((member) => {
                                if (
                                  member.type ===
                                    AST_NODE_TYPES.TSPropertySignature &&
                                  member.key.type ===
                                    AST_NODE_TYPES.Identifier &&
                                  !omittedPropNames.has(member.key.name)
                                ) {
                                  props[member.key.name] = member.key;
                                }
                              });
                            }
                          }

                          addBaseTypePropsInIntersection(
                            variable.defs[0].node.typeAnnotation,
                          );
                        } else {
                          // If we can't find the base type definition, treat it as a spread type
                          props[`...${baseTypeName}`] = baseType.typeName;
                          if (!spreadTypeProps[baseTypeName]) {
                            spreadTypeProps[baseTypeName] = [];
                          }
                        }
                      }
                    } else {
                      // For referenced types in intersections, we need to find their type declaration
                      const scope = context.getScope();
                      const variable = scope.variables.find(
                        (v) => v.name === typeName.name,
                      );
                      if (
                        variable &&
                        variable.defs[0]?.node.type ===
                          AST_NODE_TYPES.TSTypeAliasDeclaration
                      ) {
                        extractProps(variable.defs[0].node.typeAnnotation);
                      } else {
                        // If we can't find the type declaration, it's likely an imported type
                        // Mark it as a forwarded prop
                        const spreadTypeName = typeName.name;
                        props[`...${spreadTypeName}`] = typeName;

                        // For imported types, we need to track individual properties that might be used
                        // from this spread type, even if we don't know what they are yet
                        if (!spreadTypeProps[spreadTypeName]) {
                          spreadTypeProps[spreadTypeName] = [];
                        }
                      }
                    }
                  }
                } else {
                  extractProps(type);
                }
              });
            } else if (typeNode.type === AST_NODE_TYPES.TSTypeReference) {
              if (typeNode.typeName.type === AST_NODE_TYPES.Identifier) {
                // List of TypeScript utility types that transform other types
                const utilityTypes = [
                  'Pick',
                  'Omit',
                  'Partial',
                  'Required',
                  'Record',
                  'Exclude',
                  'Extract',
                  'NonNullable',
                  'ReturnType',
                  'InstanceType',
                  'ThisType',
                ];

                // Skip checking for utility type parameters (T, K, etc.) as they're not actual props
                if (
                  typeNode.typeName.name.length === 1 &&
                  /^[A-Z]$/.test(typeNode.typeName.name)
                ) {
                  // This is likely a generic type parameter (T, K, etc.), not a real type
                  // Skip it to avoid false positives
                  return;
                }

                if (
                  typeNode.typeName.name === 'Pick' &&
                  typeNode.typeParameters
                ) {
                  // Handle Pick utility type
                  const [baseType, pickedProps] =
                    typeNode.typeParameters.params;
                  if (
                    baseType.type === AST_NODE_TYPES.TSTypeReference &&
                    baseType.typeName.type === AST_NODE_TYPES.Identifier
                  ) {
                    const baseTypeName = baseType.typeName.name;
                    // Extract the picked properties from the union type
                    if (pickedProps.type === AST_NODE_TYPES.TSUnionType) {
                      pickedProps.types.forEach((type) => {
                        if (
                          type.type === AST_NODE_TYPES.TSLiteralType &&
                          type.literal.type === AST_NODE_TYPES.Literal &&
                          typeof type.literal.value === 'string'
                        ) {
                          // Add each picked property as a regular prop
                          const propName = type.literal.value;
                          props[propName] = type.literal;
                          // Track that this prop comes from the base type
                          if (!spreadTypeProps[baseTypeName]) {
                            spreadTypeProps[baseTypeName] = [];
                          }
                          spreadTypeProps[baseTypeName].push(propName);
                        }
                      });
                    } else if (
                      pickedProps.type === AST_NODE_TYPES.TSLiteralType &&
                      pickedProps.literal.type === AST_NODE_TYPES.Literal &&
                      typeof pickedProps.literal.value === 'string'
                    ) {
                      // Single property pick
                      const propName = pickedProps.literal.value;
                      props[propName] = pickedProps.literal;
                      // Track that this prop comes from the base type
                      if (!spreadTypeProps[baseTypeName]) {
                        spreadTypeProps[baseTypeName] = [];
                      }
                      spreadTypeProps[baseTypeName].push(propName);
                    }
                  }
                } else if (
                  typeNode.typeName.name === 'Omit' &&
                  typeNode.typeParameters &&
                  typeNode.typeParameters.params.length === 2
                ) {
                  // Handle Omit<T, K> utility type
                  const [baseType, omittedProps] =
                    typeNode.typeParameters.params;
                  if (
                    baseType.type === AST_NODE_TYPES.TSTypeReference &&
                    baseType.typeName.type === AST_NODE_TYPES.Identifier
                  ) {
                    const baseTypeName = baseType.typeName.name;

                    // Find the base type definition
                    const scope = context.getScope();
                    const variable = scope.variables.find(
                      (v) => v.name === baseTypeName,
                    );

                    if (
                      variable &&
                      variable.defs[0]?.node.type ===
                        AST_NODE_TYPES.TSTypeAliasDeclaration
                    ) {
                      // Extract properties from the base type

                      // Get the list of properties to omit
                      const omittedPropNames = new Set<string>();
                      if (omittedProps.type === AST_NODE_TYPES.TSUnionType) {
                        omittedProps.types.forEach((type) => {
                          if (
                            type.type === AST_NODE_TYPES.TSLiteralType &&
                            type.literal.type === AST_NODE_TYPES.Literal &&
                            typeof type.literal.value === 'string'
                          ) {
                            omittedPropNames.add(type.literal.value);
                          }
                        });
                      } else if (
                        omittedProps.type === AST_NODE_TYPES.TSLiteralType &&
                        omittedProps.literal.type === AST_NODE_TYPES.Literal &&
                        typeof omittedProps.literal.value === 'string'
                      ) {
                        omittedPropNames.add(omittedProps.literal.value);
                      }

                      // Add all properties from base type except omitted ones
                      function addBaseTypeProps(typeNode: TSESTree.TypeNode) {
                        if (typeNode.type === AST_NODE_TYPES.TSTypeLiteral) {
                          typeNode.members.forEach((member) => {
                            if (
                              member.type ===
                                AST_NODE_TYPES.TSPropertySignature &&
                              member.key.type === AST_NODE_TYPES.Identifier &&
                              !omittedPropNames.has(member.key.name)
                            ) {
                              props[member.key.name] = member.key;
                            }
                          });
                        }
                      }

                      addBaseTypeProps(variable.defs[0].node.typeAnnotation);
                    } else {
                      // If we can't find the base type definition, treat it as a spread type
                      props[`...${baseTypeName}`] = baseType.typeName;
                      if (!spreadTypeProps[baseTypeName]) {
                        spreadTypeProps[baseTypeName] = [];
                      }
                    }
                  }
                } else if (
                  // Handle other utility types like Required, Partial, etc.
                  utilityTypes.includes(typeNode.typeName.name) &&
                  typeNode.typeParameters
                ) {
                  // For utility types like Required<T>, Partial<T>, we need to handle the base type
                  const baseType = typeNode.typeParameters.params[0];
                  if (
                    baseType.type === AST_NODE_TYPES.TSTypeReference &&
                    baseType.typeName.type === AST_NODE_TYPES.Identifier
                  ) {
                    const baseTypeName = baseType.typeName.name;

                    // Find the base type definition
                    const scope = context.getScope();
                    const variable = scope.variables.find(
                      (v) => v.name === baseTypeName,
                    );

                    if (
                      variable &&
                      variable.defs[0]?.node.type ===
                        AST_NODE_TYPES.TSTypeAliasDeclaration
                    ) {
                      // For Partial<T>, Required<T>, etc., add all properties from the base type
                      function addBaseTypeProps(typeNode: TSESTree.TypeNode) {
                        if (typeNode.type === AST_NODE_TYPES.TSTypeLiteral) {
                          typeNode.members.forEach((member) => {
                            if (
                              member.type ===
                                AST_NODE_TYPES.TSPropertySignature &&
                              member.key.type === AST_NODE_TYPES.Identifier
                            ) {
                              props[member.key.name] = member.key;
                            }
                          });
                        }
                      }

                      addBaseTypeProps(variable.defs[0].node.typeAnnotation);
                    } else {
                      // If we can't find the base type definition, treat it as a spread type
                      props[`...${baseTypeName}`] = baseType.typeName;
                      if (!spreadTypeProps[baseTypeName]) {
                        spreadTypeProps[baseTypeName] = [];
                      }
                    }
                  }
                } else {
                  // For referenced types like FormControlLabelProps, we need to track that these props should be forwarded
                  const spreadTypeName = typeNode.typeName.name;
                  props[`...${spreadTypeName}`] = typeNode.typeName;

                  // For imported types, we need to track individual properties that might be used
                  // from this spread type, even if we don't know what they are yet
                  if (!spreadTypeProps[spreadTypeName]) {
                    spreadTypeProps[spreadTypeName] = [];
                  }
                }
              }
            }
          }

          extractProps(node.typeAnnotation);
          propsTypes.set(node.id.name, props);

          // Store the mapping of spread types to their properties
          const typeName = node.id.name;
          usedSpreadTypes.set(typeName, new Set(Object.keys(spreadTypeProps)));

          // Store the spread type properties for later reference
          for (const [spreadType, propNames] of Object.entries(
            spreadTypeProps,
          )) {
            // Create a map entry for this spread type if it doesn't exist
            if (!usedSpreadTypes.has(spreadType)) {
              usedSpreadTypes.set(spreadType, new Set());
            }

            // Add the property names to the spread type's set
            const spreadTypeSet = usedSpreadTypes.get(spreadType)!;
            propNames.forEach((prop) => spreadTypeSet.add(prop));
          }
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
                const used = new Set<string>();
                let restUsed = false;
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
                    restUsed = true;
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
                currentComponent = { node, typeName, used, restUsed };
              }
            }
          }
        }
      },

      'VariableDeclaration:exit'(node) {
        if (currentComponent?.node === node) {
          const { typeName, used, restUsed } = currentComponent;
          componentsToCheck.push({ typeName, used, restUsed });
          currentComponent = null;
        }
      },

      JSXElement() {
        hasJsxInFile = true;
      },

      JSXFragment() {
        hasJsxInFile = true;
      },

      'Program:exit'() {
        if (!shouldCheckFile()) {
          clearState();
          return;
        }

        componentsToCheck.forEach(({ typeName, used, restUsed }) =>
          reportUnusedProps(typeName, used, restUsed),
        );

        clearState();
      },
    };
  },
});

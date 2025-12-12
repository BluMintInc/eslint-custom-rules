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
    const filename =
      (context as { filename?: string; getFilename(): string }).filename ??
      context.getFilename();
    const ruleSettings =
      ((context.settings && context.settings['no-unused-props']) as {
        reactLikeExtensions?: string[];
      }) ?? {};
    const sourceCode = context.getSourceCode();
    const reactLikeExtensions = (
      ruleSettings.reactLikeExtensions ?? ['.tsx']
    ).map((ext) => ext.toLowerCase());
    const fileExtension = filename.includes('.')
      ? filename.slice(filename.lastIndexOf('.')).toLowerCase()
      : '';
    const isTsxFile = reactLikeExtensions.includes(fileExtension);
    let hasJsxInFile = false;

    const shouldCheckFile = () => isTsxFile || hasJsxInFile;

    const UTILITY_TYPES = new Set([
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
    ]);

    const propsTypes: Map<string, Record<string, TSESTree.Node>> = new Map();
    // Track which spread types have been used in a component
    const usedSpreadTypes: Map<string, Set<string>> = new Map();
    const componentsToCheck: Array<{
      typeName: string;
      used: Set<string>;
      restUsed: boolean;
    }> = [];
    let currentComponent: {
      node: TSESTree.Node;
      typeName: string;
      used: Set<string>;
      restUsed: boolean;
    } | null = null;

    const clearState = () => {
      propsTypes.clear();
      usedSpreadTypes.clear();
      componentsToCheck.length = 0;
      currentComponent = null;
    };

    const isGenericTypeSpread = (prop: string) =>
      prop.startsWith('...') && prop.length === 4 && /^\.\.\.[A-Z]$/.test(prop);

    const hasRestSpreadUsage = (used: Set<string>, restUsed: boolean) => {
      if (restUsed) {
        return true;
      }

      for (const usedProp of used) {
        if (usedProp.startsWith('...')) {
          return true;
        }
      }

      return false;
    };

    const isAnyPropFromSpreadTypeUsed = (
      spreadTypeName: string,
      used: Set<string>,
    ) => {
      const spreadTypeProps = usedSpreadTypes.get(spreadTypeName);
      if (!spreadTypeProps) {
        return false;
      }

      for (const spreadProp of spreadTypeProps) {
        if (used.has(spreadProp)) {
          return true;
        }
      }

      return false;
    };

    const shouldSkipSpreadType = (
      prop: string,
      hasRestSpread: boolean,
      used: Set<string>,
    ) => {
      if (hasRestSpread) {
        return true;
      }

      const spreadTypeName = prop.substring(3);

      if (UTILITY_TYPES.has(spreadTypeName)) {
        return true;
      }

      return isAnyPropFromSpreadTypeUsed(spreadTypeName, used);
    };

    const shouldSkipPropFromSpreadType = (
      prop: string,
      currentTypeName: string,
      used: Set<string>,
    ) => {
      for (const [spreadType, props] of usedSpreadTypes.entries()) {
        if (spreadType === currentTypeName) continue;

        if (!props.has(prop)) {
          continue;
        }

        for (const spreadProp of props) {
          if (used.has(spreadProp)) {
            return true;
          }
        }
      }

      return false;
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

      const hasRestSpread = hasRestSpreadUsage(used, restUsed);

      Object.keys(propsType).forEach((prop) => {
        if (!used.has(prop)) {
          // For imported types (props that start with '...'), only report if there's no rest spread operator
          // This allows imported types to be used without being flagged when properly forwarded
          // Don't report unused props if:
          // 1. It's a spread type and there's a rest spread operator, OR
          // 2. It's a property from a spread type and any property from that spread type is used, OR
          // 3. It's a spread type and any of its properties are used in the component

          let shouldReport = true;

          // Skip reporting for generic type parameters (T, K, etc.)
          if (isGenericTypeSpread(prop)) {
            shouldReport = false;
          } else if (prop.startsWith('...')) {
            shouldReport = !shouldSkipSpreadType(prop, hasRestSpread, used);
          } else {
            shouldReport = !shouldSkipPropFromSpreadType(prop, typeName, used);
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

          const collectStringLiterals = (
            node: TSESTree.TypeNode,
            callback: (value: string, literalNode: TSESTree.Node) => void,
          ) => {
            if (node.type === AST_NODE_TYPES.TSUnionType) {
              node.types.forEach((type) =>
                collectStringLiterals(type, callback),
              );
              return;
            }

            if (node.type === AST_NODE_TYPES.TSIntersectionType) {
              node.types.forEach((type) => collectStringLiterals(type, callback));
              return;
            }

            if (node.type === AST_NODE_TYPES.TSTypeOperator) {
              if (node.typeAnnotation) {
                collectStringLiterals(node.typeAnnotation, callback);
              }
              return;
            }

            if ((node as { type?: string }).type === 'TSParenthesizedType') {
              const parenthesized = node as {
                typeAnnotation?: TSESTree.TypeNode;
              };
              if (parenthesized.typeAnnotation) {
                collectStringLiterals(parenthesized.typeAnnotation, callback);
              }
              return;
            }

            if (
              node.type === AST_NODE_TYPES.TSLiteralType &&
              node.literal.type === AST_NODE_TYPES.Literal &&
              typeof node.literal.value === 'string'
            ) {
              callback(node.literal.value, node.literal);
            }
          };

          const processingTypeNodes = new Set<TSESTree.TypeNode>();

          const resolveTypeAlias = (typeName: string) => {
            const scope = context.getScope();
            const variable = scope.variables.find((v) => v.name === typeName);

            if (
              variable &&
              variable.defs[0]?.node.type ===
                AST_NODE_TYPES.TSTypeAliasDeclaration
            ) {
              return variable.defs[0].node.typeAnnotation;
            }

            const programAlias = (sourceCode.ast as TSESTree.Program).body.find(
              (statement) =>
                statement.type === AST_NODE_TYPES.TSTypeAliasDeclaration &&
                statement.id.name === typeName,
            ) as TSESTree.TSTypeAliasDeclaration | undefined;
            if (programAlias) {
              return programAlias.typeAnnotation;
            }

            return null;
          };

          const addBaseTypeProps = (
            typeNode: TSESTree.TypeNode,
            shouldInclude: (name: string) => boolean = () => true,
          ) => {
            if (processingTypeNodes.has(typeNode)) {
              return;
            }

            processingTypeNodes.add(typeNode);

            const addPropIfAllowed = (name: string, node: TSESTree.Node) => {
              if (shouldInclude(name)) {
                props[name] = node;
              }
            };

            try {
              if (typeNode.type === AST_NODE_TYPES.TSTypeLiteral) {
                typeNode.members.forEach((member) => {
                  if (
                    member.type === AST_NODE_TYPES.TSPropertySignature &&
                    member.key.type === AST_NODE_TYPES.Identifier
                  ) {
                    addPropIfAllowed(member.key.name, member.key);
                  }
                });
                return;
              }

              if (
                typeNode.type === AST_NODE_TYPES.TSTypeReference &&
                typeNode.typeName.type === AST_NODE_TYPES.Identifier
              ) {
                const referenceName = typeNode.typeName.name;

                if (
                  referenceName === 'Pick' &&
                  typeNode.typeParameters &&
                  typeNode.typeParameters.params.length >= 2
                ) {
                  const [baseType, pickedProps] = typeNode.typeParameters.params;
                  const picked = new Set<string>();
                  collectStringLiterals(pickedProps, (value) =>
                    picked.add(value),
                  );
                  addBaseTypeProps(
                    baseType,
                    (name) => picked.has(name) && shouldInclude(name),
                  );
                  return;
                }

                if (
                  referenceName === 'Omit' &&
                  typeNode.typeParameters &&
                  typeNode.typeParameters.params.length >= 2
                ) {
                  const [baseType, omittedProps] =
                    typeNode.typeParameters.params;
                  const omitted = new Set<string>();
                  collectStringLiterals(omittedProps, (value) =>
                    omitted.add(value),
                  );
                  addBaseTypeProps(
                    baseType,
                    (name) => !omitted.has(name) && shouldInclude(name),
                  );
                  return;
                }

                if (
                  UTILITY_TYPES.has(referenceName) &&
                  typeNode.typeParameters?.params.length
                ) {
                  addBaseTypeProps(
                    typeNode.typeParameters.params[0],
                    shouldInclude,
                  );
                  return;
                }

                const resolvedType = resolveTypeAlias(referenceName);
                if (resolvedType) {
                  addBaseTypeProps(resolvedType, shouldInclude);
                }
                return;
              }

              if (typeNode.type === AST_NODE_TYPES.TSIntersectionType) {
                typeNode.types.forEach((type) =>
                  addBaseTypeProps(type, shouldInclude),
                );
                return;
              }

              if (typeNode.type === AST_NODE_TYPES.TSUnionType) {
                typeNode.types.forEach((type) =>
                  addBaseTypeProps(type, shouldInclude),
                );
                return;
              }

              if (
                (typeNode as { type?: string }).type === 'TSParenthesizedType'
              ) {
                const parenthesized = typeNode as {
                  typeAnnotation?: TSESTree.TypeNode;
                };
                if (parenthesized.typeAnnotation) {
                  addBaseTypeProps(
                    parenthesized.typeAnnotation,
                    shouldInclude,
                  );
                }
                return;
              }

              if (typeNode.type === AST_NODE_TYPES.TSTypeOperator) {
                if (typeNode.typeAnnotation) {
                  addBaseTypeProps(typeNode.typeAnnotation, shouldInclude);
                }
                return;
              }

              if (typeNode.type === AST_NODE_TYPES.TSIndexedAccessType) {
                addBaseTypeProps(typeNode.objectType, shouldInclude);
                collectStringLiterals(typeNode.indexType, (value, literal) =>
                  addPropIfAllowed(value, literal),
                );
                return;
              }

              if (typeNode.type === AST_NODE_TYPES.TSMappedType) {
                const { typeParameter } = typeNode;
                if (typeParameter.constraint) {
                  collectStringLiterals(
                    typeParameter.constraint,
                    (value, literal) => addPropIfAllowed(value, literal),
                  );
                }
              }
            } finally {
              processingTypeNodes.delete(typeNode);
            }
          };

          const handleOmitType = (
            baseType: TSESTree.TypeNode,
            omittedProps: TSESTree.TypeNode,
          ): void => {
            if (
              baseType.type !== AST_NODE_TYPES.TSTypeReference ||
              baseType.typeName.type !== AST_NODE_TYPES.Identifier
            ) {
              return;
            }

            const baseTypeName = baseType.typeName.name;
            const omittedPropNames = new Set<string>();

            collectStringLiterals(omittedProps, (value) =>
              omittedPropNames.add(value),
            );

            const scope = context.getScope();
            const variable = scope.variables.find(
              (v) => v.name === baseTypeName,
            );

            if (
              variable &&
              variable.defs[0]?.node.type ===
                AST_NODE_TYPES.TSTypeAliasDeclaration
            ) {
              addBaseTypeProps(
                variable.defs[0].node.typeAnnotation,
                (name) => !omittedPropNames.has(name),
              );
            } else {
              props[`...${baseTypeName}`] = baseType.typeName;
              if (!spreadTypeProps[baseTypeName]) {
                spreadTypeProps[baseTypeName] = [];
              }
            }
          };

          const handlePickType = (
            baseType: TSESTree.TypeNode,
            pickedProps: TSESTree.TypeNode,
          ): void => {
            if (
              baseType.type !== AST_NODE_TYPES.TSTypeReference ||
              baseType.typeName.type !== AST_NODE_TYPES.Identifier
            ) {
              return;
            }

            collectStringLiterals(pickedProps, (value, literal) => {
              props[value] = literal;
            });
          };

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
                      handlePickType(baseType, pickedProps);
                    } else if (
                      typeName.name === 'Omit' &&
                      type.typeParameters &&
                      type.typeParameters.params.length === 2
                    ) {
                      // Handle Omit utility type in intersection
                      const [baseType, omittedProps] =
                        type.typeParameters.params;
                      handleOmitType(baseType, omittedProps);
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
                handlePickType(baseType, pickedProps);
                } else if (
                  typeNode.typeName.name === 'Omit' &&
                  typeNode.typeParameters &&
                  typeNode.typeParameters.params.length === 2
                ) {
                  // Handle Omit<T, K> utility type
                  const [baseType, omittedProps] =
                    typeNode.typeParameters.params;
                  handleOmitType(baseType, omittedProps);
                } else if (
                  // Handle other utility types like Required, Partial, etc.
                  UTILITY_TYPES.has(typeNode.typeName.name) &&
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

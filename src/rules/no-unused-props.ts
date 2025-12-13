import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type ParenthesizedTypeNode = TSESTree.TypeNode & {
  typeAnnotation: TSESTree.TypeNode;
};

const PAREN_TYPE =
  (AST_NODE_TYPES as unknown as Record<string, string>).TSParenthesizedType ??
  'TSParenthesizedType';

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
    const componentToReferencedSpreadTypeNames: Map<string, Set<string>> =
      new Map();
    const spreadTypeToPropNames: Map<string, Set<string>> = new Map();
    const processingTypeAliases = new Set<string>();
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
      componentToReferencedSpreadTypeNames.clear();
      spreadTypeToPropNames.clear();
      processingTypeAliases.clear();
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

    const isTSParenthesizedType = (
      node: TSESTree.TypeNode,
    ): node is ParenthesizedTypeNode =>
      (node as { type?: string }).type === PAREN_TYPE &&
      (node as { typeAnnotation?: unknown }).typeAnnotation != null;

    const isAnyPropFromSpreadTypeUsed = (
      spreadTypeName: string,
      used: Set<string>,
    ) => {
      const spreadTypeProps = spreadTypeToPropNames.get(spreadTypeName);
      if (!spreadTypeProps || spreadTypeProps.size === 0) {
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
      const spreadTypes =
        componentToReferencedSpreadTypeNames.get(currentTypeName);
      if (!spreadTypes) return false;

      for (const spreadType of spreadTypes) {
        const spreadProps = spreadTypeToPropNames.get(spreadType);
        if (!spreadProps || !spreadProps.has(prop)) {
          continue;
        }

        for (const spreadProp of spreadProps) {
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
        if (!node.id.name.endsWith('Props')) {
          return;
        }
        if (processingTypeAliases.has(node.id.name)) {
          return;
        }
        processingTypeAliases.add(node.id.name);
        try {
          const props: Record<string, TSESTree.Node> = {};
          // Track which properties come from which spread type
          const spreadTypeProps: Record<string, string[]> = {};
          const visitingTypeReferences = new Set<string>();

          const addBaseTypeProps = (
            typeNode: TSESTree.TypeNode,
            shouldInclude: (name: string) => boolean = () => true,
          ): boolean => {
            const visitingTypeNames = new Set<string>();

            const visit = (node: TSESTree.TypeNode): boolean => {
              if (isTSParenthesizedType(node)) {
                return visit(node.typeAnnotation);
              }

              switch (node.type) {
                case AST_NODE_TYPES.TSTypeLiteral: {
                  let added = false;
                  node.members.forEach((member) => {
                    if (
                      member.type === AST_NODE_TYPES.TSPropertySignature &&
                      member.key.type === AST_NODE_TYPES.Identifier &&
                      shouldInclude(member.key.name)
                    ) {
                      props[member.key.name] = member.key;
                      added = true;
                    }
                  });
                  return added;
                }
                case AST_NODE_TYPES.TSIntersectionType:
                case AST_NODE_TYPES.TSUnionType: {
                  let added = false;
                  node.types.forEach((child) => {
                    if (visit(child)) {
                      added = true;
                    }
                  });
                  return added;
                }
                case AST_NODE_TYPES.TSTypeReference: {
                  if (node.typeName.type !== AST_NODE_TYPES.Identifier) {
                    return false;
                  }
                  const typeIdentifier = node.typeName;
                  if (visitingTypeNames.has(typeIdentifier.name)) {
                    return false;
                  }
                  visitingTypeNames.add(typeIdentifier.name);
                  try {
                    const scope = context.getScope();
                    const variable = scope.variables.find(
                      (v) => v.name === typeIdentifier.name,
                    );
                    const typeAliasDef = variable?.defs.find(
                      (def) =>
                        def.node.type === AST_NODE_TYPES.TSTypeAliasDeclaration,
                    );
                    const typeAliasNode =
                      typeAliasDef?.node.type ===
                      AST_NODE_TYPES.TSTypeAliasDeclaration
                        ? (typeAliasDef.node as TSESTree.TSTypeAliasDeclaration)
                        : null;
                    if (typeAliasNode?.typeAnnotation) {
                      return visit(typeAliasNode.typeAnnotation);
                    }
                    return false;
                  } finally {
                    visitingTypeNames.delete(typeIdentifier.name);
                  }
                }
                default:
                  return false;
              }
            };

            return visit(typeNode);
          };

          const handleOmitType = (
            baseType: TSESTree.TypeNode,
            omittedProps: TSESTree.TypeNode,
          ): void => {
            const baseTypeName =
              baseType.type === AST_NODE_TYPES.TSTypeReference &&
              baseType.typeName.type === AST_NODE_TYPES.Identifier
                ? baseType.typeName.name
                : null;
            const sourceCode = context.getSourceCode();
            const baseTypeRefText =
              baseType.type === AST_NODE_TYPES.TSTypeReference
                ? sourceCode.getText(baseType.typeName)
                : null;
            const spreadKey = baseTypeName ?? baseTypeRefText;
            const omittedPropNames = new Set<string>();

            let canComputeOmittedProps = false;

            if (omittedProps.type === AST_NODE_TYPES.TSUnionType) {
              canComputeOmittedProps = omittedProps.types.every(
                (type) =>
                  type.type === AST_NODE_TYPES.TSLiteralType &&
                  type.literal.type === AST_NODE_TYPES.Literal &&
                  typeof type.literal.value === 'string',
              );

              if (canComputeOmittedProps) {
                omittedProps.types.forEach((type) => {
                  if (
                    type.type === AST_NODE_TYPES.TSLiteralType &&
                    type.literal.type === AST_NODE_TYPES.Literal &&
                    typeof type.literal.value === 'string'
                  ) {
                    omittedPropNames.add(type.literal.value);
                  }
                });
              }
            } else if (
              omittedProps.type === AST_NODE_TYPES.TSLiteralType &&
              omittedProps.literal.type === AST_NODE_TYPES.Literal &&
              typeof omittedProps.literal.value === 'string'
            ) {
              canComputeOmittedProps = true;
              omittedPropNames.add(omittedProps.literal.value);
            }

            if (!canComputeOmittedProps) {
              if (spreadKey) {
                props[`...${spreadKey}`] =
                  baseType.type === AST_NODE_TYPES.TSTypeReference
                    ? baseType.typeName
                    : baseType;
                spreadTypeProps[spreadKey] ??= [];
                return;
              }
              addBaseTypeProps(baseType);
              return;
            }

            const added = addBaseTypeProps(
              baseType,
              (name) => !omittedPropNames.has(name),
            );

            if (added) {
              return;
            }

            if (!spreadKey) {
              return;
            }

            props[`...${spreadKey}`] =
              baseType.type === AST_NODE_TYPES.TSTypeReference
                ? baseType.typeName
                : baseType;
            spreadTypeProps[spreadKey] ??= [];
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
                        if (visitingTypeReferences.has(typeName.name)) {
                          return;
                        }
                        visitingTypeReferences.add(typeName.name);
                        extractProps(variable.defs[0].node.typeAnnotation);
                        visitingTypeReferences.delete(typeName.name);
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
                      const added = addBaseTypeProps(
                        variable.defs[0].node.typeAnnotation,
                      );
                      if (!added) {
                        props[`...${baseTypeName}`] = baseType.typeName;
                        spreadTypeProps[baseTypeName] ??= [];
                      }
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

          const typeName = node.id.name;
          componentToReferencedSpreadTypeNames.set(
            typeName,
            new Set(Object.keys(spreadTypeProps)),
          );

          for (const [spreadType, propNames] of Object.entries(
            spreadTypeProps,
          )) {
            if (!spreadTypeToPropNames.has(spreadType)) {
              spreadTypeToPropNames.set(spreadType, new Set());
            }

            const spreadTypeSet = spreadTypeToPropNames.get(spreadType)!;
            propNames.forEach((prop) => spreadTypeSet.add(prop));
          }
        } finally {
          processingTypeAliases.delete(node.id.name);
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

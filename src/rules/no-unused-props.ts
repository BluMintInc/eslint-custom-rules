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
      unsupportedPropsShape:
        "What's wrong: The rule cannot enumerate any props when expanding \"{{typeName}}\" (it resolved to {{actualType}}).\n" +
        'Why it matters: Props hidden behind this shape may be missed or misreported, so the rule cannot reliably flag unused props.\n' +
        'How to fix: Model the props alias as a type literal (for example, `{ foo: string }`) or refactor the alias so its members are visible before applying utility types like Omit or Partial.',
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
    const deferredReports: Array<() => void> = [];

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

    // Marks spread types whose members cannot be enumerated so unknown props still count as used
    const UNKNOWN_SPREAD_PROP = '__unknown_spread_prop__';

    const propsTypes: Map<string, Record<string, TSESTree.Node>> = new Map();
    // Track which spread types have been used in a component
    const usedSpreadTypes: Map<string, Set<string>> = new Map();
    const componentsToCheck: Array<{
      typeName: string;
      used: Set<string>;
      restUsed: boolean;
    }> = [];
    const componentStack: Array<{
      node: TSESTree.Node;
      typeName: string;
      used: Set<string>;
      restUsed: boolean;
    }> = [];

    const clearState = () => {
      propsTypes.clear();
      usedSpreadTypes.clear();
      componentsToCheck.length = 0;
      componentStack.length = 0;
      deferredReports.length = 0;
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
      knownProps: Set<string>,
    ) => {
      const spreadTypeProps = usedSpreadTypes.get(spreadTypeName);
      const hasUnknownMarker =
        spreadTypeProps?.has(UNKNOWN_SPREAD_PROP) ?? false;

      if (spreadTypeProps?.size) {
        for (const spreadProp of spreadTypeProps) {
          if (spreadProp === UNKNOWN_SPREAD_PROP) {
            continue;
          }

          if (used.has(spreadProp)) {
            return true;
          }
        }
      }

      if (hasUnknownMarker) {
        for (const usedProp of used) {
          if (!knownProps.has(usedProp)) {
            return true;
          }
        }
      }

      return false;
    };

    const shouldSkipSpreadType = (
      prop: string,
      hasRestSpread: boolean,
      used: Set<string>,
      knownProps: Set<string>,
    ) => {
      if (hasRestSpread) {
        return true;
      }

      const spreadTypeName = prop.substring(3);

      if (UTILITY_TYPES.has(spreadTypeName)) {
        return true;
      }

      return isAnyPropFromSpreadTypeUsed(spreadTypeName, used, knownProps);
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

      const knownProps = new Set(
        Object.keys(propsType).filter((prop) => !prop.startsWith('...')),
      );
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
            shouldReport = !shouldSkipSpreadType(
              prop,
              hasRestSpread,
              used,
              knownProps,
            );
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

          const ensureSpreadTypeEntry = (
            spreadTypeName: string,
            spreadTypePropsMap: Record<string, string[]>,
          ) => {
            spreadTypePropsMap[spreadTypeName] ??= [];
          };

          const addToSpreadTypeProps = (
            spreadTypeName: string,
            propName: string,
            spreadTypePropsMap: Record<string, string[]>,
          ) => {
            ensureSpreadTypeEntry(spreadTypeName, spreadTypePropsMap);
            const props = spreadTypePropsMap[spreadTypeName];

            if (!props.includes(propName)) {
              props.push(propName);
            }
          };

          const describeTypeNode = (typeNode: TSESTree.TypeNode): string => {
            switch (typeNode.type) {
              case AST_NODE_TYPES.TSTypeLiteral:
                return 'type literal';
              case AST_NODE_TYPES.TSIntersectionType:
                return 'intersection type';
              case AST_NODE_TYPES.TSTypeReference:
                return 'type reference';
              case AST_NODE_TYPES.TSUnionType:
                return 'union type';
              case AST_NODE_TYPES.TSArrayType:
                return 'array type';
              case AST_NODE_TYPES.TSTupleType:
                return 'tuple type';
              case AST_NODE_TYPES.TSFunctionType:
                return 'function type';
              case AST_NODE_TYPES.TSIndexedAccessType:
                return 'indexed access type';
              case AST_NODE_TYPES.TSTypeOperator:
                return `${typeNode.operator.toLowerCase()} type`;
              default: {
                // Strip TS prefix and add spaces between capitals for readability
                const withoutPrefix = typeNode.type.replace(/^TS/, '');
                return withoutPrefix
                  .replace(/([A-Z])/g, ' $1')
                  .toLowerCase()
                  .trim();
              }
            }
          };

          const combinePredicates =
            (...predicates: Array<(name: string) => boolean>) =>
            (name: string) =>
              predicates.every((predicate) => predicate(name));

          const extractOmittedPropNames = (
            omittedProps: TSESTree.TypeNode,
          ): Set<string> => {
            const names = new Set<string>();

            if (omittedProps.type === AST_NODE_TYPES.TSUnionType) {
              omittedProps.types.forEach((type) => {
                if (
                  type.type === AST_NODE_TYPES.TSLiteralType &&
                  type.literal.type === AST_NODE_TYPES.Literal &&
                  typeof type.literal.value === 'string'
                ) {
                  names.add(type.literal.value);
                }
              });
            } else if (
              omittedProps.type === AST_NODE_TYPES.TSLiteralType &&
              omittedProps.literal.type === AST_NODE_TYPES.Literal &&
              typeof omittedProps.literal.value === 'string'
            ) {
              names.add(omittedProps.literal.value);
            }

            return names;
          };

          const extractPickedPropNames = (
            pickedProps: TSESTree.TypeNode,
          ): Set<string> => {
            const names = new Set<string>();

            if (pickedProps.type === AST_NODE_TYPES.TSUnionType) {
              pickedProps.types.forEach((type) => {
                if (
                  type.type === AST_NODE_TYPES.TSLiteralType &&
                  type.literal.type === AST_NODE_TYPES.Literal &&
                  typeof type.literal.value === 'string'
                ) {
                  names.add(type.literal.value);
                }
              });
            } else if (
              pickedProps.type === AST_NODE_TYPES.TSLiteralType &&
              pickedProps.literal.type === AST_NODE_TYPES.Literal &&
              typeof pickedProps.literal.value === 'string'
            ) {
              names.add(pickedProps.literal.value);
            }

            return names;
          };

          const addBaseTypeProps = (
            typeNode: TSESTree.TypeNode,
            propsMap: Record<string, TSESTree.Node>,
            shouldInclude: (name: string) => boolean = () => true,
            sourceName?: string,
          ) => {
            const visitedAliases = new Set<string>();

            type CollectResult = { added: boolean; fullySupported: boolean };

            const mergeCollectResults = (
              acc: CollectResult,
              result: CollectResult,
            ): CollectResult => ({
              added: acc.added || result.added,
              fullySupported: acc.fullySupported && result.fullySupported,
            });

            const collectPropsFromTypeLiteral = (
              node: TSESTree.TSTypeLiteral,
              includePredicate: (name: string) => boolean,
            ): CollectResult => {
              let added = false;

              node.members.forEach((member) => {
                if (
                  member.type === AST_NODE_TYPES.TSPropertySignature &&
                  member.key.type === AST_NODE_TYPES.Identifier &&
                  includePredicate(member.key.name)
                ) {
                  propsMap[member.key.name] = member.key;
                  added = true;
                }
              });

              return { added, fullySupported: true };
            };

            const collectPropsFromIntersection = (
              node: TSESTree.TSIntersectionType,
              includePredicate: (name: string) => boolean,
            ): CollectResult =>
              node.types.reduce<CollectResult>(
                (acc, type) =>
                  mergeCollectResults(acc, collectProps(type, includePredicate)),
                { added: false, fullySupported: true },
              );

            const collectPropsFromTypeReference = (
              node: TSESTree.TSTypeReference,
              includePredicate: (name: string) => boolean,
            ): CollectResult => {
              if (node.typeName.type !== AST_NODE_TYPES.Identifier) {
                return { added: false, fullySupported: false };
              }

              const referenceName = node.typeName.name;

              if (
                (referenceName === 'Partial' || referenceName === 'Required') &&
                node.typeParameters?.params[0]
              ) {
                return collectProps(node.typeParameters.params[0], includePredicate);
              }

              if (
                referenceName === 'Omit' &&
                node.typeParameters?.params.length === 2
              ) {
                const [base, omitted] = node.typeParameters.params;
                const omittedNames = extractOmittedPropNames(omitted);
                const combinedInclude = combinePredicates(
                  includePredicate,
                  (name) => !omittedNames.has(name),
                );

                return collectProps(base, combinedInclude);
              }

              if (
                referenceName === 'Pick' &&
                node.typeParameters?.params.length === 2
              ) {
                const [base, pickedProps] = node.typeParameters.params;
                const pickedNames = extractPickedPropNames(pickedProps);
                const combinedInclude = combinePredicates(
                  includePredicate,
                  (name) => pickedNames.size === 0 || pickedNames.has(name),
                );

                return collectProps(base, combinedInclude);
              }

              if (visitedAliases.has(referenceName)) {
                return { added: false, fullySupported: true };
              }

              visitedAliases.add(referenceName);

              const scope = context.getScope();
              const variable = scope.variables.find(
                (v) => v.name === referenceName,
              );

              if (
                variable &&
                variable.defs[0]?.node.type ===
                  AST_NODE_TYPES.TSTypeAliasDeclaration
              ) {
                return collectProps(
                  variable.defs[0].node.typeAnnotation,
                  includePredicate,
                );
              }

              return { added: false, fullySupported: false };
            };

            function collectProps(
              node: TSESTree.TypeNode,
              includePredicate: (name: string) => boolean,
            ): CollectResult {
              switch (node.type) {
                case AST_NODE_TYPES.TSTypeLiteral:
                  return collectPropsFromTypeLiteral(node, includePredicate);
                case AST_NODE_TYPES.TSIntersectionType:
                  return collectPropsFromIntersection(node, includePredicate);
                case AST_NODE_TYPES.TSTypeReference:
                  return collectPropsFromTypeReference(node, includePredicate);
                default:
                  return { added: false, fullySupported: false };
              }
            }

            const result = collectProps(typeNode, shouldInclude);

            if (!result.fullySupported) {
              deferredReports.push(() =>
                context.report({
                  node: typeNode,
                  messageId: 'unsupportedPropsShape',
                  data: {
                    typeName: sourceName ?? 'props type',
                    actualType: describeTypeNode(typeNode),
                  },
                }),
              );
            }
          };

          const handleOmitType = (
            baseType: TSESTree.TypeNode,
            omittedProps: TSESTree.TypeNode,
            propsMap: Record<string, TSESTree.Node>,
            spreadTypePropsMap: Record<string, string[]>,
          ): void => {
            if (
              baseType.type !== AST_NODE_TYPES.TSTypeReference ||
              baseType.typeName.type !== AST_NODE_TYPES.Identifier
            ) {
              return;
            }

            const baseTypeName = baseType.typeName.name;
            const omittedPropNames = extractOmittedPropNames(omittedProps);
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
                propsMap,
                (name) => !omittedPropNames.has(name),
                baseTypeName,
              );
              return;
            }

            propsMap[`...${baseTypeName}`] = baseType.typeName;
            ensureSpreadTypeEntry(baseTypeName, spreadTypePropsMap);
            addToSpreadTypeProps(
              baseTypeName,
              UNKNOWN_SPREAD_PROP,
              spreadTypePropsMap,
            );
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
                              addToSpreadTypeProps(
                                baseTypeName,
                                propName,
                                spreadTypeProps,
                              );
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
                          addToSpreadTypeProps(
                            baseTypeName,
                            propName,
                            spreadTypeProps,
                          );
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
                      handleOmitType(
                        baseType,
                        omittedProps,
                        props,
                        spreadTypeProps,
                      );
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
                        ensureSpreadTypeEntry(spreadTypeName, spreadTypeProps);
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
                          addToSpreadTypeProps(
                            baseTypeName,
                            propName,
                            spreadTypeProps,
                          );
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
                      addToSpreadTypeProps(
                        baseTypeName,
                        propName,
                        spreadTypeProps,
                      );
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
                  handleOmitType(
                    baseType,
                    omittedProps,
                    props,
                    spreadTypeProps,
                  );
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
                      const includeAllProps = () => true;
                      // For Partial<T>, Required<T>, etc., add all properties from the base type
                      addBaseTypeProps(
                        variable.defs[0].node.typeAnnotation,
                        props,
                        includeAllProps,
                        baseTypeName,
                      );
                    } else {
                      // If we can't find the base type definition, treat it as a spread type
                      props[`...${baseTypeName}`] = baseType.typeName;
                      ensureSpreadTypeEntry(baseTypeName, spreadTypeProps);
                    }
                  }
                } else {
                  // For referenced types like FormControlLabelProps, we need to track that these props should be forwarded
                  const spreadTypeName = typeNode.typeName.name;
                  props[`...${spreadTypeName}`] = typeNode.typeName;

                  // For imported types, we need to track individual properties that might be used
                  // from this spread type, even if we don't know what they are yet
                  ensureSpreadTypeEntry(spreadTypeName, spreadTypeProps);
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
                componentStack.push({ node, typeName, used, restUsed });
              }
            }
          }
        }
      },

      'VariableDeclaration:exit'(node) {
        const top = componentStack[componentStack.length - 1];
        if (top?.node === node) {
          const { typeName, used, restUsed } = top;
          componentsToCheck.push({ typeName, used, restUsed });
          componentStack.pop();
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

        deferredReports.forEach((report) => report());

        componentsToCheck.forEach(({ typeName, used, restUsed }) =>
          reportUnusedProps(typeName, used, restUsed),
        );

        clearState();
      },
    };
  },
});

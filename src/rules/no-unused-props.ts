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

    const UTILITY_TYPES = new Set(['Partial', 'Required', 'NonNullable', 'Readonly']);

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

    const isUnknownSpreadTypeContributingUsedProps = (
      propsType: Record<string, TSESTree.Node> | undefined,
      used: Set<string>,
    ) => {
      if (!propsType) {
        return false;
      }

      // When spread props are unknown (imported/external), treat any destructured
      // identifier that is not declared in the current props type as a signal
      // that the spread type contributes used properties.
      const knownPropNames = new Set(
        Object.keys(propsType).filter((name) => !name.startsWith('...')),
      );

      for (const usedProp of used) {
        if (!knownPropNames.has(usedProp)) {
          return true;
        }
      }

      return false;
    };

    const shouldSkipSpreadType = (
      prop: string,
      hasRestSpread: boolean,
      used: Set<string>,
      propsType: Record<string, TSESTree.Node> | undefined,
    ) => {
      if (hasRestSpread) {
        return true;
      }

      const spreadTypeName = prop.substring(3);

      if (UTILITY_TYPES.has(spreadTypeName)) {
        return true;
      }

      const spreadProps = usedSpreadTypes.get(spreadTypeName);
      if (spreadProps && spreadProps.size > 0) {
        return isAnyPropFromSpreadTypeUsed(spreadTypeName, used);
      }

      return isUnknownSpreadTypeContributingUsedProps(propsType, used);
    };

    const shouldSkipPropFromSpreadType = (
      prop: string,
      currentTypeName: string,
      used: Set<string>,
    ) => {
      const currentProps = propsTypes.get(currentTypeName);

      for (const [spreadType, props] of usedSpreadTypes.entries()) {
        if (spreadType === currentTypeName) continue;

        if (!currentProps || !currentProps[`...${spreadType}`]) {
          continue;
        }

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
            shouldReport = !shouldSkipSpreadType(
              prop,
              hasRestSpread,
              used,
              propsType,
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
          const spreadTypeProps: Record<string, Set<string>> = {};
          const typeParameterNames = new Set(
            node.typeParameters?.params.map((param) => param.name.name) ?? [],
          );

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
          const resolveTypeAliasCache = new Map<string, TSESTree.TypeNode | null>();

          const resolveTypeAlias = (typeName: string) => {
            if (resolveTypeAliasCache.has(typeName)) {
              return resolveTypeAliasCache.get(typeName) ?? null;
            }

            const scope = context.getScope();
            const variable = scope.variables.find((v) => v.name === typeName);

            if (
              variable &&
              variable.defs[0]?.node.type ===
                AST_NODE_TYPES.TSTypeAliasDeclaration
            ) {
              const resolved = variable.defs[0].node.typeAnnotation;
              resolveTypeAliasCache.set(typeName, resolved);
              return resolved;
            }

            const programAlias = (sourceCode.ast as TSESTree.Program).body.find(
              (statement) =>
                statement.type === AST_NODE_TYPES.TSTypeAliasDeclaration &&
                statement.id.name === typeName,
            ) as TSESTree.TSTypeAliasDeclaration | undefined;
            if (programAlias) {
              const resolved = programAlias.typeAnnotation;
              resolveTypeAliasCache.set(typeName, resolved);
              return resolved;
            }

            resolveTypeAliasCache.set(typeName, null);
            return null;
          };

          const getPropertySignatureName = (
            member: TSESTree.TSPropertySignature,
          ): string | null => {
            if (member.key.type === AST_NODE_TYPES.Identifier) {
              return member.key.name;
            }

            if (
              member.key.type === AST_NODE_TYPES.Literal &&
              typeof member.key.value === 'string'
            ) {
              return member.key.value;
            }

            return null;
          };

          const addBaseTypeProps = (
            typeNode: TSESTree.TypeNode,
            shouldInclude: (name: string) => boolean = () => true,
            originSpreadTypeName?: string,
          ) => {
            if (processingTypeNodes.has(typeNode)) {
              return;
            }

            processingTypeNodes.add(typeNode);

            const addPropIfAllowed = (name: string, node: TSESTree.Node) => {
              if (shouldInclude(name)) {
                props[name] = node;
                if (!originSpreadTypeName) return;

                if (!spreadTypeProps[originSpreadTypeName]) {
                  spreadTypeProps[originSpreadTypeName] = new Set();
                }

                spreadTypeProps[originSpreadTypeName].add(name);
              }
            };

            const resolvePropertyTypes = (
              node: TSESTree.TypeNode,
              propertyName: string,
            ): TSESTree.TypeNode[] => {
              if (node.type === AST_NODE_TYPES.TSTypeLiteral) {
                const matchingMember = node.members.find(
                  (member): member is TSESTree.TSPropertySignature =>
                    member.type === AST_NODE_TYPES.TSPropertySignature &&
                    getPropertySignatureName(member) === propertyName,
                );
                if (
                  matchingMember?.typeAnnotation &&
                  matchingMember.typeAnnotation.type === AST_NODE_TYPES.TSTypeAnnotation
                ) {
                  return [matchingMember.typeAnnotation.typeAnnotation];
                }
                return [];
              }

              if (
                node.type === AST_NODE_TYPES.TSTypeReference &&
                node.typeName.type === AST_NODE_TYPES.Identifier
              ) {
                const resolved = resolveTypeAlias(node.typeName.name);
                if (resolved) {
                  return resolvePropertyTypes(resolved, propertyName);
                }
                // Treat unresolved references as forwarded spread types to avoid false positives
                const referenceName = node.typeName.name;
                props[`...${referenceName}`] = node.typeName;
                if (!spreadTypeProps[referenceName]) {
                  spreadTypeProps[referenceName] = new Set();
                }
                return [];
              }

              if (node.type === AST_NODE_TYPES.TSIntersectionType) {
                return node.types.flatMap((subType) =>
                  resolvePropertyTypes(subType, propertyName),
                );
              }

              if (node.type === AST_NODE_TYPES.TSUnionType) {
                return node.types.flatMap((subType) =>
                  resolvePropertyTypes(subType, propertyName),
                );
              }

              if ((node as { type?: string }).type === 'TSParenthesizedType') {
                const parenthesized = node as {
                  typeAnnotation?: TSESTree.TypeNode;
                };
                if (parenthesized.typeAnnotation) {
                  return resolvePropertyTypes(
                    parenthesized.typeAnnotation,
                    propertyName,
                  );
                }
              }

              if (node.type === AST_NODE_TYPES.TSTypeOperator) {
                if (node.typeAnnotation) {
                  return resolvePropertyTypes(node.typeAnnotation, propertyName);
                }
              }

              return [];
            };

            try {
              if (typeNode.type === AST_NODE_TYPES.TSTypeLiteral) {
                typeNode.members.forEach((member) => {
                  if (
                    member.type === AST_NODE_TYPES.TSPropertySignature
                  ) {
                    const propName = getPropertySignatureName(member);
                    if (propName) {
                      addPropIfAllowed(propName, member.key);
                    }
                  }
                });
                return;
              }

              if (
                typeNode.type === AST_NODE_TYPES.TSTypeReference &&
                typeNode.typeName.type === AST_NODE_TYPES.Identifier
              ) {
                if (typeParameterNames.has(typeNode.typeName.name)) {
                  return;
                }
                const referenceName = typeNode.typeName.name;
                const nextOrigin = originSpreadTypeName ?? referenceName;
                const typeParameters = typeNode.typeParameters?.params;

                if (
                  referenceName === 'Pick' &&
                  typeNode.typeParameters &&
                  typeNode.typeParameters.params.length >= 2
                ) {
                  const [baseType, pickedProps] = typeNode.typeParameters.params;
                  const picked = new Set<string>();
                  const baseTypeOrigin =
                    originSpreadTypeName ||
                    (baseType.type === AST_NODE_TYPES.TSTypeReference &&
                    baseType.typeName.type === AST_NODE_TYPES.Identifier
                      ? baseType.typeName.name
                      : referenceName);
                  collectStringLiterals(pickedProps, (value) =>
                    picked.add(value),
                  );
                  addBaseTypeProps(
                    baseType,
                    (name) => picked.has(name) && shouldInclude(name),
                    baseTypeOrigin,
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
                  const baseTypeOrigin =
                    originSpreadTypeName ||
                    (baseType.type === AST_NODE_TYPES.TSTypeReference &&
                    baseType.typeName.type === AST_NODE_TYPES.Identifier
                      ? baseType.typeName.name
                      : referenceName);
                  collectStringLiterals(omittedProps, (value) =>
                    omitted.add(value),
                  );
                  addBaseTypeProps(
                    baseType,
                    (name) => !omitted.has(name) && shouldInclude(name),
                    baseTypeOrigin,
                  );
                  return;
                }

                if (
                  referenceName === 'Record' &&
                  typeParameters &&
                  typeParameters.length >= 2
                ) {
                  const [keysType] = typeParameters;
                  collectStringLiterals(keysType, (value, literal) =>
                    addPropIfAllowed(value, literal),
                  );
                  return;
                }

                if (
                  UTILITY_TYPES.has(referenceName) &&
                  typeParameters &&
                  typeParameters.length
                ) {
                  const [baseType] = typeParameters;
                  const baseTypeOrigin =
                    originSpreadTypeName ||
                    (baseType.type === AST_NODE_TYPES.TSTypeReference &&
                    baseType.typeName.type === AST_NODE_TYPES.Identifier
                      ? baseType.typeName.name
                      : referenceName);
                  addBaseTypeProps(
                    baseType,
                    shouldInclude,
                    baseTypeOrigin,
                  );
                  return;
                }

                const resolvedType = resolveTypeAlias(referenceName);
                if (resolvedType) {
                  addBaseTypeProps(resolvedType, shouldInclude, nextOrigin);
                  return;
                }
                // If unresolved (likely imported/external), treat as a forwarded spread type
                props[`...${referenceName}`] = typeNode.typeName;
                if (!spreadTypeProps[referenceName]) {
                  spreadTypeProps[referenceName] = new Set();
                }
                return;
              }

              if (typeNode.type === AST_NODE_TYPES.TSIntersectionType) {
                typeNode.types.forEach((type) =>
                  addBaseTypeProps(type, shouldInclude, originSpreadTypeName),
                );
                return;
              }

              if (typeNode.type === AST_NODE_TYPES.TSUnionType) {
                typeNode.types.forEach((type) =>
                  addBaseTypeProps(type, shouldInclude, originSpreadTypeName),
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
                    originSpreadTypeName,
                  );
                }
                return;
              }

              if (typeNode.type === AST_NODE_TYPES.TSTypeOperator) {
                if (typeNode.typeAnnotation) {
                  addBaseTypeProps(
                    typeNode.typeAnnotation,
                    shouldInclude,
                    originSpreadTypeName,
                  );
                }
                return;
              }

              if (typeNode.type === AST_NODE_TYPES.TSIndexedAccessType) {
                const indexNames = new Set<string>();
                collectStringLiterals(typeNode.indexType, (value) =>
                  indexNames.add(value),
                );
                const indexedOrigin =
                  originSpreadTypeName ||
                  (typeNode.objectType.type === AST_NODE_TYPES.TSTypeReference &&
                  typeNode.objectType.typeName.type === AST_NODE_TYPES.Identifier
                    ? typeNode.objectType.typeName.name
                    : undefined);

                if (indexNames.size === 0) {
                  if (
                    typeNode.objectType.type === AST_NODE_TYPES.TSTypeReference &&
                    typeNode.objectType.typeName.type === AST_NODE_TYPES.Identifier
                  ) {
                    const referenceName = typeNode.objectType.typeName.name;
                    props[`...${referenceName}`] = typeNode.objectType.typeName;
                    if (!spreadTypeProps[referenceName]) {
                      spreadTypeProps[referenceName] = new Set();
                    }
                  }
                  return;
                }

                indexNames.forEach((propName) => {
                  const propertyTypes = resolvePropertyTypes(
                    typeNode.objectType,
                    propName,
                  );
                  if (propertyTypes.length === 0) {
                    return;
                  }
                  propertyTypes.forEach((propType) =>
                    addBaseTypeProps(
                      propType,
                      shouldInclude,
                      indexedOrigin,
                    ),
                  );
                });
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

          const extractProps = (typeNode: TSESTree.TypeNode) => {
            addBaseTypeProps(typeNode);
          };

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
                    prop.key.type === AST_NODE_TYPES.Literal &&
                    typeof prop.key.value === 'string'
                  ) {
                    used.add(prop.key.value);
                  } else if (
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

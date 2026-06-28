import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';

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
        'Prop "{{propName}}" is declared in the component Props type but never used inside the component body. Unused props make the component API misleading: callers keep passing values that are ignored and reviewers assume behavior that is not implemented. Remove "{{propName}}" from the Props type, consume it in the component, or forward it with a rest spread (e.g., `const MyComponent = ({ usedProp, ...rest }: Props) => <Child {...rest} />`).',
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
    const normalizeExtension = (ext: string): string | null => {
      const trimmed = ext.trim().toLowerCase();

      if (!trimmed) {
        return null;
      }

      return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
    };
    const reactLikeExtensions = Array.from(
      new Set(
        (ruleSettings.reactLikeExtensions ?? ['.tsx'])
          .map(normalizeExtension)
          .filter((ext): ext is string => Boolean(ext)),
      ),
    );
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

    // Marks spread types whose members cannot be enumerated so unknown used props
    // can still count as "using something" from the imported/spread type.
    const UNKNOWN_SPREAD_PROP = '__unknown_spread_prop__';

    const markUnknownSpreadType = (
      spreadTypeProps: Record<string, string[]>,
      spreadTypeName: string,
    ) => {
      spreadTypeProps[spreadTypeName] ??= [];
      if (!spreadTypeProps[spreadTypeName].includes(UNKNOWN_SPREAD_PROP)) {
        spreadTypeProps[spreadTypeName].push(UNKNOWN_SPREAD_PROP);
      }
    };

    const isTypeAliasDeclaration = (
      node: TSESTree.Node | undefined,
    ): node is TSESTree.TSTypeAliasDeclaration =>
      node?.type === AST_NODE_TYPES.TSTypeAliasDeclaration;

    const findTypeAliasDeclaration = (
      typeName: string,
    ): TSESTree.TSTypeAliasDeclaration | null => {
      let scope: TSESLint.Scope.Scope | null = context.getScope();

      while (scope) {
        const variable =
          scope.set?.get(typeName) ??
          scope.variables.find((v) => v.name === typeName);

        if (variable) {
          const typeAliasDef = variable.defs.find(
            (def) => def.node.type === AST_NODE_TYPES.TSTypeAliasDeclaration,
          );
          const typeAliasNode = typeAliasDef?.node;
          if (isTypeAliasDeclaration(typeAliasNode)) {
            return typeAliasNode;
          }
        }

        scope = scope.upper;
      }

      return null;
    };

    const propsTypes: Map<string, Record<string, TSESTree.Node>> = new Map();
    const componentToReferencedSpreadTypeNames: Map<
      string,
      Set<string>
    > = new Map();
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

    const getStaticPropName = (
      key:
        | TSESTree.PropertyName
        | TSESTree.Expression
        | TSESTree.PrivateIdentifier,
    ): string | null => {
      if (key.type === AST_NODE_TYPES.Identifier) {
        return key.name;
      }

      if (
        key.type === AST_NODE_TYPES.Literal &&
        typeof key.value === 'string'
      ) {
        return key.value;
      }

      return null;
    };

    /**
     * Resolves the `*Props` type name from a parameter's type-annotation node.
     * Unwraps parenthesized types and descends through generic wrapper type
     * arguments (e.g. `Readonly<Foo>`, `Partial<...>`, `Readonly<Partial<Foo>>`)
     * to find the underlying `*Props` reference. Returns the first `*Props`
     * identifier found, or `null`. Uses the same `endsWith('Props')` heuristic
     * as the direct path so forward-declared Props types still resolve.
     */
    const resolvePropsTypeName = (
      typeNode: TSESTree.TypeNode | undefined,
      visited: Set<TSESTree.TypeNode> = new Set(),
    ): string | null => {
      if (!typeNode || visited.has(typeNode)) {
        return null;
      }
      visited.add(typeNode);

      if (isTSParenthesizedType(typeNode)) {
        return resolvePropsTypeName(typeNode.typeAnnotation, visited);
      }

      if (typeNode.type !== AST_NODE_TYPES.TSTypeReference) {
        return null;
      }

      if (
        typeNode.typeName.type === AST_NODE_TYPES.Identifier &&
        typeNode.typeName.name.endsWith('Props')
      ) {
        return typeNode.typeName.name;
      }

      // Generic wrapper (Readonly/Partial/etc.): descend into its type arguments
      // to find the nested *Props reference. typeParameters is the v5 AST shape;
      // typeArguments is the v6+ shape — handle both for forward compatibility.
      const typeArgs =
        typeNode.typeParameters ??
        (typeNode as { typeArguments?: TSESTree.TSTypeParameterInstantiation })
          .typeArguments;

      if (typeArgs) {
        for (const arg of typeArgs.params) {
          const resolved = resolvePropsTypeName(arg, visited);
          if (resolved) {
            return resolved;
          }
        }
      }

      return null;
    };

    const isAnyPropFromSpreadTypeUsed = (
      spreadTypeName: string,
      used: Set<string>,
      knownProps: Set<string>,
    ) => {
      const spreadTypeProps = spreadTypeToPropNames.get(spreadTypeName);
      if (!spreadTypeProps || spreadTypeProps.size === 0) {
        return false;
      }

      if (spreadTypeProps.has(UNKNOWN_SPREAD_PROP)) {
        for (const usedProp of used) {
          if (usedProp.startsWith('...')) {
            continue;
          }

          if (!knownProps.has(usedProp)) {
            return true;
          }
        }
      }

      for (const spreadProp of spreadTypeProps) {
        if (spreadProp === UNKNOWN_SPREAD_PROP) {
          continue;
        }
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

    /**
     * Records which props an ObjectPattern consumes into `used`. A rest element
     * (`...rest`) consumes all remaining props, so it flips `restUsed` and also
     * marks spread-type keys used. Renamed bindings (`{ a: localA }`) still mark
     * the original prop name `a`. Returns whether a rest element was present.
     */
    const collectUsedFromObjectPattern = (
      pattern: TSESTree.ObjectPattern,
      typeName: string,
      used: Set<string>,
    ): boolean => {
      let restUsed = false;
      pattern.properties.forEach((prop) => {
        if (prop.type === AST_NODE_TYPES.Property) {
          const propName = getStaticPropName(prop.key);
          if (propName) {
            used.add(propName);
          }
        } else if (
          prop.type === AST_NODE_TYPES.RestElement &&
          prop.argument.type === AST_NODE_TYPES.Identifier
        ) {
          // Rest spread (`{...rest}`): all remaining props are forwarded ⇒ used.
          // Spread-type markers are also flagged so the spread-forwarding skip
          // applies; remaining plain props are handled at report time via
          // `restUsed` (the props map may be incomplete here on forward refs).
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
      return restUsed;
    };

    /**
     * Whether an Identifier node is a value-position *reference* to a variable
     * (vs. a declaration binding, an object-property key, or the property of a
     * member expression like `foo.paramName`). Used to detect opaque param use.
     */
    const isParamReference = (
      parent: TSESTree.Node | null,
      parentKey: string | null,
    ): boolean => {
      if (!parent) {
        return false;
      }

      // `foo.paramName` — the identifier is the member's property, not the param.
      if (
        parent.type === AST_NODE_TYPES.MemberExpression &&
        parentKey === 'property' &&
        !parent.computed
      ) {
        return false;
      }

      // Non-shorthand object property key: `{ paramName: x }`.
      if (
        parent.type === AST_NODE_TYPES.Property &&
        parentKey === 'key' &&
        !parent.computed
      ) {
        return false;
      }

      // A binding position (declaration id, function param, etc.).
      if (
        (parent.type === AST_NODE_TYPES.VariableDeclarator &&
          parentKey === 'id') ||
        parentKey === 'params'
      ) {
        return false;
      }

      return true;
    };

    /**
     * Scans a function body for `const { a, b } = <paramName>` destructuring of
     * an identifier parameter and records the destructured prop names as used.
     * Matches only the exact `paramName` binding so destructuring of a different
     * variable does not mark props used. Does not descend into nested functions
     * that shadow `paramName` (a redeclared binding is a different variable).
     */
    type BodyDestructuringResult = {
      /** Number of `const { ... } = <paramName>` destructurings found. */
      destructureCount: number;
      /** A rest element appeared in some destructuring (`{ a, ...rest } = props`). */
      restUsed: boolean;
      /**
       * The param is referenced in a way whose prop consumption can't be
       * enumerated (member access `props.x`, spread `{...props}`, passed as a
       * value/argument). Such usage opaquely consumes props ⇒ don't report.
       */
      hasOpaqueUsage: boolean;
    };

    const collectBodyDestructuring = (
      body: TSESTree.Node,
      paramName: string,
      typeName: string,
      used: Set<string>,
    ): BodyDestructuringResult => {
      const result: BodyDestructuringResult = {
        destructureCount: 0,
        restUsed: false,
        hasOpaqueUsage: false,
      };

      const declaresParamName = (declarators: TSESTree.VariableDeclarator[]) =>
        declarators.some(
          (d) =>
            d.id.type === AST_NODE_TYPES.Identifier && d.id.name === paramName,
        );

      /** Identifier nodes that are the `init` of a `const {} = props` declarator. */
      const destructureInits = new Set<TSESTree.Node>();

      const visit = (
        node: TSESTree.Node | null | undefined,
        parent: TSESTree.Node | null,
        parentKey: string | null,
      ): void => {
        if (!node || typeof node.type !== 'string') {
          return;
        }

        if (node.type === AST_NODE_TYPES.VariableDeclarator) {
          if (
            node.id.type === AST_NODE_TYPES.ObjectPattern &&
            node.init?.type === AST_NODE_TYPES.Identifier &&
            node.init.name === paramName
          ) {
            destructureInits.add(node.init);
            result.destructureCount += 1;
            if (collectUsedFromObjectPattern(node.id, typeName, used)) {
              result.restUsed = true;
            }
          }
        }

        // A bare reference to the param that is NOT a destructuring init is an
        // opaque consumption (member access, spread, argument, return, etc.).
        if (
          node.type === AST_NODE_TYPES.Identifier &&
          node.name === paramName &&
          !destructureInits.has(node) &&
          isParamReference(parent, parentKey)
        ) {
          result.hasOpaqueUsage = true;
        }

        // Stop descending into nested functions that re-bind `paramName`, since
        // that shadowing binding refers to a different variable.
        if (
          (node.type === AST_NODE_TYPES.FunctionDeclaration ||
            node.type === AST_NODE_TYPES.FunctionExpression ||
            node.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
          node.params.some(
            (p) => p.type === AST_NODE_TYPES.Identifier && p.name === paramName,
          )
        ) {
          return;
        }
        if (
          node.type === AST_NODE_TYPES.VariableDeclaration &&
          declaresParamName(node.declarations)
        ) {
          // A `const <paramName> = ...` rebind shadows the param from here on.
          return;
        }

        for (const key of Object.keys(node)) {
          if (key === 'parent') {
            continue;
          }
          const value = (node as unknown as Record<string, unknown>)[key];
          if (Array.isArray(value)) {
            value.forEach((child) =>
              visit(child as TSESTree.Node | null | undefined, node, key),
            );
          } else if (
            value &&
            typeof (value as { type?: unknown }).type === 'string'
          ) {
            visit(value as TSESTree.Node, node, key);
          }
        }
      };

      visit(body, null, null);
      return result;
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
      const knownProps = new Set(Object.keys(propsType));

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
          } else if (restUsed) {
            // An explicit rest element (`{ a, ...rest }`) captures every prop not
            // named before it, so the remaining props are forwarded ⇒ used.
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
          const scope = context.getScope();

          const withTypeVisitation = <T>(
            visited: Set<string>,
            typeName: string,
            callback: () => T,
          ): T | null => {
            if (visited.has(typeName)) {
              return null;
            }
            visited.add(typeName);
            try {
              return callback();
            } finally {
              visited.delete(typeName);
            }
          };

          const addBaseTypeProps = (
            typeNode: TSESTree.TypeNode,
            shouldInclude: (name: string) => boolean = () => true,
          ): boolean => {
            // Tracks type identifiers while descending to avoid infinite recursion on
            // self-referential or mutually recursive type aliases; names are removed
            // in the finally block so parallel branches still run.
            const visitingTypeNames = new Set<string>();

            const visit = (node: TSESTree.TypeNode): boolean => {
              if (isTSParenthesizedType(node)) {
                return visit(node.typeAnnotation);
              }

              switch (node.type) {
                case AST_NODE_TYPES.TSTypeLiteral: {
                  let added = false;
                  node.members.forEach((member) => {
                    if (member.type !== AST_NODE_TYPES.TSPropertySignature) {
                      return;
                    }
                    const propName = getStaticPropName(member.key);
                    if (propName && shouldInclude(propName)) {
                      props[propName] = member.key;
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
                  return (
                    withTypeVisitation(
                      visitingTypeNames,
                      typeIdentifier.name,
                      () => {
                        const typeAliasNode = findTypeAliasDeclaration(
                          typeIdentifier.name,
                        );
                        return typeAliasNode
                          ? visit(typeAliasNode.typeAnnotation)
                          : false;
                      },
                    ) ?? false
                  );
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
            currentScope?: TSESLint.Scope.Scope,
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
            const fallbackSpreadKey = spreadKey ?? sourceCode.getText(baseType);
            const recordSpreadMarker = () => {
              const markerKey = fallbackSpreadKey;
              if (!markerKey) {
                return;
              }
              props[`...${markerKey}`] =
                baseType.type === AST_NODE_TYPES.TSTypeReference
                  ? baseType.typeName
                  : baseType;
              markUnknownSpreadType(spreadTypeProps, markerKey);
            };
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
                recordSpreadMarker();
                return;
              }
              const added = addBaseTypeProps(baseType);
              if (!added) {
                recordSpreadMarker();
              }
              return;
            }

            const shouldInclude = (name: string) => !omittedPropNames.has(name);
            let added = false;

            if (currentScope && baseTypeName) {
              const variable = ASTHelpers.findVariableInScope(
                currentScope,
                baseTypeName,
              );
              const definitionNode = variable?.defs[0]?.node;

              if (
                definitionNode?.type === AST_NODE_TYPES.TSTypeAliasDeclaration
              ) {
                added = addBaseTypeProps(
                  definitionNode.typeAnnotation,
                  shouldInclude,
                );
              } else if (
                definitionNode?.type === AST_NODE_TYPES.TSInterfaceDeclaration
              ) {
                added = addInterfaceProps(
                  definitionNode,
                  currentScope,
                  shouldInclude,
                );
              }
            }

            if (!added) {
              added = addBaseTypeProps(baseType, shouldInclude);
            }

            if (added) {
              return;
            }

            recordSpreadMarker();
          };

          const addPropsFromMembers = (
            members: TSESTree.TypeElement[],
            shouldInclude: (name: string) => boolean = () => true,
          ): boolean => {
            let added = false;
            for (const member of members) {
              if (
                member.type !== AST_NODE_TYPES.TSPropertySignature &&
                member.type !== AST_NODE_TYPES.TSMethodSignature
              ) {
                continue;
              }

              const propName = getStaticPropName(member.key);
              if (!propName || !shouldInclude(propName)) {
                continue;
              }

              props[propName] = member.key;
              added = true;
            }

            return added;
          };

          const addInterfaceProps = (
            declaration: TSESTree.TSInterfaceDeclaration,
            currentScope: TSESLint.Scope.Scope,
            shouldInclude: (name: string) => boolean = () => true,
            visitingInterfaces: Set<string> = new Set(),
          ): boolean => {
            return (
              withTypeVisitation(
                visitingInterfaces,
                declaration.id.name,
                () => {
                  let added = addPropsFromMembers(
                    declaration.body.body,
                    shouldInclude,
                  );

                  declaration.extends?.forEach((extension) => {
                    if (
                      extension.expression.type === AST_NODE_TYPES.Identifier &&
                      extension.expression.name
                    ) {
                      const parentVariable = ASTHelpers.findVariableInScope(
                        currentScope,
                        extension.expression.name,
                      );
                      const parentDef = parentVariable?.defs[0]?.node;
                      if (
                        parentDef?.type ===
                        AST_NODE_TYPES.TSInterfaceDeclaration
                      ) {
                        added =
                          addInterfaceProps(
                            parentDef,
                            currentScope,
                            shouldInclude,
                            visitingInterfaces,
                          ) || added;
                      } else if (
                        parentDef?.type ===
                        AST_NODE_TYPES.TSTypeAliasDeclaration
                      ) {
                        added =
                          addBaseTypeProps(
                            parentDef.typeAnnotation,
                            shouldInclude,
                          ) || added;
                      }
                    }
                  });

                  return added;
                },
              ) ?? false
            );
          };

          function extractProps(
            typeNode: TSESTree.TypeNode,
            currentScope: TSESLint.Scope.Scope,
          ) {
            if (typeNode.type === AST_NODE_TYPES.TSTypeLiteral) {
              typeNode.members.forEach((member) => {
                if (member.type !== AST_NODE_TYPES.TSPropertySignature) {
                  return;
                }
                const propName = getStaticPropName(member.key);
                if (propName) {
                  props[propName] = member.key;
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
                      handleOmitType(baseType, omittedProps, currentScope);
                    } else {
                      // For referenced types in intersections, we need to find their type declaration
                      const typeAliasNode = findTypeAliasDeclaration(
                        typeName.name,
                      );
                      if (typeAliasNode) {
                        withTypeVisitation(
                          visitingTypeReferences,
                          typeName.name,
                          () => {
                            extractProps(
                              typeAliasNode.typeAnnotation,
                              currentScope,
                            );
                          },
                        );
                      } else {
                        // If we can't find the type declaration, it's likely an imported type
                        // Mark it as a forwarded prop
                        const spreadTypeName = typeName.name;
                        props[`...${spreadTypeName}`] = typeName;

                        // For imported types, we need to track individual properties that might be used
                        // from this spread type, even if we don't know what they are yet
                        markUnknownSpreadType(spreadTypeProps, spreadTypeName);
                      }
                    }
                  }
                } else {
                  extractProps(type, currentScope);
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
                  handleOmitType(baseType, omittedProps, currentScope);
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

                    const typeAliasNode =
                      findTypeAliasDeclaration(baseTypeName);
                    if (typeAliasNode) {
                      // For Partial<T>, Required<T>, etc., add all properties from the base type
                      const added = addBaseTypeProps(
                        typeAliasNode.typeAnnotation,
                      );
                      if (!added) {
                        props[`...${baseTypeName}`] = baseType.typeName;
                        markUnknownSpreadType(spreadTypeProps, baseTypeName);
                      }
                    } else {
                      // If we can't find the base type definition, treat it as a spread type
                      props[`...${baseTypeName}`] = baseType.typeName;
                      markUnknownSpreadType(spreadTypeProps, baseTypeName);
                    }
                  }
                } else {
                  // For referenced types like FormControlLabelProps, we need to track that these props should be forwarded
                  const spreadTypeName = typeNode.typeName.name;
                  props[`...${spreadTypeName}`] = typeNode.typeName;

                  // For imported types, we need to track individual properties that might be used
                  // from this spread type, even if we don't know what they are yet
                  markUnknownSpreadType(spreadTypeProps, spreadTypeName);
                }
              }
            }
          }

          extractProps(node.typeAnnotation, scope);
          propsTypes.set(node.id.name, props);

          const typeName = node.id.name;
          componentToReferencedSpreadTypeNames.set(
            typeName,
            new Set(Object.keys(spreadTypeProps)),
          );

          for (const [spreadType, propNames] of Object.entries(
            spreadTypeProps,
          )) {
            const spreadTypeSet =
              spreadTypeToPropNames.get(spreadType) ?? new Set<string>();
            spreadTypeToPropNames.set(spreadType, spreadTypeSet);
            propNames.forEach((prop) => spreadTypeSet.add(prop));
          }
        } finally {
          processingTypeAliases.delete(node.id.name);
        }
      },

      VariableDeclaration(node) {
        if (node.declarations.length !== 1) {
          return;
        }
        const declaration = node.declarations[0];
        if (declaration.init?.type !== AST_NODE_TYPES.ArrowFunctionExpression) {
          return;
        }
        const fn = declaration.init;
        const param = fn.params[0];

        if (param?.type === AST_NODE_TYPES.ObjectPattern) {
          // Resolve through generic wrappers (e.g. `Readonly<FooProps>`) as well
          // as the plain `FooProps` annotation.
          const typeName = resolvePropsTypeName(
            param.typeAnnotation?.typeAnnotation,
          );
          if (typeName) {
            const used = new Set<string>();
            const restUsed = collectUsedFromObjectPattern(
              param,
              typeName,
              used,
            );
            currentComponent = { node, typeName, used, restUsed };
          }
          return;
        }

        if (param?.type === AST_NODE_TYPES.Identifier) {
          // Identifier param (`props: FooProps`): the destructuring happens in
          // the body. Resolve the Props type (unwrapping generic wrappers) and
          // scan the body for `const { ... } = props`.
          const typeName = resolvePropsTypeName(
            param.typeAnnotation?.typeAnnotation,
          );
          if (!typeName) {
            return;
          }
          const used = new Set<string>();
          const { destructureCount, restUsed, hasOpaqueUsage } =
            collectBodyDestructuring(fn.body, param.name, typeName, used);

          // Only check when the body destructures the param at least once.
          // Member access (`props.x`), spread (`{...props}`), passing `props`
          // whole, or never referencing it (e.g. `_props`) is left to prior
          // behavior (no report) — those usages can't be enumerated reliably.
          if (destructureCount === 0) {
            return;
          }

          // Mixed usage (some destructure + opaque consumption) forwards the
          // remaining props, so treat every prop as used to avoid false reports.
          if (hasOpaqueUsage) {
            const propsType = propsTypes.get(typeName);
            if (propsType) {
              Object.keys(propsType).forEach((key) => used.add(key));
            }
            currentComponent = { node, typeName, used, restUsed: true };
            return;
          }

          currentComponent = { node, typeName, used, restUsed };
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

import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds =
  | 'memoizeTransformValue'
  | 'memoizeTransformOnChange'
  | 'useCorrectHook'
  | 'missingDependencies';

type MemoHook = 'useMemo' | 'useCallback';

export const enforceTransformMemoization = createRule<[], MessageIds>({
  name: 'enforce-transform-memoization',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce memoization of adaptValue transformValue/transformOnChange so the adapted component receives stable handlers and avoids unnecessary re-renders.',
      recommended: 'error',
    },
    schema: [],
    messages: {
      memoizeTransformValue:
        'transformValue is recreated on every render. Wrap it in useMemo (or reference a memoized helper) so adaptValue passes a stable transformer and avoids rerendering the adapted component.',
      memoizeTransformOnChange:
        'transformOnChange handler is recreated on every render. Wrap it in useCallback (or another memoized helper) so adaptValue passes a stable onChange and prevents extra renders and stale closures.',
      useCorrectHook:
        '{{propName}} should be memoized with {{expectedHook}}. {{actualHook}} recreates a new transform on every render and hides intent; wrap the transform with {{expectedHook}} so React preserves its identity and avoids churn.',
      missingDependencies:
        '{{hook}} for {{propName}} is missing {{deps}} in its dependency array. Include every external value the transform closes over so the memoized function stays in sync and does not capture stale data.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    const scopeManager = sourceCode.scopeManager;
    const adaptValueNames = new Set(['adaptValue']);
    const memoizingHooks = new Set(['useMemo', 'useCallback']);
    const stabilizingUtilities = new Set(['useEvent']);

    const getPropertyName = (
      key:
        | TSESTree.Expression
        | TSESTree.PrivateIdentifier
        | TSESTree.Identifier
        | TSESTree.Literal,
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

    const isFunctionExpression = (
      node: TSESTree.Node,
    ): node is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression =>
      node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      node.type === AST_NODE_TYPES.FunctionExpression;

    const unwrapExpression = (
      node: TSESTree.Node,
    ): TSESTree.Node | TSESTree.Expression => {
      if (
        node.type === AST_NODE_TYPES.TSAsExpression ||
        node.type === AST_NODE_TYPES.TSTypeAssertion
      ) {
        return unwrapExpression(node.expression);
      }
      if (node.type === AST_NODE_TYPES.ChainExpression) {
        return unwrapExpression(node.expression);
      }
      return node as TSESTree.Node | TSESTree.Expression;
    };

    const getCalleeName = (callee: TSESTree.LeftHandSideExpression): string => {
      if (callee.type === AST_NODE_TYPES.Identifier) {
        return callee.name;
      }
      if (
        callee.type === AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.property.type === AST_NODE_TYPES.Identifier
      ) {
        return callee.property.name;
      }
      return '';
    };

    const isTopLevelScope = (scope: TSESLint.Scope.Scope): boolean =>
      scope.type === 'global' || scope.type === 'module';

    const findVariableInScopeChain = (
      identifier: TSESTree.Identifier,
    ): TSESLint.Scope.Variable | null => {
      if (!scopeManager) return null;

      let currentNode: TSESTree.Node | undefined = identifier;
      let scope: TSESLint.Scope.Scope | null = null;

      while (currentNode && !scope) {
        scope = scopeManager.acquire(currentNode, true);
        currentNode = currentNode.parent ?? undefined;
      }

      if (!scope) {
        scope = scopeManager.globalScope;
      }
      if (!scope) return null;

      let currentScope: TSESLint.Scope.Scope | null = scope;
      while (currentScope) {
        const variable = currentScope.variables.find(
          (v) => v.name === identifier.name,
        );
        if (variable) return variable;
        currentScope = currentScope.upper;
      }
      return null;
    };

    const isPropertyKeyIdentifier = (
      identifier: TSESTree.Identifier | TSESTree.JSXIdentifier,
    ): boolean =>
      identifier.parent?.type === AST_NODE_TYPES.MemberExpression &&
      identifier.parent.property === identifier &&
      !identifier.parent.computed;

    const isScopeAncestor = (
      maybeAncestor: TSESLint.Scope.Scope,
      scope: TSESLint.Scope.Scope,
    ): boolean => {
      let current: TSESLint.Scope.Scope | null = scope.upper;
      while (current) {
        if (current === maybeAncestor) return true;
        current = current.upper;
      }
      return false;
    };

    const collectExternalDependencies = (
      callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
    ): Set<string> => {
      const deps = new Set<string>();
      if (!scopeManager) return deps;
      const rootScope = scopeManager.acquire(callback);
      if (!rootScope) return deps;

      const walkScopes = (scope: TSESLint.Scope.Scope) => {
        for (const ref of scope.references) {
          const resolved = ref.resolved;
          if (!resolved) continue;
          if (isPropertyKeyIdentifier(ref.identifier)) continue;
          const resolvedScope = resolved.scope;

          if (
            isScopeAncestor(resolvedScope, rootScope) &&
            !isTopLevelScope(resolvedScope)
          ) {
            deps.add(ref.identifier.name);
          }
        }
        for (const child of scope.childScopes) {
          walkScopes(child);
        }
      };

      walkScopes(rootScope);
      return deps;
    };

    const extractDependencyNames = (depsArg: TSESTree.ArrayExpression) => {
      const dependencyNames = new Set<string>();

      const addName = (name: string | null) => {
        if (name) dependencyNames.add(name);
      };

      const extractFromExpression = (
        expression: TSESTree.Expression,
      ): string | null => {
        if (expression.type === AST_NODE_TYPES.Identifier) {
          return expression.name;
        }

        if (
          expression.type === AST_NODE_TYPES.MemberExpression &&
          !expression.computed
        ) {
          const objectExpr = expression.object;
          if (objectExpr.type === AST_NODE_TYPES.Identifier) {
            return objectExpr.name;
          }
        }

        if (expression.type === AST_NODE_TYPES.ChainExpression) {
          return extractFromExpression(expression.expression);
        }

        return null;
      };

      for (const element of depsArg.elements) {
        if (!element) continue;
        if (element.type === AST_NODE_TYPES.SpreadElement) continue;
        addName(extractFromExpression(element));
      }

      return dependencyNames;
    };

    const formatMissingDeps = (
      missing: Set<string>,
      hasArray: boolean,
    ): string => {
      if (missing.size === 0 && !hasArray) {
        return 'a dependency array (use [] when the transform has no external values)';
      }
      if (missing.size === 0) {
        return 'all external values referenced by the transform';
      }
      return Array.from(missing).join(', ');
    };

    const getVariableInitializer = (
      variable: TSESLint.Scope.Variable,
    ): TSESTree.Node | null => {
      for (const def of variable.defs) {
        if (def.type === 'Variable' && def.node.init) {
          return def.node.init;
        }
        if (def.type === 'FunctionName') {
          return def.node;
        }
      }
      return null;
    };

    const resolveValueForKey = (
      expression: TSESTree.Expression | TSESTree.Node | null,
      key: string,
      depth = 0,
    ): TSESTree.Expression | null => {
      if (!expression || depth > 5) return null;
      const unwrapped = unwrapExpression(expression);

      if (unwrapped.type === AST_NODE_TYPES.ObjectExpression) {
        let found: TSESTree.Expression | null = null;
        for (const prop of unwrapped.properties) {
          if (prop.type === AST_NODE_TYPES.Property) {
            const keyName = getPropertyName(prop.key);
            if (keyName === key) {
              found = prop.value as TSESTree.Expression;
            }
          } else if (prop.type === AST_NODE_TYPES.SpreadElement) {
            const nested = resolveValueForKey(prop.argument, key, depth + 1);
            if (nested) {
              found = nested;
            }
          }
        }
        if (found) return found;
      }

      if (unwrapped.type === AST_NODE_TYPES.Identifier) {
        const variable = findVariableInScopeChain(unwrapped);
        const init = variable ? getVariableInitializer(variable) : null;
        if (init) {
          return resolveValueForKey(
            init as TSESTree.Expression,
            key,
            depth + 1,
          );
        }
      }

      if (
        unwrapped.type === AST_NODE_TYPES.MemberExpression &&
        !unwrapped.computed
      ) {
        const propertyName = getPropertyName(unwrapped.property);
        if (!propertyName) return null;
        if (unwrapped.object.type !== AST_NODE_TYPES.Super) {
          const resolvedMember = resolveValueForKey(
            unwrapped.object as TSESTree.Expression,
            propertyName,
            depth + 1,
          );
          if (!resolvedMember) return null;
          if (
            propertyName !== key &&
            resolvedMember.type === AST_NODE_TYPES.ObjectExpression
          ) {
            return resolveValueForKey(resolvedMember, key, depth + 1);
          }
          return resolvedMember;
        }
      }

      return null;
    };

    const resolveOptionsObject = (
      node: TSESTree.Expression | TSESTree.Node | null,
    ): TSESTree.ObjectExpression | null => {
      if (!node) return null;
      const unwrapped = unwrapExpression(node);
      if (unwrapped.type === AST_NODE_TYPES.ObjectExpression) {
        return unwrapped;
      }

      if (unwrapped.type === AST_NODE_TYPES.Identifier) {
        const variable = findVariableInScopeChain(unwrapped);
        const init = variable ? getVariableInitializer(variable) : null;
        if (init && init.type === AST_NODE_TYPES.ObjectExpression) {
          return init;
        }
      }

      if (
        unwrapped.type === AST_NODE_TYPES.MemberExpression &&
        !unwrapped.computed
      ) {
        const objectExpression =
          unwrapped.object.type === AST_NODE_TYPES.Super
            ? null
            : resolveOptionsObject(unwrapped.object as TSESTree.Expression);
        if (objectExpression) {
          const propertyName = getPropertyName(unwrapped.property);
          if (propertyName) {
            const nested = resolveValueForKey(objectExpression, propertyName);
            if (nested && nested.type === AST_NODE_TYPES.ObjectExpression) {
              return nested;
            }
          }
        }
      }

      return null;
    };

    const analyzeMemoization = (
      node: TSESTree.Expression | TSESTree.Node,
      propName: 'transformValue' | 'transformOnChange',
      expectedHook: MemoHook,
      seenIdentifiers: Set<string>,
    ):
      | { ok: true }
      | {
          ok: false;
          messageId: MessageIds;
          data?: Record<string, string>;
        } => {
      const unwrapped = unwrapExpression(node);

      if (isFunctionExpression(unwrapped)) {
        return {
          ok: false,
          messageId:
            propName === 'transformValue'
              ? 'memoizeTransformValue'
              : 'memoizeTransformOnChange',
        };
      }

      if (unwrapped.type === AST_NODE_TYPES.FunctionDeclaration) {
        return {
          ok: false,
          messageId:
            propName === 'transformValue'
              ? 'memoizeTransformValue'
              : 'memoizeTransformOnChange',
        };
      }

      if (unwrapped.type === AST_NODE_TYPES.CallExpression) {
        const calleeName = getCalleeName(unwrapped.callee);
        if (memoizingHooks.has(calleeName)) {
          if (
            (expectedHook === 'useMemo' && calleeName === 'useCallback') ||
            (expectedHook === 'useCallback' && calleeName === 'useMemo')
          ) {
            return {
              ok: false,
              messageId: 'useCorrectHook',
              data: {
                propName,
                expectedHook,
                actualHook: calleeName,
              },
            };
          }

          const callback = unwrapped.arguments[0];
          const depsArg = unwrapped.arguments[unwrapped.arguments.length - 1];
          const externalDeps =
            callback && isFunctionExpression(callback)
              ? collectExternalDependencies(callback)
              : new Set<string>();

          if (!depsArg || depsArg.type !== AST_NODE_TYPES.ArrayExpression) {
            return {
              ok: false,
              messageId: 'missingDependencies',
              data: {
                hook: calleeName,
                propName,
                deps: formatMissingDeps(externalDeps, false),
              },
            };
          }

          if (externalDeps.size > 0) {
            const declaredDeps = extractDependencyNames(depsArg);
            const missingDeps = new Set<string>();
            for (const dep of externalDeps) {
              if (!declaredDeps.has(dep)) {
                missingDeps.add(dep);
              }
            }

            if (missingDeps.size > 0) {
              return {
                ok: false,
                messageId: 'missingDependencies',
                data: {
                  hook: calleeName,
                  propName,
                  deps: formatMissingDeps(missingDeps, true),
                },
              };
            }
          }

          return { ok: true };
        }

        if (stabilizingUtilities.has(calleeName)) {
          return { ok: true };
        }

        return {
          ok: false,
          messageId:
            propName === 'transformValue'
              ? 'memoizeTransformValue'
              : 'memoizeTransformOnChange',
        };
      }

      if (unwrapped.type === AST_NODE_TYPES.Identifier) {
        if (seenIdentifiers.has(unwrapped.name)) {
          return { ok: true };
        }
        seenIdentifiers.add(unwrapped.name);

        const variable = findVariableInScopeChain(unwrapped);
        if (!variable) {
          return { ok: true };
        }

        if (
          variable.defs.some((def) => def.type === 'Parameter') ||
          isTopLevelScope(variable.scope)
        ) {
          return { ok: true };
        }

        const init = getVariableInitializer(variable);
        if (!init) {
          return {
            ok: false,
            messageId:
              propName === 'transformValue'
                ? 'memoizeTransformValue'
                : 'memoizeTransformOnChange',
          };
        }

        return analyzeMemoization(
          init,
          propName,
          expectedHook,
          seenIdentifiers,
        );
      }

      return {
        ok: false,
        messageId:
          propName === 'transformValue'
            ? 'memoizeTransformValue'
            : 'memoizeTransformOnChange',
      };
    };

    const checkTransformProperty = (
      node: TSESTree.Expression,
      propName: 'transformValue' | 'transformOnChange',
      expectedHook: MemoHook,
    ) => {
      const result = analyzeMemoization(
        node,
        propName,
        expectedHook,
        new Set(),
      );
      if (result.ok) return;

      context.report({
        node,
        messageId: result.messageId,
        data: result.data,
      });
    };

    return {
      ImportDeclaration(node) {
        const sourceValue =
          typeof node.source.value === 'string' ? node.source.value : '';
        for (const specifier of node.specifiers) {
          if (
            specifier.type === AST_NODE_TYPES.ImportSpecifier &&
            specifier.imported.type === AST_NODE_TYPES.Identifier &&
            specifier.imported.name === 'adaptValue'
          ) {
            adaptValueNames.add(specifier.local.name);
          }
          if (
            specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier &&
            (specifier.local.name === 'adaptValue' ||
              sourceValue.includes('adaptValue'))
          ) {
            adaptValueNames.add(specifier.local.name);
          }
        }
      },
      CallExpression(node) {
        if (
          node.callee.type !== AST_NODE_TYPES.Identifier ||
          !adaptValueNames.has(node.callee.name)
        ) {
          return;
        }

        const optionsArg = node.arguments[0] as TSESTree.Expression | undefined;
        if (!optionsArg) return;

        const optionsObject = resolveOptionsObject(optionsArg);
        if (!optionsObject) return;

        const transformValueNode = resolveValueForKey(
          optionsObject,
          'transformValue',
        );
        if (transformValueNode) {
          checkTransformProperty(
            transformValueNode,
            'transformValue',
            'useMemo',
          );
        }

        const transformOnChangeNode = resolveValueForKey(
          optionsObject,
          'transformOnChange',
        );
        if (transformOnChangeNode) {
          checkTransformProperty(
            transformOnChangeNode,
            'transformOnChange',
            'useCallback',
          );
        }
      },
    };
  },
});

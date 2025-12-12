import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds =
  | 'requireMemoizedTransformBefore'
  | 'requireMemoizedRender'
  | 'requireMemoizedRenderHits'
  | 'noDirectComponentInRender';

export const enforceRenderHitsMemoization = createRule<[], MessageIds>({
  name: 'enforce-render-hits-memoization',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce proper memoization and usage of useRenderHits and renderHits',
      recommended: 'error',
    },
    schema: [],
    messages: {
      requireMemoizedTransformBefore:
        'transformBefore prop must be memoized using useCallback',
      requireMemoizedRender: 'render prop must be memoized using useCallback',
      requireMemoizedRenderHits:
        'renderHits must be used inside useMemo or useCallback',
      noDirectComponentInRender:
        'Do not pass React components directly to render prop, use a memoized arrow function instead',
    },
  },
  defaultOptions: [],
  create(context) {
    const memoHookNames = new Set(['useCallback', 'useMemo']);

    const isReactComponent = (node: TSESTree.Node): boolean => {
      if (node.type !== AST_NODE_TYPES.Identifier) return false;
      return /^[A-Z]/.test(node.name);
    };

    const isMemoizedCall = (node: TSESTree.Node): boolean => {
      if (node.type !== AST_NODE_TYPES.CallExpression) return false;
      if (!node.callee || node.callee.type !== AST_NODE_TYPES.Identifier)
        return false;
      return memoHookNames.has(node.callee.name);
    };

    const findVariable = (name: string): TSESLint.Scope.Variable | null => {
      for (
        let scope: TSESLint.Scope.Scope | null = context.getScope();
        scope;
        scope = scope.upper
      ) {
        const variable = scope.variables.find(
          (candidate) => candidate.name === name,
        );
        if (variable) return variable;
      }
      return null;
    };

    const variableHasMemoizedDefinition = (
      variable: TSESLint.Scope.Variable,
    ): boolean =>
      variable.defs.some(
        (def) =>
          def.node.type === AST_NODE_TYPES.VariableDeclarator &&
          def.node.init &&
          isMemoizedCall(def.node.init),
      );

    const variableIsUsedInsideMemo = (
      variable: TSESLint.Scope.Variable,
    ): boolean =>
      variable.references.some((ref) => {
        let current: TSESTree.Node | undefined = ref.identifier;
        while (current?.parent) {
          if (
            current.parent.type === AST_NODE_TYPES.CallExpression &&
            current.parent.callee.type === AST_NODE_TYPES.Identifier &&
            memoHookNames.has(current.parent.callee.name)
          ) {
            return true;
          }
          current = current.parent;
        }
        return false;
      });

    const isMemoizedVariable = (node: TSESTree.Node): boolean => {
      if (node.type !== AST_NODE_TYPES.Identifier) return false;
      const variable = findVariable(node.name);
      if (!variable) return false;
      return (
        variableHasMemoizedDefinition(variable) ||
        variableIsUsedInsideMemo(variable)
      );
    };

    const isInsideMemoizedCall = (node: TSESTree.Node): boolean => {
      if (isMemoizedCall(node)) return true;

      if (node.type === AST_NODE_TYPES.Identifier && isMemoizedVariable(node)) {
        return true;
      }

      let current: TSESTree.Node | undefined = node;
      while (current?.parent) {
        if (
          current.parent.type === AST_NODE_TYPES.CallExpression &&
          current.parent.callee.type === AST_NODE_TYPES.Identifier &&
          memoHookNames.has(current.parent.callee.name)
        ) {
          return true;
        }
        current = current.parent;
      }

      if (
        node.parent?.type === AST_NODE_TYPES.Property &&
        node.parent.parent?.type === AST_NODE_TYPES.ObjectExpression
      ) {
        let objectCurrent: TSESTree.Node | undefined = node.parent.parent;
        while (objectCurrent?.parent) {
          if (
            objectCurrent.parent.type === AST_NODE_TYPES.CallExpression &&
            objectCurrent.parent.callee.type === AST_NODE_TYPES.Identifier &&
            memoHookNames.has(objectCurrent.parent.callee.name)
          ) {
            return true;
          }
          objectCurrent = objectCurrent.parent;
        }
      }

      return false;
    };

    const getAssignedIdentifier = (
      node: TSESTree.CallExpression,
    ): TSESTree.Identifier | null => {
      const parent = node.parent;
      if (
        parent?.type === AST_NODE_TYPES.VariableDeclarator &&
        parent.id.type === AST_NODE_TYPES.Identifier
      ) {
        return parent.id;
      }
      if (
        parent?.type === AST_NODE_TYPES.AssignmentExpression &&
        parent.left.type === AST_NODE_TYPES.Identifier
      ) {
        return parent.left;
      }
      return null;
    };

    const nearestFunctionAncestor = (
      node: TSESTree.Node,
    ): TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression | null => {
      let current: TSESTree.Node | undefined = node;
      while (current) {
        if (
          current.type === AST_NODE_TYPES.FunctionDeclaration ||
          current.type === AST_NODE_TYPES.FunctionExpression ||
          current.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          return current;
        }
        current = current.parent;
      }
      return null;
    };

    const isRenderHitsMemoized = (node: TSESTree.CallExpression): boolean => {
      if (isInsideMemoizedCall(node)) {
        return true;
      }

      const assignedIdentifier = getAssignedIdentifier(node);
      if (assignedIdentifier) {
        const variable = findVariable(assignedIdentifier.name);
        if (
          variable &&
          (variableHasMemoizedDefinition(variable) ||
            variableIsUsedInsideMemo(variable))
        ) {
          return true;
        }
      }

      const enclosingFunction = nearestFunctionAncestor(node);
      if (enclosingFunction && isInsideMemoizedCall(enclosingFunction)) {
        return true;
      }

      if (
        node.parent?.type === AST_NODE_TYPES.CallExpression &&
        node.parent.callee.type === AST_NODE_TYPES.Identifier &&
        memoHookNames.has(node.parent.callee.name)
      ) {
        return true;
      }

      return false;
    };

    const useRenderHitsSources = new Set([
      'useRenderHits',
      '@/hooks/algolia/useRenderHits',
    ]);
    const renderHitsSources = new Set([
      'renderHits',
      '@/hooks/algolia/renderHits',
    ]);
    let useRenderHitsName = 'useRenderHits';
    let renderHitsName = 'renderHits';

    return {
      ImportDeclaration(node) {
        const sourceValue = String(node.source.value);
        if (useRenderHitsSources.has(sourceValue)) {
          for (const specifier of node.specifiers) {
            if (
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.imported.name === 'useRenderHits'
            ) {
              useRenderHitsName = specifier.local.name;
              break;
            }
          }
        } else if (renderHitsSources.has(sourceValue)) {
          for (const specifier of node.specifiers) {
            if (
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.imported.name === 'renderHits'
            ) {
              renderHitsName = specifier.local.name;
              break;
            }
          }
        }
      },

      CallExpression(node) {
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === useRenderHitsName
        ) {
          if (node.arguments.length === 0) return;

          const options = node.arguments[0];
          if (options.type !== AST_NODE_TYPES.ObjectExpression) return;

          // Variable to track if we need to check properties (check both by default)
          const checkProps = {
            transformBefore: true,
            render: true,
          };

          // First pass: Check if transformBefore or render properties exist as shorthand
          for (const prop of options.properties) {
            if (prop.type !== AST_NODE_TYPES.Property) continue;
            if (prop.key.type !== AST_NODE_TYPES.Identifier) continue;

            // If it's shorthand property syntax like { transformBefore } and already a memoized variable
            if (
              prop.key.name === 'transformBefore' &&
              prop.shorthand &&
              prop.key.type === AST_NODE_TYPES.Identifier
            ) {
              checkProps.transformBefore = !isMemoizedVariable(prop.key);
            } else if (
              prop.key.name === 'render' &&
              prop.shorthand &&
              prop.key.type === AST_NODE_TYPES.Identifier
            ) {
              checkProps.render = !isMemoizedVariable(prop.key);
            }
          }

          // Second pass: Check non-shorthand properties
          for (const prop of options.properties) {
            if (prop.type !== AST_NODE_TYPES.Property) continue;
            if (prop.key.type !== AST_NODE_TYPES.Identifier) continue;

            // Skip shorthand properties that we already checked
            if (prop.shorthand) continue;

            if (
              prop.key.name === 'transformBefore' &&
              checkProps.transformBefore
            ) {
              // Skip if the value is already a memoized call
              if (isMemoizedCall(prop.value)) continue;

              if (!isInsideMemoizedCall(prop.value)) {
                context.report({
                  node: prop.value,
                  messageId: 'requireMemoizedTransformBefore',
                });
              }
            } else if (prop.key.name === 'render' && checkProps.render) {
              if (isReactComponent(prop.value)) {
                context.report({
                  node: prop.value,
                  messageId: 'noDirectComponentInRender',
                });
              } else if (!isInsideMemoizedCall(prop.value)) {
                context.report({
                  node: prop.value,
                  messageId: 'requireMemoizedRender',
                });
              }
            }
          }
        }

        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === renderHitsName
        ) {
          if (isRenderHitsMemoized(node)) {
            return;
          }

          context.report({
            node,
            messageId: 'requireMemoizedRenderHits',
          });
        }
      },
    };
  },
});

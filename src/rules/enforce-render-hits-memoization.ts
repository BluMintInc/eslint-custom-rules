import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
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
      description: 'Enforce proper memoization and usage of useRenderHits and renderHits',
      recommended: 'error',
    },
    schema: [],
    messages: {
      requireMemoizedTransformBefore: 'transformBefore prop must be memoized using useCallback',
      requireMemoizedRender: 'render prop must be memoized using useCallback',
      requireMemoizedRenderHits: 'renderHits must be used inside useMemo or useCallback',
      noDirectComponentInRender: 'Do not pass React components directly to render prop, use a memoized arrow function instead',
    },
  },
  defaultOptions: [],
  create(context) {


    const isReactComponent = (node: TSESTree.Node): boolean => {
      if (node.type !== AST_NODE_TYPES.Identifier) return false;
      const name = node.name;
      return /^[A-Z]/.test(name);
    };

    const isInsideMemoizedCall = (node: TSESTree.Node): boolean => {
      if (node.type !== AST_NODE_TYPES.Identifier) {
        return false;
      }

      // Check if the node is directly inside a memoized call
      let current: TSESTree.Node | undefined = node;
      while (current?.parent) {
        if (current.parent.type === AST_NODE_TYPES.CallExpression) {
          const callee = current.parent.callee;
          if (callee.type === AST_NODE_TYPES.Identifier &&
              (callee.name === 'useCallback' || callee.name === 'useMemo')) {
            return true;
          }
        }
        current = current.parent;
      }

      // Check if the node is a reference to a memoized value
      const scope = context.getScope();
      const variable = scope.variables.find(v => v.name === node.name);

      if (!variable) {
        return false;
      }

      // Check if any definition is a memoized value
      for (const def of variable.defs) {
        const parent = def.node.parent;
        if (parent?.type === AST_NODE_TYPES.VariableDeclarator &&
            parent.init?.type === AST_NODE_TYPES.CallExpression) {
          const callee = parent.init.callee;
          if (callee.type === AST_NODE_TYPES.Identifier &&
              (callee.name === 'useCallback' || callee.name === 'useMemo')) {
            return true;
          }
        }
      }

      // Check if any reference is inside a memoized call
      for (const ref of variable.references) {
        let current: TSESTree.Node | undefined = ref.identifier;
        while (current?.parent) {
          if (current.parent.type === AST_NODE_TYPES.CallExpression) {
            const callee = current.parent.callee;
            if (callee.type === AST_NODE_TYPES.Identifier &&
                (callee.name === 'useCallback' || callee.name === 'useMemo')) {
              return true;
            }
          }
          current = current.parent;
        }
      }

      // Check if the node is a property of an object that is memoized
      const parent = node.parent;
      if (parent?.type === AST_NODE_TYPES.Property &&
          parent.parent?.type === AST_NODE_TYPES.ObjectExpression) {
        const objectExpression = parent.parent;
        let current: TSESTree.Node | undefined = objectExpression;
        while (current?.parent) {
          if (current.parent.type === AST_NODE_TYPES.CallExpression) {
            const callee = current.parent.callee;
            if (callee.type === AST_NODE_TYPES.Identifier &&
                (callee.name === 'useCallback' || callee.name === 'useMemo')) {
              return true;
            }
          }
          current = current.parent;
        }
      }

      // Check if the node is a property of an object that is passed to useRenderHits
      if (parent?.type === AST_NODE_TYPES.Property &&
          parent.parent?.type === AST_NODE_TYPES.ObjectExpression &&
          parent.parent.parent?.type === AST_NODE_TYPES.CallExpression &&
          parent.parent.parent.callee.type === AST_NODE_TYPES.Identifier &&
          parent.parent.parent.callee.name === useRenderHitsName) {
        return true;
      }

      return false;
    };

    let useRenderHitsName = 'useRenderHits';

    return {
      ImportDeclaration(node) {
        if (node.source.value.endsWith('useRenderHits')) {
          for (const specifier of node.specifiers) {
            if (specifier.type === AST_NODE_TYPES.ImportSpecifier &&
                specifier.imported.name === 'useRenderHits') {
              useRenderHitsName = specifier.local.name;
              break;
            }
          }
        }
      },

      CallExpression(node) {
        if (node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name === useRenderHitsName) {
          if (node.arguments.length === 0) return;

          const options = node.arguments[0];
          if (options.type !== AST_NODE_TYPES.ObjectExpression) return;

          for (const prop of options.properties) {
            if (prop.type !== AST_NODE_TYPES.Property) continue;
            if (prop.key.type !== AST_NODE_TYPES.Identifier) continue;

            if (prop.key.name === 'transformBefore') {
              if (!isInsideMemoizedCall(prop.value)) {
                context.report({
                  node: prop.value,
                  messageId: 'requireMemoizedTransformBefore',
                });
              }
            } else if (prop.key.name === 'render') {
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

        if (node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name === 'renderHits') {
          let current: TSESTree.Node | undefined = node;
          while (current?.parent) {
            if (current.parent.type === AST_NODE_TYPES.CallExpression) {
              const callee = current.parent.callee;
              if (callee.type === AST_NODE_TYPES.Identifier &&
                  (callee.name === 'useCallback' || callee.name === 'useMemo')) {
                return;
              }
            }
            current = current.parent;
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

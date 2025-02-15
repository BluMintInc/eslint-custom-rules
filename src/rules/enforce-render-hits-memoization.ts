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
    const isMemoizedCall = (node: TSESTree.Node): boolean => {
      if (node.type !== AST_NODE_TYPES.CallExpression) return false;

      const callee = node.callee;
      if (callee.type !== AST_NODE_TYPES.Identifier) return false;

      return callee.name === 'useCallback' || callee.name === 'useMemo';
    };

    const isReactComponent = (node: TSESTree.Node): boolean => {
      if (node.type !== AST_NODE_TYPES.Identifier) return false;
      const name = node.name;
      return /^[A-Z]/.test(name);
    };

    const isMemoizedVariable = (node: TSESTree.Node): boolean => {
      if (node.type !== AST_NODE_TYPES.Identifier) return false;

      // Get the variable declaration for this identifier
      const variable = context.getScope().variables.find(v => v.name === (node as TSESTree.Identifier).name);
      if (!variable) return false;

      // Check if the variable is initialized with a memoized call
      const def = variable.defs[0];
      if (!def || !def.node) return false;

      if (def.node.type === AST_NODE_TYPES.VariableDeclarator && def.node.init) {
        return isMemoizedCall(def.node.init);
      }
      return false;
    };

    const isInsideMemoizedCall = (node: TSESTree.Node): boolean => {
      // Check if the node is a reference to a memoized variable
      if (isMemoizedVariable(node)) return true;

      // Check if the node is inside a memoization hook call
      let current: TSESTree.Node | undefined = node;
      while (current?.parent) {
        if (isMemoizedCall(current.parent)) return true;
        current = current.parent;
      }
      return false;
    };

    return {
      CallExpression(node) {
        if (node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name === 'useRenderHits') {
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
            }

            if (prop.key.name === 'render') {
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
          if (!isInsideMemoizedCall(node)) {
            context.report({
              node,
              messageId: 'requireMemoizedRenderHits',
            });
          }
        }
      },
    };
  },
});

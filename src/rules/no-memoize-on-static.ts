import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noMemoizeOnStatic';

export const noMemoizeOnStatic = createRule<[], MessageIds>({
  name: 'no-memoize-on-static',
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent using @Memoize() decorator on static methods',
      recommended: 'error',
    },
    schema: [],
    messages: {
      noMemoizeOnStatic:
        '@Memoize() decorator should not be used on static methods',
    },
  },
  defaultOptions: [],
  create(context) {
    // Track renamed imports of Memoize
    const memoizeAliases = new Set(['Memoize']);

    return {
      ImportSpecifier(node: TSESTree.ImportSpecifier) {
        if (
          node.imported.type === AST_NODE_TYPES.Identifier &&
          node.imported.name === 'Memoize' &&
          node.local.type === AST_NODE_TYPES.Identifier
        ) {
          memoizeAliases.add(node.local.name);
        }
      },
      'MethodDefinition[static=true]'(node: TSESTree.MethodDefinition) {
        if (node.decorators) {
          for (const decorator of node.decorators) {
            const expr = decorator.expression;
            if (
              // Handle @Memoize()
              (expr.type === AST_NODE_TYPES.CallExpression &&
                expr.callee.type === AST_NODE_TYPES.Identifier &&
                memoizeAliases.has(expr.callee.name)) ||
              // Handle @Memoize (without parentheses)
              (expr.type === AST_NODE_TYPES.Identifier &&
                memoizeAliases.has(expr.name))
            ) {
              context.report({
                node: decorator,
                messageId: 'noMemoizeOnStatic',
              });
            }
          }
        }
      },
    };
  },
});

import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { getMethodName } from '../utils/getMethodName';

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
        'Static member "{{methodName}}" uses @Memoize(), which shares one cache across every caller instead of per instance. Static memoization can leak stale or cross-tenant data because the cache survives across requests for the lifetime of the process. Remove @Memoize() or move the logic into an instance method so each consumer gets its own cache lifecycle.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
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
                data: {
                  methodName:
                    getMethodName(node, sourceCode, {
                      privateIdentifierPrefix: '#',
                      computedFallbackToText: false,
                    }) || '<unknown>',
                },
              });
            }
          }
        }
      },
    };
  },
});

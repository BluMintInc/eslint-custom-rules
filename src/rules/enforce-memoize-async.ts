import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'requireMemoize';
type Options = [];

export const enforceMemoizeAsync = createRule<Options, MessageIds>({
  name: 'enforce-memoize-async',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce @Memoize() decorator on async methods with 0-1 parameters',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      requireMemoize: 'Async methods with 0-1 parameters should be decorated with @Memoize() to cache results and improve performance. Instead of `async getData(id?: string)`, use `@Memoize()\nasync getData(id?: string)`. Import Memoize from "typescript-memoize".',
    },
  },
  defaultOptions: [],
  create(context) {
    let hasMemoizeImport = false;
    let memoizeAlias = 'Memoize';

    return {
      ImportDeclaration(node) {
        if (node.source.value === 'typescript-memoize') {
          const memoizeSpecifier = node.specifiers.find(
            spec =>
              spec.type === AST_NODE_TYPES.ImportSpecifier &&
              spec.imported.name === 'Memoize'
          );
          if (memoizeSpecifier) {
            hasMemoizeImport = true;
            if (memoizeSpecifier.local) {
              memoizeAlias = memoizeSpecifier.local.name;
            }
          }
        }
      },

      MethodDefinition(node) {
        // Only process async methods
        if (node.value.type !== AST_NODE_TYPES.FunctionExpression || !node.value.async) {
          return;
        }

        // Skip methods with more than one parameter
        if (node.value.params.length > 1) {
          return;
        }

        // Check if method already has @Memoize decorator
        const hasDecorator = node.decorators?.some(decorator => {
          if (decorator.expression.type !== AST_NODE_TYPES.CallExpression) {
            return false;
          }
          const callee = decorator.expression.callee;
          return (
            callee.type === AST_NODE_TYPES.Identifier &&
            callee.name === memoizeAlias
          );
        });

        if (!hasDecorator && hasMemoizeImport) {
          context.report({
            node,
            messageId: 'requireMemoize',
            fix(fixer) {
              // Add import if needed
              // Add decorator
              return fixer.insertTextBefore(
                node,
                `@${memoizeAlias}()\n${' '.repeat(node.loc.start.column)}`
              );
            },
          });
        }
      },
    };
  },
});

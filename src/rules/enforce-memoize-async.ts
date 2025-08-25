import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'requireMemoize';
type Options = [];

export const enforceMemoizeAsync = createRule<Options, MessageIds>({
  name: 'enforce-memoize-async',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce @Memoize() decorator on async methods with 0-1 parameters to cache results and prevent redundant API calls or expensive computations. This improves performance by reusing previous results when the same parameters are provided, particularly useful for data fetching methods.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      requireMemoize:
        'Async methods with 0-1 parameters should be decorated with @Memoize() to cache results and improve performance. Instead of `async getData(id?: string)`, use `@Memoize()\nasync getData(id?: string)`. Import Memoize from "typescript-memoize".',
    },
  },
  defaultOptions: [],
  create(context) {
    let hasMemoizeImport = false;
    let memoizeAlias = 'Memoize';
    let scheduledImportFix = false;

    return {
      ImportDeclaration(node) {
        if (node.source.value === 'typescript-memoize') {
          const memoizeSpecifier = node.specifiers.find(
            (spec) =>
              spec.type === AST_NODE_TYPES.ImportSpecifier &&
              spec.imported.name === 'Memoize',
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
        // Only process async instance methods (skip static methods)
        if (
          node.value.type !== AST_NODE_TYPES.FunctionExpression ||
          !node.value.async ||
          node.static
        ) {
          return;
        }

        // Skip methods with more than one parameter
        if (node.value.params.length > 1) {
          return;
        }

        // Check if method already has @Memoize or @Memoize() decorator
        const hasDecorator = node.decorators?.some((decorator) => {
          const expression = decorator.expression as any;
          // @Memoize()
          if (expr.type === AST_NODE_TYPES.CallExpression) {
            const callee = expr.callee;
            return (
              callee.type === AST_NODE_TYPES.Identifier &&
              callee.name === memoizeAlias
            );
          }
          // @Memoize (no parens)
          if (expr.type === AST_NODE_TYPES.Identifier) {
            return expr.name === memoizeAlias;
          }
          return false;
        });

        if (hasDecorator) {
          return;
        }

        context.report({
          node,
          messageId: 'requireMemoize',
          fix(fixer) {
            const fixes = [] as any[];

            // Add import if it's not already present; ensure we only add once per file
            if (!hasMemoizeImport && !scheduledImportFix) {
              const sourceCode = context.getSourceCode();
              const programBody = sourceCode.ast.body;
              const firstImport = programBody.find(
                (n) => n.type === AST_NODE_TYPES.ImportDeclaration,
              );
              const anchorNode = (firstImport ?? programBody[0]) as
                | (typeof programBody)[number]
                | undefined;

              if (anchorNode) {
                const text = sourceCode.text;
                const anchorStart = anchorNode.range![0];
                const lineStart = text.lastIndexOf('\n', anchorStart - 1) + 1;
                const leadingWhitespace = text.slice(lineStart, anchorStart).match(/^[ \t]*/)?.[0] ?? '';
                const importLine = `${leadingWhitespace}import { Memoize } from 'typescript-memoize';\n`;
                fixes.push(
                  fixer.insertTextBeforeRange([lineStart, lineStart], importLine),
                );
              } else {
                // Fallback: empty file
                fixes.push(
                  fixer.insertTextBeforeRange(
                    [0, 0],
                    "import { Memoize } from 'typescript-memoize';\n",
                  ),
                );
              }
              scheduledImportFix = true;
            }

            // Add decorator for this method
            fixes.push(
              fixer.insertTextBefore(
                node as any,
                `@${memoizeAlias}()\n${' '.repeat(node.loc.start.column)}`,
              ),
            );

            return fixes;
          },
        });
      },
    };
  },
});

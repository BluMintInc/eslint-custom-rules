import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'requireMemoize';
type Options = [];

const MEMOIZE_MODULE = 'typescript-memoize';

/**
 * Matches a memoize decorator in supported syntaxes:
 * - @Alias()
 * - @Alias
 * - @ns.Alias
 */
function isMemoizeDecorator(
  decorator: TSESTree.Decorator,
  alias: string,
): boolean {
  let expression = decorator.expression;
  if (expression.type === AST_NODE_TYPES.ParenthesizedExpression) {
    expression = expression.expression;
  }
  /* @Alias() */
  if (expression.type === AST_NODE_TYPES.CallExpression) {
    const callee = expression.callee;
    return (
      (callee.type === AST_NODE_TYPES.Identifier && callee.name === alias) ||
      (callee.type === AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.property.type === AST_NODE_TYPES.Identifier &&
        callee.property.name === alias)
    );
  }
  /* @Alias */
  if (expression.type === AST_NODE_TYPES.Identifier) {
    return expression.name === alias;
  }
  /* @ns.Alias */
  if (
    expression.type === AST_NODE_TYPES.MemberExpression &&
    !expression.computed &&
    expression.property.type === AST_NODE_TYPES.Identifier
  ) {
    return expression.property.name === alias;
  }
  return false;
}

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
    let memoizeNamespace: string | null = null;
    let scheduledImportFix = false;

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (node.source.value === MEMOIZE_MODULE) {
          node.specifiers.forEach((spec) => {
            if (
              spec.type === AST_NODE_TYPES.ImportSpecifier &&
              spec.imported.name === 'Memoize'
            ) {
              hasMemoizeImport = true;
              memoizeAlias = spec.local?.name ?? memoizeAlias;
            } else if (spec.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
              hasMemoizeImport = true;
              memoizeNamespace = spec.local.name;
            }
          });
        }
      },

      MethodDefinition(node: TSESTree.MethodDefinition) {
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
        const hasDecorator = node.decorators?.some((decorator) =>
          isMemoizeDecorator(decorator, memoizeAlias),
        );

        if (hasDecorator) {
          return;
        }

        context.report({
          node,
          messageId: 'requireMemoize',
          fix(fixer) {
            const fixes: TSESLint.RuleFix[] = [];
            const decoratorIdent = memoizeNamespace
              ? `${memoizeNamespace}.Memoize`
              : memoizeAlias;
            const decoratorIndent = ' '.repeat(node.loc.start.column);
            const importStatement = `import { Memoize } from '${MEMOIZE_MODULE}';`;

            // Add import if it's not already present; ensure we only add once per file
            if (
              !hasMemoizeImport &&
              !memoizeNamespace &&
              !scheduledImportFix &&
              !context.getSourceCode().text.includes(importStatement)
            ) {
              const sourceCode = context.getSourceCode();
              const programBody = (sourceCode.ast as TSESTree.Program).body;
              const firstImport = programBody.find(
                (n) => n.type === AST_NODE_TYPES.ImportDeclaration,
              );
              const anchorNode = (firstImport ?? programBody[0]) as
                | typeof programBody[number]
                | undefined;

              if (anchorNode) {
                const text = sourceCode.text;
                const anchorStart = anchorNode.range![0];
                const lineStart = text.lastIndexOf('\n', anchorStart - 1) + 1;
                const leadingWhitespace =
                  text.slice(lineStart, anchorStart).match(/^[ \t]*/)?.[0] ??
                  '';
                const importLine = `${leadingWhitespace}${importStatement}\n`;
                fixes.push(
                  fixer.insertTextBeforeRange(
                    [lineStart, lineStart],
                    importLine,
                  ),
                );
              } else {
                // Fallback: empty file
                fixes.push(
                  fixer.insertTextBeforeRange(
                    [0, 0],
                    `import { Memoize } from '${MEMOIZE_MODULE}';\n`,
                  ),
                );
              }
              scheduledImportFix = true;
            }

            // Add decorator for this method
            const insertionTarget =
              node.decorators && node.decorators.length > 0
                ? node.decorators[0]
                : node;
            fixes.push(
              fixer.insertTextBefore(
                insertionTarget,
                `@${decoratorIdent}()\n${decoratorIndent}`,
              ),
            );

            return fixes;
          },
        });
      },
    };
  },
});

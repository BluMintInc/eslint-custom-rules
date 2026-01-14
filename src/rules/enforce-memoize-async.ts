import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'requireMemoize';
type Options = [];

const MEMOIZE_MODULE = '@blumintinc/typescript-memoize';
const ALLOWED_MEMOIZE_MODULES = new Set([
  MEMOIZE_MODULE,
  'typescript-memoize',
]);

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
  const expression = decorator.expression;
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
        'Async methods with 0-1 parameters should be decorated with @Memoize() to cache results and improve performance. Instead of `async getData(id?: string)`, use `@Memoize()\nasync getData(id?: string)`. Import Memoize from "@blumintinc/typescript-memoize".',
    },
  },
  defaultOptions: [],
  create(context) {
    let hasMemoizeImport = false;
    const memoizeAliases = new Map<string, string>(); // alias -> source module
    const memoizeNamespaces = new Set<string>();
    let scheduledImportFix = false;

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (ALLOWED_MEMOIZE_MODULES.has(node.source.value)) {
          node.specifiers.forEach((spec) => {
            if (
              spec.type === AST_NODE_TYPES.ImportSpecifier &&
              spec.imported.name === 'Memoize'
            ) {
              hasMemoizeImport = true;
              if (spec.local) {
                memoizeAliases.set(spec.local.name, node.source.value);
              }
            } else if (spec.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
              hasMemoizeImport = true;
              memoizeNamespaces.add(spec.local.name);
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
        const hasDecorator = node.decorators?.some((decorator) => {
          // If no imports were found, we assume 'Memoize' is the intended name (for legacy/global support)
          const aliasesToCheck =
            memoizeAliases.size === 0 && memoizeNamespaces.size === 0
              ? ['Memoize']
              : Array.from(memoizeAliases.keys());

          // Check against all known aliases
          for (const alias of aliasesToCheck) {
            if (isMemoizeDecorator(decorator, alias)) {
              return true;
            }
          }
          // Also check against namespaces
          const expression = decorator.expression;
          if (
            expression.type === AST_NODE_TYPES.MemberExpression &&
            !expression.computed &&
            expression.property.type === AST_NODE_TYPES.Identifier &&
            expression.property.name === 'Memoize' &&
            expression.object.type === AST_NODE_TYPES.Identifier &&
            memoizeNamespaces.has(expression.object.name)
          ) {
            return true;
          }
          // Handle namespace call: @ns.Memoize()
          if (
            expression.type === AST_NODE_TYPES.CallExpression &&
            expression.callee.type === AST_NODE_TYPES.MemberExpression &&
            !expression.callee.computed &&
            expression.callee.property.type === AST_NODE_TYPES.Identifier &&
            expression.callee.property.name === 'Memoize' &&
            expression.callee.object.type === AST_NODE_TYPES.Identifier &&
            memoizeNamespaces.has(expression.callee.object.name)
          ) {
            return true;
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
            const fixes: TSESLint.RuleFix[] = [];
            const sourceCode = context.sourceCode;

            // Determine which identifier to use for the decorator
            let decoratorIdent = 'Memoize';
            if (hasMemoizeImport) {
              // Prefer 'Memoize' from the new package if available
              if (
                memoizeAliases.has('Memoize') &&
                memoizeAliases.get('Memoize') === MEMOIZE_MODULE
              ) {
                decoratorIdent = 'Memoize';
              } else if (memoizeAliases.size > 0) {
                // Find first alias from new package, fallback to any alias
                const newPackageAlias = Array.from(
                  memoizeAliases.entries(),
                ).find(([_, pkg]) => pkg === MEMOIZE_MODULE)?.[0];
                decoratorIdent =
                  newPackageAlias || Array.from(memoizeAliases.keys())[0];
              } else if (memoizeNamespaces.size > 0) {
                decoratorIdent = `${Array.from(memoizeNamespaces)[0]}.Memoize`;
              }
            }
            const importStatement = `import { Memoize } from '${MEMOIZE_MODULE}';`;

            // Add import if it's not already present; ensure we only add once per file
            if (
              !hasMemoizeImport &&
              memoizeNamespaces.size === 0 &&
              !scheduledImportFix
            ) {
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
            const insertionStart =
              insertionTarget.range?.[0] ?? node.range?.[0] ?? 0;
            const text = sourceCode.text;
            const lineStart = text.lastIndexOf('\n', insertionStart - 1) + 1;
            const leadingWhitespace =
              text.slice(lineStart, insertionStart).match(/^[ \t]*/)?.[0] ?? '';
            fixes.push(
              fixer.insertTextBeforeRange(
                [lineStart, lineStart],
                `${leadingWhitespace}@${decoratorIdent}()\n`,
              ),
            );

            return fixes;
          },
        });
      },
    };
  },
});

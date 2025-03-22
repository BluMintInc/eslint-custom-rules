import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';

type MessageIds = 'requireMemoize';
type Options = [];

export const requireMemoizeJsx = createRule<Options, MessageIds>({
  name: 'require-memoize-jsx',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require @Memoize() decorator on any getter or function that returns JSX to prevent unnecessary React component re-renders. Without memoization, these functions will generate a new React component instance on every call, leading to performance degradation.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      requireMemoize:
        'Getters and methods that return JSX should be decorated with @Memoize() to prevent unnecessary re-renders. Import Memoize from "typescript-memoize".',
    },
  },
  defaultOptions: [],
  create(context) {
    let hasMemoizeImport = false;
    let memoizeAlias = 'Memoize';

    // Helper function to check if a node returns JSX directly or indirectly
    const returnsJsxDirectlyOrIndirectly = (node: any): boolean => {
      // Direct JSX return
      if (ASTHelpers.returnsJSX(node)) {
        return true;
      }

      // Check for arrow functions that return JSX
      if (node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          node.type === AST_NODE_TYPES.FunctionExpression) {
        if (node.body.type === AST_NODE_TYPES.JSXElement ||
            node.body.type === AST_NODE_TYPES.JSXFragment) {
          return true;
        }

        if (node.body.type === AST_NODE_TYPES.BlockStatement) {
          for (const statement of node.body.body) {
            if (statement.type === AST_NODE_TYPES.ReturnStatement && statement.argument) {
              if (statement.argument.type === AST_NODE_TYPES.JSXElement ||
                  statement.argument.type === AST_NODE_TYPES.JSXFragment) {
                return true;
              }

              // Check for nested functions that return JSX
              if (statement.argument.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                  statement.argument.type === AST_NODE_TYPES.FunctionExpression) {
                if (returnsJsxDirectlyOrIndirectly(statement.argument)) {
                  return true;
                }
              }
            }
          }
        }
      }

      // Check for functions that return functions that return JSX
      if (node.type === AST_NODE_TYPES.ReturnStatement && node.argument) {
        if (node.argument.type === AST_NODE_TYPES.JSXElement ||
            node.argument.type === AST_NODE_TYPES.JSXFragment) {
          return true;
        }

        if (node.argument.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            node.argument.type === AST_NODE_TYPES.FunctionExpression) {
          return returnsJsxDirectlyOrIndirectly(node.argument);
        }
      }

      return false;
    };

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

      // Check class methods
      MethodDefinition(node) {
        // Skip if it's not a method or getter
        if (
          node.value.type !== AST_NODE_TYPES.FunctionExpression ||
          (node.kind !== 'method' && node.kind !== 'get')
        ) {
          return;
        }

        // Check if method already has @Memoize decorator
        const hasDecorator = node.decorators?.some((decorator) => {
          if (decorator.expression.type !== AST_NODE_TYPES.CallExpression) {
            return false;
          }
          const callee = decorator.expression.callee;
          return (
            callee.type === AST_NODE_TYPES.Identifier &&
            callee.name === memoizeAlias
          );
        });

        if (hasDecorator) {
          return;
        }

        // Check if the method returns JSX
        let returnsJsx = false;

        if (node.value.body && node.value.body.type === AST_NODE_TYPES.BlockStatement) {
          for (const statement of node.value.body.body) {
            if (statement.type === AST_NODE_TYPES.ReturnStatement) {
              if (returnsJsxDirectlyOrIndirectly(statement)) {
                returnsJsx = true;
                break;
              }

              // Special case for double-wrapped JSX
              if (statement.argument &&
                  (statement.argument.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                   statement.argument.type === AST_NODE_TYPES.FunctionExpression)) {
                const func = statement.argument;
                if (func.body.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                    func.body.type === AST_NODE_TYPES.FunctionExpression) {
                  if (returnsJsxDirectlyOrIndirectly(func.body)) {
                    returnsJsx = true;
                    break;
                  }
                }
              }
            }
          }
        }

        if (returnsJsx) {
          context.report({
            node,
            messageId: 'requireMemoize',
            *fix(fixer) {
              // Add import if needed
              if (!hasMemoizeImport) {
                const importStatement = 'import { Memoize } from "typescript-memoize";\n';
                yield fixer.insertTextBeforeRange([0, 0], importStatement);
                hasMemoizeImport = true;
              }

              // Add decorator
              yield fixer.insertTextBefore(
                node,
                `@${memoizeAlias}()\n${' '.repeat(node.loc.start.column)}`,
              );
            },
          });
        }
      },
    };
  },
});

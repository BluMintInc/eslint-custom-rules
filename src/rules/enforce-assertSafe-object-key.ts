import { AST_NODE_TYPES, TSESTree, TSESLint } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'useAssertSafe';
type Options = [];

export const enforceAssertSafeObjectKey = createRule<Options, MessageIds>({
  name: 'enforce-assertSafe-object-key',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce the use of assertSafe(id) when accessing object properties with computed keys that involve string interpolation or explicit string conversion.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      useAssertSafe:
        'Use assertSafe() for object key access to ensure safe property access. Replace `obj[String(id)]` or `obj[`${id}`]` with `obj[assertSafe(id)]`.',
    },
  },
  defaultOptions: [],
  create(context) {
    let hasAssertSafeImport = false;

    /**
     * Helper function to add assertSafe import if needed
     */
    const addAssertSafeImport = (fixer: TSESLint.RuleFixer): TSESLint.RuleFix => {
      const program = context.getSourceCode().ast;
      const firstImport = program.body.find(
        (node) => node.type === AST_NODE_TYPES.ImportDeclaration
      );
      const importStatement = "import { assertSafe } from 'utils/assertions';\n";

      if (firstImport) {
        return fixer.insertTextBefore(firstImport, importStatement);
      } else {
        return fixer.insertTextBefore(program.body[0], importStatement);
      }
    };

    /**
     * Helper function to create fixes for a node
     */
    const createFixes = (
      fixer: TSESLint.RuleFixer,
      node: TSESTree.Node,
      argText: string
    ): TSESLint.RuleFix[] => {
      const fixes: TSESLint.RuleFix[] = [];

      // Add import if not present
      if (!hasAssertSafeImport) {
        fixes.push(addAssertSafeImport(fixer));
        hasAssertSafeImport = true;
      }

      // Replace the node with assertSafe(argText)
      fixes.push(fixer.replaceText(node, `assertSafe(${argText})`));

      return fixes;
    };

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        // Check if assertSafe is already imported
        if (
          node.specifiers.some(
            (specifier) =>
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.imported.name === 'assertSafe'
          )
        ) {
          hasAssertSafeImport = true;
        }
      },
      // Handle computed property in object destructuring
      Property(node: TSESTree.Property) {
        if (node.computed && node.key) {
          const key = node.key;

          // Check for String(id) pattern
          if (
            key.type === AST_NODE_TYPES.CallExpression &&
            key.callee.type === AST_NODE_TYPES.Identifier &&
            key.callee.name === 'String'
          ) {
            context.report({
              node: key,
              messageId: 'useAssertSafe',
              fix(fixer) {
                const arg = key.arguments[0];
                const argText = context.getSourceCode().getText(arg);
                return createFixes(fixer, key, argText);
              },
            });
          }

          // Check for template literals like `${id}`
          if (
            key.type === AST_NODE_TYPES.TemplateLiteral &&
            key.expressions.length === 1 &&
            key.quasis.length === 2 &&
            key.quasis[0].value.raw === '' &&
            key.quasis[1].value.raw === ''
          ) {
            context.report({
              node: key,
              messageId: 'useAssertSafe',
              fix(fixer) {
                const expr = key.expressions[0];
                const exprText = context.getSourceCode().getText(expr);
                return createFixes(fixer, key, exprText);
              },
            });
          }
        }
      },
      // Handle binary expressions like 'key' in obj
      BinaryExpression(node: TSESTree.BinaryExpression) {
        if (node.operator === 'in') {
          const left = node.left;

          // Check for String(id) pattern
          if (
            left.type === AST_NODE_TYPES.CallExpression &&
            left.callee.type === AST_NODE_TYPES.Identifier &&
            left.callee.name === 'String'
          ) {
            context.report({
              node: left,
              messageId: 'useAssertSafe',
              fix(fixer) {
                const arg = left.arguments[0];
                const argText = context.getSourceCode().getText(arg);
                return createFixes(fixer, left, argText);
              },
            });
          }

          // Check for template literals like `${id}`
          if (
            left.type === AST_NODE_TYPES.TemplateLiteral &&
            left.expressions.length === 1 &&
            left.quasis.length === 2 &&
            left.quasis[0].value.raw === '' &&
            left.quasis[1].value.raw === ''
          ) {
            context.report({
              node: left,
              messageId: 'useAssertSafe',
              fix(fixer) {
                const expr = left.expressions[0];
                const exprText = context.getSourceCode().getText(expr);
                return createFixes(fixer, left, exprText);
              },
            });
          }
        }
      },
      MemberExpression(node: TSESTree.MemberExpression) {
        if (node.computed) {
          const property = node.property;

          // Check for String(id) pattern
          if (
            property.type === AST_NODE_TYPES.CallExpression &&
            property.callee.type === AST_NODE_TYPES.Identifier &&
            property.callee.name === 'String'
          ) {
            context.report({
              node: property,
              messageId: 'useAssertSafe',
              fix(fixer) {
                const arg = property.arguments[0];
                const argText = context.getSourceCode().getText(arg);
                return createFixes(fixer, property, argText);
              },
            });
          }

          // Check for template literals like `${id}`
          if (property.type === AST_NODE_TYPES.TemplateLiteral) {
            // Only target simple template literals with a single expression
            if (
              property.expressions.length === 1 &&
              property.quasis.length === 2 &&
              property.quasis[0].value.raw === '' &&
              property.quasis[1].value.raw === ''
            ) {
              context.report({
                node: property,
                messageId: 'useAssertSafe',
                fix(fixer) {
                  const expr = property.expressions[0];
                  const exprText = context.getSourceCode().getText(expr);
                  return createFixes(fixer, property, exprText);
                },
              });
            }
          }

          // Check for variables that were defined using template literals
          if (property.type === AST_NODE_TYPES.Identifier) {
            const sourceCode = context.getSourceCode();
            // Note: context.getScope() is deprecated in ESLint v9, but we're using an earlier version
            // When upgrading to ESLint v9, change to sourceCode.getScope()
            const scope = context.getScope();
            const variable = scope.variables.find(v => v.name === property.name);

            if (variable && variable.defs.length > 0) {
              const def = variable.defs[0];

              if (
                def.node.type === AST_NODE_TYPES.VariableDeclarator &&
                def.node.init &&
                def.node.init.type === AST_NODE_TYPES.TemplateLiteral &&
                def.node.init.expressions.length === 1 &&
                def.node.init.quasis.length === 2 &&
                def.node.init.quasis[0].value.raw === '' &&
                def.node.init.quasis[1].value.raw === ''
              ) {
                context.report({
                  node: property,
                  messageId: 'useAssertSafe',
                  fix(fixer) {
                    const propText = sourceCode.getText(property);
                    return createFixes(fixer, property, propText);
                  },
                });
              }
            }
          }
        }
      },
    };
  },
});

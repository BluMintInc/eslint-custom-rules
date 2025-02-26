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
                const fixes: TSESLint.RuleFix[] = [];

                // Add import if not present
                if (!hasAssertSafeImport) {
                  const program = context.getSourceCode().ast;
                  const firstImport = program.body.find(
                    (node) => node.type === AST_NODE_TYPES.ImportDeclaration
                  );
                  const importStatement = "import { assertSafe } from 'utils/assertions';\n";

                  if (firstImport) {
                    fixes.push(fixer.insertTextBefore(firstImport, importStatement));
                  } else {
                    fixes.push(fixer.insertTextBefore(program.body[0], importStatement));
                  }
                  hasAssertSafeImport = true;
                }

                // Replace String(id) with assertSafe(id)
                const arg = property.arguments[0];
                const argText = context.getSourceCode().getText(arg);
                fixes.push(fixer.replaceText(property, `assertSafe(${argText})`));

                return fixes;
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
                  const fixes: TSESLint.RuleFix[] = [];

                  // Add import if not present
                  if (!hasAssertSafeImport) {
                    const program = context.getSourceCode().ast;
                    const firstImport = program.body.find(
                      (node) => node.type === AST_NODE_TYPES.ImportDeclaration
                    );
                    const importStatement = "import { assertSafe } from 'utils/assertions';\n";

                    if (firstImport) {
                      fixes.push(fixer.insertTextBefore(firstImport, importStatement));
                    } else {
                      fixes.push(fixer.insertTextBefore(program.body[0], importStatement));
                    }
                    hasAssertSafeImport = true;
                  }

                  // Replace `${id}` with assertSafe(id)
                  const expr = property.expressions[0];
                  const exprText = context.getSourceCode().getText(expr);
                  fixes.push(fixer.replaceText(property, `assertSafe(${exprText})`));

                  return fixes;
                },
              });
            }
          }
        }
      },
    };
  },
});

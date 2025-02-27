import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noFrontendTimestampImport';

export const noFrontendTimestampImport = createRule<[], MessageIds>({
  name: 'no-frontend-timestamp-import',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent importing Timestamp from firebase-admin/firestore in frontend code. In Firestore\'s frontend SDK, timestamp fields are automatically converted to Date, making the explicit use of Timestamp unnecessary and potentially problematic.',
      recommended: 'error',
      requiresTypeChecking: false,
      extendsBaseRule: false,
    },
    fixable: 'code',
    schema: [],
    messages: {
      noFrontendTimestampImport:
        'Do not import Timestamp from firebase-admin/firestore in frontend code. Use Date objects instead.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Only apply this rule to frontend code (src/ directory but not functions/src/)
    const filename = context.getFilename();

    // Skip backend code and test files
    if (filename.includes('functions/src/') ||
        filename.includes('.test.') ||
        filename.includes('.spec.')) {
      return {};
    }

    // Only apply to frontend code
    if (!filename.includes('src/')) {
      return {};
    }

    return {
      ImportDeclaration(node): void {
        // Check for imports from firebase-admin/firestore
        if (node.source.value === 'firebase-admin/firestore') {
          // Look for Timestamp imports
          node.specifiers.forEach((specifier) => {
            if (
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.imported.type === AST_NODE_TYPES.Identifier &&
              specifier.imported.name === 'Timestamp'
            ) {
              // Allow type-only imports
              if (node.importKind === 'type' || specifier.importKind === 'type') {
                return;
              }

              context.report({
                node: specifier,
                messageId: 'noFrontendTimestampImport',
                fix(fixer) {
                  // If it's the only import, remove the entire import declaration
                  if (node.specifiers.length === 1) {
                    return fixer.remove(node);
                  }

                  const sourceCode = context.getSourceCode();

                  // Create a new import statement without the Timestamp import
                  const newSpecifiers = node.specifiers
                    .filter(s =>
                      s !== specifier &&
                      !(s.type === AST_NODE_TYPES.ImportSpecifier &&
                        s.imported.type === AST_NODE_TYPES.Identifier &&
                        s.imported.name === 'Timestamp')
                    )
                    .map(s => sourceCode.getText(s))
                    .join(', ');

                  const newImport = `import { ${newSpecifiers} } from 'firebase-admin/firestore';`;

                  return fixer.replaceText(node, newImport);
                }
              });
            }
          });
        }
      },

      // Handle dynamic imports
      ImportExpression(node): void {
        if (
          node.source.type === AST_NODE_TYPES.Literal &&
          node.source.value === 'firebase-admin/firestore'
        ) {
          // We can't easily check what's being destructured from the dynamic import
          // So we'll report a more general warning
          const parent = node.parent;

          if (
            parent?.type === AST_NODE_TYPES.AwaitExpression &&
            parent.parent?.type === AST_NODE_TYPES.VariableDeclarator
          ) {
            const declarator = parent.parent;

            // Check if Timestamp is being destructured
            if (declarator.id.type === AST_NODE_TYPES.ObjectPattern) {
              declarator.id.properties.forEach((prop) => {
                if (
                  prop.type === AST_NODE_TYPES.Property &&
                  prop.key.type === AST_NODE_TYPES.Identifier &&
                  prop.key.name === 'Timestamp'
                ) {
                  context.report({
                    node: prop,
                    messageId: 'noFrontendTimestampImport',
                  });
                }
              });
            }
          }
        }
      }
    };
  },
});

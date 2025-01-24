import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'useCustomMemo';

export const useCustomMemo = createRule<[], MessageIds>({
  name: 'use-custom-memo',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce using src/util/memo instead of React memo',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      useCustomMemo: 'Import memo from src/util/memo instead of react',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (node.source.value === 'react') {
          const specifiers = node.specifiers.filter(
            (specifier): specifier is TSESTree.ImportSpecifier =>
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.imported.type === AST_NODE_TYPES.Identifier &&
              specifier.imported.name === 'memo',
          );

          if (specifiers.length > 0) {
            context.report({
              node,
              messageId: 'useCustomMemo',
              fix(fixer) {
                // If there are other imports from react, keep them
                const otherSpecifiers = node.specifiers.filter(
                  (specifier): specifier is TSESTree.ImportSpecifier =>
                    specifier.type !== AST_NODE_TYPES.ImportSpecifier ||
                    (specifier.imported.type === AST_NODE_TYPES.Identifier &&
                      specifier.imported.name !== 'memo'),
                );

                if (otherSpecifiers.length === 0) {
                  // If memo is the only import, replace the entire import
                  return fixer.replaceText(
                    node,
                    `import { ${specifiers
                      .map((s) =>
                        s.local.name !== s.imported.name
                          ? `memo as ${s.local.name}`
                          : 'memo',
                      )
                      .join(', ')} } from 'src/util/memo';`,
                  );
                } else {
                  // Create a new import for memo and keep other imports
                  const memoImport = `import { ${specifiers
                    .map((s) =>
                      s.local.name !== s.imported.name
                        ? `memo as ${s.local.name}`
                        : 'memo',
                    )
                    .join(', ')} } from 'src/util/memo';\n`;

                  const otherImports = `import { ${otherSpecifiers
                    .map((s) => s.local.name)
                    .join(', ')} } from 'react';`;

                  return fixer.replaceText(node, memoImport + otherImports);
                }
              },
            });
          }
        }
      },
    };
  },
});

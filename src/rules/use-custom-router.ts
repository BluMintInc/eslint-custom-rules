import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'useCustomRouter';

export const useCustomRouter = createRule<[], MessageIds>({
  name: 'use-custom-router',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using src/hooks/routing/useRouter instead of next/router',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      useCustomRouter:
        'Import useRouter from src/hooks/routing/useRouter instead of next/router',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (node.source.value === 'next/router') {
          const specifiers = node.specifiers.filter(
            (specifier): specifier is TSESTree.ImportSpecifier =>
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.imported.type === AST_NODE_TYPES.Identifier &&
              specifier.imported.name === 'useRouter',
          );

          if (specifiers.length > 0) {
            context.report({
              node,
              messageId: 'useCustomRouter',
              fix(fixer) {
                // If there are other imports from next/router, keep them
                const otherSpecifiers = node.specifiers.filter(
                  (specifier): specifier is TSESTree.ImportSpecifier =>
                    specifier.type !== AST_NODE_TYPES.ImportSpecifier ||
                    (specifier.imported.type === AST_NODE_TYPES.Identifier &&
                      specifier.imported.name !== 'useRouter'),
                );

                if (otherSpecifiers.length === 0) {
                  // If useRouter is the only import, replace the entire import
                  return fixer.replaceText(
                    node,
                    `import { ${specifiers
                      .map((s) =>
                        s.local.name !== s.imported.name
                          ? `useRouter as ${s.local.name}`
                          : 'useRouter',
                      )
                      .join(', ')} } from 'src/hooks/routing/useRouter';`,
                  );
                } else {
                  // Create a new import for useRouter and keep other imports
                  const useRouterImport = `import { ${specifiers
                    .map((s) =>
                      s.local.name !== s.imported.name
                        ? `useRouter as ${s.local.name}`
                        : 'useRouter',
                    )
                    .join(', ')} } from 'src/hooks/routing/useRouter';\n`;

                  const otherImports = `import { ${otherSpecifiers
                    .map((s) => s.local.name)
                    .join(', ')} } from 'next/router';`;

                  return fixer.replaceText(
                    node,
                    useRouterImport + otherImports,
                  );
                }
              },
            });
          }
        }
      },
    };
  },
});

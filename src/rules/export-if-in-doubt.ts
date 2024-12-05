// import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';

export const exportIfInDoubt: TSESLint.RuleModule<'exportIfInDoubt', never[]> =
  createRule({
    name: 'export-if-in-doubt',
    meta: {
      type: 'suggestion',
      docs: {
        description:
          'All top-level const definitions, type definitions, and functions should be exported',
        recommended: 'warn',
      },
      schema: [],
      messages: {
        exportIfInDoubt:
          'Top-level const definitions, type definitions, and functions should be exported.',
      },
    },
    defaultOptions: [],
    create(context) {
      // List of top-level declarations
      // List of exported identifiers
      const topLevelDeclarations: TSESTree.Node[] = [];
      const exportedIdentifiers: string[] = [];

      return {
        'Program > VariableDeclaration > VariableDeclarator, Program > FunctionDeclaration, Program > TSTypeAliasDeclaration'(
          node: TSESTree.Node,
        ) {
          topLevelDeclarations.push(node);
        },
        ExportNamedDeclaration: (node: TSESTree.ExportNamedDeclaration) => {
          if (node.specifiers) {
            node.specifiers.forEach((specifier) => {
              if (specifier.type === 'ExportSpecifier') {
                // Handle both normal and default export
                const exportedName = specifier.exported.name;
                if (!exportedIdentifiers.includes(exportedName)) {
                  exportedIdentifiers.push(exportedName);
                }
                // If the specifier is a default export
                if (specifier.local.name !== exportedName) {
                  const localName = specifier.local.name;
                  if (!exportedIdentifiers.includes(localName)) {
                    exportedIdentifiers.push(localName);
                  }
                }
              }
            });
          }
        },
        'Program:exit': () => {
          topLevelDeclarations.forEach((node) => {
            if (
              'id' in node &&
              node.id &&
              (node.type === 'VariableDeclarator' ||
                node.type === 'FunctionDeclaration' ||
                node.type === 'TSTypeAliasDeclaration') &&
              node.id.type === 'Identifier' &&
              !exportedIdentifiers.includes(node.id.name)
            ) {
              context.report({
                node,
                messageId: 'exportIfInDoubt',
              });
            }
          });
        },
      };
    },
  });

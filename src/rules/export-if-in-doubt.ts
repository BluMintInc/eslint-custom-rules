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
        recommended: 'error',
      },
      schema: [],
      messages: {
        exportIfInDoubt:
          'Top-level {{kind}} "{{name}}" is not exported. Module-level declarations define the file\'s public API; leaving this unexported makes the code effectively dead to other modules and hides reusable utilities. Export it (for example "{{exportExample}}") or move it into a narrower scope if it is intentionally private.',
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
              const name = node.id.name;
              const kind =
                node.type === 'VariableDeclarator'
                  ? node.parent?.type === 'VariableDeclaration'
                    ? node.parent.kind
                    : 'const'
                  : node.type === 'FunctionDeclaration'
                  ? 'function'
                  : 'type';
              const exportExample =
                node.type === 'VariableDeclarator'
                  ? `export ${kind} ${name}`
                  : node.type === 'FunctionDeclaration'
                  ? `export function ${name}`
                  : `export type ${name}`;
              context.report({
                node,
                messageId: 'exportIfInDoubt',
                data: {
                  name,
                  kind,
                  exportExample,
                },
              });
            }
          });
        },
      };
    },
  });

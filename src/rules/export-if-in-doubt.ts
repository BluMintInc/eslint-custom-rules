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
          'All top-level variable declarations, type definitions, and functions should be exported',
        recommended: 'error',
      },
      schema: [],
      messages: {
        exportIfInDoubt:
          'What\'s wrong: Top-level {{kind}} "{{name}}" is not exported. Why it matters: Top-level declarations define your module\'s public API; leaving this unexported makes it unusable from other files and hides reusable utilities (often resulting in dead code or duplicated implementations). How to fix: Export it (for example: {{exportExample}}) or move it into a narrower scope if it is intentionally private.',
      },
    },
    defaultOptions: [],
    create(context) {
      const topLevelDeclarations: TSESTree.Node[] = [];
      const exportedIdentifiers: string[] = [];
      const getDeclarationKind = (
        node: TSESTree.Node,
      ): TSESTree.VariableDeclaration['kind'] | 'function' | 'type' => {
        if (node.type === 'VariableDeclarator') {
          const variableParent = node.parent;
          if (variableParent?.type === 'VariableDeclaration') {
            return variableParent.kind;
          }
          return 'const';
        }
        if (node.type === 'FunctionDeclaration') {
          return 'function';
        }
        return 'type';
      };

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
              const kind = getDeclarationKind(node);
              const exportExample =
                node.type === 'VariableDeclarator'
                  ? `export ${kind} ${name} = undefined;`
                  : node.type === 'FunctionDeclaration'
                  ? `export function ${name}() {}`
                  : `export type ${name} = unknown;`;
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

import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';

export const exportIfInDoubt: TSESLint.RuleModule<'exportIfInDoubt', never[]> =
  createRule({
    name: 'always-export',
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
      return {
        'Program > VariableDeclaration > VariableDeclarator, Program > FunctionDeclaration, Program > TSTypeAliasDeclaration'(
          node: TSESTree.Node,
        ) {
          if (
            (node.parent && node.parent.type !== 'ExportNamedDeclaration') ||
            (node.parent &&
              node.parent.parent &&
              node.parent.parent.type !== 'ExportNamedDeclaration')
          ) {
            context.report({
              node,
              messageId: 'exportIfInDoubt',
            });
          }
        },
      };
    },
  });

import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type Options = [];
type MessageIds =
  | 'missingPropsType'
  | 'missingResponseType'
  | 'unusedPropsType'
  | 'unusedResponseType';

export const enforceCallableTypes = createRule<Options, MessageIds>({
  name: 'enforce-callable-types',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce Props and Response type exports in callable functions',
      recommended: 'error',
    },
    schema: [],
    messages: {
      missingPropsType: 'Missing Props type export in callable function file',
      missingResponseType:
        'Missing Response type export in callable function file',
      unusedPropsType:
        'Props type is exported but not used in the callable function',
      unusedResponseType:
        'Response type is exported but not used in the callable function',
    },
  },
  defaultOptions: [],
  create(context) {
    const filename = context.getFilename();

    // Only apply to .f.ts files in the callable directory, but ignore scripts directory
    if (
      !filename.endsWith('.f.ts') ||
      !filename.includes('/callable/') ||
      filename.includes('/callable/scripts/')
    ) {
      return {};
    }

    let hasPropsExport = false;
    let hasResponseExport = false;
    let hasCallableFunction = false;
    let propsTypeUsed = false;
    let responseTypeUsed = false;

    return {
      // Check for type exports
      ExportNamedDeclaration(node) {
        if (node.declaration?.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
          const typeName = node.declaration.id.name;
          if (typeName === 'Props') {
            hasPropsExport = true;
          } else if (typeName === 'Response') {
            hasResponseExport = true;
          }
        }
      },

      // Check for onCall usage
      CallExpression(node) {
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === 'onCall'
        ) {
          hasCallableFunction = true;
        }
      },

      // Check for type usage in function parameters and return types
      TSTypeReference(node) {
        if (node.typeName.type === AST_NODE_TYPES.Identifier) {
          if (node.typeName.name === 'Props') {
            propsTypeUsed = true;
          } else if (node.typeName.name === 'Response') {
            responseTypeUsed = true;
          }
        }
      },

      'Program:exit'() {
        if (!hasCallableFunction) {
          return;
        }

        if (!hasPropsExport) {
          context.report({
            loc: { line: 1, column: 0 },
            messageId: 'missingPropsType',
          });
        } else if (!propsTypeUsed) {
          context.report({
            loc: { line: 1, column: 0 },
            messageId: 'unusedPropsType',
          });
        }

        if (!hasResponseExport) {
          context.report({
            loc: { line: 1, column: 0 },
            messageId: 'missingResponseType',
          });
        } else if (!responseTypeUsed) {
          context.report({
            loc: { line: 1, column: 0 },
            messageId: 'unusedResponseType',
          });
        }
      },
    };
  },
});

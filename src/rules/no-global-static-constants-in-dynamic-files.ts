import { createRule } from '../utils/createRule';
import path from 'path';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

export const RULE_NAME = 'no-global-static-constants-in-dynamic-files';

export default createRule<[], 'noGlobalStaticConstantsInDynamicFiles'>({
  name: RULE_NAME,
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow global static constants in .dynamic.ts/.dynamic.tsx files',
      recommended: 'error',
    },
    schema: [],
    messages: {
      noGlobalStaticConstantsInDynamicFiles:
        'Global static constants (export const in SCREAMING_SNAKE_CASE) should not be defined in .dynamic.ts/.dynamic.tsx files. Move this constant to a non-dynamic file.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Get the file path and name
    const filePath = context.getFilename();
    const fileName = path.basename(filePath);

    // Check if the file has .dynamic.ts or .dynamic.tsx extension
    const hasDynamicExtension = /\.dynamic\.tsx?$/.test(fileName);

    // Skip if not a dynamic file
    if (!hasDynamicExtension) {
      return {};
    }

    // Function to check if a string is in SCREAMING_SNAKE_CASE
    const isScreamingSnakeCase = (str: string): boolean => {
      return /^[A-Z][A-Z0-9_]*$/.test(str);
    };

    return {
      // Look for export declarations
      ExportNamedDeclaration(node) {
        // Check if it's a variable declaration (export const X = ...)
        if (
          node.declaration &&
          node.declaration.type === AST_NODE_TYPES.VariableDeclaration &&
          node.declaration.kind === 'const'
        ) {
          // Check each variable declarator
          for (const declarator of node.declaration.declarations) {
            // Check if the variable name is in SCREAMING_SNAKE_CASE
            if (
              declarator.id.type === AST_NODE_TYPES.Identifier &&
              isScreamingSnakeCase(declarator.id.name)
            ) {
              context.report({
                node: declarator.id,
                messageId: 'noGlobalStaticConstantsInDynamicFiles',
              });
            }
          }
        }
      },
    };
  },
});

import { createRule } from '../utils/createRule';
import path from 'path';

export const RULE_NAME = 'enforce-dynamic-file-naming';

export default createRule<
  [],
  'requireDynamicExtension' | 'requireDisableDirective'
>({
  name: RULE_NAME,
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce .dynamic.ts(x) file naming when @blumintinc/blumint/enforce-dynamic-imports or @blumintinc/blumint/require-dynamic-firebase-imports rule is disabled',
      recommended: 'error',
    },
    schema: [],
    messages: {
      requireDynamicExtension:
        'Files with disabled @blumintinc/blumint/enforce-dynamic-imports or @blumintinc/blumint/require-dynamic-firebase-imports rule must use .dynamic.ts(x) extension',
      requireDisableDirective:
        'Files with .dynamic.ts(x) extension must have at least one @blumintinc/blumint/enforce-dynamic-imports or @blumintinc/blumint/require-dynamic-firebase-imports disable directive',
    },
  },
  defaultOptions: [],
  create(context) {
    // Get the file path and name
    const filePath = context.getFilename();
    const fileName = path.basename(filePath);

    // Check if the file is a TypeScript file (ends with .ts or .tsx)
    // Ignore files with other extensions like .test.ts, .deprecated.ts, etc.
    const isTypeScriptFile = /^[^.]+\.tsx?$/.test(fileName);

    // Check if the file has .dynamic.ts or .dynamic.tsx extension
    const hasDynamicExtension = /\.dynamic\.tsx?$/.test(fileName);

    // Skip if not a TypeScript file or has other extensions
    if (!isTypeScriptFile && !hasDynamicExtension) {
      return {};
    }

    // Track if we found a disable directive for enforce-dynamic-imports
    let foundDisableDirective = false;

    return {
      Program() {
        // Get the source code
        const sourceCode = context.getSourceCode();
        const comments = sourceCode.getAllComments();

        // Check all comments for disable directives
        for (const comment of comments) {
          const commentText = comment.value.trim();

          // Check for inline disable directive for either rule
          if (
            (commentText.includes('eslint-disable-next-line') ||
              commentText.includes('ednl')) &&
            (commentText.includes('@blumintinc/blumint/enforce-dynamic-imports') ||
             commentText.includes('@blumintinc/blumint/require-dynamic-firebase-imports'))
          ) {
            foundDisableDirective = true;
            break;
          }

          // Check for block disable directive for either rule
          if (
            commentText.includes('eslint-disable ') &&
            (commentText.includes('@blumintinc/blumint/enforce-dynamic-imports') ||
             commentText.includes('@blumintinc/blumint/require-dynamic-firebase-imports'))
          ) {
            foundDisableDirective = true;
            break;
          }
        }

        // If we found a disable directive but the file doesn't have .dynamic extension
        if (foundDisableDirective && !hasDynamicExtension) {
          context.report({
            loc: { line: 1, column: 0 },
            messageId: 'requireDynamicExtension',
          });
        }

        // If the file has .dynamic extension but no disable directive
        if (hasDynamicExtension && !foundDisableDirective) {
          context.report({
            loc: { line: 1, column: 0 },
            messageId: 'requireDisableDirective',
          });
        }
      },
    };
  },
});

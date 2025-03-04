import { createRule } from '../utils/createRule';
import path from 'path';

export const RULE_NAME = 'enforce-dynamic-file-naming';

export default createRule<[], 'requireDynamicExtension' | 'requireDisableDirective'>({
  name: RULE_NAME,
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce .dynamic.ts(x) file naming when @blumintinc/blumint/enforce-dynamic-imports rule is disabled',
      recommended: 'error',
    },
    schema: [],
    messages: {
      requireDynamicExtension: 'Files with disabled @blumintinc/blumint/enforce-dynamic-imports rule must use .dynamic.ts(x) extension',
      requireDisableDirective: 'Files with .dynamic.ts(x) extension must have at least one @blumintinc/blumint/enforce-dynamic-imports disable directive',
    },
  },
  defaultOptions: [],
  create(context) {
    const filename = context.getFilename();
    const ext = path.extname(filename);

    // Only apply to .ts and .tsx files
    if (ext !== '.ts' && ext !== '.tsx') {
      return {};
    }

    // Skip files with additional extensions like .test.ts, .deprecated.ts, etc.
    const basename = path.basename(filename);
    if (basename.split('.').length > 2 && !basename.endsWith('.dynamic.ts') && !basename.endsWith('.dynamic.tsx')) {
      return {};
    }

    const isDynamicFile = basename.endsWith('.dynamic.ts') || basename.endsWith('.dynamic.tsx');
    let hasDisableDirective = false;
    let hasImport = false;

    return {
      Program() {
        // Get the source code
        const sourceCode = context.getSourceCode();
        const comments = sourceCode.getAllComments();

        // Check for disable directives in comments
        for (const comment of comments) {
          const commentText = comment.value;
          if (
            commentText.includes('eslint-disable-next-line @blumintinc/blumint/enforce-dynamic-imports') ||
            commentText.includes('eslint-disable @blumintinc/blumint/enforce-dynamic-imports') ||
            commentText.includes('eslint-disable-line @blumintinc/blumint/enforce-dynamic-imports') ||
            (commentText.includes('eslint-disable') && commentText.includes('@blumintinc/blumint/enforce-dynamic-imports'))
          ) {
            hasDisableDirective = true;
            break;
          }
        }
      },
      ImportDeclaration() {
        hasImport = true;
      },
      'Program:exit'() {
        // Only apply the rule if the file has imports
        if (!hasImport) {
          return;
        }

        // If the rule is disabled but the file doesn't have .dynamic extension
        if (hasDisableDirective && !isDynamicFile) {
          context.report({
            loc: { line: 1, column: 0 },
            messageId: 'requireDynamicExtension',
          });
        }

        // If the file has .dynamic extension but the rule isn't disabled
        if (isDynamicFile && !hasDisableDirective) {
          context.report({
            loc: { line: 1, column: 0 },
            messageId: 'requireDisableDirective',
          });
        }
      },
    };
  },
});

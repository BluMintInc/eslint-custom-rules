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
        'File "{{fileName}}" disables "{{ruleName}}" but keeps the standard {{extension}} extension, hiding that dynamic-import safeguards are bypassed. Rename to "{{suggestedName}}" (or another *.dynamic.ts/tsx name) so the exception is visible and static-import hotspots stay easy to audit.',
      requireDisableDirective:
        'File "{{fileName}}" uses the ".dynamic" suffix that signals dynamic-import rules are disabled, but it lacks a disable directive for "@blumintinc/blumint/enforce-dynamic-imports" or "@blumintinc/blumint/require-dynamic-firebase-imports". Add the matching disable comment for the static import you need, or rename the file to "{{standardName}}" so the rules keep protecting other files.',
    },
  },
  defaultOptions: [],
  create(context) {
    const filePath = context.getFilename();
    const fileName = path.basename(filePath);
    const extension = path.extname(fileName) || '.ts';

    const isTypeScriptFile = /^[^.]+\.tsx?$/.test(fileName);

    const hasDynamicExtension = /\.dynamic\.tsx?$/.test(fileName);

    if (!isTypeScriptFile && !hasDynamicExtension) {
      return {};
    }

    let foundDisableDirective = false;
    let disabledRuleName: string | null = null;

    return {
      Program() {
        const sourceCode = context.getSourceCode();
        const comments = sourceCode.getAllComments();

        for (const comment of comments) {
          const commentText = comment.value.trim();
          const disablesEnforceDynamicImports = commentText.includes(
            '@blumintinc/blumint/enforce-dynamic-imports',
          );
          const disablesRequireDynamicFirebaseImports = commentText.includes(
            '@blumintinc/blumint/require-dynamic-firebase-imports',
          );
          const disablesTargetRule =
            disablesEnforceDynamicImports || disablesRequireDynamicFirebaseImports;

          const inlineDisable =
            (commentText.includes('eslint-disable-next-line') ||
              commentText.includes('ednl')) &&
            disablesTargetRule;
          const blockDisable =
            commentText.includes('eslint-disable ') && disablesTargetRule;

          if (inlineDisable || blockDisable) {
            foundDisableDirective = true;
            if (disablesEnforceDynamicImports && !disablesRequireDynamicFirebaseImports) {
              disabledRuleName = '@blumintinc/blumint/enforce-dynamic-imports';
            } else if (
              disablesRequireDynamicFirebaseImports &&
              !disablesEnforceDynamicImports
            ) {
              disabledRuleName = '@blumintinc/blumint/require-dynamic-firebase-imports';
            } else {
              disabledRuleName =
                '@blumintinc/blumint/enforce-dynamic-imports or @blumintinc/blumint/require-dynamic-firebase-imports';
            }
            break;
          }
        }

        if (foundDisableDirective && !hasDynamicExtension) {
          const suggestedName = fileName.replace(/\.tsx?$/, '.dynamic$&');
          context.report({
            loc: { line: 1, column: 0 },
            messageId: 'requireDynamicExtension',
            data: {
              fileName,
              ruleName:
                disabledRuleName ??
                '@blumintinc/blumint/enforce-dynamic-imports or @blumintinc/blumint/require-dynamic-firebase-imports',
              extension,
              suggestedName,
            },
          });
        }

        if (hasDynamicExtension && !foundDisableDirective) {
          const standardName = fileName.replace(/\.dynamic(?=\.tsx?$)/, '');
          context.report({
            loc: { line: 1, column: 0 },
            messageId: 'requireDisableDirective',
            data: {
              fileName,
              standardName,
            },
          });
        }
      },
    };
  },
});

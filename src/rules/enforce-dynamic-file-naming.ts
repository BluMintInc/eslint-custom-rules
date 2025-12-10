import path from 'path';
import { createRule } from '../utils/createRule';

export const RULE_NAME = 'enforce-dynamic-file-naming';

const ENFORCE_DYNAMIC_IMPORTS_RULE =
  '@blumintinc/blumint/enforce-dynamic-imports';
const REQUIRE_DYNAMIC_FIREBASE_IMPORTS_RULE =
  '@blumintinc/blumint/require-dynamic-firebase-imports';
const SHORTHAND_DISABLE_NEXT_LINE = /\bednl\b/;
const SHORTHAND_DISABLE_LINE = /\bedl\b/;
const DISABLE_NEXT_LINE_TOKENS = ['eslint-disable-next-line'];
const DISABLE_LINE_TOKENS = ['eslint-disable-line'];
const DISABLE_BLOCK_TOKEN = 'eslint-disable';

export default createRule<
  [],
  'requireDynamicExtension' | 'requireDisableDirective'
>({
  name: RULE_NAME,
  meta: {
    type: 'suggestion',
    docs: {
      description: `Enforce .dynamic.ts(x) file naming when ${ENFORCE_DYNAMIC_IMPORTS_RULE} or ${REQUIRE_DYNAMIC_FIREBASE_IMPORTS_RULE} rule is disabled`,
      recommended: 'error',
    },
    schema: [],
    messages: {
      requireDynamicExtension:
        'File "{{fileName}}" disables "{{ruleName}}" but keeps the standard {{extension}} extension, hiding that dynamic-import safeguards are bypassed. Rename to "{{suggestedName}}" (or another *.dynamic.ts/tsx name) so the exception is visible and static-import hotspots stay easy to audit.',
      requireDisableDirective:
        `File "{{fileName}}" uses the ".dynamic" suffix that signals dynamic-import rules are disabled, but it lacks a disable directive for "${ENFORCE_DYNAMIC_IMPORTS_RULE}" or "${REQUIRE_DYNAMIC_FIREBASE_IMPORTS_RULE}". Add the matching disable comment for the static import you need, or rename the file to "{{standardName}}" so the rules keep protecting other files.`,
    },
  },
  defaultOptions: [],
  create(context) {
    const filePath = context.getFilename();
    const fileName = path.basename(filePath);
    const extension = path.extname(fileName);

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
        const normalizedCommentText = commentText.toLowerCase();
          const disablesEnforceDynamicImports = commentText.includes(
          ENFORCE_DYNAMIC_IMPORTS_RULE,
          );
          const disablesRequireDynamicFirebaseImports = commentText.includes(
          REQUIRE_DYNAMIC_FIREBASE_IMPORTS_RULE,
          );
          const disablesTargetRule =
            disablesEnforceDynamicImports || disablesRequireDynamicFirebaseImports;

          const inlineDisable =
          (DISABLE_NEXT_LINE_TOKENS.some((token) =>
            normalizedCommentText.includes(token),
          ) ||
            DISABLE_LINE_TOKENS.some((token) =>
              normalizedCommentText.includes(token),
            ) ||
            SHORTHAND_DISABLE_NEXT_LINE.test(normalizedCommentText) ||
            SHORTHAND_DISABLE_LINE.test(normalizedCommentText)) &&
            disablesTargetRule;
          const blockDisable =
          normalizedCommentText.includes(DISABLE_BLOCK_TOKEN) && disablesTargetRule;

          if (inlineDisable || blockDisable) {
            foundDisableDirective = true;
            if (disablesEnforceDynamicImports && !disablesRequireDynamicFirebaseImports) {
            disabledRuleName = ENFORCE_DYNAMIC_IMPORTS_RULE;
            } else if (
              disablesRequireDynamicFirebaseImports &&
              !disablesEnforceDynamicImports
            ) {
            disabledRuleName = REQUIRE_DYNAMIC_FIREBASE_IMPORTS_RULE;
            } else {
              disabledRuleName =
              `${ENFORCE_DYNAMIC_IMPORTS_RULE} or ${REQUIRE_DYNAMIC_FIREBASE_IMPORTS_RULE}`;
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
              `${ENFORCE_DYNAMIC_IMPORTS_RULE} or ${REQUIRE_DYNAMIC_FIREBASE_IMPORTS_RULE}`,
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

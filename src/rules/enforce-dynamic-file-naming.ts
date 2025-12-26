import path from 'path';
import { createRule } from '../utils/createRule';

export const RULE_NAME = 'enforce-dynamic-file-naming';

const ENFORCE_DYNAMIC_IMPORTS_RULE =
  '@blumintinc/blumint/enforce-dynamic-imports';
export const REQUIRE_DYNAMIC_FIREBASE_IMPORTS_RULE =
  '@blumintinc/blumint/require-dynamic-firebase-imports';
export const DYNAMIC_RULES_LABEL = `${ENFORCE_DYNAMIC_IMPORTS_RULE} or ${REQUIRE_DYNAMIC_FIREBASE_IMPORTS_RULE}`;
const SHORTHAND_DISABLE_NEXT_LINE = /\bednl\b/;
const SHORTHAND_DISABLE_LINE = /\bedl\b/;
const DISABLE_NEXT_LINE_TOKEN = 'eslint-disable-next-line';
const DISABLE_LINE_TOKEN = 'eslint-disable-line';
const DISABLE_BLOCK_PATTERN = /\beslint-disable\b(?!-)/;
const disabledRuleNameFrom = (commentText: string): string | null => {
  const mentionsEnforceDynamicImports = commentText.includes(
    ENFORCE_DYNAMIC_IMPORTS_RULE,
  );
  const mentionsRequireDynamicFirebaseImports = commentText.includes(
    REQUIRE_DYNAMIC_FIREBASE_IMPORTS_RULE,
  );

  if (mentionsEnforceDynamicImports && mentionsRequireDynamicFirebaseImports) {
    return DYNAMIC_RULES_LABEL;
  }

  if (mentionsEnforceDynamicImports) {
    return ENFORCE_DYNAMIC_IMPORTS_RULE;
  }

  if (mentionsRequireDynamicFirebaseImports) {
    return REQUIRE_DYNAMIC_FIREBASE_IMPORTS_RULE;
  }

  return null;
};

export default createRule<
  [],
  'requireDynamicExtension' | 'requireDisableDirective'
>({
  name: RULE_NAME,
  meta: {
    type: 'suggestion',
    docs: {
      description: `Enforce .dynamic.ts(x) file naming when ${DYNAMIC_RULES_LABEL} rule is disabled`,
      recommended: 'error',
    },
    schema: [],
    messages: {
      requireDynamicExtension:
        'File "{{fileName}}" disables "{{ruleName}}" but keeps the standard {{extension}} extension, hiding that dynamic-import safeguards are bypassed. Rename to "{{suggestedName}}" (or another *.dynamic.ts/tsx name) so the exception is visible and static-import hotspots stay easy to audit.',
      requireDisableDirective:
        'File "{{fileName}}" uses the ".dynamic" suffix that signals dynamic-import rules are disabled, but it lacks a disable directive for {{rulesLabel}}. Add the matching disable comment for the static import you need, or rename the file to "{{standardName}}" so the rules keep protecting other files.',
    },
  },
  defaultOptions: [],
  create(context) {
    const filePath = context.getFilename();
    const fileName = path.basename(filePath);

    const isTypeScriptFile =
      fileName.endsWith('.ts') || fileName.endsWith('.tsx');

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
          const disabledRuleNameForComment = disabledRuleNameFrom(commentText);
          const disablesTargetRule = disabledRuleNameForComment !== null;

          const inlineDisable =
            (commentText.includes(DISABLE_NEXT_LINE_TOKEN) ||
              commentText.includes(DISABLE_LINE_TOKEN) ||
              SHORTHAND_DISABLE_NEXT_LINE.test(commentText) ||
              SHORTHAND_DISABLE_LINE.test(commentText)) &&
            disablesTargetRule;
          const blockDisable =
            DISABLE_BLOCK_PATTERN.test(commentText) && disablesTargetRule;

          if (inlineDisable || blockDisable) {
            foundDisableDirective = true;
            disabledRuleName = disabledRuleNameForComment;
            break;
          }
        }

        if (foundDisableDirective && !hasDynamicExtension) {
          const suggestedName = fileName.replace(/\.tsx?$/, '.dynamic$&');
          const extension = path.extname(fileName);
          context.report({
            loc: { line: 1, column: 0 },
            messageId: 'requireDynamicExtension',
            data: {
              fileName,
              ruleName: disabledRuleName ?? DYNAMIC_RULES_LABEL,
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
              rulesLabel: DYNAMIC_RULES_LABEL,
            },
          });
        }
      },
    };
  },
});

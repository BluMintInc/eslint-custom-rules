import path from 'path';
import { AST_TOKEN_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

export const RULE_NAME = 'enforce-dynamic-file-naming';

const ENFORCE_DYNAMIC_IMPORTS_RULE =
  '@blumintinc/blumint/enforce-dynamic-imports';
export const REQUIRE_DYNAMIC_FIREBASE_IMPORTS_RULE =
  '@blumintinc/blumint/require-dynamic-firebase-imports';
export const DYNAMIC_RULES_LABEL = `${ENFORCE_DYNAMIC_IMPORTS_RULE} or ${REQUIRE_DYNAMIC_FIREBASE_IMPORTS_RULE}`;

const DISABLE_NEXT_LINE_TOKEN = 'eslint-disable-next-line';
const DISABLE_LINE_TOKEN = 'eslint-disable-line';
const DISABLE_TOKEN = 'eslint-disable';

/**
 * ESLint splits a directive comment on ` -- ` and treats the tail as a human
 * justification, never as part of the rule list. A rule named only in the tail
 * is prose, so it must not read as a bypass.
 */
const JUSTIFICATION_SEPARATOR = /\s-{2,}\s/;

/**
 * Mirrors ESLint's own `directivesPattern`: the directive has to be the FIRST
 * token of the comment, followed by whitespace or the end of the comment.
 * `// see eslint-disable-next-line <rule>` is prose to ESLint and suppresses
 * nothing, so it cannot count as an acknowledged exception here either.
 *
 * The alternatives are ordered longest-first because `eslint-disable` would
 * otherwise shadow the two suffixed spellings.
 */
const DIRECTIVE_PATTERN = new RegExp(
  `^(${DISABLE_NEXT_LINE_TOKEN}|${DISABLE_LINE_TOKEN}|${DISABLE_TOKEN})(?:\\s|$)`,
);

/**
 * The only two directives ESLint honors inside a `//` comment. A bare
 * `// eslint-disable <rule>` is inert — ESLint parses `eslint-disable` only out
 * of a block comment — so blessing it would hand a reviewer a documented
 * exception while the sibling rule keeps failing CI.
 */
const LINE_COMMENT_DIRECTIVES = new Set([
  DISABLE_NEXT_LINE_TOKEN,
  DISABLE_LINE_TOKEN,
]);

/**
 * The rule names a comment actually disables, or `null` when ESLint would not
 * read the comment as a disable directive at all.
 */
const disabledRuleNamesFrom = (comment: TSESTree.Comment): string[] | null => {
  const justification = JUSTIFICATION_SEPARATOR.exec(comment.value);
  const directivePart = (
    justification ? comment.value.slice(0, justification.index) : comment.value
  ).trim();

  const match = DIRECTIVE_PATTERN.exec(directivePart);
  if (!match) {
    return null;
  }

  const directiveText = match[1];

  if (
    comment.type !== AST_TOKEN_TYPES.Block &&
    !LINE_COMMENT_DIRECTIVES.has(directiveText)
  ) {
    return null;
  }

  // ESLint rejects a multi-line `eslint-disable-line` outright and reports the
  // comment as a problem instead of applying it.
  if (
    directiveText === DISABLE_LINE_TOKEN &&
    comment.loc.start.line !== comment.loc.end.line
  ) {
    return null;
  }

  return directivePart
    .slice(directiveText.length)
    .split(',')
    .map((ruleName) => ruleName.trim().replace(/^(['"])(.*)\1$/s, '$2'))
    .filter((ruleName) => ruleName.length > 0);
};

/**
 * The rule has to be named explicitly. An unnamed blanket disable is not a
 * counter-example: it silences this rule too, so no report is observable on
 * such a file either way.
 */
const disabledRuleNameFrom = (comment: TSESTree.Comment): string | null => {
  const disabledRuleNames = disabledRuleNamesFrom(comment);
  if (disabledRuleNames === null) {
    return null;
  }

  const disabled = new Set(disabledRuleNames);
  const mentionsEnforceDynamicImports = disabled.has(
    ENFORCE_DYNAMIC_IMPORTS_RULE,
  );
  const mentionsRequireDynamicFirebaseImports = disabled.has(
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
        'File "{{fileName}}" uses the ".dynamic" suffix that signals dynamic-import rules are disabled, but it lacks a disable directive for {{dynamicRulesLabel}}. Add the matching disable comment for the static import you need, or rename the file to "{{standardName}}" so the rules keep protecting other files.',
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
          const disabledRuleNameForComment = disabledRuleNameFrom(comment);

          if (disabledRuleNameForComment !== null) {
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
              dynamicRulesLabel: DYNAMIC_RULES_LABEL,
            },
          });
        }
      },
    };
  },
});

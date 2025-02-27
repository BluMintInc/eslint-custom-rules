import { createRule } from '../utils/createRule';

type Options = [];
type MessageIds = 'enforceIdCapitalization';

/**
 * This rule ensures consistency in user-facing text by enforcing the use of "ID"
 * instead of "id" when referring to identifiers in UI labels, instructions,
 * error messages, and other visible strings.
 */
export const enforceIdCapitalization = createRule<Options, MessageIds>({
  name: 'enforce-id-capitalization',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce the use of "ID" instead of "id" in user-facing text',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      enforceIdCapitalization:
        'Use "ID" instead of "id" in user-facing text for better readability',
    },
  },
  defaultOptions: [],
  create(context) {
    // Regular expression to match standalone "id" surrounded by whitespace or punctuation
    // This ensures we only match "id" as a word, not as part of another word
    const idRegex = /(^|\s|[.,;:!?'"()\[\]{}])id(\s|$|[.,;:!?'"()\[\]{}])/g;

    /**
     * Check if a string contains "id" as a standalone word and report if found
     */
    function checkForIdInString(node: any, value: string) {
      if (typeof value !== 'string') return;

      // Reset the regex lastIndex to ensure consistent behavior
      idRegex.lastIndex = 0;

      // Check if the string contains "id" as a standalone word
      if (idRegex.test(value)) {
        // Reset the regex lastIndex again before replacing
        idRegex.lastIndex = 0;

        const fixedText = value.replace(idRegex, (_match, prefix, suffix) => {
          return `${prefix}ID${suffix}`;
        });

        context.report({
          node,
          messageId: 'enforceIdCapitalization',
          fix: (fixer) => {
            if (node.type === 'Literal') {
              return fixer.replaceText(node, JSON.stringify(fixedText));
            } else if (node.type === 'JSXText') {
              return fixer.replaceText(node, fixedText);
            } else if (node.type === 'TemplateElement') {
              return fixer.replaceText(node, fixedText);
            }
            return fixer.replaceText(node, JSON.stringify(fixedText));
          },
        });
      }
    }

    return {
      // Check string literals
      Literal(node) {
        if (typeof node.value === 'string') {
          checkForIdInString(node, node.value);
        }
      },

      // Check JSX text
      JSXText(node) {
        checkForIdInString(node, node.value);
      },

      // We don't need a separate handler for CallExpression since we already handle Literals
      // The Literal handler will catch the string arguments in t("user.profile.id")
    };
  },
});

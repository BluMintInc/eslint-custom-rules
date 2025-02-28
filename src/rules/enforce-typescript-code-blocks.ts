import { createRule } from '../utils/createRule';

type Options = [];
type MessageIds = 'missingLanguageSpecifier';

export const enforceTypescriptCodeBlocks = createRule<Options, MessageIds>({
  name: 'enforce-typescript-code-blocks',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce TypeScript language specifier in Markdown code blocks',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      missingLanguageSpecifier:
        'Code blocks should specify a language. If it contains TypeScript code, use ```typescript.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    const text = sourceCode.getText();
    const filename = context.getFilename();

    // Only apply this rule to Markdown files
    if (!filename.endsWith('.md')) {
      return {};
    }

    return {
      Program() {
        // Regular expression to find code blocks
        // This matches triple backtick blocks with or without a language specifier
        const codeBlockRegex = /```(?:([a-zA-Z0-9]+)?)[\s\S]*?```/g;
        let match;

        while ((match = codeBlockRegex.exec(text)) !== null) {
          const fullMatch = match[0];
          const languageSpecifier = match[1] || '';

          // If there's no language specifier, report and fix
          if (!languageSpecifier) {
            const startIndex = match.index;
            const openingBackticksEndIndex = startIndex + 3; // Length of ```

            context.report({
              loc: {
                start: sourceCode.getLocFromIndex(startIndex),
                end: sourceCode.getLocFromIndex(startIndex + fullMatch.length),
              },
              messageId: 'missingLanguageSpecifier',
              fix: (fixer) => {
                return fixer.insertTextAfterRange(
                  [startIndex, openingBackticksEndIndex],
                  'typescript'
                );
              },
            });
          }
        }
      },
    };
  },
});

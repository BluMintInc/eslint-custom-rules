import { createRule } from '../utils/createRule';
import { TSESTree } from '@typescript-eslint/utils';

/**
 * Rule to enforce that JSDoc-style comments (especially those with `@` annotations)
 * must be placed above fields in TypeScript interfaces and type definitions
 * rather than as inline comments.
 */
export const jsdocAboveField = createRule({
  create(context) {
    /**
     * Check if a comment is a JSDoc-style comment
     * This includes both block comments with /** and comments containing @ annotations
     */
    const isJSDocComment = (comment: TSESTree.Comment): boolean => {
      // Check if it's a block comment starting with /**
      if (comment.type === 'Block' && comment.value.startsWith('*')) {
        return true;
      }

      // Check if it contains @ annotations typical of JSDoc
      return comment.value.includes('@');
    };

    /**
     * Process a property signature node to check for inline JSDoc comments
     */
    const checkPropertyForInlineJSDoc = (node: TSESTree.TSPropertySignature | TSESTree.PropertyDefinition) => {
      const sourceCode = context.getSourceCode();
      const comments = sourceCode.getCommentsAfter(node);

      // Find the first comment after the node on the same line
      const inlineComment = comments.find(comment =>
        comment.loc.start.line === node.loc.end.line
      );

      if (inlineComment && isJSDocComment(inlineComment)) {
        context.report({
          node,
          messageId: 'moveJSDocAboveField',
          fix: (fixer) => {
            // Get the comment text
            const commentText = inlineComment.value.trim();

            // Get the indentation of the current line
            const sourceText = sourceCode.getText(node);
            const indentMatch = sourceText.match(/^\s*/);
            const indentation = indentMatch ? indentMatch[0] : '';

            // Create a new JSDoc comment to place above the field with proper indentation
            const newComment = `/** ${commentText.replace(/^\*\s*/, '')} */\n${indentation}`;

            // Create a fix that removes the inline comment and adds it above the field
            return [
              fixer.remove(inlineComment),
              fixer.insertTextBefore(node, newComment)
            ];
          },
        });
      }
    };

    return {
      // Check property signatures in interfaces and type literals
      TSPropertySignature(node) {
        checkPropertyForInlineJSDoc(node);
      },

      // Check class properties
      PropertyDefinition(node) {
        checkPropertyForInlineJSDoc(node);
      }
    };
  },

  name: 'jsdoc-above-field',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce JSDoc comments above fields instead of inline',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      moveJSDocAboveField:
        'Place JSDoc comments above fields rather than inline to improve IDE support and documentation visibility.',
    },
  },
  defaultOptions: [],
});

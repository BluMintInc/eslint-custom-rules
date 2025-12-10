import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';

/**
 * Rule to enforce the use of block comments (/** *\/) instead of single-line comments (//)
 * for all declarations, including type declarations, variable declarations, and function declarations.
 */
export const preferBlockCommentsForDeclarations: TSESLint.RuleModule<
  'preferBlockComment',
  never[]
> = createRule({
  create(context) {
    /**
     * Check if a comment is a line comment that should be converted to a block comment
     */
    const isLineCommentBeforeDeclaration = (
      comment: TSESTree.Comment,
      node: TSESTree.Node,
    ): boolean => {
      // Only process line comments
      if (comment.type !== 'Line') {
        return false;
      }

      // Ignore ESLint directive comments
      const commentText = comment.value.trim();
      const isDirective =
        /^(?:eslint(?:-disable(?:-next-line)?|-enable|-env)\b|eslint(?:\s|$)|globals?\b|exported\b)/.test(
          commentText,
        );
      if (isDirective) {
        return false;
      }

      // Check if the comment is directly before the node
      const commentLine = comment.loc.end.line;
      const nodeLine = node.loc.start.line;

      return commentLine === nodeLine - 1;
    };

    /**
     * Check if a node is inside a function body
     */
    const isInsideFunctionBody = (node: TSESTree.Node): boolean => {
      let parent = node.parent;

      while (parent) {
        if (
          parent.type === 'BlockStatement' &&
          (parent.parent?.type === 'FunctionDeclaration' ||
            parent.parent?.type === 'FunctionExpression' ||
            parent.parent?.type === 'ArrowFunctionExpression' ||
            parent.parent?.type === 'MethodDefinition')
        ) {
          return true;
        }
        parent = parent.parent;
      }

      return false;
    };

    /**
     * Process a node that might have a declaration comment
     */
    const checkNodeForLineComments = (node: TSESTree.Node) => {
      // Skip nodes inside function bodies
      if (isInsideFunctionBody(node)) {
        return;
      }

      const sourceCode = context.getSourceCode();
      const comments = sourceCode.getCommentsBefore(node);

      // Find the closest comment to the node
      const lastComment = comments[comments.length - 1];

      if (lastComment && isLineCommentBeforeDeclaration(lastComment, node)) {
        const commentText = lastComment.value.trim();
        const commentLabel = commentText || 'declaration comment';

        context.report({
          loc: lastComment.loc,
          messageId: 'preferBlockComment',
          data: { commentText: commentLabel },
          fix: (fixer) => fixer.replaceText(lastComment, `/** ${commentLabel} */`),
        });
      }
    };

    return {
      // Check function declarations
      FunctionDeclaration(node) {
        checkNodeForLineComments(node);
      },

      // Check variable declarations
      VariableDeclaration(node) {
        checkNodeForLineComments(node);
      },

      // Check type declarations
      TSTypeAliasDeclaration(node) {
        checkNodeForLineComments(node);
      },

      // Check interface declarations
      TSInterfaceDeclaration(node) {
        checkNodeForLineComments(node);
      },

      // Check class declarations
      ClassDeclaration(node) {
        checkNodeForLineComments(node);
      },

      // Check property declarations in interfaces and classes
      TSPropertySignature(node) {
        checkNodeForLineComments(node);
      },

      // Check class properties
      PropertyDefinition(node) {
        checkNodeForLineComments(node);
      },

      // Check method declarations
      MethodDefinition(node) {
        checkNodeForLineComments(node);
      },

      // Check enum declarations
      TSEnumDeclaration(node) {
        checkNodeForLineComments(node);
      },
    };
  },

  name: 'prefer-block-comments-for-declarations',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce the use of block comments for declarations',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferBlockComment:
        'Line comment "{{commentText}}" sits on a declaration, and IDE hovers and TypeScript docs ignore it as documentation. Rewrite it as a block comment (/** ... */) so the text stays attached to the declaration and tooling surfaces it.',
    },
  },
  defaultOptions: [],
});

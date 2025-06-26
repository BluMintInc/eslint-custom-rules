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
     * Check if a comment is an ESLint directive comment
     */
    const isEslintDirectiveComment = (comment: TSESTree.Comment): boolean => {
      const commentText = comment.value.trim();
      return commentText.startsWith('eslint-disable') ||
             commentText.startsWith('eslint-enable') ||
             commentText.startsWith('eslint-env') ||
             commentText.startsWith('global ') ||
             commentText.startsWith('globals ');
    };

    /**
     * Check if a node is inside a function body
     */
    const isInsideFunctionBody = (node: TSESTree.Node): boolean => {
      let parent = node.parent;

      while (parent) {
        if (
          parent.type === 'BlockStatement' &&
          (
            parent.parent?.type === 'FunctionDeclaration' ||
            parent.parent?.type === 'FunctionExpression' ||
            parent.parent?.type === 'ArrowFunctionExpression' ||
            parent.parent?.type === 'MethodDefinition'
          )
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

      // Skip if there's no comment or if it's an ESLint directive comment
      if (!lastComment || isEslintDirectiveComment(lastComment)) {
        return;
      }

      // Process both line comments and regular block comments for conversion
      if (lastComment.type === 'Line') {
        // Check if the comment is directly before the node
        const commentLine = lastComment.loc.end.line;
        const nodeLine = node.loc.start.line;

        if (commentLine === nodeLine - 1) {
          context.report({
            loc: lastComment.loc,
            messageId: 'preferBlockComment',
            fix: (fixer) => {
              const commentText = lastComment.value.trim();
              return fixer.replaceText(lastComment, `/** ${commentText} */`);
            },
          });
        }
      } else if (lastComment.type === 'Block' && !lastComment.value.startsWith('*')) {
        // Handle regular block comments (/* */) but not JSDoc comments (/** */)
        // Check if the comment is directly before the node
        const commentLine = lastComment.loc.end.line;
        const nodeLine = node.loc.start.line;

        if (commentLine === nodeLine - 1) {
          context.report({
            loc: lastComment.loc,
            messageId: 'preferBlockComment',
            fix: (fixer) => {
              const commentText = lastComment.value.trim();
              return fixer.replaceText(lastComment, `/** ${commentText} */`);
            },
          });
        }
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

      // Check import declarations
      ImportDeclaration(node) {
        checkNodeForLineComments(node);
      },

      // Check export declarations
      ExportNamedDeclaration(node) {
        checkNodeForLineComments(node);
      },

      ExportDefaultDeclaration(node) {
        checkNodeForLineComments(node);
      },

      ExportAllDeclaration(node) {
        checkNodeForLineComments(node);
      },

      // Check namespace declarations
      TSNamespaceDeclaration(node) {
        checkNodeForLineComments(node);
      },

      // Check module declarations
      TSModuleDeclaration(node) {
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
        'Use block comments (/** */) instead of line comments (//) for declarations to improve IDE support.',
    },
  },
  defaultOptions: [],
});

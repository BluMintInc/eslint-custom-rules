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
    const sourceCode = context.sourceCode;

    /**
     * Directives whose `//` form is load-bearing: ESLint reads them off the
     * comment type and line, and TypeScript only honours its own directives as
     * line comments. Rewriting one as a block comment would silently disable
     * it, so they are never reported and never absorbed into a run.
     */
    const isDirectiveComment = (comment: TSESTree.Comment): boolean => {
      const commentText = comment.value.trim();

      return (
        // ESLint
        commentText.startsWith('eslint-disable') ||
        commentText.startsWith('eslint-enable') ||
        commentText.startsWith('eslint-env') ||
        commentText.startsWith('eslint ') ||
        commentText.startsWith('global ') ||
        commentText.startsWith('globals ') ||
        commentText.startsWith('exported ') ||
        // TypeScript line directives (keep as line comments)
        /^@ts-(ignore|expect-error|check|nocheck)\b/.test(commentText) ||
        // TypeScript triple-slash directives (value of a 'Line' comment that started with '///')
        commentText.startsWith('/ <reference') ||
        commentText.startsWith('/ <amd-') ||
        commentText.startsWith('/ <jsxImportSource')
      );
    };

    /**
     * The whitespace between the start of the comment's line and the comment
     * itself. Taken from the source rather than rebuilt from the column so a
     * tab-indented file keeps its tabs.
     */
    const indentationOf = (comment: TSESTree.Comment): string =>
      (sourceCode.lines[comment.loc.start.line - 1] ?? '').slice(
        0,
        comment.loc.start.column,
      );

    /**
     * A comment only documents the declaration below it when it starts its own
     * line. A trailing comment (`const a = 1; // was 72`) describes the
     * statement it shares a line with, so treating it as the next
     * declaration's documentation re-attributes the text to code it was never
     * written about.
     */
    const startsOwnLine = (comment: TSESTree.Comment): boolean => {
      const tokenBefore = sourceCode.getTokenBefore(comment, {
        includeComments: true,
      });

      return (
        !tokenBefore || tokenBefore.loc.end.line !== comment.loc.start.line
      );
    };

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

      if (isDirectiveComment(comment) || !startsOwnLine(comment)) {
        return false;
      }

      // Check if the comment is directly before the node
      const commentLine = comment.loc.end.line;
      const nodeLine = node.loc.start.line;

      return commentLine === nodeLine - 1;
    };

    /**
     * Collect the contiguous run of line comments ending at `comments[index]`.
     *
     * Consecutive `//` lines are separate comment nodes, so a rationale a human
     * wrote as one paragraph arrives as a run. Converting only the adjacent
     * node truncates the documentation to its last line and leaves a mixed
     * `//` + block header, which is why an ASCII table above a declaration
     * lost everything except its closing row.
     *
     * The walk stops at anything outside the same visual block: a block
     * comment, a directive, a blank-line gap, a comment at a different
     * indentation, or a trailing comment sharing its line with code.
     */
    const collectRun = (
      comments: TSESTree.Comment[],
      index: number,
    ): TSESTree.Comment[] => {
      const run = [comments[index]];
      const indentation = indentationOf(run[0]);

      for (let cursor = index - 1; cursor >= 0; cursor--) {
        const previous = comments[cursor];
        const below = run[0];

        if (
          previous.type !== 'Line' ||
          isDirectiveComment(previous) ||
          !startsOwnLine(previous) ||
          below.loc.start.line - previous.loc.end.line !== 1 ||
          indentationOf(previous) !== indentation
        ) {
          break;
        }

        run.unshift(previous);
      }

      return run;
    };

    /**
     * Render the run as a single block comment.
     *
     * Each line keeps its text byte for byte: only the `//` marker is swapped
     * for ` *`, which is the same width, so an ASCII table stays aligned. A
     * line's trailing whitespace is dropped because it carries no content and
     * would land inside the block as trailing whitespace.
     */
    const buildBlockComment = (
      run: TSESTree.Comment[],
      label: string,
    ): string | null => {
      const indentation = indentationOf(run[0]);
      const content =
        run.length === 1
          ? ` ${label} `
          : `\n${run
              .map((comment) => `${indentation} *${comment.value.trimEnd()}`)
              .join('\n')}\n${indentation} `;

      // A block comment cannot carry its own terminator, and re-indenting the
      // text to escape one would rewrite prose this rule does not own.
      if (content.includes('*/')) {
        return null;
      }

      return `/**${content}*/`;
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
     * Resolve the node that owns the declaration's leading comments.
     *
     * A leading comment sits before the first token of the whole statement, so
     * an `export` wrapper takes ownership of it: the `export` keyword becomes
     * the token preceding the inner declaration and `getCommentsBefore` on that
     * declaration returns nothing. Walking out to the wrapper keeps exported
     * declarations — the public API this rule exists to document — in scope.
     *
     * Only the visitors for the inner declaration types are registered, so
     * unwrapping here reports each declaration once; registering the export
     * node types as extra visitors instead would report the same comment twice.
     */
    const resolveCommentAnchor = (node: TSESTree.Node): TSESTree.Node => {
      let anchor = node;
      let parent = anchor.parent;

      while (
        parent &&
        (parent.type === 'ExportNamedDeclaration' ||
          parent.type === 'ExportDefaultDeclaration') &&
        parent.declaration === anchor
      ) {
        anchor = parent;
        parent = anchor.parent;
      }

      return anchor;
    };

    /**
     * Process a node that might have a declaration comment
     */
    const checkNodeForLineComments = (node: TSESTree.Node) => {
      // Skip nodes inside function bodies
      if (isInsideFunctionBody(node)) {
        return;
      }

      const anchor = resolveCommentAnchor(node);
      const comments = sourceCode.getCommentsBefore(anchor);

      // Find the closest comment to the node
      const lastComment = comments[comments.length - 1];

      if (lastComment && isLineCommentBeforeDeclaration(lastComment, anchor)) {
        const run = collectRun(comments, comments.length - 1);
        // The run reads top to bottom, so its first line with text is what
        // names the documentation; an opening `//` spacer names nothing.
        const commentLabel =
          run
            .map((comment) => comment.value.trim())
            .find((text) => text !== '') || 'declaration comment';

        context.report({
          loc: { start: run[0].loc.start, end: lastComment.loc.end },
          messageId: 'preferBlockComment',
          data: { commentText: commentLabel },
          fix: (fixer) => {
            const blockComment = buildBlockComment(run, commentLabel);

            if (blockComment === null) {
              return null;
            }

            return fixer.replaceTextRange(
              [run[0].range[0], lastComment.range[1]],
              blockComment,
            );
          },
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

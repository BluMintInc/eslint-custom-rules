import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESTree,
} from '@typescript-eslint/utils';

import { createRule } from '../utils/createRule';

type Options = [
  {
    /**
     * When true, the rule also flags inline JSDoc on object literal properties.
     * By default, only interface/type literals and class fields are checked.
     */
    checkObjectLiterals?: boolean;
  },
];

type MessageIds = 'moveJsdocAbove';

/**
 * Where a member's own code stops, ignoring the trailing `;`/`,` separator, and
 * where that separator ends. Detection compares comment positions against both,
 * so a member with no separator reports `separatorEnd === offset`.
 */
type FieldSpan = {
  offset: number;
  line: number;
  separatorEnd: number;
};

type FieldNode =
  | TSESTree.TSPropertySignature
  | TSESTree.PropertyDefinition
  | TSESTree.Property;

const defaultOptions: Options = [{ checkObjectLiterals: false }];

export const jsdocAboveField = createRule<Options, MessageIds>({
  name: 'jsdoc-above-field',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require JSDoc blocks to sit above fields instead of trailing inline so IDE hovers surface the documentation.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          checkObjectLiterals: {
            type: 'boolean',
            description:
              'Also enforce JSDoc placement for object literal properties.',
            default: false,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      moveJsdocAbove:
        'Inline JSDoc for "{{name}}" sits after the {{kind}} → IDE hovers and autocomplete skip trailing inline JSDoc, so tags like @deprecated/@default never surface when developers hover → Move the JSDoc block above the {{kind}} (and above any decorators or modifiers) so the documentation stays visible where it is needed.',
    },
  },
  defaultOptions,
  create(context, [options = defaultOptions[0]]) {
    const sourceCode = context.getSourceCode();
    const { checkObjectLiterals = false } = options;
    const allComments = sourceCode.getAllComments();

    const isRelevantNode = (node: TSESTree.Node): node is FieldNode => {
      if (node.type === AST_NODE_TYPES.TSPropertySignature) {
        return true;
      }

      if (node.type === AST_NODE_TYPES.PropertyDefinition) {
        return true;
      }

      if (
        checkObjectLiterals &&
        node.type === AST_NODE_TYPES.Property &&
        node.parent?.type === AST_NODE_TYPES.ObjectExpression
      ) {
        return true;
      }

      return false;
    };

    const isJSDocBlock = (comment: TSESTree.Comment): boolean =>
      comment.type === 'Block' && comment.value.startsWith('*');

    const getPropertyName = (node: FieldNode): string => {
      const key = node.key;

      if (key.type === AST_NODE_TYPES.Identifier) {
        return key.name;
      }

      if (
        key.type === AST_NODE_TYPES.Literal &&
        typeof key.value === 'string'
      ) {
        return key.value;
      }

      return 'computed property';
    };

    const getKind = (node: FieldNode): string => {
      if (node.type === AST_NODE_TYPES.PropertyDefinition) {
        return 'class field';
      }

      if (node.type === AST_NODE_TYPES.Property) {
        return 'object property';
      }

      return 'type field';
    };

    const isSeparatorToken = (
      token: TSESTree.Token | null | undefined,
    ): token is TSESTree.PunctuatorToken =>
      token?.type === AST_TOKEN_TYPES.Punctuator &&
      (token.value === ';' || token.value === ',');

    /**
     * A member's range and its end line both swallow its trailing separator,
     * while prettier canonicalises trailing JSDoc into the gap between the
     * member's content and that separator. Such a comment therefore starts
     * before `node.range[1]`, and when it spans lines it drags
     * `node.loc.end.line` past the field's own line — so both boundaries have
     * to come from the last non-separator token instead of the node, or the
     * rule goes blind on formatted source.
     *
     * Object literal properties are the mirror case: their `,` sits outside the
     * `Property` range, so the separator has to be read from the token after the
     * node instead of the token before its last one.
     */
    const fieldSpanOf = (node: FieldNode): FieldSpan => {
      const lastToken = sourceCode.getLastToken(node);

      if (isSeparatorToken(lastToken)) {
        const beforeSeparator = sourceCode.getTokenBefore(lastToken);

        if (beforeSeparator) {
          return {
            offset: beforeSeparator.range[1],
            line: beforeSeparator.loc.end.line,
            separatorEnd: lastToken.range[1],
          };
        }
      }

      const tokenAfter = sourceCode.getTokenAfter(node);

      return {
        offset: node.range[1],
        line: node.loc.end.line,
        separatorEnd: isSeparatorToken(tokenAfter)
          ? tokenAfter.range[1]
          : node.range[1],
      };
    };

    /**
     * Attaches a trailing JSDoc block by token order rather than by line.
     *
     * Prettier reflows a multi-line block that trails a field onto its own
     * line, ahead of the member's separator: the block that followed
     * `timeout: number;` ends up between `timeout: number` and its `;`. Keying
     * on the comment sharing the field's line makes the rule inert on exactly
     * the formatted source it has to police, so a block the separator still
     * follows counts as this member's however many lines down it starts.
     *
     * Past the separator the member has ended and position alone no longer
     * identifies an owner: an own-line block there is the leading documentation
     * of the next field, or a note about the enclosing shape. Only the same-line
     * spelling can be claimed there, which is why that arm survives.
     */
    const trailingJSDocFor = (
      span: FieldSpan,
    ): TSESTree.Comment | undefined => {
      return allComments.find((comment) => {
        if (!isJSDocBlock(comment)) {
          return false;
        }

        if (comment.range[0] < span.offset) {
          return false;
        }

        const precedesSeparator = comment.range[1] <= span.separatorEnd;
        if (!precedesSeparator && comment.loc.start.line !== span.line) {
          return false;
        }

        const between = sourceCode.text.slice(span.offset, comment.range[0]);

        return /^[\s;,]*$/.test(between);
      });
    };

    const indentForNode = (node: TSESTree.Node): string => {
      const line = sourceCode.lines[node.loc.start.line - 1] ?? '';
      const beforeColumn = line.slice(0, node.loc.start.column);
      const trailingWhitespace = beforeColumn.match(/\s*$/);

      return trailingWhitespace?.[0] ?? '';
    };

    const formatCommentWithIndent = (
      comment: TSESTree.Comment,
      indent: string,
    ): string => {
      const rawText = sourceCode.getText(comment);
      const rawLines = rawText.split('\n');
      let minIndentAfterStar: number | undefined;

      // Calculate minimum indentation across all lines (excluding the first line and standard closing line)
      rawLines.slice(1).forEach((line, index, arr) => {
        const isLastLine = index === arr.length - 1;
        const starMatch = line.match(/^\s*\*(.*)$/);
        if (!starMatch) {
          return;
        }
        const afterStar = starMatch[1];

        // Skip the standard " */" closing line
        if (isLastLine && afterStar.trim() === '/') {
          return;
        }

        const contentIndent = afterStar.match(/^([ \t]*)\S/);
        if (contentIndent) {
          const indentLength = contentIndent[1].length;
          minIndentAfterStar =
            minIndentAfterStar === undefined
              ? indentLength
              : Math.min(minIndentAfterStar, indentLength);
        }
      });

      // Normalize indentation: we want the minimum indentation after '*' to be exactly 1 space.
      // (e.g., if min indent is 3, we strip 2; if min indent is 0, we add 1).
      const indentToAdjustment =
        minIndentAfterStar === undefined ? 0 : minIndentAfterStar - 1;

      const normalize = (text: string) => {
        if (indentToAdjustment > 0) {
          return text.replace(
            new RegExp(`^[ \\t]{0,${indentToAdjustment}}`),
            '',
          );
        }
        if (indentToAdjustment < 0) {
          return ' '.repeat(-indentToAdjustment) + text;
        }
        return text;
      };

      const normalizedLines = rawLines.map((line, index) => {
        if (index === 0) {
          return line.trimStart();
        }

        const starMatch = line.match(/^\s*\*(.*)$/);
        if (!starMatch) {
          return line.trimStart();
        }

        const afterStar = normalize(starMatch[1]);
        if (afterStar.trim() === '/') {
          return ' */';
        }
        if (afterStar.trim() === '') {
          return ' *';
        }

        const needsSpace =
          !afterStar.startsWith(' ') && !afterStar.startsWith('\t');
        const content = needsSpace ? ` ${afterStar}` : afterStar;

        return ` *${content}`;
      });

      return normalizedLines.map((line) => `${indent}${line}`).join('\n');
    };

    const reportInlineJSDoc = (
      node: FieldNode,
      comment: TSESTree.Comment,
      span: FieldSpan,
    ) => {
      const insertTarget =
        node.type === AST_NODE_TYPES.PropertyDefinition &&
        node.decorators &&
        node.decorators.length > 0
          ? node.decorators[0]
          : node;
      const indent = indentForNode(insertTarget);
      const commentText = formatCommentWithIndent(comment, indent);
      let removalStart = comment.range[0];
      const removalEnd = comment.range[1];
      const lineStart = insertTarget.range[0] - insertTarget.loc.start.column;
      const textBeforeNode = sourceCode.text.slice(
        lineStart,
        insertTarget.range[0],
      );
      const hasCodeBeforeNode = /\S/.test(textBeforeNode);
      const insertionPoint = hasCodeBeforeNode
        ? insertTarget.range[0]
        : lineStart;
      const insertionText = hasCodeBeforeNode
        ? `\n${commentText}\n${indent}`
        : `${commentText}\n`;

      while (
        removalStart > span.offset &&
        /\s/.test(sourceCode.text[removalStart - 1])
      ) {
        removalStart -= 1;
      }

      context.report({
        node,
        loc: comment.loc,
        messageId: 'moveJsdocAbove',
        data: {
          name: getPropertyName(node),
          kind: getKind(node),
        },
        fix(fixer) {
          return [
            fixer.insertTextBeforeRange(
              [insertionPoint, insertionPoint],
              insertionText,
            ),
            fixer.removeRange([removalStart, removalEnd]),
          ];
        },
      });
    };

    const checkNode = (node: TSESTree.Node) => {
      if (!isRelevantNode(node)) {
        return;
      }

      const span = fieldSpanOf(node);
      const jsdocComment = trailingJSDocFor(span);

      if (!jsdocComment) {
        return;
      }

      reportInlineJSDoc(node, jsdocComment, span);
    };

    return {
      TSPropertySignature: checkNode,
      PropertyDefinition: checkNode,
      ...(checkObjectLiterals && { Property: checkNode }),
    };
  },
});

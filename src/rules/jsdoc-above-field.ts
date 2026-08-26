import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
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

/**
 * The `{ ... }` a field lives in, together with the separator prettier prints
 * between its members when it is laid out one member per line.
 */
type Container = {
  node: TSESTree.Node;
  members: TSESTree.Node[];
  separator: string;
};

/** A whole-container replacement that re-lays a one-line `{ ... }` out. */
type Expansion = {
  range: [number, number];
  text: string;
};

const INDENT_STEP_FALLBACK = '  ';

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
    let cachedIndentStep: string | undefined;

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
    const fieldSpanOf = (node: TSESTree.Node): FieldSpan => {
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

    const containerOf = (node: FieldNode): Container | undefined => {
      const parent = node.parent;

      if (parent?.type === AST_NODE_TYPES.TSTypeLiteral) {
        return { node: parent, members: parent.members, separator: ';' };
      }

      if (parent?.type === AST_NODE_TYPES.TSInterfaceBody) {
        return { node: parent, members: parent.body, separator: ';' };
      }

      if (parent?.type === AST_NODE_TYPES.ClassBody) {
        return { node: parent, members: parent.body, separator: ';' };
      }

      if (parent?.type === AST_NODE_TYPES.ObjectExpression) {
        return { node: parent, members: parent.properties, separator: ',' };
      }

      return undefined;
    };

    /**
     * Whether nothing but the container's closing brace follows the block, so
     * the field it trails is the only member it can belong to.
     */
    const closesContainer = (
      node: FieldNode,
      comment: TSESTree.Comment,
    ): boolean => {
      const container = containerOf(node);

      if (!container) {
        return false;
      }

      const closeBrace = sourceCode.getLastToken(container.node);

      if (!closeBrace || comment.range[1] > closeBrace.range[0]) {
        return false;
      }

      return !container.members.some(
        (member) => member.range[0] >= comment.range[1],
      );
    };

    /**
     * Attaches a trailing JSDoc block by token order rather than by line.
     *
     * Prettier is not idempotent on a multi-line block that trails a field. One
     * pass reflows it onto its own line ahead of the member's separator, so the
     * block that followed `timeout: number;` sits between `timeout: number` and
     * its `;`; the next pass moves the separator back in front of it, and that
     * separator-first spelling is the fixed point formatted source converges
     * to. Both intermediates and the fixed point document the field above them,
     * so keying on the comment sharing the field's line — or on the separator
     * still following it — leaves the rule inert on the shape it exists to
     * police.
     *
     * Past the separator the member has ended and position alone stops naming
     * an owner: an own-line block there reads as the leading documentation of
     * the next field. That reading needs a next field, so it is unavailable on
     * the last member of a container, where the preceding field is the only
     * candidate left.
     *
     * A blank line is the one signal that survives the round trip intact:
     * prettier preserves an authored one and never inserts one while reflowing,
     * so a block held off by an empty line is a deliberate note about the
     * enclosing shape rather than displaced documentation.
     */
    const trailingJSDocFor = (
      node: FieldNode,
      span: FieldSpan,
    ): TSESTree.Comment | undefined => {
      return allComments.find((comment) => {
        if (!isJSDocBlock(comment)) {
          return false;
        }

        if (comment.range[0] < span.offset) {
          return false;
        }

        const between = sourceCode.text.slice(span.offset, comment.range[0]);
        const precedesSeparator = comment.range[1] <= span.separatorEnd;

        if (!precedesSeparator && comment.loc.start.line !== span.line) {
          if (!closesContainer(node, comment) || /\n[^\S\n]*\n/.test(between)) {
            return false;
          }
        }

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

    /**
     * The file's own indent step, so a tab-indented file sheds and gains tabs
     * instead of the two spaces prettier happens to default to. A block
     * comment's continuation lines align to its `*` rather than to the file's
     * indent grid, so counting them would invent a one-space step.
     */
    const indentStepOf = (): string => {
      if (cachedIndentStep !== undefined) {
        return cachedIndentStep;
      }

      const indents = sourceCode.lines
        .filter((line) => /\S/.test(line) && !/^[ \t]*\*/.test(line))
        .map((line) => /^[ \t]+/.exec(line)?.[0] ?? '')
        .filter((indent) => indent.length > 0);

      if (indents.length === 0) {
        cachedIndentStep = INDENT_STEP_FALLBACK;
      } else if (indents.some((indent) => indent.startsWith('\t'))) {
        cachedIndentStep = '\t';
      } else {
        cachedIndentStep = ' '.repeat(
          Math.min(...indents.map((indent) => indent.length)),
        );
      }

      return cachedIndentStep;
    };

    /**
     * The indentation of the line a node starts on, which is where the
     * enclosing construct's closing brace belongs. This differs from
     * `indentForNode`, which reports the whitespace directly before the node
     * and so returns the single space in `type T = { field: string }`.
     */
    const lineIndentOf = (node: TSESTree.Node): string =>
      /^[ \t]*/.exec(sourceCode.lines[node.loc.start.line - 1] ?? '')?.[0] ??
      '';

    /**
     * A member's separator sits inside its range for type and class members
     * but outside it for object literal properties, so both spellings have to
     * be probed before concluding a member carries none.
     */
    const separatorTokenOf = (
      member: TSESTree.Node,
    ): TSESTree.PunctuatorToken | undefined => {
      const lastToken = sourceCode.getLastToken(member);

      if (isSeparatorToken(lastToken)) {
        return lastToken;
      }

      const tokenAfter = sourceCode.getTokenAfter(member);

      return isSeparatorToken(tokenAfter) ? tokenAfter : undefined;
    };

    // A member whose body is a block closes itself; everything else — fields,
    // signatures, properties — is separated.
    const takesSeparator = (member: TSESTree.Node): boolean =>
      member.type !== AST_NODE_TYPES.MethodDefinition &&
      member.type !== AST_NODE_TYPES.StaticBlock;

    /**
     * Rewrites a one-line `{ ... }` as one member per line so the moved block
     * lands on a line of its own.
     *
     * Prettier keeps a type literal or object literal on one line whenever the
     * source has no newline after its `{`, so the fixer routinely meets a field
     * sharing a line with the braces and its siblings. Inserting the block
     * above such a field in place indents it by whatever whitespace happened to
     * follow `{` and leaves the members bunched behind it — output prettier
     * rewrites on the next pass, so the two tools chase each other forever.
     * Expanding the container is the shape prettier prints, which makes the
     * fixer's output a fixed point.
     *
     * The rewrite carries every comment in the braces rather than rebuilding
     * from member text alone: a block sitting in the gap between two members
     * belongs to nobody's range and would otherwise be dropped.
     */
    const expandSingleLineContainer = (
      node: FieldNode,
      comment: TSESTree.Comment,
    ): Expansion | undefined => {
      const container = containerOf(node);

      // A container already laid out across lines keeps its own spacing and
      // blank lines; only the one-line spelling needs breaking apart.
      if (
        !container ||
        container.node.loc.start.line !== container.node.loc.end.line
      ) {
        return undefined;
      }

      const openBrace = sourceCode.getFirstToken(container.node);
      const closeBrace = sourceCode.getLastToken(container.node);

      if (!openBrace || !closeBrace) {
        return undefined;
      }

      const memberIndent = lineIndentOf(container.node) + indentStepOf();

      const members = container.members.map((member) => {
        const separatorToken = separatorTokenOf(member);

        return {
          member,
          separatorToken,
          bodyEnd: separatorToken ? separatorToken.range[0] : member.range[1],
          end: separatorToken ? separatorToken.range[1] : member.range[1],
          // Every documented member is hoisted, not just the reported one:
          // a sibling's block left behind lands after that member's separator,
          // where it reads as a note about the shape and the rule stops seeing
          // it — the fix would bury the very violation it competes with.
          jsdoc:
            member === node
              ? comment
              : isRelevantNode(member)
              ? trailingJSDocFor(member, fieldSpanOf(member))
              : undefined,
        };
      });

      // A trailing separator is added in the spelling the container already
      // uses, so a comma-separated type literal does not gain a stray `;`.
      const fallbackSeparator =
        members.find(({ separatorToken }) => separatorToken)?.separatorToken
          ?.value ?? container.separator;

      const memberLines = members.map(
        ({ member, separatorToken, bodyEnd, jsdoc }) => {
          const raw = sourceCode.text.slice(member.range[0], bodyEnd);
          const carriesJSDoc =
            jsdoc &&
            jsdoc.range[0] >= member.range[0] &&
            jsdoc.range[1] <= bodyEnd;
          const body = carriesJSDoc
            ? raw.slice(0, jsdoc.range[0] - member.range[0]) +
              raw.slice(jsdoc.range[1] - member.range[0])
            : raw;
          const separator = separatorToken
            ? separatorToken.value
            : takesSeparator(member)
            ? fallbackSeparator
            : '';
          const line = `${memberIndent}${body.trimEnd()}${separator}`;

          return {
            start: member.range[0],
            text: jsdoc
              ? `${formatCommentWithIndent(jsdoc, memberIndent)}\n${line}`
              : line,
          };
        },
      );

      const hoisted = new Set(
        members
          .map(({ jsdoc }) => jsdoc)
          .filter((jsdoc): jsdoc is TSESTree.Comment => Boolean(jsdoc)),
      );

      const strayComments = allComments
        .filter(
          (candidate) =>
            !hoisted.has(candidate) &&
            candidate.range[0] >= openBrace.range[1] &&
            candidate.range[1] <= closeBrace.range[0] &&
            !members.some(
              ({ member, end }) =>
                candidate.range[0] >= member.range[0] &&
                candidate.range[1] <= end,
            ),
        )
        .map((candidate) => ({
          start: candidate.range[0],
          text: `${memberIndent}${sourceCode.getText(candidate)}`,
        }));

      const lines = [...memberLines, ...strayComments]
        .sort((left, right) => left.start - right.start)
        .map(({ text }) => text);

      return {
        range: [openBrace.range[1], closeBrace.range[0]],
        text: `\n${lines.join('\n')}\n${lineIndentOf(container.node)}`,
      };
    };

    /**
     * Moves the block onto its own line above the field, in place. The field
     * already owns its line here, so only the block travels.
     */
    const inlineMoveEdits = (
      fixer: TSESLint.RuleFixer,
      node: FieldNode,
      comment: TSESTree.Comment,
      span: FieldSpan,
    ): TSESLint.RuleFix[] => {
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

      return [
        fixer.insertTextBeforeRange(
          [insertionPoint, insertionPoint],
          insertionText,
        ),
        fixer.removeRange([removalStart, removalEnd]),
      ];
    };

    const reportInlineJSDoc = (
      node: FieldNode,
      comment: TSESTree.Comment,
      span: FieldSpan,
    ) => {
      const expansion = expandSingleLineContainer(node, comment);

      context.report({
        node,
        loc: comment.loc,
        messageId: 'moveJsdocAbove',
        data: {
          name: getPropertyName(node),
          kind: getKind(node),
        },
        fix(fixer) {
          if (expansion) {
            return fixer.replaceTextRange(expansion.range, expansion.text);
          }

          return inlineMoveEdits(fixer, node, comment, span);
        },
      });
    };

    const checkNode = (node: TSESTree.Node) => {
      if (!isRelevantNode(node)) {
        return;
      }

      const span = fieldSpanOf(node);
      const jsdocComment = trailingJSDocFor(node, span);

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

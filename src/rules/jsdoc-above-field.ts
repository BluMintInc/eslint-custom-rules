import { AST_NODE_TYPES, TSESTree, TSESLint } from '@typescript-eslint/utils';

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
    const sourceCode =
      (context as unknown as { sourceCode?: TSESLint.SourceCode }).sourceCode ??
      context.getSourceCode();
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

      return 'property';
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

    const inlineJSDocOnSameLine = (
      node: FieldNode,
    ): TSESTree.Comment | undefined => {
      return allComments.find((comment) => {
        if (!isJSDocBlock(comment)) {
          return false;
        }

        if (comment.loc.start.line !== node.loc.end.line) {
          return false;
        }

        if (comment.range[0] < node.range[1]) {
          return false;
        }

        const between = sourceCode.text.slice(node.range[1], comment.range[0]);

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
      const raw = sourceCode
        .getText(comment)
        // Strip inline indentation so we can re-indent cleanly.
        .replace(/\n\s*\*/g, '\n *');

      return raw
        .split('\n')
        .map((line) => `${indent}${line}`)
        .join('\n');
    };

    const reportInlineJSDoc = (node: FieldNode, comment: TSESTree.Comment) => {
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
      const textBeforeNode = sourceCode.text.slice(lineStart, insertTarget.range[0]);
      const hasCodeBeforeNode = /\S/.test(textBeforeNode);
      const insertionPoint = hasCodeBeforeNode ? insertTarget.range[0] : lineStart;
      const insertionText = hasCodeBeforeNode
        ? `\n${commentText}\n${indent}`
        : `${commentText}\n`;

      while (
        removalStart > node.range[1] &&
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

      const jsdocComment = inlineJSDocOnSameLine(node);

      if (!jsdocComment) {
        return;
      }

      reportInlineJSDoc(node, jsdocComment);
    };

    return {
      TSPropertySignature: checkNode,
      PropertyDefinition: checkNode,
      ...(checkObjectLiterals && { Property: checkNode }),
    };
  },
});

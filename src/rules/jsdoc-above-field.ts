import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';

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
        'Place the JSDoc for "{{name}}" above the {{kind}}. Inline JSDoc after a {{kind}} is skipped by IDE tooltips and autocomplete; move it before the declaration (and any decorators) so the documentation stays visible.',
    },
  },
  defaultOptions,
  create(context, [options = defaultOptions[0]]) {
    const sourceCode = context.getSourceCode();
    const { checkObjectLiterals = false } = options;

    const isRelevantNode = (
      node: TSESTree.Node,
    ): node is
      | TSESTree.TSPropertySignature
      | TSESTree.PropertyDefinition
      | TSESTree.Property => {
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

    const getPropertyName = (
      node:
        | TSESTree.TSPropertySignature
        | TSESTree.PropertyDefinition
        | TSESTree.Property,
    ): string => {
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

    const getKind = (
      node:
        | TSESTree.TSPropertySignature
        | TSESTree.PropertyDefinition
        | TSESTree.Property,
    ): string => {
      if (node.type === AST_NODE_TYPES.PropertyDefinition) {
        return 'class field';
      }

      if (node.type === AST_NODE_TYPES.Property) {
        return 'object property';
      }

      return 'type field';
    };

    const inlineJSDocOnSameLine = (
      node:
        | TSESTree.TSPropertySignature
        | TSESTree.PropertyDefinition
        | TSESTree.Property,
    ): TSESTree.Comment | undefined => {
      return sourceCode.getAllComments().find((comment) => {
        if (!isJSDocBlock(comment)) {
          return false;
        }

        if (comment.loc.start.line !== node.loc.end.line) {
          return false;
        }

        const between = sourceCode.text.slice(node.range[1], comment.range[0]);

        return /^[\s;,]*$/.test(between);
      });
    };

    const indentForNode = (node: TSESTree.Node): string => {
      const line = sourceCode.lines[node.loc.start.line - 1] ?? '';
      const match = line.match(/^\s*/);
      return match?.[0] ?? '';
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

    const reportInlineJSDoc = (
      node:
        | TSESTree.TSPropertySignature
        | TSESTree.PropertyDefinition
        | TSESTree.Property,
      comment: TSESTree.Comment,
    ) => {
      const indent = indentForNode(node);
      const commentText = formatCommentWithIndent(comment, indent);
      let removalStart = comment.range[0];
      const removalEnd = comment.range[1];
      const lineStart = node.range[0] - node.loc.start.column;

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
              [lineStart, lineStart],
              `${commentText}\n`,
            ),
            fixer.removeRange([removalStart, removalEnd]),
          ];
        },
      });
    };

    const checkNode = (
      node: TSESTree.Node,
    ) => {
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
      Property: checkNode,
    };
  },
});

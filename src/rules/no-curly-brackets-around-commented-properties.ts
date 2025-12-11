import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';

import { createRule } from '../utils/createRule';

type MessageIds = 'removeCommentWrappedBlock';

const MEMBER_SIGNATURE_PATTERN = /\b[A-Za-z_$][\w$]*\s*\??\s*:\s*[^;]+;?/;
const METHOD_SIGNATURE_PATTERN = /\b[A-Za-z_$][\w$]*\s*\([^)]*\)\s*:?[^;]*;?/;

function looksLikeTypeMemberComment(rawComment: string): boolean {
  const normalized = rawComment.replace(/^\s*\*/gm, '').trim();

  if (!normalized) {
    return false;
  }

  if (normalized.startsWith('@') || normalized.startsWith('remarks')) {
    return true;
  }

  return (
    MEMBER_SIGNATURE_PATTERN.test(normalized) ||
    METHOD_SIGNATURE_PATTERN.test(normalized)
  );
}

function getBlockComments(
  sourceCode: Readonly<TSESLint.SourceCode>,
  node: TSESTree.BlockStatement,
): TSESTree.Comment[] {
  return sourceCode
    .getAllComments()
    .filter(
      (comment) =>
        comment.range[0] >= node.range[0] && comment.range[1] <= node.range[1],
    );
}

function describeContext(
  ancestors: TSESTree.Node[],
  parent: TSESTree.Node | null,
): string {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];

    /* istanbul ignore next -- interface/type/enum ancestors are unreachable with valid parsing */
    if (ancestor.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
      return ancestor.id?.name
        ? `interface "${ancestor.id.name}"`
        : 'this interface';
    }

    /* istanbul ignore next -- interface/type/enum ancestors are unreachable with valid parsing */
    if (ancestor.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
      return ancestor.id?.name
        ? `type "${ancestor.id.name}"`
        : 'this type alias';
    }

    /* istanbul ignore next -- interface/type/enum ancestors are unreachable with valid parsing */
    if (ancestor.type === AST_NODE_TYPES.TSEnumDeclaration) {
      return ancestor.id?.name
        ? `enum "${ancestor.id.name}"`
        : 'this enum';
    }

    if (ancestor.type === AST_NODE_TYPES.TSModuleDeclaration) {
      return ancestor.id.type === AST_NODE_TYPES.Identifier
        ? `namespace "${ancestor.id.name}"`
        : 'this module';
    }
  }

  if (parent?.type === AST_NODE_TYPES.TSModuleBlock) {
    return 'this namespace or module block';
  }

  return 'this file';
}

function getSiblingIndent(
  sourceCode: Readonly<TSESLint.SourceCode>,
  parent: TSESTree.Node | null,
  current: TSESTree.BlockStatement,
): string | null {
  const container =
    parent && 'body' in parent && Array.isArray((parent as TSESTree.Program).body)
      ? (parent as TSESTree.Program | TSESTree.TSModuleBlock).body
      : null;

  /* istanbul ignore next -- defensive, parent is guaranteed to be Program or TSModuleBlock */
  if (!container) {
    return null;
  }

  let indent: string | null = null;

  for (const statement of container) {
    if (statement === current || !statement.loc) {
      continue;
    }

    const lineText = sourceCode.lines[statement.loc.start.line - 1];
    /* istanbul ignore next -- sourceCode always returns string lines */
    if (typeof lineText !== 'string') {
      continue;
    }

    const leading = lineText.match(/^\s*/)?.[0] ?? '';

    if (indent === null || leading.length < indent.length) {
      indent = leading;
    }
  }

  return indent;
}

function computeReplacement(
  sourceCode: Readonly<TSESLint.SourceCode>,
  node: TSESTree.BlockStatement,
  baseIndentOverride?: string | null,
): string | null {
  const openingBrace = sourceCode.getFirstToken(node);
  const closingBrace = sourceCode.getLastToken(node);

  /* istanbul ignore next -- block nodes always have brace tokens */
  if (!openingBrace || !closingBrace) {
    return null;
  }

  const between = sourceCode.text.slice(
    openingBrace.range[1],
    closingBrace.range[0],
  );

  const lines = between.split('\n');

  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }

  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  /* istanbul ignore next -- empty blocks are filtered earlier */
  if (!lines.length) {
    return null;
  }

  const indentOfBlockLine =
    baseIndentOverride ??
    sourceCode.lines[node.loc.start.line - 1]?.match(/^\s*/)?.[0] ??
    '';

  const additionalIndents = lines
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const indentLength = line.match(/^\s*/)?.[0].length ?? 0;
      return Math.max(indentLength - indentOfBlockLine.length, 0);
    });

  const minAdditionalIndent = additionalIndents.length
    ? Math.min(...additionalIndents)
    : 0;

  const normalizedLines = lines.map((line) => {
    const currentIndent = line.match(/^\s*/)?.[0].length ?? 0;
    const removeLength = Math.min(
      currentIndent,
      indentOfBlockLine.length + minAdditionalIndent,
    );
    const withoutIndent =
      removeLength > 0 ? line.slice(Math.min(removeLength, line.length)) : line;
    return `${indentOfBlockLine}${withoutIndent.trimEnd()}`;
  });

  return normalizedLines.join('\n');
}

function getAncestors(
  context: Readonly<TSESLint.RuleContext<MessageIds, []>>,
  sourceCode: Readonly<TSESLint.SourceCode>,
  node: TSESTree.Node,
): TSESTree.Node[] {
  const candidate = (sourceCode as unknown as {
    getAncestors?: (current: TSESTree.Node) => TSESTree.Node[];
  }).getAncestors;

  if (typeof candidate === 'function') {
    return candidate.call(sourceCode, node);
  }

  /* istanbul ignore next -- fallback for older ESLint versions */
  return context.getAncestors();
}

export const noCurlyBracketsAroundCommentedProperties = createRule<
  [],
  MessageIds
>({
  name: 'no-curly-brackets-around-commented-properties',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow curly-brace blocks that only wrap commented-out members inside type declarations',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      removeCommentWrappedBlock:
        'Curly braces in {{context}} wrap only comments (often commented-out members). They leave the declaration invalid or misleading. Remove the braces and keep the comments inline so the type stays readable and syntactically correct.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();

    return {
      BlockStatement(node) {
        if (node.body.length > 0) {
          return;
        }

        const parent = node.parent;

        if (
          !parent ||
          (parent.type !== AST_NODE_TYPES.Program &&
            parent.type !== AST_NODE_TYPES.TSModuleBlock)
        ) {
          return;
        }

        const ancestors = getAncestors(context, sourceCode, node);

        const comments = getBlockComments(sourceCode, node);

        const siblingIndent = getSiblingIndent(sourceCode, parent, node);

        if (!comments.length) {
          return;
        }

        const hasMemberShapedComment = comments.some((comment) =>
          looksLikeTypeMemberComment(comment.value),
        );

        if (!hasMemberShapedComment) {
          return;
        }

        context.report({
          node,
          messageId: 'removeCommentWrappedBlock',
          data: {
            context: describeContext(ancestors, parent),
          },
          fix: (fixer) => {
            const replacement = computeReplacement(
              sourceCode,
              node,
              siblingIndent,
            );

            /* istanbul ignore next -- replacement only null when tokens are missing */
            if (replacement === null) {
              return null;
            }

            return fixer.replaceText(node, replacement);
          },
        });
      },
    };
  },
});

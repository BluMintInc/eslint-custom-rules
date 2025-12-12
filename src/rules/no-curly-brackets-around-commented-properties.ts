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

function extractContentBetweenBraces(
  sourceCode: Readonly<TSESLint.SourceCode>,
  node: TSESTree.BlockStatement,
): string | null {
  const openingBrace = sourceCode.getFirstToken(node);
  const closingBrace = sourceCode.getLastToken(node);

  /* istanbul ignore next -- block nodes always have brace tokens */
  if (!openingBrace || !closingBrace) {
    return null;
  }

  return sourceCode.text.slice(openingBrace.range[1], closingBrace.range[0]);
}

function trimEmptyLines(lines: string[]): string[] {
  const result = [...lines];

  while (result.length > 0 && result[0].trim() === '') {
    result.shift();
  }

  while (result.length > 0 && result[result.length - 1].trim() === '') {
    result.pop();
  }

  return result;
}

function determineBaseIndent(
  indentFromLine: string,
  baseIndentOverride?: string | null,
): string {
  if (baseIndentOverride === null || baseIndentOverride === undefined) {
    return indentFromLine;
  }

  return baseIndentOverride.length <= indentFromLine.length
    ? baseIndentOverride
    : indentFromLine;
}

function calculateMinAdditionalIndent(lines: string[]): number {
  const indents = lines
    .filter((line) => line.trim() !== '')
    .map((line) => line.match(/^\s*/)?.[0].length ?? 0);

  return indents.length ? Math.min(...indents) : 0;
}

function normalizeLineIndentation(
  lines: string[],
  extraIndent: number,
  minAdditionalIndent: number,
): string[] {
  const indentPrefix = extraIndent > 0 ? ' '.repeat(extraIndent) : '';

  return lines.map((line) => {
    const currentIndent = line.match(/^\s*/)?.[0].length ?? 0;
    const removeLength = Math.min(currentIndent, minAdditionalIndent);
    const withoutIndent =
      removeLength > 0 ? line.slice(Math.min(removeLength, line.length)) : line;
    return `${indentPrefix}${withoutIndent.trimEnd()}`;
  });
}

function computeReplacement(
  sourceCode: Readonly<TSESLint.SourceCode>,
  node: TSESTree.BlockStatement,
  baseIndentOverride?: string | null,
): string | null {
  const content = extractContentBetweenBraces(sourceCode, node);

  if (content === null) {
    return null;
  }

  const trimmedLines = trimEmptyLines(content.split('\n'));

  /* istanbul ignore next -- empty blocks are filtered earlier */
  if (!trimmedLines.length) {
    return null;
  }

  const indentFromLine =
    sourceCode.lines[node.loc.start.line - 1]?.match(/^\s*/)?.[0] ?? '';

  const targetIndent = determineBaseIndent(indentFromLine, baseIndentOverride);

  const indentDelta = Math.max(targetIndent.length - indentFromLine.length, 0);

  const minAdditionalIndent = calculateMinAdditionalIndent(trimmedLines);

  const normalizedLines = normalizeLineIndentation(
    trimmedLines,
    indentDelta,
    minAdditionalIndent,
  );

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

type TopLevelParent = TSESTree.Program | TSESTree.TSModuleBlock;

type ReportableBlockContext = {
  parent: TopLevelParent;
  ancestors: TSESTree.Node[];
  siblingIndent: string | null;
};

function isEmptyTopLevelBlock(
  node: TSESTree.BlockStatement,
  parent: TSESTree.Node | null | undefined,
): parent is TopLevelParent {
  return (
    node.body.length === 0 &&
    !!parent &&
    (parent.type === AST_NODE_TYPES.Program ||
      parent.type === AST_NODE_TYPES.TSModuleBlock)
  );
}

function hasTypeMemberComments(comments: TSESTree.Comment[]): boolean {
  return comments.some((comment) => looksLikeTypeMemberComment(comment.value));
}

function getReportableBlockContext(
  context: Readonly<TSESLint.RuleContext<MessageIds, []>>,
  sourceCode: Readonly<TSESLint.SourceCode>,
  node: TSESTree.BlockStatement,
): ReportableBlockContext | null {
  const parent = node.parent;

  if (!isEmptyTopLevelBlock(node, parent)) {
    return null;
  }

  const comments = getBlockComments(sourceCode, node);

  if (!hasTypeMemberComments(comments)) {
    return null;
  }

  return {
    parent,
    ancestors: getAncestors(context, sourceCode, node),
    siblingIndent: getSiblingIndent(sourceCode, parent, node),
  };
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
        const reportableContext = getReportableBlockContext(
          context,
          sourceCode,
          node,
        );

        if (!reportableContext) {
          return;
        }

        context.report({
          node,
          messageId: 'removeCommentWrappedBlock',
          data: {
            context: describeContext(
              reportableContext.ancestors,
              reportableContext.parent,
            ),
          },
          fix: (fixer) => {
            const replacement = computeReplacement(
              sourceCode,
              node,
              reportableContext.siblingIndent,
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

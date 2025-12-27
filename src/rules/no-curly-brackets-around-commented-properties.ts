import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';

import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';

type MessageIds = 'removeCommentWrappedBlock';

const MEMBER_SIGNATURE_PATTERN = /\b[A-Za-z_$][\w$]*\s*\??\s*:\s*[^;]+;?/;
const METHOD_SIGNATURE_PATTERN = /\b[A-Za-z_$][\w$]*\s*\([^)]*\)\s*:?[^;]*;?/;

const JSDOC_MEMBER_TAGS = [
  '@remarks',
  '@deprecated',
  '@see',
  '@example',
  '@param',
  '@returns',
  '@type',
  '@property',
  '@method',
  '@default',
  '@readonly',
  '@private',
  '@public',
  '@protected',
  '@internal',
  '@beta',
  '@alpha',
  '@experimental',
  '@override',
  '@throws',
  '@todo',
  '@future',
];

function isTypeMemberComment(rawComment: string): boolean {
  const normalized = rawComment.replace(/^\s*\*/gm, '').trim();

  if (!normalized) {
    return false;
  }

  if (JSDOC_MEMBER_TAGS.some((tag) => normalized.startsWith(tag))) {
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
  return comments.some((comment) => isTypeMemberComment(comment.value));
}

function describeContext(
  ancestors: TSESTree.Node[],
  parent: TSESTree.Node | null,
): string {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];

    if (ancestor.type === AST_NODE_TYPES.TSModuleDeclaration) {
      return ancestor.id.type === AST_NODE_TYPES.Identifier
        ? `namespace "${ancestor.id.name}"`
        : 'this module';
    }
  }

  if (parent?.type === AST_NODE_TYPES.TSModuleBlock) {
    /* istanbul ignore next -- TSModuleBlock always has TSModuleDeclaration ancestor in valid parsing */
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

function calculateMinAdditionalIndent(lines: string[]): number {
  const indents = lines
    .filter((line) => line.trim() !== '')
    .map((line) => line.match(/^\s*/)?.[0].length ?? 0);

  return indents.length ? Math.min(...indents) : 0;
}

function normalizeLineIndentation(
  lines: string[],
  targetIndent: string,
  minAdditionalIndent: number,
): string[] {
  return lines.map((line, index) => {
    const currentIndent = line.match(/^\s*/)?.[0].length ?? 0;
    const removeLength = Math.min(currentIndent, minAdditionalIndent);
    const withoutIndent =
      removeLength > 0 ? line.slice(Math.min(removeLength, line.length)) : line;
    const baseIndent = index === 0 ? '' : targetIndent;
    return `${baseIndent}${withoutIndent.trimEnd()}`;
  });
}

function computeReplacement(
  sourceCode: Readonly<TSESLint.SourceCode>,
  node: TSESTree.BlockStatement,
  targetIndent: string,
): string | null {
  const content = extractContentBetweenBraces(sourceCode, node);

  /* istanbul ignore next -- extractContentBetweenBraces only null when tokens are missing */
  if (content === null) {
    return null;
  }

  const trimmedLines = trimEmptyLines(content.split('\n'));

  /* istanbul ignore next -- empty blocks are filtered earlier */
  if (!trimmedLines.length) {
    return null;
  }

  const minAdditionalIndent = calculateMinAdditionalIndent(trimmedLines);

  const normalizedLines = normalizeLineIndentation(
    trimmedLines,
    targetIndent,
    minAdditionalIndent,
  );

  return normalizedLines.join('\n');
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
    ancestors: ASTHelpers.getAncestors(context, node),
    siblingIndent: getSiblingIndent(sourceCode, parent, node),
  };
}

/**
 * Creates a fixer function that removes unnecessary curly brackets around
 * commented properties by computing the appropriate replacement text and
 * handling indentation and edge cases with trailing code.
 */
function createBlockRemovalFix(
  sourceCode: Readonly<TSESLint.SourceCode>,
  node: TSESTree.BlockStatement,
  reportableContext: ReportableBlockContext,
): TSESLint.ReportFixFunction {
  return (fixer) => {
    const startLine = node.loc.start.line;
    const lineText = sourceCode.lines[startLine - 1];
    const leadingWhitespace = lineText.match(/^\s*/)?.[0] ?? '';
    const targetIndent = reportableContext.siblingIndent ?? leadingWhitespace;

    const replacement = computeReplacement(sourceCode, node, targetIndent);

    /* istanbul ignore next -- replacement only null when tokens are missing */
    if (replacement === null) {
      return null;
    }

    let fixRange: [number, number] = [node.range[0], node.range[1]];
    let finalText = replacement;

    /**
     * If the node is at the start of the line (only whitespace before it),
     * we replace from the very beginning of the line to handle both
     * de-indentation and increasing indentation correctly.
     */
    if (node.loc.start.column === leadingWhitespace.length) {
      const lineStart = sourceCode.getIndexFromLoc({
        line: startLine,
        column: 0,
      });
      fixRange[0] = lineStart;
      finalText = targetIndent + replacement;
    }

    /**
     * If the replacement ends with a line comment and there's code on the
     * same line after the block, we must add a newline and proper
     * indentation to prevent commenting out the subsequent code.
     */
    const lastLine = replacement.split('\n').pop() ?? '';
    if (lastLine.trim().startsWith('//')) {
      const nextToken = sourceCode.getTokenAfter(node);
      if (nextToken && nextToken.loc.start.line === node.loc.end.line) {
        fixRange[1] = nextToken.range[0];
        finalText += '\n' + targetIndent;
      }
    }

    return fixer.replaceTextRange(fixRange, finalText);
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
    const sourceCode = context.sourceCode;

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
          fix: createBlockRemovalFix(sourceCode, node, reportableContext),
        });
      },
    };
  },
});

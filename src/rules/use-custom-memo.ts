import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import {
  CUSTOM_MEMO_MODULE_PATH,
  CUSTOM_MEMO_MODULE_SOURCE,
} from '../utils/memoModule';

type MessageIds = 'useCustomMemo';

const SOURCE_EXTENSION = /\.(?:ts|tsx|js|jsx)$/;

/**
 * The module the fixer points every `memo` import at is the one module that must
 * keep importing `memo` from `react`: rewriting it makes it import itself, and a
 * self-import evaluates circularly, so the wrapper exports `undefined` and every
 * consumer of it breaks.
 *
 * The linted path is matched by suffix because it reaches the rule in whatever
 * form the caller used — absolute (`/repo/src/util/memo.ts`) or project-relative
 * (`src/util/memo.ts`). The suffix has to land on a path-segment boundary,
 * otherwise `notsrc/util/memo.ts` — an unrelated module — would be exempted too.
 */
const isMemoModule = (filename: string): boolean => {
  const normalized = filename.replace(/\\/g, '/').replace(SOURCE_EXTENSION, '');
  if (!normalized.endsWith(CUSTOM_MEMO_MODULE_PATH)) {
    return false;
  }
  const suffixStart = normalized.length - CUSTOM_MEMO_MODULE_PATH.length;
  return suffixStart === 0 || normalized[suffixStart - 1] === '/';
};

type Range = [number, number];

const isComment = (
  token: TSESLint.AST.Token | TSESTree.Comment,
): token is TSESTree.Comment =>
  token.type === AST_TOKEN_TYPES.Line || token.type === AST_TOKEN_TYPES.Block;

const isMemoSpecifier = (
  specifier: TSESTree.ImportClause,
): specifier is TSESTree.ImportSpecifier =>
  specifier.type === AST_NODE_TYPES.ImportSpecifier &&
  specifier.imported.type === AST_NODE_TYPES.Identifier &&
  specifier.imported.name === 'memo';

/**
 * Rebuilding an import from `local.name` alone silently drops the pieces that
 * make a binding resolve: the default/namespace position outside the braces,
 * `as` aliases, and inline `type` modifiers. Re-emitting each surviving
 * specifier verbatim keeps every one of them intact.
 */
const buildImport = (
  specifiers: TSESTree.ImportClause[],
  source: string,
  importKind: TSESTree.ImportDeclaration['importKind'],
  sourceCode: Readonly<TSESLint.SourceCode>,
): string => {
  const defaultSpecifier = specifiers.find(
    (specifier) => specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier,
  );
  const namespaceSpecifier = specifiers.find(
    (specifier) => specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier,
  );
  const namedSpecifiers = specifiers.filter(
    (specifier) => specifier.type === AST_NODE_TYPES.ImportSpecifier,
  );

  const clauses: string[] = [];
  if (defaultSpecifier) {
    clauses.push(sourceCode.getText(defaultSpecifier));
  }
  if (namespaceSpecifier) {
    clauses.push(sourceCode.getText(namespaceSpecifier));
  }
  // Braces are emitted only when a named binding survives, so a lone default
  // import stays `import React from 'react'` rather than `import {} from ...`.
  if (namedSpecifiers.length > 0) {
    clauses.push(
      `{ ${namedSpecifiers
        .map((specifier) => sourceCode.getText(specifier))
        .join(', ')} }`,
    );
  }

  const prefix = importKind === 'type' ? 'import type ' : 'import ';
  return `${prefix}${clauses.join(', ')} from ${source};`;
};

/**
 * Comments the fix removes along with `memo` are re-emitted above the new
 * import: a directive there kept suppressing the line `memo` sat on, so it has
 * to keep suppressing the line `memo` moves to.
 */
const commentLinesOf = (
  comments: TSESTree.Comment[],
  sourceCode: Readonly<TSESLint.SourceCode>,
): string => {
  if (comments.length === 0) {
    return '';
  }
  const text = sourceCode.getText();
  return `${comments
    .map((comment) => text.slice(comment.range[0], comment.range[1]))
    .join('\n')}\n`;
};

const lineBreakLengthAt = (text: string, index: number): number => {
  if (text.startsWith('\r\n', index)) {
    return 2;
  }
  return text[index] === '\n' ? 1 : 0;
};

/**
 * A comment in front of `memo` annotates `memo`, except when it trails the
 * previous specifier on that specifier's own line — there it annotates the
 * specifier that stays behind. Only an unbroken run of comments immediately
 * before `memo` can travel with it, since the removal must stay one contiguous
 * range.
 */
const commentedStartOf = (
  specifier: TSESTree.ImportSpecifier,
  sourceCode: Readonly<TSESLint.SourceCode>,
): number => {
  const comments = sourceCode.getCommentsBefore(specifier);
  let start = specifier.range[0];
  for (let index = comments.length - 1; index >= 0; index--) {
    const comment = comments[index];
    const previous = sourceCode.getTokenBefore(comment, {
      includeComments: true,
    });
    const startsItsOwnLine =
      !previous || previous.loc.end.line !== comment.loc.start.line;
    // In `import { /* c */ memo, ... }` nothing but the brace precedes the
    // comment, so it annotates `memo` despite sharing its line.
    const followsTheOpeningBrace =
      !!previous && !isComment(previous) && previous.value === '{';
    if (!startsItsOwnLine && !followsTheOpeningBrace) {
      break;
    }
    start = comment.range[0];
  }
  return start;
};

/**
 * Cutting a chunk out of an import must not strand a blank line or a doubled
 * space, so the range absorbs the whitespace the cut orphans.
 */
const absorbOrphanedWhitespace = ([start, end]: Range, text: string): Range => {
  let trailing = end;
  while (text[trailing] === ' ' || text[trailing] === '\t') {
    trailing++;
  }
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const ownsItsLine = /^[ \t]*$/.test(text.slice(lineStart, start));
  const lineBreak = lineBreakLengthAt(text, trailing);
  if (ownsItsLine && lineBreak > 0) {
    return [lineStart, trailing + lineBreak];
  }
  // Mid-line the trailing whitespace is absorbed only when what stays in front
  // already separates the tokens, so `{ memo, useState }` does not become
  // `{  useState }` and `React, { memo } from` does not become `Reactfrom`.
  const separatedInFront = start > 0 && /[ \t]/.test(text[start - 1]);
  return separatedInFront && trailing > end ? [start, trailing] : [start, end];
};

const removalRangeOf = (
  specifier: TSESTree.ImportSpecifier,
  sourceCode: Readonly<TSESLint.SourceCode>,
): Range => {
  const text = sourceCode.getText();
  const start = commentedStartOf(specifier, sourceCode);
  const nextToken = sourceCode.getTokenAfter(specifier);
  if (nextToken?.value === ',') {
    return absorbOrphanedWhitespace([start, nextToken.range[1]], text);
  }
  // Lacking a comma of its own, `memo` is the last specifier, so the comma
  // separating it from the survivors goes too — but only across pure
  // whitespace, otherwise the survivor's trailing comment would be swallowed.
  const separator = /,[ \t\r\n]*$/.exec(text.slice(0, start));
  const separatedStart = separator ? start - separator[0].length : start;
  return absorbOrphanedWhitespace([separatedStart, specifier.range[1]], text);
};

/**
 * When every named specifier is a `memo` binding, the braces go with them:
 * `import React, {} from 'react'` parses but is nonsense.
 */
const bracesRangeOf = (
  node: TSESTree.ImportDeclaration,
  sourceCode: Readonly<TSESLint.SourceCode>,
): Range | null => {
  const tokens = sourceCode.getTokens(node);
  const open = tokens.find((token) => token.value === '{');
  const close = [...tokens].reverse().find((token) => token.value === '}');
  if (!open || !close) {
    return null;
  }
  const text = sourceCode.getText();
  const separator = /,[ \t\r\n]*$/.exec(text.slice(0, open.range[0]));
  const start = separator ? open.range[0] - separator[0].length : open.range[0];
  return absorbOrphanedWhitespace([start, close.range[1]], text);
};

/**
 * A comment *within* a `memo` specifier travels inside the specifier text the
 * new import re-emits, so carrying it as well would duplicate it.
 */
const isInsideAnyOf = (
  comment: TSESTree.Comment,
  specifiers: TSESTree.ImportSpecifier[],
): boolean =>
  specifiers.some(
    (specifier) =>
      comment.range[0] >= specifier.range[0] &&
      comment.range[1] <= specifier.range[1],
  );

const memoRemovalsOf = (
  node: TSESTree.ImportDeclaration,
  memoSpecifiers: TSESTree.ImportSpecifier[],
  survivingSpecifiers: TSESTree.ImportClause[],
  sourceCode: Readonly<TSESLint.SourceCode>,
): Range[] | null => {
  const keepsANamedSpecifier = survivingSpecifiers.some(
    (specifier) => specifier.type === AST_NODE_TYPES.ImportSpecifier,
  );
  if (!keepsANamedSpecifier) {
    const braces = bracesRangeOf(node, sourceCode);
    return braces === null ? null : [braces];
  }
  return memoSpecifiers.map((specifier) =>
    removalRangeOf(specifier, sourceCode),
  );
};

export const useCustomMemo = createRule<[], MessageIds>({
  name: 'use-custom-memo',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce using src/util/memo instead of React memo',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      useCustomMemo: 'Import memo from src/util/memo instead of react',
    },
  },
  defaultOptions: [],
  create(context) {
    // A processor hands the rule a virtual filename for an extracted code block;
    // the physical path is the one that identifies the module on disk.
    const filename = context.getPhysicalFilename
      ? context.getPhysicalFilename()
      : context.getFilename();
    if (isMemoModule(filename)) {
      return {};
    }

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (node.source.value !== 'react') {
          return;
        }

        const memoSpecifiers = node.specifiers.filter(isMemoSpecifier);
        if (memoSpecifiers.length === 0) {
          return;
        }

        context.report({
          node,
          messageId: 'useCustomMemo',
          fix(fixer) {
            const sourceCode = context.getSourceCode();
            const memoImport = buildImport(
              memoSpecifiers,
              CUSTOM_MEMO_MODULE_SOURCE,
              node.importKind,
              sourceCode,
            );

            const survivingSpecifiers = node.specifiers.filter(
              (specifier) => !isMemoSpecifier(specifier),
            );
            const comments = sourceCode
              .getCommentsInside(node)
              .filter((comment) => !isInsideAnyOf(comment, memoSpecifiers));
            if (survivingSpecifiers.length === 0) {
              return fixer.replaceText(
                node,
                `${commentLinesOf(comments, sourceCode)}${memoImport}`,
              );
            }

            // Re-emitting the surviving specifiers keeps their aliases but drops
            // the comments attached to them, and a dropped
            // `eslint-disable-next-line` changes which rules report. An import
            // carrying comments is therefore spliced instead: only the `memo`
            // bindings are cut out, so everything else stays byte-identical.
            const removals =
              comments.length === 0
                ? null
                : memoRemovalsOf(
                    node,
                    memoSpecifiers,
                    survivingSpecifiers,
                    sourceCode,
                  );
            if (removals) {
              const carried = comments.filter((comment) =>
                removals.some(
                  ([start, end]) =>
                    comment.range[0] >= start && comment.range[1] <= end,
                ),
              );
              return [
                fixer.insertTextBefore(
                  node,
                  `${commentLinesOf(carried, sourceCode)}${memoImport}\n`,
                ),
                ...removals.map((range) => fixer.removeRange(range)),
              ];
            }

            const reactImport = buildImport(
              survivingSpecifiers,
              sourceCode.getText(node.source),
              node.importKind,
              sourceCode,
            );

            return fixer.replaceText(node, `${memoImport}\n${reactImport}`);
          },
        });
      },
    };
  },
});

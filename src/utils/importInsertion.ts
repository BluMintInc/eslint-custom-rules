import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { parseDisableDirectives } from './disableDirectives';

/**
 * Where a brand-new top-of-file import belongs. `before` anchors at a node (or
 * a comment bound to the node below it); `index` is a raw character offset for
 * files with nothing to anchor to — a shebang-only, directive-only, or empty
 * file.
 */
export type ImportInsertionAnchor =
  | { kind: 'before'; target: TSESTree.Node | TSESTree.Comment }
  | { kind: 'index'; index: number };

/**
 * The source a rule needs to place an import. Narrower than
 * `TSESLint.SourceCode` so tests can drive the helper without a full linter
 * run.
 */
export type ImportInsertionSource = Pick<
  TSESLint.SourceCode,
  'text' | 'ast' | 'getCommentsBefore'
>;

/**
 * A comment that governs the line directly below it. Splicing an import
 * between such a comment and its subject silently retargets the suppression
 * at the import, so the anchor must climb above the whole run.
 */
function bindsNextLine(comment: TSESTree.Comment): boolean {
  const [directive] = parseDisableDirectives([comment]);
  if (directive?.kind === 'disable-next-line') {
    return true;
  }
  const value = comment.value.trim();
  return value.startsWith('@ts-expect-error') || value.startsWith('@ts-ignore');
}

/**
 * Walks upward from `anchor` over line-binding suppression comments that sit
 * on consecutive lines, so the eventual insertion lands above them rather
 * than between a suppression and the line it covers.
 */
function climbBoundComments(
  sourceCode: ImportInsertionSource,
  anchor: TSESTree.Node,
): TSESTree.Node | TSESTree.Comment {
  let target: TSESTree.Node | TSESTree.Comment = anchor;
  const comments = sourceCode.getCommentsBefore(anchor);
  for (let index = comments.length - 1; index >= 0; index--) {
    const comment = comments[index];
    if (
      !bindsNextLine(comment) ||
      comment.loc.end.line + 1 !== target.loc.start.line
    ) {
      break;
    }
    target = comment;
  }
  return target;
}

function isDirective(statement: TSESTree.ProgramStatement): boolean {
  return (
    statement.type === AST_NODE_TYPES.ExpressionStatement &&
    typeof statement.directive === 'string'
  );
}

/**
 * Resolves the position where a fixer may insert a new import declaration
 * without changing what the file's prologue governs. A `'use client'` /
 * `'use server'` directive must stay the first statement or it stops being a
 * directive; a `#!` shebang must stay at character 0 or the file stops
 * parsing; a leading `// @ts-nocheck` (or any header comment) keeps its
 * meaning only above the code it covers. The anchor therefore lands on the
 * first import if one exists, else on the first non-directive statement —
 * both positions sit past the prologue because comments are excluded from a
 * node's range — and only degenerate files (no statements at all) fall back
 * to a computed offset.
 */
export function importInsertionAnchor(
  sourceCode: ImportInsertionSource,
): ImportInsertionAnchor {
  const { body } = sourceCode.ast;
  const anchorNode =
    body.find(
      (statement) => statement.type === AST_NODE_TYPES.ImportDeclaration,
    ) ?? body.find((statement) => !isDirective(statement));
  if (anchorNode) {
    return {
      kind: 'before',
      target: climbBoundComments(sourceCode, anchorNode),
    };
  }
  const lastDirective = [...body].reverse().find(isDirective);
  if (lastDirective) {
    // Start of the line after the directive, so a trailing same-line comment
    // stays glued to its statement and no blank line is spliced in.
    const lineEnd = sourceCode.text.indexOf('\n', lastDirective.range[1]);
    return {
      kind: 'index',
      index: lineEnd === -1 ? sourceCode.text.length : lineEnd + 1,
    };
  }
  if (sourceCode.text.startsWith('#!')) {
    const lineEnd = sourceCode.text.indexOf('\n');
    return {
      kind: 'index',
      index: lineEnd === -1 ? sourceCode.text.length : lineEnd + 1,
    };
  }
  return { kind: 'index', index: 0 };
}

/**
 * Applies `text` at `anchor`. Callers keep full control of the inserted
 * statement and its separators; the only adjustment made here is a leading
 * newline when a raw-offset anchor sits mid-line (after a directive's `;` or
 * at the unterminated end of a shebang), where splicing text verbatim would
 * fuse the import onto the prologue's line.
 */
export function insertAtImportAnchor(
  sourceCode: ImportInsertionSource,
  fixer: TSESLint.RuleFixer,
  anchor: ImportInsertionAnchor,
  text: string,
): TSESLint.RuleFix {
  if (anchor.kind === 'before') {
    return fixer.insertTextBefore(anchor.target as TSESTree.Node, text);
  }
  const needsNewline =
    anchor.index > 0 && sourceCode.text[anchor.index - 1] !== '\n';
  return fixer.insertTextBeforeRange(
    [anchor.index, anchor.index],
    needsNewline ? `\n${text}` : text,
  );
}

/**
 * Widens `anchor` to the start of its line only where whitespace is all that
 * precedes it there, and leaves it alone otherwise.
 *
 * Raw-offset anchors pass through: they never sit inside an indented line.
 *
 * The widening buys one thing — an emitted `${indent}import …\n` leaves the
 * displaced anchor on the indentation it already had — and that reasoning holds
 * only while the anchor opens its line. When something else opens that line the
 * widened offset sits ahead of it, and the anchor resolves past the prologue
 * precisely because the prologue is what precedes it: a `'use client'` is a
 * directive only while it is the first statement, so an import spliced above it
 * demotes it to an inert expression statement that no bundler reads. Nothing
 * downstream reports that — the output re-lints clean and the demoted directive
 * is still valid TypeScript.
 *
 * Declining to widen costs the displaced anchor its indentation and keeps the
 * file's meaning, which is the safe direction of that trade.
 */
export function importAnchorLineStartIfOwned(
  sourceCode: ImportInsertionSource,
  anchor: ImportInsertionAnchor,
): ImportInsertionAnchor {
  if (anchor.kind === 'index') {
    return anchor;
  }
  const start = anchor.target.range[0];
  const lineStart = sourceCode.text.lastIndexOf('\n', start - 1) + 1;
  return /^[\t ]*$/.test(sourceCode.text.slice(lineStart, start))
    ? { kind: 'index', index: lineStart }
    : anchor;
}

/**
 * The whitespace prefix of the anchor's line, for fixers that replicate the
 * anchor's indentation on the inserted import.
 */
export function importAnchorIndent(
  sourceCode: ImportInsertionSource,
  anchor: ImportInsertionAnchor,
): string {
  const from = anchor.kind === 'before' ? anchor.target.range[0] : anchor.index;
  const lineStart = sourceCode.text.lastIndexOf('\n', from - 1) + 1;
  const match = /^[ \t]*/.exec(sourceCode.text.slice(lineStart, from));
  return match?.[0] ?? '';
}

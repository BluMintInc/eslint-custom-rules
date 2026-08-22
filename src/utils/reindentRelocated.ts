import { AST_TOKEN_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';

/**
 * Text copied out of one position and emitted at another still carries the
 * indentation of the depth it was written at, so every line after the first
 * lands too deep (or too shallow) and prettier immediately rewrites the fix.
 * Shifting all of them by the same delta moves the span to its landing depth
 * while preserving the relative nesting inside it.
 *
 * The entry point takes the node rather than its text so the line the text was
 * laid out against, and the lines inside it whose whitespace is data, are both
 * derived from the same node. Passing them alongside the text lets a caller
 * desync them, which is the failure this API exists to make unrepresentable.
 */

/**
 * A block comment whose continuation lines are `*`-aligned is layout that moves
 * with the code around it — prettier realigns those stars to the comment's new
 * column. Any other block comment is prose whose interior prettier reproduces
 * verbatim.
 */
function isStarAligned(comment: TSESTree.Comment): boolean {
  return comment.value
    .split('\n')
    .slice(1)
    .every((line) => {
      const trimmed = line.trim();
      return trimmed === '' || trimmed.startsWith('*');
    });
}

/**
 * Lines inside the relocated span whose leading whitespace is data rather than
 * layout: a template literal and a line-continued string carry it in the
 * string's value, and a non-aligned block comment carries it in text the fixer
 * does not own. Shifting either would be a correctness defect, not a formatting
 * one.
 */
function frozenLinesOf(
  node: TSESTree.Node,
  sourceCode: TSESLint.SourceCode,
): ReadonlySet<number> {
  const frozen = new Set<number>();

  const freezeInterior = (loc: TSESTree.SourceLocation) => {
    for (let line = loc.start.line + 1; line <= loc.end.line; line++) {
      frozen.add(line);
    }
  };

  for (const token of sourceCode.getTokens(node)) {
    if (
      (token.type === AST_TOKEN_TYPES.Template ||
        token.type === AST_TOKEN_TYPES.String) &&
      token.loc.start.line !== token.loc.end.line
    ) {
      freezeInterior(token.loc);
    }
  }

  for (const comment of sourceCode.getCommentsInside(node)) {
    if (
      comment.type === AST_TOKEN_TYPES.Block &&
      comment.loc.start.line !== comment.loc.end.line &&
      !isStarAligned(comment)
    ) {
      freezeInterior(comment.loc);
    }
  }

  return frozen;
}

/** Leading whitespace of the line `line` (1-based) sits on. */
function indentOfLine(line: number, sourceCode: TSESLint.SourceCode): string {
  return /^[\t ]*/u.exec(sourceCode.lines[line - 1] ?? '')?.[0] ?? '';
}

/**
 * `node`'s source text with every line after the first shifted from the depth
 * the node was written at to `toIndent`. The first line is returned untouched
 * because the caller places it at the landing column itself.
 */
export function reindentRelocated(
  node: TSESTree.Node,
  toIndent: string,
  sourceCode: TSESLint.SourceCode,
): string {
  const text = sourceCode.getText(node);
  const lines = text.split('\n');
  const fromIndent = indentOfLine(node.loc.start.line, sourceCode);
  if (fromIndent === toIndent || lines.length === 1) {
    return text;
  }

  // Tabs and spaces that share no prefix have no delta expressible as
  // whitespace, and picking a tab width would rewrite the file's own
  // indentation style, so such a span is left where it was
  const deepening = toIndent.startsWith(fromIndent);
  const shallowing = fromIndent.startsWith(toIndent);
  if (!deepening && !shallowing) {
    return text;
  }

  const added = deepening ? toIndent.slice(fromIndent.length) : '';
  const removed = shallowing ? fromIndent.slice(toIndent.length) : '';
  const frozenLines = frozenLinesOf(node, sourceCode);
  const firstLine = node.loc.start.line;

  return lines
    .map((line, offset) => {
      // A frozen line's leading whitespace belongs to a string or a comment
      if (offset === 0 || frozenLines.has(firstLine + offset)) {
        return line;
      }
      if (deepening) {
        // Padding a blank line would leave trailing whitespace prettier strips,
        // which is itself a fixed-point failure
        return line.trim() === '' ? line : `${added}${line}`;
      }
      // A line shallower than the delta cannot absorb it; leaving it put keeps
      // the fix from eating indentation that is not the span's
      return line.startsWith(removed) ? line.slice(removed.length) : line;
    })
    .join('\n');
}

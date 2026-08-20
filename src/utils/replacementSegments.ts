import { AST_TOKEN_TYPES, TSESTree } from '@typescript-eslint/utils';
import { parseDisableDirectives } from './disableDirectives';

/**
 * Building blocks for fixers that inline an expression in place of a larger
 * span (e.g. a `useMemo(...)` call) and must carry the comments stranded by
 * that rewrite. A stranded comment is one written inside the replaced span but
 * outside the surviving expression: its text has no anchor in the replacement,
 * so a fixer that does not carry it deletes it — and a fixer that declines
 * instead lets a comment decide whether the transform fires at all, which is a
 * comment changing the transform just the same (#1877).
 */

/**
 * A comment whose meaning is bound to the line it occupies cannot be folded
 * onto the text that follows it. A line comment swallows that text outright,
 * and `eslint-disable-next-line` targets the line after the comment ENDS, so a
 * block-comment directive sharing a line with the expression it guards would
 * silently retarget one line past its subject.
 */
export function requiresLineBreakAfter(comment: TSESTree.Comment): boolean {
  if (comment.type === AST_TOKEN_TYPES.Line) {
    return true;
  }
  return parseDisableDirectives([comment]).some(
    (directive) => directive.kind === 'disable-next-line',
  );
}

/**
 * Whether a comment's own text carries a line terminator, which only a block
 * comment can do.
 */
export function spansMultipleLines(comment: TSESTree.Comment): boolean {
  return comment.loc.start.line !== comment.loc.end.line;
}

/**
 * A comment that cannot be folded onto the code that follows it, so a fixer
 * placing it ahead of an expression must give it a line of its own.
 *
 * Two kinds qualify. One is the line-bound comment {@link requiresLineBreakAfter}
 * describes, whose meaning is tied to the line it occupies. The other is a block
 * comment containing a line terminator: the syntactic grammar treats such a
 * comment as a LineTerminator in its own right, so it triggers every restricted
 * production a raw newline would. Measured with `node --check`, a block comment
 * on one line between arrow parameters and their arrow parses, while the same
 * comment broken across two lines is a SyntaxError; ahead of a `return`
 * argument, the multi-line form is worse still — it parses, and ASI silently
 * replaces the returned value with `undefined` (#1963).
 *
 * Only fixers emitting text where a newline is meaningful need this;
 * a replacement wrapped in parentheses can never trip a restricted production
 * and can keep such a comment inline.
 */
export function requiresOwnLine(comment: TSESTree.Comment): boolean {
  return requiresLineBreakAfter(comment) || spansMultipleLines(comment);
}

export type ReplacementSegment = { text: string; breakAfter: boolean };

/**
 * Joins the inlined expression and its carried comments into one run of text,
 * keeping each comment on the side of the expression it was written on and
 * breaking the line wherever a comment demands one.
 */
export function joinSegmentBody(
  segments: readonly ReplacementSegment[],
  indent: string,
): string {
  const lineBreak = `\n${indent}`;
  return segments.reduce(
    (accumulated, segment, index) =>
      index === 0
        ? segment.text
        : `${accumulated}${segments[index - 1].breakAfter ? lineBreak : ' '}${
            segment.text
          }`,
    '',
  );
}

/**
 * Assembles the parenthesized replacement from the inlined expression and the
 * comments that surround it. The parentheses are what make the internal line
 * breaks safe: inside them a newline can never trigger ASI, so a line comment
 * or a `-next-line` directive can keep a line of its own anywhere in the span.
 */
export function joinSegments(
  segments: readonly ReplacementSegment[],
  indent: string,
): string {
  const lineBreak = `\n${indent}`;
  const body = joinSegmentBody(segments, indent);
  const leading = segments[0].breakAfter ? lineBreak : '';
  const trailing = segments[segments.length - 1].breakAfter ? lineBreak : '';
  return `(${leading}${body}${trailing})`;
}

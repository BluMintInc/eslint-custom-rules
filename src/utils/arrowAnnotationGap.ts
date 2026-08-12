import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { parseDisableDirectives } from './disableDirectives';
import { TextRange } from './importRemoval';
import {
  joinSegmentBody,
  requiresLineBreakAfter,
  requiresOwnLine,
} from './replacementSegments';

/**
 * The span between an arrow function's parameter list and its `=>` is the one
 * place a return-type annotation sits inside a restricted production:
 * `ArrowParameters [no LineTerminator here] =>` forbids a line terminator
 * there, and the syntactic grammar counts a block comment carrying a line
 * terminator AS one. Stripping the annotation and leaving such a comment behind
 * therefore emits a hard SyntaxError (TS1200 / V8 `Unexpected token '=>'`) —
 * which `@typescript-eslint/parser` accepts, so no reparse-based guard sees it
 * (#1964, #1969).
 *
 * Every other subject an annotation can hang off — a function declaration, a
 * method, a class property with a body, a plain binding — ends its signature at
 * a body or a separator, so nothing about the comments around it is restricted
 * and a plain deletion stays correct.
 */

/** One span of a fix, and the text that replaces it. */
export type Edit = { range: TextRange; text: string };

/** Every character the syntactic grammar counts as a LineTerminator. */
const LINE_TERMINATOR = /[\n\r\u2028\u2029]/;

function containsRange(outer: TextRange, inner: TextRange): boolean {
  return inner[0] >= outer[0] && inner[1] <= outer[1];
}

const textOf = (source: TSESLint.SourceCode, range: TextRange): string =>
  source.text.slice(range[0], range[1]);

/**
 * A comment whose meaning is tied to where it sits. Re-emitting one somewhere
 * else retargets it — a disable directive lands on an unrelated line and a
 * `@ts-expect-error` becomes an error of its own — so a rewrite that would move
 * one is withheld instead.
 */
export function isPositionalDirective(comment: TSESTree.Comment): boolean {
  if (parseDisableDirectives([comment]).length > 0) {
    return true;
  }
  const value = comment.value.trim();
  return value.startsWith('@ts-expect-error') || value.startsWith('@ts-ignore');
}

/** The indentation of the line `offset` sits on, for a carried line break. */
export function indentAt(source: TSESLint.SourceCode, offset: number): string {
  const lineStart = source.text.lastIndexOf('\n', offset - 1) + 1;
  const [indent] = /^[ \t]*/.exec(source.text.slice(lineStart, offset)) ?? [''];
  return indent;
}

/**
 * The span an arrow's return annotation occupies between the parameter list and
 * the `=>`, together with that arrow token.
 *
 * The span holds the annotation, whitespace and comments and nothing else,
 * which is what makes it safe to rewrite wholesale: no binding reference can
 * hide in it beyond the ones the annotation itself names.
 */
export function arrowAnnotationGap(
  source: TSESLint.SourceCode,
  returnType: TSESTree.TSTypeAnnotation,
): { gap: TextRange; arrow: TSESTree.Token } | null {
  const parametersEnd = source.getTokenBefore(returnType);
  const arrow = source.getTokenAfter(returnType, {
    filter: (token) => token.value === '=>',
  });
  if (!parametersEnd || !arrow) return null;

  const gap: TextRange = [parametersEnd.range[1], arrow.range[0]];
  return containsRange(gap, returnType.range) ? { gap, arrow } : null;
}

/**
 * Re-emits `comments` on the far side of the arrow, where a line terminator is
 * inert, consuming the horizontal whitespace the arrow already had after it so
 * the body keeps a single separator.
 */
function hoistPastArrow(
  source: TSESLint.SourceCode,
  arrow: TSESTree.Token,
  comments: readonly TSESTree.Comment[],
): Edit {
  const indent = indentAt(source, arrow.range[0]);
  const trailingText = source.text.slice(arrow.range[1]);
  const [spacing] = /^[ \t]*/.exec(trailingText) ?? [''];
  const body = joinSegmentBody(
    comments.map((comment) => ({
      text: textOf(source, comment.range),
      breakAfter: true,
    })),
    indent,
  );
  const rest = trailingText.slice(spacing.length);
  const separator = LINE_TERMINATOR.test(rest.charAt(0))
    ? ''
    : requiresLineBreakAfter(comments[comments.length - 1])
    ? `\n${indent}`
    : ' ';
  return {
    range: [arrow.range[1], arrow.range[1] + spacing.length],
    text: ` ${body}${separator}`,
  };
}

/**
 * The edits that strip an arrow function's return annotation without leaving a
 * line terminator in the restricted gap, carrying every comment the strip
 * strands rather than deleting it (#1877).
 *
 * `removal` is the span the calling rule would otherwise delete: it covers the
 * annotation and may reach further back over the horizontal whitespace ahead of
 * the `:`. It must lie inside the gap, which it does for any annotation the
 * caller located on the arrow itself.
 *
 * A comment that must own a line is re-emitted past the `=>`, the nearest
 * position outside the restricted gap that cannot itself begin one; hoisting it
 * above the enclosing line would anchor an insertion at a column zero that may
 * sit inside a template literal or JSX text, where the comment would become
 * content rather than code. A comment that trips no restricted production stays
 * exactly where it was written, since moving comments gratuitously is its own
 * regression.
 *
 * `null` withholds the fix, for a comment whose meaning is its position and
 * which cannot stay where it is.
 */
export function planArrowAnnotationEdits(
  source: TSESLint.SourceCode,
  returnType: TSESTree.TSTypeAnnotation,
  removal: TextRange,
): Edit[] | null {
  const gapInfo = arrowAnnotationGap(source, returnType);
  if (!gapInfo) return null;
  const { gap, arrow } = gapInfo;
  if (!containsRange(gap, removal)) return null;

  const comments = source
    .getAllComments()
    .filter((comment) => containsRange(gap, comment.range));
  const stranded = comments.filter((comment) =>
    containsRange(removal, comment.range),
  );
  // What the plain deletion would leave between the parameters and the arrow.
  // A comment left there contributes its own text, so a line comment or a
  // multi-line block comment shows up here as the line terminator it is.
  const residue = `${textOf(source, [gap[0], removal[0]])}${textOf(source, [
    removal[1],
    gap[1],
  ])}`;

  // The plain deletion is kept wherever it already lands a legal gap and
  // strands nothing, so no output that survives today moves by a byte.
  if (stranded.length === 0 && !LINE_TERMINATOR.test(residue)) {
    return [{ range: removal, text: '' }];
  }

  // Rewriting the gap collapses the lines it spanned, which moves the line a
  // directive inside it points at, so the whole fix is withheld rather than
  // retargeting one. The gap a directive can share with nothing else is left
  // untouched by the branch above.
  if (comments.some(isPositionalDirective)) return null;

  const hoisted = comments.filter(requiresOwnLine);
  const inline = comments
    .filter((comment) => !requiresOwnLine(comment))
    .map((comment) => textOf(source, comment.range));
  const edits: Edit[] = [
    { range: gap, text: inline.length === 0 ? ' ' : ` ${inline.join(' ')} ` },
  ];
  if (hoisted.length > 0) {
    edits.push(hoistPastArrow(source, arrow, hoisted));
  }
  return edits;
}

/**
 * ESLint applies a fix whole or not at all, and rejects one whose edits
 * overlap. Spans planned independently — several annotations, and the bindings
 * their removal orphans — can only overlap if a premise behind them is wrong,
 * so an overlap withdraws the fix rather than throwing at apply time.
 */
export function isDisjoint(edits: readonly Edit[]): boolean {
  const sorted = [...edits].sort(
    (left, right) => left.range[0] - right.range[0],
  );
  return sorted.every(
    (edit, index) => index === 0 || sorted[index - 1].range[1] <= edit.range[0],
  );
}

import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { parseDisableDirectives } from './disableDirectives';
import { TextRange } from './importRemoval';
import {
  joinSegmentBody,
  requiresLineBreakAfter,
  requiresOwnLine,
  spansMultipleLines,
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

/**
 * One nesting step, in the spelling prettier writes at its default `tabWidth`.
 * Text placed on a line of its own has to pick SOME depth, and the depth
 * prettier gives an arrow body it has broken is a single step past the
 * declaration the arrow belongs to.
 */
const INDENT_STEP = '  ';

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
 * Whether every continuation line of a block comment carries the `*` gutter.
 *
 * Such a comment's interior alignment is a function of the column it opens at
 * rather than text its author chose, so moving the comment obliges re-aligning
 * it — and it is exactly the shape prettier re-indents. Every other block
 * comment's interior is content (commented-out code, an ASCII table, a fenced
 * example), which keeps its columns byte-for-byte because re-flowing it would
 * rewrite text the fixer does not own.
 */
function hasAlignedGutter(lines: readonly string[]): boolean {
  return (
    lines.length > 1 &&
    lines.slice(1).every((line) => line.trimStart().startsWith('*'))
  );
}

/**
 * A block comment re-aligned to open at `indent`, its gutter one column in from
 * the `/*` as a `*`-gutter comment is written. Only leading whitespace moves:
 * the comment's own characters are the part a fix may not rewrite.
 */
function realignComment(text: string, indent: string): string {
  const lines = text.split('\n');
  if (!hasAlignedGutter(lines)) return text;

  return lines
    .map((line, index) =>
      index === 0 ? line : `${indent} ${line.trimStart()}`,
    )
    .join('\n');
}

/**
 * The arrow function an annotation belongs to. The annotation itself stands in
 * where a caller holds a detached node, so an anchor derived from it degrades to
 * the annotation's own line rather than throwing.
 */
function subjectOf(returnType: TSESTree.TSTypeAnnotation): TSESTree.Node {
  return returnType.parent ?? returnType;
}

/**
 * Where the annotated function's own line begins, which is the depth an arrow
 * body is indented from.
 *
 * The `=>` is the wrong anchor for it: an annotation carrying a line terminator
 * leaves the arrow on a continuation line whose indentation is that of the
 * annotation's last line — a comment's gutter, one column — rather than the
 * declaration's.
 */
function subjectIndentOf(
  source: TSESLint.SourceCode,
  returnType: TSESTree.TSTypeAnnotation,
): string {
  return indentAt(source, subjectOf(returnType).range[0]);
}

/**
 * Body shapes that keep the arrow's own line rather than being pushed onto the
 * next one. Each opens a bracket on that line and closes it back at the
 * declaration's depth, so breaking ahead of it buys nothing and leaves the
 * closing brace out of line with what opened it. A template spanning lines is
 * here for a related reason: its interior columns are content, and shifting its
 * opening quote moves the whole literal.
 *
 * A nested arrow is deliberately absent. It reads as one more shape that closes
 * back at its own depth, but a chain of arrows is laid out as a chain — every
 * signature on a line of its own, starting with the `=` — which no annotation
 * strip can produce and which anchors the carried comment one step in, exactly
 * where a broken body goes.
 */
const HUGGING_BODY_TYPES = new Set<string>([
  AST_NODE_TYPES.ArrayExpression,
  AST_NODE_TYPES.BlockStatement,
  AST_NODE_TYPES.JSXElement,
  AST_NODE_TYPES.JSXFragment,
  AST_NODE_TYPES.ObjectExpression,
]);

function hugsArrow(
  source: TSESLint.SourceCode,
  returnType: TSESTree.TSTypeAnnotation,
): boolean {
  const subject = subjectOf(returnType);
  if (subject.type !== AST_NODE_TYPES.ArrowFunctionExpression) return false;

  const { body } = subject;
  if (
    body.type === AST_NODE_TYPES.TemplateLiteral ||
    body.type === AST_NODE_TYPES.TaggedTemplateExpression
  ) {
    return LINE_TERMINATOR.test(textOf(source, body.range));
  }

  return HUGGING_BODY_TYPES.has(body.type);
}

/**
 * Re-emits `comments` on the far side of the arrow, where a line terminator is
 * inert, consuming the horizontal whitespace the arrow already had after it so
 * the body keeps a single separator.
 *
 * A run holding a comment that breaks the line takes a line of its own, one step
 * past the declaration, and its block comments are re-aligned to the column they
 * land at — which is where prettier prints an arrow body it has had to break. A
 * comment spliced in after the `=>` keeping the alignment it had in the
 * annotation position is valid but is not what prettier writes, so it fails
 * `prettier --check` on arrival (#2066). A run that leaves the arrow's line
 * unbroken keeps it, since that is where prettier leaves it.
 */
function hoistPastArrow(
  source: TSESLint.SourceCode,
  arrow: TSESTree.Token,
  comments: readonly TSESTree.Comment[],
  returnType: TSESTree.TSTypeAnnotation,
): Edit {
  const trailingText = source.text.slice(arrow.range[1]);
  const [spacing] = /^[ \t]*/.exec(trailingText) ?? [''];
  const rest = trailingText.slice(spacing.length);
  const last = comments[comments.length - 1];

  // The run and the body share the arrow's line only while nothing between them
  // ends one: a second comment, a comment that must own its line, or a body the
  // source already put on the line below.
  const bodyStartsALine =
    comments.length > 1 ||
    requiresLineBreakAfter(last) ||
    LINE_TERMINATOR.test(rest.charAt(0));
  const ownsLine =
    comments.some(spansMultipleLines) &&
    (bodyStartsALine || !hugsArrow(source, returnType));

  const subjectIndent = subjectIndentOf(source, returnType);
  const indent = ownsLine ? `${subjectIndent}${INDENT_STEP}` : subjectIndent;
  const body = joinSegmentBody(
    comments.map((comment) => ({
      text: realignComment(textOf(source, comment.range), indent),
      breakAfter: true,
    })),
    indent,
  );
  const separator = LINE_TERMINATOR.test(rest.charAt(0))
    ? ''
    : requiresLineBreakAfter(last)
    ? `\n${indent}`
    : ' ';
  return {
    range: [arrow.range[1], arrow.range[1] + spacing.length],
    text: `${ownsLine ? `\n${indent}` : ' '}${body}${separator}`,
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
    edits.push(hoistPastArrow(source, arrow, hoisted, returnType));
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

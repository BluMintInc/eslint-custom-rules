import { createRule } from '../utils/createRule';

type Options = [];
type MessageIds = 'missingLanguageSpecifier';

const BACKTICK = '`';
const TILDE = '~';
/** Only a run of exactly three backticks is labelable; longer runs are declined. */
const LABELABLE_FENCE_LENGTH = 3;
/** CommonMark opens a fenced block on a run of three or more of either marker. */
const MIN_FENCE_LENGTH = 3;
/**
 * CommonMark allows a fence to be indented at most three columns. At four or
 * more the line opens an indented code block, so its backticks are literal
 * document content that must never be rewritten.
 */
const MAX_FENCE_INDENT_COLUMNS = 3;
/** CommonMark advances a tab to the next multiple of four when measuring indent. */
const TAB_STOP = 4;
/** The three bullet characters CommonMark accepts for an unordered list item. */
const BULLET_MARKERS = new Set(['-', '+', '*']);
/** CommonMark caps an ordered list marker at nine digits before its delimiter. */
const MAX_ORDERED_MARKER_DIGITS = 9;

type Line = {
  /** Offset of the first character of the line in the source text. */
  start: number;
  /** Offset of the line terminator, or of the end of the text for the last line. */
  end: number;
  text: string;
};

type FenceMarker = typeof BACKTICK | typeof TILDE;

type Fence = {
  /** Offset of the first marker character of the run. */
  runStart: number;
  marker: FenceMarker;
  runLength: number;
  /** The literal whitespace preceding the run, used to match a closing fence. */
  indent: string;
  infoString: string;
};

function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;

  for (;;) {
    const terminator = text.indexOf('\n', start);
    const end = terminator === -1 ? text.length : terminator;
    lines.push({ start, end, text: text.slice(start, end) });
    if (terminator === -1) {
      return lines;
    }
    start = terminator + 1;
  }
}

/**
 * Reads the fence a line opens, or null when the line cannot open one.
 * Indentation is measured in columns rather than characters so that a tab is
 * treated as the four-column indent CommonMark says it is.
 */
function readFence(line: Line): Fence | null {
  let indentColumns = 0;
  let offset = 0;

  while (offset < line.text.length) {
    const char = line.text[offset];
    if (char === ' ') {
      indentColumns += 1;
    } else if (char === '\t') {
      indentColumns += TAB_STOP - (indentColumns % TAB_STOP);
    } else {
      break;
    }
    offset += 1;
  }

  if (indentColumns > MAX_FENCE_INDENT_COLUMNS) {
    return null;
  }

  const marker = line.text[offset];
  if (marker !== BACKTICK && marker !== TILDE) {
    return null;
  }

  let runLength = 0;
  while (line.text[offset + runLength] === marker) {
    runLength += 1;
  }

  if (runLength < MIN_FENCE_LENGTH) {
    return null;
  }

  return {
    runStart: line.start + offset,
    marker,
    runLength,
    indent: line.text.slice(0, offset),
    infoString: line.text.slice(offset + runLength),
  };
}

/**
 * Reads the list marker at `offset`, including the whitespace that separates
 * it from the item's content, or 0 when no marker starts there. CommonMark
 * requires that separator, which is what keeps `*emphasis*` and the thematic
 * break `***` from reading as list items.
 */
function readListMarker(text: string, offset: number): number {
  let cursor = offset;
  const char = text[cursor];

  if (char !== undefined && BULLET_MARKERS.has(char)) {
    cursor += 1;
  } else {
    let digits = 0;
    while (
      digits < MAX_ORDERED_MARKER_DIGITS &&
      text[cursor + digits] >= '0' &&
      text[cursor + digits] <= '9'
    ) {
      digits += 1;
    }
    const delimiter = text[cursor + digits];
    if (digits === 0 || (delimiter !== '.' && delimiter !== ')')) {
      return 0;
    }
    cursor += digits + 1;
  }

  if (text[cursor] !== ' ' && text[cursor] !== '\t') {
    return 0;
  }
  while (text[cursor] === ' ' || text[cursor] === '\t') {
    cursor += 1;
  }

  return cursor - offset;
}

/**
 * Reads a fence opened on the same line as one or more list markers, as in
 * "- ```ts". A list item's content begins after its marker, so the backticks
 * open a block there exactly as they would at the head of a line.
 *
 * `readFence` cannot see one, because it stops at the first character that is
 * neither a space nor a tab. Without this the scanner walks INTO such a block
 * and mistakes its closing fence — which is nothing but spaces and backticks —
 * for an opening one, appending a language to literal document content.
 *
 * The block is skipped whole rather than labeled: a fix would have to be
 * written past the marker, and labeling a block this rule cannot delimit at
 * the head of a line is the false-negative direction it deliberately keeps.
 */
function readListItemFence(line: Line): Fence | null {
  let indentColumns = 0;
  let offset = 0;
  let sawMarker = false;

  for (;;) {
    while (offset < line.text.length) {
      const char = line.text[offset];
      if (char === ' ') {
        indentColumns += 1;
      } else if (char === '\t') {
        indentColumns += TAB_STOP - (indentColumns % TAB_STOP);
      } else {
        break;
      }
      offset += 1;
    }

    if (indentColumns > MAX_FENCE_INDENT_COLUMNS) {
      return null;
    }

    const markerLength = readListMarker(line.text, offset);
    if (markerLength === 0) {
      break;
    }

    offset += markerLength;
    // The item's content starts a fresh indent budget, so a fence sitting at
    // the content column is at indent zero however deep the nesting is.
    indentColumns = 0;
    sawMarker = true;
  }

  if (!sawMarker) {
    return null;
  }

  const marker = line.text[offset];
  if (marker !== BACKTICK && marker !== TILDE) {
    return null;
  }

  let runLength = 0;
  while (line.text[offset + runLength] === marker) {
    runLength += 1;
  }

  if (runLength < MIN_FENCE_LENGTH) {
    return null;
  }

  return {
    runStart: line.start + offset,
    marker,
    runLength,
    indent: line.text.slice(0, offset),
    infoString: line.text.slice(offset + runLength),
  };
}

/**
 * The line a block closes on, per CommonMark: a run of at least the opening
 * length, of the SAME marker, at a fence indent, with nothing but whitespace
 * after it. This locates the block's END, which is a separate question from
 * whether the rule is willing to LABEL it.
 */
function findFenceCloser(
  lines: Line[],
  fromLine: number,
  opener: Fence,
): { line: number; fence: Fence } | null {
  for (let index = fromLine; index < lines.length; index++) {
    const fence = readFence(lines[index]);
    if (
      fence !== null &&
      fence.marker === opener.marker &&
      fence.runLength >= opener.runLength &&
      fence.infoString.trim().length === 0
    ) {
      return { line: index, fence };
    }
  }

  return null;
}

/**
 * The rule labels only a block it can delimit exactly: three backticks closed
 * by three backticks at the same indent. A longer closing run or a differently
 * indented one is left unlabeled by design — but the block is still SKIPPED
 * whole, because a block the rule declines to label is a block it must not
 * read.
 */
function isExactlyDelimited(opener: Fence, closer: Fence): boolean {
  return (
    closer.runLength === LABELABLE_FENCE_LENGTH &&
    closer.indent === opener.indent
  );
}

export const enforceTypescriptMarkdownCodeBlocks = createRule<
  Options,
  MessageIds
>({
  name: 'enforce-typescript-markdown-code-blocks',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Ensure Markdown fenced code blocks without a language specifier default to typescript for consistent highlighting.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      missingLanguageSpecifier:
        'Code block starting on line {{line}} has no language label. Unlabeled fences render as plain text, hiding TypeScript syntax and type cues. Add "typescript" after the opening backticks (```typescript) to keep documentation readable and consistent.',
    },
  },
  defaultOptions: [],
  create(context) {
    const filename = context.getFilename();
    if (!filename.toLowerCase().endsWith('.md')) {
      return {};
    }

    return {
      Program() {
        const sourceCode = context.sourceCode;
        const text = sourceCode.getText();
        const lines = splitLines(text);

        let index = 0;
        while (index < lines.length) {
          const openingLine = lines[index];
          const fence = readFence(openingLine);

          if (fence === null) {
            const listFence = readListItemFence(openingLine);
            if (listFence === null) {
              index += 1;
              continue;
            }

            // A fence opened on a list marker's line is one this rule declines
            // to label, and declining to label a block means declining to read
            // it. Skipping it whole is what keeps its closing fence — spaces
            // and backticks, indistinguishable from an opener — out of the
            // walk.
            const listClosing = findFenceCloser(lines, index + 1, listFence);
            if (listClosing === null) {
              return;
            }

            index = listClosing.line + 1;
            continue;
          }

          const closing = findFenceCloser(lines, index + 1, fence);

          // An unclosed fence runs to the end of the file, so everything after
          // it is the block's literal content and there is nothing left to
          // scan. Resuming on the next line would read the block's interior.
          if (closing === null) {
            return;
          }

          // A tilde fence and a run of four or more backticks are blocks this
          // rule declines to label, and declining to label a block means
          // declining to read it: its interior is literal text, triple
          // backticks included. So is the interior of a triple-backtick block
          // this rule cannot delimit exactly. Every one of them is skipped from
          // its opening line to past its closing line.
          const labelable =
            fence.marker === BACKTICK &&
            fence.runLength === LABELABLE_FENCE_LENGTH &&
            isExactlyDelimited(fence, closing.fence);

          if (labelable) {
            const content = text.slice(
              openingLine.end + 1,
              lines[closing.line].start,
            );
            const hasContent = content.trim().length > 0;
            const hasLanguage = fence.infoString.trim().length > 0;

            if (!hasLanguage && hasContent) {
              const lineEnd = openingLine.end;
              const locStart = sourceCode.getLocFromIndex(fence.runStart);
              const hasCarriageReturn =
                lineEnd > 0 && text[lineEnd - 1] === '\r';

              context.report({
                loc: {
                  start: locStart,
                  end: sourceCode.getLocFromIndex(lineEnd),
                },
                messageId: 'missingLanguageSpecifier',
                data: { line: locStart.line },
                fix: (fixer) =>
                  fixer.replaceTextRange(
                    [fence.runStart + LABELABLE_FENCE_LENGTH, lineEnd],
                    hasCarriageReturn ? 'typescript\r' : 'typescript',
                  ),
              });
            }
          }

          index = closing.line + 1;
        }
      },
    };
  },
});

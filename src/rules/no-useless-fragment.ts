import { AST_TOKEN_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

/**
 * Normalizes JSX child node types into short descriptors used inside lint messages.
 * Keeps message phrasing consistent regardless of the specific child node shape.
 * @param child - The JSX child node to describe.
 * @returns Human-readable descriptor for the child type used in lint messages.
 */
const describeChild = (child: TSESTree.JSXChild): string => {
  switch (child.type) {
    case 'JSXElement':
      return 'JSX element';
    case 'JSXFragment':
      return 'fragment';
    case 'JSXText':
      return 'text node';
    case 'JSXSpreadChild':
      return 'spread child';
    default:
      return 'child node';
  }
};

/**
 * A `JSXText` child that is pure whitespace AND spans a line break is
 * formatting padding — the newline + indentation prettier inserts around a
 * single-line child in the multi-line fragment form — and renders no output.
 * A whitespace-only child WITHOUT a newline (e.g. `<> <Foo /> </>`) renders
 * an actual space between siblings, so it still counts as meaningful.
 */
const isFormattingWhitespace = (child: TSESTree.JSXChild): boolean =>
  child.type === 'JSXText' &&
  /^\s*$/.test(child.value) &&
  child.value.includes('\n');

/**
 * Multi-line tokens whose interior lines are CONTENT rather than layout: the
 * inside of a template literal (and of a backslash-continued string) is part
 * of the runtime value, and prettier leaves block-comment bodies verbatim.
 * Re-indenting any of these lines would corrupt the value or fight prettier.
 */
const OPAQUE_MULTILINE_TOKEN_TYPES = new Set<string>([
  AST_TOKEN_TYPES.Template,
  AST_TOKEN_TYPES.String,
  AST_TOKEN_TYPES.Block,
]);

/**
 * Collects the absolute line numbers whose first character sits INSIDE an
 * opaque multi-line token of `child`. Such a line begins mid-token, so its
 * leading columns belong to the token's content and must not be shifted.
 * The token's own first line starts outside it and stays shiftable; every
 * later line it spans (including the one it ends on) begins inside it.
 */
const collectContentLines = (
  sourceCode: Readonly<TSESLint.SourceCode>,
  child: TSESTree.Node,
): Set<number> => {
  const contentLines = new Set<number>();
  for (const token of sourceCode.getTokens(child, { includeComments: true })) {
    if (token.loc.start.line === token.loc.end.line) {
      continue;
    }
    if (!OPAQUE_MULTILINE_TOKEN_TYPES.has(token.type)) {
      continue;
    }
    for (
      let line = token.loc.start.line + 1;
      line <= token.loc.end.line;
      line++
    ) {
      contentLines.add(line);
    }
  }
  return contentLines;
};

const shiftLineIndentation = (line: string, columnShift: number): string => {
  // Whitespace-only lines carry no content to align, and padding them would
  // introduce trailing whitespace prettier immediately strips.
  if (/^\s*$/.test(line)) {
    return line;
  }
  if (columnShift > 0) {
    return ' '.repeat(columnShift) + line;
  }
  const leadingWhitespace = /^[ \t]*/.exec(line);
  const leadingWidth = leadingWhitespace ? leadingWhitespace[0].length : 0;
  // Clamp to the whitespace that is actually present so a dedent can never
  // eat into content (e.g. a line already at column 0).
  return line.slice(Math.min(-columnShift, leadingWidth));
};

/**
 * Returns the child's source text re-indented for its promoted position.
 * Replacing the fragment moves the child's first character from the child's
 * column to the fragment's, but a verbatim paste leaves every LATER line at
 * its old depth — one indentation step deeper than the new enclosing scope —
 * which prettier immediately re-indents (a fix that never settles). Shifting
 * each subsequent line by the same column delta as the first keeps the
 * subtree's internal alignment intact at its new depth.
 */
const reindentPromotedChild = (
  sourceCode: Readonly<TSESLint.SourceCode>,
  fragment: TSESTree.JSXFragment,
  child: TSESTree.Node,
): string => {
  const text = sourceCode.getText(child);
  const columnShift = fragment.loc.start.column - child.loc.start.column;
  if (columnShift === 0 || !text.includes('\n')) {
    return text;
  }
  const contentLines = collectContentLines(sourceCode, child);
  return text
    .split('\n')
    .map((line, index) => {
      // The first line's column is set by the replacement position itself.
      if (index === 0) {
        return line;
      }
      const absoluteLine = child.loc.start.line + index;
      if (contentLines.has(absoluteLine)) {
        return line;
      }
      return shiftLineIndentation(line, columnShift);
    })
    .join('\n');
};

export const noUselessFragment = createRule<[], 'noUselessFragment'>({
  name: 'no-useless-fragment',
  create(context) {
    return {
      JSXFragment(node: TSESTree.JSXFragment) {
        const meaningfulChildren = node.children.filter(
          (child) => !isFormattingWhitespace(child),
        );

        if (meaningfulChildren.length !== 1) {
          return;
        }

        const [child] = meaningfulChildren;

        /**
         * A fragment whose only child is an expression container — e.g.
         * `<>{portal}</>` — is NOT useless. Unwrapping it to a bare
         * `{portal}` is invalid in statement/return position, and wrapping a
         * single ReactNode expression in a fragment is the idiomatic way to
         * render it. (Mirrors the upstream rule's `allowExpressions`.)
         */
        if (child.type === 'JSXExpressionContainer') {
          return;
        }

        /**
         * Unwrapping is only sound when the child is itself standalone JSX.
         * A text child (`<>hello</>`) would become a bare identifier
         * reference, and a spread child (`<>{...items}</>`) is not a valid
         * expression on its own — both are report-only so the developer
         * chooses how to restructure the surrounding code.
         */
        const isFixable =
          child.type === 'JSXElement' || child.type === 'JSXFragment';

        context.report({
          node,
          messageId: 'noUselessFragment',
          data: {
            childKind: describeChild(child),
          },
          fix: isFixable
            ? (fixer) =>
                fixer.replaceText(
                  node,
                  reindentPromotedChild(context.sourceCode, node, child),
                )
            : null,
        });
      },
    };
  },
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prevent unnecessary use of React fragments',
      recommended: 'error',
    },
    messages: {
      noUselessFragment:
        'React fragment wraps a single {{childKind}} and does not provide grouping. Fragments exist to wrap multiple siblings; leaving this fragment adds extra syntax and a React tree node without changing the rendered output. Remove the fragment and return the child directly.',
    },
    schema: [],
    fixable: 'code',
  },
  defaultOptions: [],
});

import { AST_TOKEN_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';
import { isReactFragmentElement } from '../utils/reactFragmentBinding';
import { createSuppressionChecker } from '../utils/disableDirectives';
import {
  bindingUses,
  ImportRemovalSource,
  planOrphanedImportRemoval,
  TextRange,
} from '../utils/importRemoval';

/**
 * Normalizes JSX child node types into short descriptors used inside lint messages.
 * Keeps message phrasing consistent regardless of the specific child node shape.
 * A long-form fragment child (`<Fragment>`, `<React.Fragment>`) is described as
 * a fragment rather than a JSX element so the message reads the same whichever
 * spelling the nested fragment uses.
 * @param child - The JSX child node to describe.
 * @param isFragmentElement - Recognizes the long-form fragment spellings.
 * @returns Human-readable descriptor for the child type used in lint messages.
 */
const describeChild = (
  child: TSESTree.JSXChild,
  isFragmentElement: (element: TSESTree.JSXElement) => boolean,
): string => {
  switch (child.type) {
    case 'JSXElement':
      return isFragmentElement(child) ? 'fragment' : 'JSX element';
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
  fragment: TSESTree.JSXFragment | TSESTree.JSXElement,
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

/**
 * A fragment held until `Program:exit`, with everything its report needs.
 *
 * `tags` is what the fix DELETES that could hold a reference: the opening and
 * closing tags. The promoted child is written back verbatim, so a `<Fragment>`
 * nested inside it survives the unwrap and still holds the import alive — which
 * is why the child's span is deliberately not part of this range.
 */
type Violation = {
  node: TSESTree.JSXFragment | TSESTree.JSXElement;
  childKind: string;
  /** The text the fix writes in the fragment's place; `null` is report-only. */
  replacement: string | null;
  tags: TextRange[];
};

/** The opening and closing tag spans of either fragment spelling. */
const tagRangesOf = (
  node: TSESTree.JSXFragment | TSESTree.JSXElement,
): TextRange[] => {
  if (node.type === 'JSXFragment') {
    return [node.openingFragment.range, node.closingFragment.range];
  }
  return node.closingElement
    ? [node.openingElement.range, node.closingElement.range]
    : [node.openingElement.range];
};

const contains = (outer: TextRange, inner: TextRange): boolean =>
  outer[0] <= inner[0] && inner[1] <= outer[1];

/**
 * Partitions violations into the sets whose unwraps have to travel together.
 *
 * A `Fragment` import read by two useless `<Fragment>` elements is orphaned only
 * once BOTH are unwrapped, so neither unwrap may drop the import alone — and a
 * fix may only count on the other unwrap happening if it performs that unwrap
 * itself. Fragments that jointly hold a binding alive therefore become one
 * batch; every other fragment is a batch of one, judged against the file as it
 * stands. Shorthand `<>` names nothing, so it is never unioned with anything and
 * keeps fixing independently.
 *
 * EVERY binding is asked about, not the imported ones alone, so that a binding
 * no fix asks about cannot end up owned by none of them.
 */
function batchViolations(
  source: ImportRemovalSource,
  violations: readonly Violation[],
): Violation[][] {
  const parents = violations.map((_violation, index) => index);
  const find = (index: number): number => {
    let current = index;
    while (parents[current] !== current) {
      parents[current] = parents[parents[current]];
      current = parents[current];
    }
    return current;
  };
  const union = (left: number, right: number) => {
    const rootLeft = find(left);
    const rootRight = find(right);
    if (rootLeft !== rootRight) {
      parents[rootRight] = rootLeft;
    }
  };

  const ownerOf = (use: TextRange) =>
    violations.findIndex(({ tags }) =>
      tags.some((tag) => use[0] >= tag[0] && use[1] <= tag[1]),
    );

  for (const { uses } of bindingUses(source)) {
    if (uses.length < 2) continue;

    const owners = new Set<number>();
    const escapes = uses.some((use) => {
      const owner = ownerOf(use);
      if (owner === -1) return true;
      owners.add(owner);
      return false;
    });
    // A use outside every unwrap keeps the binding alive whatever these fixes
    // do, so their fixes owe each other nothing.
    if (escapes || owners.size < 2) continue;

    const [first, ...rest] = [...owners];
    for (const other of rest) {
      union(first, other);
    }
  }

  const groups = new Map<number, Violation[]>();
  violations.forEach((violation, index) => {
    const root = find(index);
    const group = groups.get(root);
    if (group) {
      group.push(violation);
    } else {
      groups.set(root, [violation]);
    }
  });
  return [...groups.values()];
}

/** The edits one fix performs for `batch`, or `null` to decline the fix. */
type Plan = {
  unwraps: { node: TSESTree.Node; text: string }[];
  cleanups: TextRange[];
};

/**
 * The unwraps `batch` performs plus the import specifiers they leave bound to
 * nothing. `null` when an orphan cannot be unbound safely — an import behind a
 * directive comment, say — in which case the caller keeps the report and drops
 * the fix, because unwrapping while leaving the import behind turns a clean file
 * into one that fails `no-unused-vars`.
 */
function planBatch(
  source: ImportRemovalSource,
  batch: readonly Violation[],
): Plan | null {
  const unwraps = batch.map((violation) => ({
    node: violation.node,
    // Only fixable violations reach a plan, so the replacement is present.
    text: violation.replacement as string,
  }));
  const cleanups = planOrphanedImportRemoval(
    source,
    batch.flatMap((violation) => violation.tags),
  );
  return cleanups ? { unwraps, cleanups } : null;
}

export const noUselessFragment = createRule<[], 'noUselessFragment'>({
  name: 'no-useless-fragment',
  create(context) {
    const sourceCode = context.sourceCode;

    /**
     * Long-form fragments are recognized through the element's own scope, so a
     * `Fragment` shadowed by a local component is not mistaken for react's.
     */
    const isFragmentElement = (element: TSESTree.JSXElement): boolean =>
      isReactFragmentElement(element, (node) =>
        ASTHelpers.getScope(context, node),
      );

    /**
     * Fragments held until `Program:exit`. Whether an unwrap strands the import
     * that names the fragment is a whole-file question, and the answer can only
     * be given once every fragment reading that import is known.
     */
    const violations: Violation[] = [];

    /**
     * Whether ESLint will discard a report, resolved the way ESLint resolves it.
     * A batched fix counts on every unwrap in its batch happening; a suppressed
     * report never fixes, so its fragment — and the reference its tags hold —
     * outlives the pass and must not be counted on.
     */
    const isSuppressed = createSuppressionChecker(context);

    /**
     * The single decision every fragment spelling shares. `<>`, `<Fragment>`
     * and `<React.Fragment>` denote the same node, so they are reported and
     * unwrapped identically; splitting the logic per spelling is what let the
     * long forms go unexamined in the first place.
     */
    const collectWhenUseless = (
      node: TSESTree.JSXFragment | TSESTree.JSXElement,
    ) => {
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

      violations.push({
        node,
        childKind: describeChild(child, isFragmentElement),
        replacement: isFixable
          ? reindentPromotedChild(sourceCode, node, child)
          : null,
        tags: tagRangesOf(node),
      });
    };

    return {
      JSXFragment(node: TSESTree.JSXFragment) {
        collectWhenUseless(node);
      },
      JSXElement(node: TSESTree.JSXElement) {
        if (!isFragmentElement(node)) {
          return;
        }

        /**
         * An attribute is content the shorthand cannot carry: `key` positions
         * the fragment in a sibling list, and unwrapping would move it onto
         * the promoted child, changing reconciliation. Only the long forms can
         * reach this branch, since `<>` admits no attributes at all.
         */
        if (node.openingElement.attributes.length > 0) {
          return;
        }

        collectWhenUseless(node);
      },

      /**
       * Emits every held report, each carrying the import cleanup its own
       * unwrap makes necessary.
       *
       * Orphanhood is judged against a single fix's own deletions, never
       * against what sibling reports might also delete: ESLint may discard a
       * sibling, and the fragment it was going to unwrap then keeps the import
       * alive.
       */
      'Program:exit'() {
        if (violations.length === 0) return;

        /**
         * A fragment nested inside another fragment being unwrapped is left out
         * of the batching. Its tags are carried into the outer fragment's
         * replacement text verbatim, so its reference SURVIVES that fix — and
         * the two replacements would overlap besides. The outer unwrap then
         * finds the import still in use and leaves it, and the next `--fix`
         * pass unwraps what is by then a lone fragment and takes the import
         * with it.
         */
        const unwrapping = violations.filter(
          (violation) =>
            violation.replacement !== null && !isSuppressed(violation.node),
        );
        const batchable = unwrapping.filter(
          (violation) =>
            !unwrapping.some(
              (other) =>
                other !== violation &&
                contains(other.node.range, violation.node.range),
            ),
        );
        const batchableSet = new Set(batchable);

        const plans = new Map<Violation, Plan>();
        for (const batch of batchViolations(sourceCode, batchable)) {
          const plan = planBatch(sourceCode, batch);
          if (!plan) continue;
          for (const violation of batch) {
            plans.set(violation, plan);
          }
        }

        for (const violation of violations) {
          /**
           * A fixable fragment the batching left out fixes on its own. It is
           * nested inside another fragment being unwrapped — so its tags are
           * carried into that fragment's replacement rather than deleted, and
           * strand nothing — or it is suppressed, in which case ESLint discards
           * the report and the fix never runs. A fragment that WAS batched and
           * whose batch declined gets no fix at all, which is the whole point of
           * the decline.
           */
          const own =
            violation.replacement !== null && !batchableSet.has(violation)
              ? {
                  unwraps: [
                    { node: violation.node, text: violation.replacement },
                  ],
                  cleanups: [] as TextRange[],
                }
              : null;
          const applied = plans.get(violation) ?? own;
          context.report({
            node: violation.node,
            messageId: 'noUselessFragment',
            data: { childKind: violation.childKind },
            ...(applied
              ? {
                  fix: (fixer: TSESLint.RuleFixer) => [
                    ...applied.unwraps.map((unwrap) =>
                      fixer.replaceText(unwrap.node, unwrap.text),
                    ),
                    ...applied.cleanups.map((range) =>
                      fixer.removeRange([range[0], range[1]]),
                    ),
                  ],
                }
              : {}),
          });
        }
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

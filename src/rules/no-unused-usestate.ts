import { ESLintUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createSuppressionChecker } from '../utils/disableDirectives';
import { planOrphanedBindingRemoval, TextRange } from '../utils/importRemoval';

const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `https://github.com/BluMintInc/eslint-custom-rules/blob/main/docs/rules/${name}.md`,
);

/**
 * A destructuring binding counts as live when anything other than its own
 * initializer write references it. The write produced by the declaration itself
 * carries `init: true`, so it must not be mistaken for a usage.
 */
const isBindingReferenced = (variable: TSESLint.Scope.Variable) => {
  return variable.references.some((reference) => !reference.init);
};

const isWithinAny = (range: TextRange, ranges: readonly TextRange[]) =>
  ranges.some(([start, end]) => range[0] >= start && range[1] <= end);

const rangesOverlap = (left: TextRange, right: TextRange) =>
  left[0] < right[1] && right[0] < left[1];

/** A discarded `useState` pair the rule reports, held until `Program:exit`. */
type Violation = {
  node: TSESTree.VariableDeclarator;
  stateName: string;
  /**
   * The span deleting this declaration, or `null` for a report that ships no
   * fix because a live setter still needs the declaration.
   */
  removal: TextRange | null;
};

/** A violation whose deletion ships, with the span it owns. */
type PlannedRemoval = { violation: Violation; removal: TextRange };

/**
 * The slice a fix deletes to retire `node`, separators included, or `null` when
 * the declaration sits somewhere this rule does not rewrite.
 *
 * The sole declarator of a statement takes the statement with it, up to the next
 * token or comment so the line it occupied does not survive as blank space. One
 * declarator among several takes exactly one separator: the comma after it, plus
 * the whitespace up to the next declarator so no double space is left behind —
 * or the comma before it when it ends the list. A comment stops the removal so
 * it survives the fix.
 */
const declarationRemovalRange = (
  sourceCode: Readonly<TSESLint.SourceCode>,
  node: TSESTree.VariableDeclarator,
): TextRange | null => {
  const parentStatement = node.parent;
  if (
    !parentStatement ||
    parentStatement.type !== TSESTree.AST_NODE_TYPES.VariableDeclaration
  ) {
    return null;
  }

  if (parentStatement.declarations.length === 1) {
    const nextToken = sourceCode.getTokenAfter(parentStatement, {
      includeComments: true,
    });
    return nextToken
      ? [parentStatement.range[0], nextToken.range[0]]
      : [parentStatement.range[0], parentStatement.range[1]];
  }

  const tokenAfter = sourceCode.getTokenAfter(node);
  if (tokenAfter && tokenAfter.value === ',') {
    const tokenAfterComma = sourceCode.getTokenAfter(tokenAfter, {
      includeComments: true,
    });
    return [
      node.range[0],
      tokenAfterComma ? tokenAfterComma.range[0] : tokenAfter.range[1],
    ];
  }

  const tokenBefore = sourceCode.getTokenBefore(node);
  if (tokenBefore && tokenBefore.value === ',') {
    return [tokenBefore.range[0], node.range[1]];
  }

  return [node.range[0], node.range[1]];
};

/**
 * Rule to detect and remove unused useState hooks in React components
 * This rule identifies cases where the state variable from useState is ignored (e.g., replaced with _)
 */
export const noUnusedUseState = createRule({
  name: 'no-unused-usestate',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow unused useState hooks',
      recommended: 'error',
    },
    fixable: 'code',
    messages: {
      unusedUseState:
        'State value "{{stateName}}" from useState is discarded. React still allocates state and re-renders for a value you never read, which misleads readers into thinking the component depends on that state. Remove the useState pair or switch to a ref/derived value when you only need the setter-style side effect.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();

    /**
     * Every discarded pair the rule finds, in traversal order.
     *
     * Reporting waits for `Program:exit` because the `useState` import is left
     * unreferenced only once NO surviving call mentions it. Judged one
     * declaration at a time, a file with two dead pairs never sees either as the
     * import's last use, and the pass that deletes both resolves every report —
     * so nothing ever revisits the stranded import.
     */
    const violations: Violation[] = [];

    /**
     * A suppressed report is discarded together with its fix, so its removal
     * never happens: counting it toward the batch would unbind an import the
     * surviving text still calls.
     */
    const isReportSuppressed = createSuppressionChecker(context);

    /**
     * The extra deletions that keep `removed` from stranding a binding.
     *
     * Deleting a `useState` declaration strands two kinds of binding. The
     * import is unbound by dropping its specifier, which the shared helper
     * plans. The pattern's own `_` and setter are unbound by the very deletion
     * being planned — their declarations sit inside `removed`, so they need
     * nothing further and the unbinder claims them with an empty plan. Anything
     * else the deletion leaves unreferenced (a `const` read only by the
     * discarded initializer) declines the whole fix: leaving the report standing
     * costs less than trading it for an unused-variable error the fixer resolved
     * out of view.
     */
    const planRemoval = (removed: readonly TextRange[]) =>
      planOrphanedBindingRemoval(sourceCode, removed, (variables, ranges) =>
        variables.every((variable) =>
          variable.identifiers.every((identifier) =>
            isWithinAny(identifier.range, ranges),
          ),
        )
          ? []
          : null,
      );

    /**
     * The removals that ship, in traversal order.
     *
     * Each is screened alone before joining the batch: a deletion that strands
     * something unbindable would otherwise withhold every other removal in the
     * file. Overlapping deletions are dropped because ESLint rejects a fix whose
     * own edits collide — two dead declarators of one statement overlap on the
     * separator between them, and the later one is deleted on a following pass.
     */
    const planViolations = (): PlannedRemoval[] => {
      const planned: PlannedRemoval[] = [];
      const claimed: TextRange[] = [];

      for (const violation of violations) {
        const { removal } = violation;
        if (!removal) continue;
        if (isReportSuppressed(violation.node)) continue;
        if (planRemoval([removal]) === null) continue;
        if (claimed.some((taken) => rangesOverlap(removal, taken))) continue;
        claimed.push(removal);
        planned.push({ violation, removal });
      }

      return planned;
    };

    return {
      // Look for variable declarations that destructure from useState
      VariableDeclarator(node) {
        // Check if it's an array pattern (destructuring)
        if (
          node.id.type === TSESTree.AST_NODE_TYPES.ArrayPattern &&
          node.init?.type === TSESTree.AST_NODE_TYPES.CallExpression
        ) {
          const callExpression = node.init;

          // Check if the call is to useState
          if (
            callExpression.callee.type === TSESTree.AST_NODE_TYPES.Identifier &&
            callExpression.callee.name === 'useState'
          ) {
            const arrayPattern = node.id;

            // Check if the first element is ignored (named _ or unused)
            if (
              arrayPattern.elements.length > 0 &&
              arrayPattern.elements[0] &&
              arrayPattern.elements[0].type ===
                TSESTree.AST_NODE_TYPES.Identifier &&
              (arrayPattern.elements[0].name === '_' ||
                arrayPattern.elements[0].name.startsWith('_'))
            ) {
              const stateIdentifier = arrayPattern.elements[0];
              const declaredVariables = context.getDeclaredVariables(node);
              const stateVariable = declaredVariables.find((variable) =>
                variable.identifiers.includes(stateIdentifier),
              );

              // The `_` prefix is a convention, not proof: when the value is
              // actually read the pair is justified and nothing is discarded.
              if (stateVariable && isBindingReferenced(stateVariable)) {
                return;
              }

              // Every other binding of the pattern (the setter, and any nested
              // or rest binding) must be dead before the declaration can be
              // deleted. Removing it while the setter is still called strands
              // the call sites and breaks the component. A live setter therefore
              // yields a report without a fix.
              const hasLiveSiblingBinding = declaredVariables.some(
                (variable) =>
                  variable !== stateVariable && isBindingReferenced(variable),
              );

              violations.push({
                node,
                stateName: stateIdentifier.name,
                removal: hasLiveSiblingBinding
                  ? null
                  : declarationRemovalRange(sourceCode, node),
              });
            }
          }
        }
      },

      'Program:exit'() {
        if (violations.length === 0) return;

        const planned = planViolations();
        // One plan over every surviving removal: the `useState` binding is left
        // unreferenced by their union even when no single deletion strips its
        // last call, and the pass that applies them all resolves every report —
        // so this is the only moment the stranded import is visible.
        const orphanRemoval =
          planned.length > 0
            ? planRemoval(planned.map((entry) => entry.removal))
            : null;

        // The whole batch ships as one fix, so no deletion lands without the
        // others the import's orphanhood was judged against, and no unbinding
        // lands without the deletion it was claimed on. The other violations
        // report without a fixer; the carrier's pass already resolves them.
        //
        // No plan at all means some binding would be left unreferenced yet
        // cannot be unbound safely, so every deletion stays behind: reports
        // without a fixer are the lesser damage.
        const carrier = orphanRemoval ? planned[0] : undefined;
        const removals: readonly TextRange[] = orphanRemoval
          ? [...orphanRemoval, ...planned.map((entry) => entry.removal)]
          : [];

        for (const violation of violations) {
          context.report({
            node: violation.node,
            messageId: 'unusedUseState',
            data: {
              stateName: violation.stateName,
            },
            fix:
              violation === carrier?.violation
                ? (fixer: TSESLint.RuleFixer) =>
                    removals.map((range) =>
                      fixer.removeRange([range[0], range[1]]),
                    )
                : undefined,
          });
        }
      },
    };
  },
});

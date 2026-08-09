import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { createSuppressionChecker } from '../utils/disableDirectives';
import { planOrphanedImportRemoval, TextRange } from '../utils/importRemoval';
import {
  ReplacementSegment,
  joinSegments,
  requiresLineBreakAfter,
} from '../utils/replacementSegments';
import { classifyExpressionType } from '../utils/tsTypeClassifier';

type Options = [
  {
    ignoreCallExpressions?: boolean;
    ignoreSymbol?: boolean;
    tsOnly?: boolean;
  },
];

type MessageIds = 'uselessUseMemoPrimitive';

/** One rewrite the fix performs: `range` becomes `text`. */
type Edit = { range: TSESTree.Range; text: string };

/** A `useMemo` call the rule reports, held until `Program:exit`. */
type Violation = {
  node: TSESTree.CallExpression;
  returnedExpression: TSESTree.Expression;
  valueKind: string;
};

/** A violation whose rewrite ships, with the edit and deletions it owns. */
type PlannedViolation = {
  violation: Violation;
  edit: Edit;
  /** The positions the edit erases, for the orphaned-import analysis. */
  removed: TSESTree.Range[];
};

const DEFAULT_OPTIONS: Required<Options[number]> = {
  ignoreCallExpressions: true,
  ignoreSymbol: true,
  tsOnly: false,
};

const NON_DETERMINISTIC_MEMBERS = new Set([
  'Date.now',
  'Math.random',
  'performance.now',
  'crypto.randomUUID',
  'crypto.getRandomValues',
]);
const NON_DETERMINISTIC_CONSTRUCTORS = new Set(['Date']);
const COMPARISON_OPERATORS = new Set([
  '==',
  '===',
  '!=',
  '!==',
  '<',
  '<=',
  '>',
  '>=',
  'instanceof',
  'in',
]);

function isStringLikeWithoutTypes(expr: TSESTree.Expression): boolean {
  switch (expr.type) {
    case AST_NODE_TYPES.Literal:
      return typeof expr.value === 'string';
    case AST_NODE_TYPES.TemplateLiteral:
      return true;
    case AST_NODE_TYPES.UnaryExpression:
      return expr.operator === 'typeof';
    case AST_NODE_TYPES.BinaryExpression:
      return (
        expr.operator === '+' &&
        (isStringLikeWithoutTypes(expr.left as TSESTree.Expression) ||
          isStringLikeWithoutTypes(expr.right as TSESTree.Expression))
      );
    default:
      return false;
  }
}

function rangesOverlap(
  a: readonly [number, number],
  b: readonly [number, number],
): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

function isUseMemoCallee(callee: TSESTree.LeftHandSideExpression): boolean {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === 'useMemo';
  }

  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return callee.property.name === 'useMemo';
  }

  return false;
}

function getReturnedExpression(
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): TSESTree.Expression | null {
  if (callback.body.type !== AST_NODE_TYPES.BlockStatement) {
    return callback.body as TSESTree.Expression;
  }

  if (callback.body.body.length !== 1) {
    return null;
  }

  const soleStatement = callback.body.body[0];
  if (
    soleStatement.type === AST_NODE_TYPES.ReturnStatement &&
    soleStatement.argument &&
    soleStatement.argument.type !== AST_NODE_TYPES.SequenceExpression
  ) {
    return soleStatement.argument as TSESTree.Expression;
  }

  return null;
}

function walkExpression(
  expr: TSESTree.Expression,
  predicate: (node: TSESTree.Node) => boolean,
  maxDepth = 100,
): boolean {
  const stack: Array<{ node: TSESTree.Node; depth: number }> = [
    { node: expr, depth: 0 },
  ];
  while (stack.length > 0) {
    const { node: current, depth } = stack.pop()!;
    if (depth > maxDepth) continue;

    if (predicate(current)) {
      return true;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const key of Object.keys(current as any)) {
      if (key === 'parent') continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = (current as any)[key];
      if (!value) continue;
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === 'object' && 'type' in child) {
            stack.push({ node: child as TSESTree.Node, depth: depth + 1 });
          }
        }
      } else if (typeof value === 'object' && 'type' in value) {
        stack.push({ node: value as TSESTree.Node, depth: depth + 1 });
      }
    }
  }

  return false;
}

function containsCallExpression(expr: TSESTree.Expression): boolean {
  return walkExpression(expr, (node) =>
    [
      AST_NODE_TYPES.CallExpression,
      AST_NODE_TYPES.NewExpression,
      AST_NODE_TYPES.TaggedTemplateExpression,
    ].includes(node.type as AST_NODE_TYPES),
  );
}

function isNonDeterministicCall(node: TSESTree.CallExpression) {
  const callee = node.callee;
  if (callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed) {
    const object = callee.object;
    const property = callee.property;
    if (
      object.type === AST_NODE_TYPES.Identifier &&
      property.type === AST_NODE_TYPES.Identifier
    ) {
      const key = `${object.name}.${property.name}`;
      if (NON_DETERMINISTIC_MEMBERS.has(key)) {
        return true;
      }
    }
  }

  if (callee.type === AST_NODE_TYPES.Identifier && callee.name === 'Date') {
    return true;
  }

  return false;
}

function isNonDeterministicInvocation(expr: TSESTree.Expression): boolean {
  return walkExpression(expr, (node) => {
    if (node.type === AST_NODE_TYPES.CallExpression) {
      return isNonDeterministicCall(node);
    }

    if (node.type === AST_NODE_TYPES.NewExpression) {
      if (
        node.callee.type === AST_NODE_TYPES.Identifier &&
        NON_DETERMINISTIC_CONSTRUCTORS.has(node.callee.name)
      ) {
        return true;
      }
    }

    return false;
  });
}

function hasUnsafeSideEffects(expr: TSESTree.Expression): boolean {
  return walkExpression(
    expr,
    (node) =>
      [
        AST_NODE_TYPES.AssignmentExpression,
        AST_NODE_TYPES.AwaitExpression,
        AST_NODE_TYPES.UpdateExpression,
        AST_NODE_TYPES.YieldExpression,
        AST_NODE_TYPES.SequenceExpression,
      ].includes(node.type as AST_NODE_TYPES) ||
      (node.type === AST_NODE_TYPES.UnaryExpression &&
        node.operator === 'delete'),
  );
}

function describePrimitiveExpression(expr: TSESTree.Expression): string {
  switch (expr.type) {
    case AST_NODE_TYPES.Literal: {
      if ('regex' in expr && expr.regex) {
        return 'RegExp object';
      }
      if ('bigint' in expr && expr.bigint !== undefined) {
        return 'bigint value';
      }
      if (expr.value === null) return 'null value';
      if (typeof expr.value === 'boolean') return 'boolean value';
      if (typeof expr.value === 'number') return 'number value';
      if (typeof expr.value === 'string') return 'string value';
      /* istanbul ignore next -- defensive fallback for uncommon literals */
      return 'primitive value';
    }
    case AST_NODE_TYPES.TemplateLiteral:
      return 'string value';
    case AST_NODE_TYPES.UnaryExpression:
      if (expr.operator === '!') return 'boolean condition';
      if (expr.operator === 'void') return 'undefined value';
      if (expr.operator === 'typeof') return 'string value';
      /* istanbul ignore next -- other unary operators are treated as primitives */
      return 'primitive value';
    case AST_NODE_TYPES.BinaryExpression:
      if (COMPARISON_OPERATORS.has(expr.operator)) {
        return 'boolean condition';
      }
      if (expr.operator === '+' && isStringLikeWithoutTypes(expr)) {
        return 'string value';
      }
      return 'number value';
    case AST_NODE_TYPES.LogicalExpression:
      return 'primitive value';
    case AST_NODE_TYPES.ConditionalExpression:
      return 'primitive value';
    case AST_NODE_TYPES.Identifier:
      if (expr.name === 'undefined') return 'undefined value';
      if (expr.name === 'Infinity' || expr.name === 'NaN')
        return 'number value';
      return 'primitive value';
    default:
      /* istanbul ignore next -- unreachable with current node set */
      return 'primitive value';
  }
}

function isPrimitiveExpressionWithoutTypes(expr: TSESTree.Expression): {
  primitive: boolean;
  kind: string;
} {
  switch (expr.type) {
    case AST_NODE_TYPES.Literal: {
      if ('regex' in expr && expr.regex) {
        return { primitive: false, kind: describePrimitiveExpression(expr) };
      }
      return { primitive: true, kind: describePrimitiveExpression(expr) };
    }
    case AST_NODE_TYPES.Identifier: {
      const identifier = expr as TSESTree.Identifier;
      if (
        identifier.name === 'undefined' ||
        identifier.name === 'Infinity' ||
        identifier.name === 'NaN'
      ) {
        return { primitive: true, kind: describePrimitiveExpression(expr) };
      }
      return { primitive: false, kind: 'primitive value' };
    }
    case AST_NODE_TYPES.TemplateLiteral:
      return { primitive: true, kind: describePrimitiveExpression(expr) };
    case AST_NODE_TYPES.UnaryExpression:
      return { primitive: true, kind: describePrimitiveExpression(expr) };
    case AST_NODE_TYPES.BinaryExpression: {
      const primitive =
        COMPARISON_OPERATORS.has(expr.operator) ||
        (isPrimitiveExpressionWithoutTypes(expr.left as TSESTree.Expression)
          .primitive &&
          isPrimitiveExpressionWithoutTypes(expr.right as TSESTree.Expression)
            .primitive);
      return {
        primitive,
        kind: describePrimitiveExpression(expr),
      };
    }
    case AST_NODE_TYPES.LogicalExpression:
      return {
        primitive:
          isPrimitiveExpressionWithoutTypes(expr.left as TSESTree.Expression)
            .primitive &&
          isPrimitiveExpressionWithoutTypes(expr.right as TSESTree.Expression)
            .primitive,
        kind: describePrimitiveExpression(expr),
      };
    case AST_NODE_TYPES.ConditionalExpression:
      return {
        primitive:
          isPrimitiveExpressionWithoutTypes(
            expr.consequent as TSESTree.Expression,
          ).primitive &&
          isPrimitiveExpressionWithoutTypes(
            expr.alternate as TSESTree.Expression,
          ).primitive,
        kind: describePrimitiveExpression(expr),
      };
    case AST_NODE_TYPES.ChainExpression:
      return isPrimitiveExpressionWithoutTypes(
        expr.expression as TSESTree.Expression,
      );
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
    case AST_NODE_TYPES.TSNonNullExpression:
      return isPrimitiveExpressionWithoutTypes(
        expr.expression as TSESTree.Expression,
      );
    default:
      return { primitive: false, kind: 'primitive value' };
  }
}

export const noUselessUsememoPrimitives = createRule<Options, MessageIds>({
  name: 'no-useless-usememo-primitives',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow useless useMemo with primitive values.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          ignoreCallExpressions: { type: 'boolean', default: true },
          ignoreSymbol: { type: 'boolean', default: true },
          tsOnly: { type: 'boolean', default: false },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      uselessUseMemoPrimitive:
        'useMemo wraps a primitive {{valueKind}}. → Primitives are pass-by-value and have no identity to preserve, so memoization provides zero referential-stability benefit and only adds unnecessary hook overhead. → Remove useMemo and inline the expression directly.',
    },
  },
  defaultOptions: [DEFAULT_OPTIONS],
  create(context) {
    const options = { ...DEFAULT_OPTIONS, ...context.options[0] };
    const sourceCode = context.sourceCode;
    const services = sourceCode.parserServices;
    const parserServices =
      services &&
      'hasFullTypeInformation' in services &&
      services.hasFullTypeInformation
        ? services
        : null;

    if (options.tsOnly && !parserServices) {
      return {};
    }

    let tsModule: typeof import('typescript') | null = null;
    let checker: import('typescript').TypeChecker | null = null;
    if (parserServices) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ts = require('typescript');
        tsModule = ts;
        checker = parserServices.program.getTypeChecker();
      } catch {
        /* istanbul ignore next -- TypeScript not available, falls back to heuristic path */
      }
    }

    function classifyExpressionTypeInternal(expr: TSESTree.Expression) {
      if (!checker || !tsModule || !parserServices) {
        return { status: 'unknown' as const, kind: 'unknown value' };
      }

      return classifyExpressionType(expr, {
        checker,
        tsModule,
        parserServices,
        options,
      });
    }

    /**
     * Every `useMemo` call the rule reports, in traversal order.
     *
     * Reporting is deferred to `Program:exit` because the `useMemo` import is
     * unbound only once no surviving call references it. Judged one call at a
     * time, a file with two of them never sees either as the binding's last
     * use, and the pass that unwraps both resolves every report — so nothing
     * ever revisits the stranded import.
     */
    const violations: Violation[] = [];

    /**
     * A suppressed report is dropped together with its fix, so its rewrite
     * never happens: counting it toward the batch would unbind an import the
     * surviving text still calls.
     */
    const isReportSuppressed = createSuppressionChecker(context);

    /**
     * The text the call collapses to. Inlining replaces the entire
     * `useMemo(...)` call with the returned expression's text, so any comment
     * inside the call but outside that expression — an eslint-disable-next-line
     * directive on the return statement among them — has no representation in
     * the replacement. Dropping one changes which rules report on the file
     * (#1591), and declining the fix whenever one is present makes a comment
     * decide whether the rule rewrites at all (#1877). Both are avoided by
     * carrying every such comment into the replacement, where the directives
     * among them keep the line relationship they were written with.
     */
    function replacementTextFor(
      node: TSESTree.CallExpression,
      returnedExpression: TSESTree.Expression,
    ): string {
      const expressionText = sourceCode.getText(returnedExpression);
      const strandedComments = sourceCode
        .getCommentsInside(node)
        .filter(
          (comment) =>
            comment.range[0] < returnedExpression.range[0] ||
            comment.range[1] > returnedExpression.range[1],
        );
      if (strandedComments.length === 0) {
        return `(${expressionText})`;
      }

      // A comment inside the call lies wholly on one side of the expression,
      // since a comment is a token and cannot straddle a node; keeping each on
      // its own side preserves what it annotates.
      const toSegment = (comment: TSESTree.Comment) => ({
        text: sourceCode.text.slice(comment.range[0], comment.range[1]),
        breakAfter: requiresLineBreakAfter(comment),
      });
      const isBefore = (comment: TSESTree.Comment) =>
        comment.range[0] < returnedExpression.range[0];
      const segments: ReplacementSegment[] = [
        ...strandedComments.filter(isBefore).map(toSegment),
        { text: expressionText, breakAfter: false },
        ...strandedComments
          .filter((comment) => !isBefore(comment))
          .map(toSegment),
      ];

      // The call can start mid-line, so the indentation of the line it opens on
      // is the only anchor the carried comments have.
      const startLine = sourceCode.lines[node.loc.start.line - 1] ?? '';
      const indent = /^[\t ]*/.exec(startLine)?.[0] ?? '';
      return joinSegments(segments, indent);
    }

    /**
     * The edit one violation contributes, together with the positions it
     * genuinely erases.
     *
     * Only deleted text may be listed as removed, and the returned expression is
     * never deleted: it is re-emitted verbatim at the call's position. Handing
     * over the whole call span instead would read every binding the expression
     * mentions as unreferenced and delete its import — an over-removal strictly
     * worse than the stranded import this exists to prevent. What does vanish is
     * the wrapper around it: the callee, the callback's syntax, and the
     * dependency array.
     */
    function planViolation(violation: Violation): PlannedViolation {
      const { node, returnedExpression } = violation;
      return {
        violation,
        edit: {
          range: node.range,
          text: replacementTextFor(node, returnedExpression),
        },
        removed: [
          [node.range[0], returnedExpression.range[0]],
          [returnedExpression.range[1], node.range[1]],
        ],
      };
    }

    /**
     * The rewrites that actually ship, in traversal order.
     *
     * Each is screened alone before it joins the batch: a rewrite whose own
     * deletion orphans something that cannot be unbound safely — a local
     * variable, an import behind a directive comment — would otherwise poison
     * every other rewrite in the file. Edits colliding with an already accepted
     * one are dropped for the same reason a single report's overlapping fixes
     * are: ESLint asserts on the overlap and discards every message for the
     * file. A nested pair collides this way, and the outer rewrite wins because
     * it is visited first; the inner one is reported and fixed on a later pass.
     */
    function planViolations(): PlannedViolation[] {
      const planned: PlannedViolation[] = [];
      const claimed: TSESTree.Range[] = [];

      for (const violation of violations) {
        if (isReportSuppressed(violation.node)) continue;
        const candidate = planViolation(violation);
        if (planOrphanedImportRemoval(sourceCode, candidate.removed) === null) {
          continue;
        }
        if (
          claimed.some((taken) => rangesOverlap(candidate.edit.range, taken))
        ) {
          continue;
        }
        claimed.push(candidate.edit.range);
        planned.push(candidate);
      }

      return planned;
    }

    return {
      CallExpression(node) {
        if (!isUseMemoCallee(node.callee)) {
          return;
        }

        if (node.arguments.length === 0) {
          return;
        }

        const callback = node.arguments[0];
        if (
          callback.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
          callback.type !== AST_NODE_TYPES.FunctionExpression
        ) {
          return;
        }

        if (callback.async) {
          return;
        }

        if (callback.generator) {
          return;
        }

        const returnedExpression = getReturnedExpression(callback);
        if (!returnedExpression) {
          return;
        }

        if (hasUnsafeSideEffects(returnedExpression)) {
          return;
        }

        if (isNonDeterministicInvocation(returnedExpression)) {
          return;
        }

        if (
          options.ignoreCallExpressions &&
          containsCallExpression(returnedExpression)
        ) {
          return;
        }

        const typeEvaluation =
          classifyExpressionTypeInternal(returnedExpression);
        let isPrimitive = false;
        let valueKind = typeEvaluation.kind;

        if (typeEvaluation.status === 'primitive') {
          isPrimitive = true;
        } else if (typeEvaluation.status !== 'non-primitive') {
          const heuristic =
            isPrimitiveExpressionWithoutTypes(returnedExpression);
          if (heuristic.primitive) {
            isPrimitive = true;
            valueKind = heuristic.kind;
          }
        }

        if (!isPrimitive) {
          return;
        }

        violations.push({ node, returnedExpression, valueKind });
      },

      'Program:exit'() {
        if (violations.length === 0) return;

        const planned = planViolations();
        // One plan over every surviving rewrite: the `useMemo` binding is left
        // unreferenced by their union even when no single unwrap strips its
        // last use, and the pass that applies them all resolves every report —
        // so this is the only moment the stranded import is visible.
        const importRemoval =
          planned.length > 0
            ? planOrphanedImportRemoval(
                sourceCode,
                planned.flatMap((entry) => entry.removed),
              )
            : null;

        // The whole batch ships as one fix, so no unwrap can land without the
        // others the import's orphanhood was judged against, and no unbinding
        // can land without the unwrap it was claimed on. The other violations
        // report without a fixer; the carrier's pass already resolves them.
        //
        // No plan at all means some binding would be left unreferenced yet
        // cannot be unbound safely, so every unwrap stays behind: reports
        // without a fixer are the lesser damage.
        const removalRanges: readonly TextRange[] = importRemoval ?? [];
        const carrier = importRemoval ? planned[0] : undefined;

        for (const violation of violations) {
          context.report({
            node: violation.node,
            messageId: 'uselessUseMemoPrimitive',
            data: {
              valueKind: violation.valueKind,
            },
            fix:
              violation === carrier?.violation
                ? (fixer: TSESLint.RuleFixer) => [
                    ...removalRanges.map((range) =>
                      fixer.removeRange([range[0], range[1]]),
                    ),
                    ...planned.map((entry) =>
                      fixer.replaceTextRange(entry.edit.range, entry.edit.text),
                    ),
                  ]
                : undefined,
          });
        }
      },
    };
  },
});

export default noUselessUsememoPrimitives;

import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { createSuppressionChecker } from '../utils/disableDirectives';
import { planOrphanedImportRemoval, TextRange } from '../utils/importRemoval';
import {
  ReplacementSegment,
  joinSegmentBody,
  requiresLineBreakAfter,
  requiresOwnLine,
} from '../utils/replacementSegments';
import {
  isRestrictedProduction,
  requiresParenthesesInline,
} from '../utils/inlineExpressionParens';
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

/** The replacement one call collapses to, and the span it takes over. */
type Replacement = { text: string; range: TSESTree.Range };

/** The repository's prettier `tabWidth`, and so the depth a nested line takes. */
const INDENT_UNIT = '  ';

/**
 * Assembles the parenthesized replacement the way prettier prints a
 * parenthesized group that has to break: every carried line one level in from
 * the position the group opens at, and the closing parenthesis alone on a line
 * at that position's own indentation.
 *
 * The shared `joinSegments` anchors every line at the indentation it is handed —
 * the call's own — and leaves the closing parenthesis trailing the last carried
 * line. Prettier reprints both, so a file the fixer touched fails
 * `prettier --check` over layout alone (#2079). The re-layout stays here because
 * the helper is shared with rules whose emissions prettier already accepts.
 *
 * A group with no break in it stays on one line, which is where prettier keeps
 * it too.
 */
function joinParenthesizedSegments(
  segments: readonly ReplacementSegment[],
  indent: string,
): string {
  if (!segments.some((segment) => segment.breakAfter)) {
    return `(${joinSegmentBody(segments, indent)})`;
  }
  const interior = `${indent}${INDENT_UNIT}`;
  return `(\n${interior}${joinSegmentBody(segments, interior)}\n${indent})`;
}

/** The indentation of the line the given position sits on. */
function indentOfLine(line: string): string {
  return /^[\t ]*/.exec(line)?.[0] ?? '';
}

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
    const sourceCode = context.getSourceCode();
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
     * Whether source the fixer does not own shares the line the call ends on.
     * A carried comment emitted last swallows the rest of its line, so text
     * still standing there is what makes the line break after it mandatory.
     */
    function hasSourceAfterOnLine(node: TSESTree.CallExpression): boolean {
      const endLine = sourceCode.lines[node.loc.end.line - 1] ?? '';
      return endLine.slice(node.loc.end.column).trim() !== '';
    }

    /**
     * Whether code precedes the call on the line it opens on, which makes every
     * line the replacement adds a continuation of a statement already open.
     */
    function hasSourceBeforeOnLine(node: TSESTree.CallExpression): boolean {
      const startLine = sourceCode.lines[node.loc.start.line - 1] ?? '';
      return startLine.slice(0, node.loc.start.column).trim() !== '';
    }

    /**
     * The punctuator a comment carried from behind the expression may move past.
     *
     * Such a comment annotates the statement the call stood in, and prettier
     * prints it AFTER the token that closes that statement — `const x = 1; /* c
     * *\/`, never `const x = 1 /* c *\/;`. Leaving it inside the statement is
     * layout prettier rewrites, so the fixed file fails `prettier --check`
     * (#2079).
     *
     * A comma is a weaker claim and takes only the comments that need a line of
     * their own. Measured against this repo's prettier: a line comment on a list
     * element is printed after the comma, while a block comment on one is
     * printed before it — the opposite of what a semicolon gets. Moving a block
     * comment past a comma would trade one layout prettier rewrites for another.
     *
     * Only a punctuator with nothing but line ending behind it may be taken
     * over: a line-bound comment landing after it would otherwise swallow
     * whatever shared that line. Asking for the next token INCLUDING comments
     * also keeps a comment the fixer does not own from being stepped over.
     */
    function absorbableClosingPunctuator(
      node: TSESTree.CallExpression,
      trailingComments: readonly TSESTree.Comment[],
    ): TSESTree.Token | null {
      const next = sourceCode.getTokenAfter(node, { includeComments: true });
      if (
        !next ||
        next.type !== AST_TOKEN_TYPES.Punctuator ||
        (next.value !== ';' && next.value !== ',')
      ) {
        return null;
      }
      if (
        next.value === ',' &&
        !trailingComments.every(requiresLineBreakAfter)
      ) {
        return null;
      }
      const line = sourceCode.lines[next.loc.end.line - 1] ?? '';
      return line.slice(next.loc.end.column).trim() === '' ? next : null;
    }

    /**
     * The text the call collapses to, and the span that text takes over.
     * Inlining replaces the entire `useMemo(...)` call with the returned
     * expression's text, so any comment inside the call but outside that
     * expression — an eslint-disable-next-line directive on the return statement
     * among them — has no representation in the replacement. Dropping one
     * changes which rules report on the file (#1591), and declining the fix
     * whenever one is present makes a comment decide whether the rule rewrites
     * at all (#1877). Both are avoided by carrying every such comment into the
     * replacement, where the directives among them keep the line relationship
     * they were written with.
     *
     * The parentheses around that replacement are a separate question, decided
     * per landing position by `requiresParenthesesInline`: a pair the position
     * does not need is text the fixer writes into a formatted file, and
     * prettier deletes it again, so every fixed file fails `prettier --check`
     * (#2071).
     */
    function replacementFor(
      node: TSESTree.CallExpression,
      returnedExpression: TSESTree.Expression,
    ): Replacement {
      const expressionText = sourceCode.getText(returnedExpression);
      const needsParentheses = (text: string) =>
        requiresParenthesesInline({
          replacement: returnedExpression,
          replaced: node,
          text,
          sourceText: sourceCode.text,
        });

      const strandedComments = sourceCode
        .getCommentsInside(node)
        .filter(
          (comment) =>
            comment.range[0] < returnedExpression.range[0] ||
            comment.range[1] > returnedExpression.range[1],
        );
      if (strandedComments.length === 0) {
        return {
          text: needsParentheses(expressionText)
            ? `(${expressionText})`
            : expressionText,
          range: node.range,
        };
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
      const leadingComments = strandedComments.filter(isBefore);
      const trailingComments = strandedComments.filter(
        (comment) => !isBefore(comment),
      );

      // A comment behind the expression rides past the punctuator that closes
      // the statement where one is available, so it lands where prettier puts
      // it. Where none is, it stays inside the replacement and the parentheses
      // below keep the break it needs from displacing the source that follows.
      const closingPunctuator =
        trailingComments.length > 0
          ? absorbableClosingPunctuator(node, trailingComments)
          : null;
      const carriedComments = closingPunctuator
        ? leadingComments
        : strandedComments;
      const segments: ReplacementSegment[] = [
        ...leadingComments.map(toSegment),
        { text: expressionText, breakAfter: false },
        ...(closingPunctuator ? [] : trailingComments.map(toSegment)),
      ];

      // The call can start mid-line, so the indentation of the line it opens on
      // is the only anchor the carried comments have.
      const indent = indentOfLine(
        sourceCode.lines[node.loc.start.line - 1] ?? '',
      );

      // Where code already opened the line, every line the replacement adds
      // continues a statement that is already open, and prettier indents such a
      // line one level in from the statement it belongs to. Matching that is
      // what makes the unparenthesised emission a prettier fixed point rather
      // than merely a shorter one (#2071).
      const continuesOpenLine = hasSourceBeforeOnLine(node);
      const carriedIndent = continuesOpenLine
        ? `${indent}${INDENT_UNIT}`
        : indent;
      const body = joinSegmentBody(segments, carriedIndent);

      /** The replacement, followed by whatever rode past the punctuator. */
      const withTail = (core: string): Replacement => {
        if (!closingPunctuator) {
          return { text: core, range: node.range };
        }
        // A comment that takes a line of its own out here belongs to the
        // statement rather than to the expression, so it returns to the
        // indentation of the line the punctuator closes.
        const tail = joinSegmentBody(
          trailingComments.map(toSegment),
          indentOfLine(
            sourceCode.lines[closingPunctuator.loc.end.line - 1] ?? '',
          ),
        );
        return {
          text: `${core}${closingPunctuator.value} ${tail}`,
          range: [node.range[0], closingPunctuator.range[1]],
        };
      };

      // A comment that owns its line puts a line terminator in the middle of
      // the replacement, and the parentheses are what make that terminator
      // inert. Two positions need that, and only those two.
      //
      // In a restricted production the terminator is read as the end of the
      // construct: bare after `return`, ASI hands back `undefined` and leaves
      // the expression standing as dead code (#1963). And an emission ending in
      // a line-bound comment needs the break that follows it, which inside the
      // parentheses stops short of source sharing that line — unparenthesised,
      // that break would displace source the fixer does not own onto a line of
      // its own, and dropping it would comment the source out instead.
      //
      // Anywhere else the terminator is inert, so the landing position decides
      // the parentheses exactly as it does for an uncommented emission: a pair
      // the position does not ask for is text prettier deletes again (#2071).
      const ownsALine = carriedComments.some(requiresOwnLine);
      const endsWithLineBoundComment = segments[segments.length - 1].breakAfter;
      if (
        ownsALine &&
        (isRestrictedProduction(node) ||
          (endsWithLineBoundComment && hasSourceAfterOnLine(node)))
      ) {
        return withTail(joinParenthesizedSegments(segments, indent));
      }
      if (needsParentheses(body)) {
        return withTail(joinParenthesizedSegments(segments, indent));
      }

      // A leading comment that owns its line takes the break that gives it one
      // from the call's own position, so it never shares a line with the code
      // the source already wrote there. The break the last segment asks for is
      // left off: it exists to keep a line-bound comment from swallowing what
      // follows it, and the arm above already keeps the parentheses wherever
      // anything does.
      const leading =
        segments[0].breakAfter && continuesOpenLine ? `\n${carriedIndent}` : '';
      return withTail(`${leading}${body}`);
    }

    /**
     * The span the rewrite takes over.
     *
     * An emission opening with a line break leaves the whitespace that stood
     * between it and the code before it at the end of a line, and a line ending
     * in spaces is no more a prettier fixed point than a redundant pair of
     * parentheses is (#2071). Taking that whitespace along costs nothing — it
     * is the separator the break replaces — and it strands no binding, since
     * whitespace carries no reference for the orphaned-import analysis to read.
     */
    function editRangeFor({ text, range }: Replacement): TSESTree.Range {
      if (!text.startsWith('\n')) {
        return range;
      }
      let start = range[0];
      while (start > 0 && /[\t ]/.test(sourceCode.text[start - 1])) {
        start -= 1;
      }
      return [start, range[1]];
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
      const replacement = replacementFor(node, returnedExpression);
      return {
        violation,
        edit: {
          range: editRangeFor(replacement),
          text: replacement.text,
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

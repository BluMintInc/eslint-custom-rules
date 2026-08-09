import {
  AST_NODE_TYPES,
  TSESTree,
  TSESLint,
  ASTUtils,
} from '@typescript-eslint/utils';
import ts from 'typescript';
import { createRule } from '../utils/createRule';
import { createSuppressionChecker } from '../utils/disableDirectives';
import { planOrphanedImportRemoval, TextRange } from '../utils/importRemoval';
import {
  ReplacementSegment,
  joinSegmentBody,
  joinSegments,
  requiresLineBreakAfter,
} from '../utils/replacementSegments';

type Options = [
  {
    /**
     * Patterns (regex strings) that describe call expressions considered "expensive"
     * and therefore allowed even when they return pass-by-value types.
     */
    allowExpensiveCalleePatterns?: string[];
  },
];

type MessageIds = 'primitiveMemo' | 'invalidRegex';

const DEFAULT_EXPENSIVE_PATTERNS = [
  'compute',
  'calculate',
  'derive',
  'generate',
  'expensive',
  'heavy',
  'hash',
];

/**
 * Resolved on first use rather than at module load: the plugin barrel imports
 * every rule eagerly, and the compiler package root does not expose this enum on
 * all installed TypeScript releases (TypeScript 7 exports only a version stub),
 * so dereferencing it at module scope makes the whole plugin fail to load rather
 * than merely disabling this type-aware rule. The sole call site sits behind a
 * `parserServices.program` guard, so the enum is present whenever this runs.
 */
let passByValueFlagsCache: number | undefined;
function passByValueFlags(): number {
  passByValueFlagsCache ??=
    ts.TypeFlags.StringLike |
    ts.TypeFlags.NumberLike |
    ts.TypeFlags.BigIntLike |
    ts.TypeFlags.BooleanLike |
    ts.TypeFlags.Undefined |
    ts.TypeFlags.Null;
  return passByValueFlagsCache;
}

type FunctionContext = {
  isHook: boolean;
  hookName?: string;
  memoVariables: WeakMap<TSESLint.Scope.Variable, TSESTree.CallExpression>;
};

type UseMemoImports = {
  useMemoNames: Set<string>;
  reactNamespaceNames: Set<string>;
};

/** One rewrite the fix performs: `range` becomes `text`. */
type Edit = { range: TSESTree.Range; text: string };

/** A `useMemo` call the rule reports, held until `Program:exit`. */
type Violation = {
  node: TSESTree.CallExpression;
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;
  returnedExpression: TSESTree.Expression;
  hookName: string;
  valueType: string;
};

/** A violation whose rewrite ships, with the edits and deletions it owns. */
type PlannedViolation = {
  violation: Violation;
  edits: Edit[];
  /** The positions the edits erase, for the orphaned-import analysis. */
  removed: TSESTree.Range[];
};

function rangesOverlap(
  a: readonly [number, number],
  b: readonly [number, number],
): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

function isCustomHookName(name: string | undefined): boolean {
  if (!name) return false;
  return /^use[A-Z]/.test(name);
}

function getFunctionName(
  node:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): string | undefined {
  if (
    node.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
    node.id?.type === AST_NODE_TYPES.Identifier
  ) {
    return node.id.name;
  }

  if (
    node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    node.parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    return node.parent.id.name;
  }

  return undefined;
}

function collectUseMemoImports(program: TSESTree.Program): UseMemoImports {
  const useMemoNames = new Set<string>();
  const reactNamespaceNames = new Set<string>();

  for (const statement of program.body) {
    if (
      statement.type !== AST_NODE_TYPES.ImportDeclaration ||
      statement.source.value !== 'react'
    ) {
      continue;
    }

    for (const specifier of statement.specifiers) {
      if (
        specifier.type === AST_NODE_TYPES.ImportSpecifier &&
        specifier.imported.type === AST_NODE_TYPES.Identifier &&
        specifier.imported.name === 'useMemo'
      ) {
        useMemoNames.add(specifier.local.name);
      }

      if (
        specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
        specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier
      ) {
        reactNamespaceNames.add(specifier.local.name);
      }
    }
  }

  return { useMemoNames, reactNamespaceNames };
}

function getReturnedExpression(
  callback:
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionExpression
    | TSESTree.FunctionDeclaration,
): TSESTree.Expression | null {
  if (callback.body.type === AST_NODE_TYPES.BlockStatement) {
    if (callback.body.body.length !== 1) {
      return null;
    }

    const [onlyStatement] = callback.body.body;
    if (
      onlyStatement.type === AST_NODE_TYPES.ReturnStatement &&
      onlyStatement.argument
    ) {
      return onlyStatement.argument;
    }

    return null;
  }

  return callback.body;
}

function isPassByValueType(
  type: ts.Type,
  checker: ts.TypeChecker,
): { passByValue: boolean; indeterminate: boolean; description: string } {
  const description = checker.typeToString(type);

  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
    return { passByValue: false, indeterminate: true, description };
  }

  if (type.flags & ts.TypeFlags.Never) {
    return { passByValue: false, indeterminate: false, description };
  }

  if (type.flags & ts.TypeFlags.Union) {
    const unionType = type as ts.UnionType;
    let sawIndeterminate = false;

    for (const part of unionType.types) {
      const result = isPassByValueType(part, checker);
      if (result.indeterminate) {
        sawIndeterminate = true;
        break;
      }
      if (!result.passByValue) {
        return { passByValue: false, indeterminate: false, description };
      }
    }

    if (sawIndeterminate) {
      return { passByValue: false, indeterminate: true, description };
    }

    return { passByValue: true, indeterminate: false, description };
  }

  if (checker.isTupleType(type)) {
    const typeArguments = checker.getTypeArguments(type as ts.TypeReference);
    let allPrimitive = true;
    let sawIndeterminate = false;

    for (const elementType of typeArguments) {
      const result = isPassByValueType(elementType, checker);
      if (result.indeterminate) {
        sawIndeterminate = true;
        break;
      }
      if (!result.passByValue) {
        allPrimitive = false;
        break;
      }
    }

    if (sawIndeterminate) {
      return { passByValue: false, indeterminate: true, description };
    }
    return { passByValue: allPrimitive, indeterminate: false, description };
  }

  if (checker.isArrayType(type) || checker.isArrayLikeType(type)) {
    const typeArguments = checker.getTypeArguments(type as ts.TypeReference);
    const elementType = typeArguments[0];
    if (elementType) {
      if (elementType.flags & ts.TypeFlags.Never) {
        // TypeScript infers [] as never[]. The array still has reference identity, but this rule
        // treats it as a primitive-only array by definition (vacuously) to avoid special-casing.
        return { passByValue: true, indeterminate: false, description };
      }
      const result = isPassByValueType(elementType, checker);
      return { ...result, description };
    }
    // Conservative: arrays with unresolvable element types are indeterminate.
    return { passByValue: false, indeterminate: true, description };
  }

  if (type.flags & passByValueFlags()) {
    return { passByValue: true, indeterminate: false, description };
  }

  return { passByValue: false, indeterminate: false, description };
}

function getCalleeName(node: TSESTree.CallExpression): string | null {
  if (node.callee.type === AST_NODE_TYPES.Identifier) {
    return node.callee.name;
  }

  if (
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    node.callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    const object =
      node.callee.object.type === AST_NODE_TYPES.Identifier
        ? node.callee.object.name
        : null;
    if (!object) {
      return node.callee.property.name;
    }
    return `${object}.${node.callee.property.name}`;
  }

  return null;
}

function matchesExpensiveCalleePattern(
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
  expensiveMatchers: RegExp[],
): boolean {
  const returnedExpression = getReturnedExpression(callback);
  if (
    !returnedExpression ||
    returnedExpression.type !== AST_NODE_TYPES.CallExpression
  ) {
    return false;
  }

  const calleeName = getCalleeName(returnedExpression);
  if (!calleeName) {
    return false;
  }

  return expensiveMatchers.some((matcher) => matcher.test(calleeName));
}

function isImportedIdentifier(
  identifier: TSESTree.Identifier,
  resolveVariable: (id: TSESTree.Identifier) => TSESLint.Scope.Variable | null,
): boolean {
  // Treat identifiers as React bindings only when they resolve to an import.
  // This avoids unsafe auto-fixes when names like "React" or "useMemo" are shadowed
  // by parameters/locals or represent non-React values.
  const variable = resolveVariable(identifier);
  return variable?.defs.some((def) => def.type === 'ImportBinding') ?? false;
}

function isUseMemoCall(
  node: TSESTree.CallExpression,
  imports: UseMemoImports,
  resolveVariable: (id: TSESTree.Identifier) => TSESLint.Scope.Variable | null,
): boolean {
  if (
    node.callee.type === AST_NODE_TYPES.Identifier &&
    imports.useMemoNames.has(node.callee.name)
  ) {
    return isImportedIdentifier(node.callee, resolveVariable);
  }

  if (
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    node.callee.property.type === AST_NODE_TYPES.Identifier &&
    node.callee.property.name === 'useMemo' &&
    node.callee.object.type === AST_NODE_TYPES.Identifier &&
    imports.reactNamespaceNames.has(node.callee.object.name) &&
    isImportedIdentifier(node.callee.object, resolveVariable)
  ) {
    return true;
  }

  return false;
}

function getReplacementText(
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
  sourceCode: Readonly<TSESLint.SourceCode>,
): string | null {
  const returnedExpression = getReturnedExpression(callback);
  if (!returnedExpression) {
    return null;
  }

  if (
    callback.body.type === AST_NODE_TYPES.BlockStatement &&
    callback.body.body.length !== 1
  ) {
    return null;
  }

  return sourceCode.getText(returnedExpression);
}

/**
 * Comments inside the `useMemo(...)` span but outside the returned expression.
 *
 * The fix replaces the whole call with the text of the returned expression, so
 * the callback wrapper, the `return` keyword, the dependency array and every
 * piece of trivia between them disappear. A comment sitting in any of those
 * places has no surviving anchor in the replacement, so the fixer carries it
 * into the replacement instead (#1877). A comment inside the returned
 * expression needs no carrying: its text is copied verbatim with the
 * expression.
 */
function strandedCommentsOf(
  node: TSESTree.CallExpression,
  returnedExpression: TSESTree.Expression,
  sourceCode: Readonly<TSESLint.SourceCode>,
): TSESTree.Comment[] {
  return sourceCode
    .getCommentsInside(node)
    .filter(
      (comment) =>
        comment.range[0] < returnedExpression.range[0] ||
        comment.range[1] > returnedExpression.range[1],
    );
}

function isSafeAtomicExpression(expression: TSESTree.Expression): boolean {
  switch (expression.type) {
    case AST_NODE_TYPES.Identifier:
    case AST_NODE_TYPES.Literal:
    case AST_NODE_TYPES.TemplateLiteral:
    case AST_NODE_TYPES.ThisExpression:
    case AST_NODE_TYPES.Super:
    case AST_NODE_TYPES.MemberExpression:
    case AST_NODE_TYPES.CallExpression:
    case AST_NODE_TYPES.NewExpression:
    case AST_NODE_TYPES.ArrayExpression:
    case AST_NODE_TYPES.ObjectExpression:
    case AST_NODE_TYPES.ArrowFunctionExpression:
    case AST_NODE_TYPES.FunctionExpression:
    case AST_NODE_TYPES.ClassExpression:
    case AST_NODE_TYPES.TaggedTemplateExpression:
    case AST_NODE_TYPES.UnaryExpression:
    case AST_NODE_TYPES.UpdateExpression:
    case AST_NODE_TYPES.AwaitExpression:
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
    case AST_NODE_TYPES.TSNonNullExpression:
      return true;
    default:
      return false;
  }
}

function shouldParenthesizeReplacement(
  node: TSESTree.CallExpression,
  replacementExpression: TSESTree.Expression,
  sourceCode: Readonly<TSESLint.SourceCode>,
): boolean {
  const alreadyParenthesized = ASTUtils.isParenthesized(
    replacementExpression,
    sourceCode,
  );
  const parent = node.parent;
  if (!parent) {
    return false;
  }

  if (
    (replacementExpression as TSESTree.SequenceExpression).type ===
    AST_NODE_TYPES.SequenceExpression
  ) {
    return true;
  }

  switch (parent.type) {
    case AST_NODE_TYPES.LogicalExpression:
    case AST_NODE_TYPES.BinaryExpression:
      return (
        alreadyParenthesized || !isSafeAtomicExpression(replacementExpression)
      );
    case AST_NODE_TYPES.UnaryExpression:
    case AST_NODE_TYPES.AwaitExpression:
    case AST_NODE_TYPES.MemberExpression:
    case AST_NODE_TYPES.TaggedTemplateExpression:
    case AST_NODE_TYPES.TSNonNullExpression:
    case AST_NODE_TYPES.ChainExpression:
      return true;
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
    case AST_NODE_TYPES.TSSatisfiesExpression:
      return (
        alreadyParenthesized || !isSafeAtomicExpression(replacementExpression)
      );
    case AST_NODE_TYPES.CallExpression:
    case AST_NODE_TYPES.NewExpression:
      return (
        alreadyParenthesized ||
        parent.callee === node ||
        replacementExpression.type === AST_NODE_TYPES.SequenceExpression
      );
    case AST_NODE_TYPES.ConditionalExpression:
      if (parent.test !== node) {
        return false;
      }
      return (
        alreadyParenthesized || !isSafeAtomicExpression(replacementExpression)
      );
    case AST_NODE_TYPES.AssignmentExpression:
      return false;
    default:
      return false;
  }
}

export const noUsememoForPassByValue = createRule<Options, MessageIds>({
  name: 'no-usememo-for-pass-by-value',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow returning useMemo results from custom hooks when the memoized value is pass-by-value: primitives with value equality (string, number, boolean, null, undefined, bigint) or arrays/tuples composed exclusively of these primitives. Requires type information.',
      recommended: 'error',
      requiresTypeChecking: true,
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          allowExpensiveCalleePatterns: {
            type: 'array',
            items: { type: 'string' },
            default: DEFAULT_EXPENSIVE_PATTERNS,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      primitiveMemo:
        'What’s wrong: custom hook "{{hookName}}" returns useMemo wrapping a pass-by-value value ({{valueType}}) → Why it matters: memoizing pass-by-value results cannot change identity and implies stability that is not real, which misleads callers and adds noise → How to fix: inline the returned expression and remove the useMemo import if it becomes unused.',
      invalidRegex:
        'What’s wrong: invalid regex pattern "{{pattern}}" in allowExpensiveCalleePatterns → Why it matters: invalid patterns prevent the rule from correctly identifying expensive computations, potentially causing false positives → How to fix: correct the regex pattern in your ESLint configuration.',
    },
  },
  defaultOptions: [{}],
  create(context) {
    const sourceCode = context.getSourceCode();
    const parserServices = sourceCode.parserServices ?? context.parserServices;
    if (!parserServices?.program || !parserServices.esTreeNodeToTSNodeMap) {
      return {};
    }

    const { program, esTreeNodeToTSNodeMap } = parserServices;
    const checker = program.getTypeChecker();
    const imports = collectUseMemoImports(sourceCode.ast);
    const expensiveMatchers: RegExp[] = [];
    const invalidPatterns: string[] = [];

    (
      context.options[0]?.allowExpensiveCalleePatterns ??
      DEFAULT_EXPENSIVE_PATTERNS
    ).forEach((pattern) => {
      try {
        expensiveMatchers.push(new RegExp(pattern));
      } catch {
        invalidPatterns.push(pattern);
      }
    });

    const functionStack: FunctionContext[] = [];
    const reported = new WeakSet<TSESTree.CallExpression>();
    const resolveVariable = (identifier: TSESTree.Identifier) =>
      ASTUtils.findVariable(context.getScope(), identifier) ?? null;

    /**
     * Every `useMemo` call the rule reports, in traversal order.
     *
     * Reporting is deferred to `Program:exit` because the binding the call
     * reads — the `useMemo` specifier, or the `React` default import behind
     * `React.useMemo` — is unbound only once no surviving call references it.
     * Judged one call at a time, a file with two of them never sees either as
     * the binding's last use, and the pass that unwraps both resolves every
     * report — so nothing ever revisits the stranded import.
     */
    const violations: Violation[] = [];

    /**
     * A suppressed report is dropped together with its fix, so its rewrite
     * never happens: counting it toward the batch would unbind an import the
     * surviving text still calls.
     */
    const isReportSuppressed = createSuppressionChecker(context);

    function visitPatternNode(
      pattern: TSESTree.Node,
      visitIdentifier: (identifier: TSESTree.Identifier) => void,
    ): void {
      if (pattern.type === AST_NODE_TYPES.Identifier) {
        visitIdentifier(pattern);
        return;
      }

      if (pattern.type === AST_NODE_TYPES.ArrayPattern) {
        for (const element of pattern.elements) {
          if (!element) {
            continue;
          }
          visitPatternNode(
            element.type === AST_NODE_TYPES.RestElement
              ? element.argument
              : element,
            visitIdentifier,
          );
        }
        return;
      }

      if (pattern.type === AST_NODE_TYPES.ObjectPattern) {
        for (const property of pattern.properties) {
          if (property.type === AST_NODE_TYPES.Property) {
            visitPatternNode(property.value, visitIdentifier);
            continue;
          }
          if (property.type === AST_NODE_TYPES.RestElement) {
            visitPatternNode(property.argument, visitIdentifier);
          }
        }
        return;
      }

      if (pattern.type === AST_NODE_TYPES.AssignmentPattern) {
        visitPatternNode(pattern.left, visitIdentifier);
      }
    }

    function traversePattern(
      pattern: TSESTree.Node,
      resolveVariable: (
        id: TSESTree.Identifier,
      ) => TSESLint.Scope.Variable | null,
      visitVariable: (variable: TSESLint.Scope.Variable) => void,
    ) {
      visitPatternNode(pattern, (identifier) => {
        const variable = resolveVariable(identifier);
        if (variable) {
          visitVariable(variable);
        }
      });
    }

    function trackPatternVariables(
      pattern: TSESTree.Node,
      memoCall: TSESTree.CallExpression,
      currentContext: FunctionContext,
      resolveVariable: (
        id: TSESTree.Identifier,
      ) => TSESLint.Scope.Variable | null,
    ) {
      traversePattern(pattern, resolveVariable, (variable) => {
        currentContext.memoVariables.set(variable, memoCall);
      });
    }

    function untrackPatternVariables(
      pattern: TSESTree.Node,
      currentContext: FunctionContext,
      resolveVariable: (
        id: TSESTree.Identifier,
      ) => TSESLint.Scope.Variable | null,
    ) {
      traversePattern(pattern, resolveVariable, (variable) => {
        currentContext.memoVariables.delete(variable);
      });
    }

    function validateUseMemoArgument(node: TSESTree.CallExpression): {
      callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;
      returnedExpression: TSESTree.Expression;
    } | null {
      const callback = node.arguments[0];
      if (
        !callback ||
        (callback.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
          callback.type !== AST_NODE_TYPES.FunctionExpression)
      ) {
        return null;
      }
      const returnedExpression = getReturnedExpression(callback);
      if (!returnedExpression) {
        return null;
      }
      return { callback, returnedExpression };
    }

    function classifyUseMemoReturnType(
      node: TSESTree.CallExpression,
      returnedExpression: TSESTree.Expression,
    ): {
      passByValue: boolean;
      indeterminate: boolean;
      description: string;
    } | null {
      const tsNode = esTreeNodeToTSNodeMap.get(node);
      if (!tsNode) {
        return null;
      }

      const type = checker.getTypeAtLocation(tsNode);
      let classification = isPassByValueType(type, checker);
      if (classification.indeterminate) {
        // When useMemo's type is indeterminate (any/unknown), the callback can still return a
        // concrete pass-by-value type. Inspect the returned expression to reduce false negatives.
        const returnedTsNode = esTreeNodeToTSNodeMap.get(returnedExpression);
        if (returnedTsNode) {
          const returnedType = checker.getTypeAtLocation(returnedTsNode);
          const fallbackClassification = isPassByValueType(
            returnedType,
            checker,
          );
          if (!fallbackClassification.indeterminate) {
            classification = fallbackClassification;
          }
        }
      }

      return classification;
    }

    /**
     * A retirement range shortened so it stops before any comment it would
     * otherwise take with it, or `null` when no shortening can spare one.
     *
     * Retiring a declaration claims the whole line it owns, trailing same-line
     * comments included. Such a comment sits AFTER the terminating token, so it
     * is outside the declaration and belongs to nobody the fix is entitled to
     * rewrite — deleting it silently is the same fidelity bug the unwrap avoids
     * by carrying comments (#1877). Stopping short leaves the comment exactly
     * where it was written, which cannot reorder or duplicate anything.
     *
     * A comment the range cannot be shortened past aborts the whole fix rather
     * than yielding a removal that swallows it.
     */
    function sparingTrailingComments(range: TextRange): TextRange | null {
      const starts = sourceCode
        .getAllComments()
        .filter(
          (comment) =>
            comment.range[0] >= range[0] && comment.range[1] <= range[1],
        )
        .map((comment) => comment.range[0]);
      if (starts.length === 0) {
        return range;
      }
      const first = Math.min(...starts);
      return first > range[0] ? [range[0], first] : null;
    }

    /**
     * The edits one violation contributes, together with the positions they
     * genuinely erase.
     *
     * Only deleted text may be listed as removed, and the returned expression is
     * never deleted: it is re-emitted verbatim at the call's position. Handing
     * over the whole call span instead would read every binding the expression
     * mentions as unreferenced and delete its import — an over-removal strictly
     * worse than the stranded import this exists to prevent. What does vanish is
     * the wrapper around it: the callee (`useMemo` or `React.useMemo`), the
     * callback's syntax, and the dependency array.
     */
    function planViolation(violation: Violation): PlannedViolation | null {
      const { node, callback, returnedExpression } = violation;
      const replacementText = getReplacementText(callback, sourceCode);
      if (!replacementText) {
        return null;
      }

      const needsParentheses = shouldParenthesizeReplacement(
        node,
        returnedExpression,
        sourceCode,
      );
      const strandedComments = strandedCommentsOf(
        node,
        returnedExpression,
        sourceCode,
      );

      const edits: Edit[] = [];

      if (strandedComments.length === 0) {
        edits.push({
          range: node.range,
          text: needsParentheses ? `(${replacementText})` : replacementText,
        });
      } else {
        // Carrying must not change the non-comment token stream: whether the
        // replacement is parenthesized is decided by the expression's context
        // exactly as in the comment-free fix, never by the comments themselves.
        // The call can start mid-line, so the indentation of the line it opens
        // on is the only anchor the carried comments have.
        const startLine = sourceCode.lines[node.loc.start.line - 1] ?? '';
        const indent = /^[\t ]*/.exec(startLine)?.[0] ?? '';
        const text = sourceCode.getText();
        const toSegment = (comment: TSESTree.Comment): ReplacementSegment => ({
          text: text.slice(comment.range[0], comment.range[1]),
          breakAfter: requiresLineBreakAfter(comment),
        });
        // A stranded comment lies wholly on one side of the expression, since
        // a comment is a token and cannot straddle a node; keeping each on its
        // own side preserves what it annotates.
        const isBefore = (comment: TSESTree.Comment) =>
          comment.range[0] < returnedExpression.range[0];
        const leadingComments = strandedComments.filter(isBefore);
        const trailingComments = strandedComments.filter(
          (comment) => !isBefore(comment),
        );

        if (needsParentheses) {
          // Inside parentheses a newline can never trigger ASI, so every
          // comment — line comments and -next-line directives included — can
          // ride within the replacement on a line of its own.
          const segments: ReplacementSegment[] = [
            ...leadingComments.map(toSegment),
            { text: replacementText, breakAfter: false },
            ...trailingComments.map(toSegment),
          ];
          edits.push({
            range: node.range,
            text: joinSegments(segments, indent),
          });
        } else {
          // Without parentheses a line break between a restricted keyword
          // (`return`, `throw`, `yield`) and the expression would change the
          // program through ASI, so a leading comment that demands its own
          // line is hoisted onto a full line of its own ABOVE the line the
          // call starts on. That insertion can never split a token pair, and
          // it lands a `-next-line` directive exactly one line above the
          // statement that now hosts its subject. Everything else stays
          // inline: a block comment beside the expression, and a trailing
          // line-bound comment followed by a line break, which is safe after
          // the expression has begun.
          const hoistedComments = leadingComments.filter(
            requiresLineBreakAfter,
          );
          if (hoistedComments.length > 0) {
            const lineStartIndex = sourceCode.getIndexFromLoc({
              line: node.loc.start.line,
              column: 0,
            });
            const hoisted = hoistedComments
              .map(
                (comment) =>
                  `${indent}${text.slice(
                    comment.range[0],
                    comment.range[1],
                  )}\n`,
              )
              .join('');
            edits.push({
              range: [lineStartIndex, lineStartIndex],
              text: hoisted,
            });
          }

          const segments: ReplacementSegment[] = [
            ...leadingComments
              .filter((comment) => !requiresLineBreakAfter(comment))
              .map(toSegment),
            { text: replacementText, breakAfter: false },
            ...trailingComments.map(toSegment),
          ];
          const body = joinSegmentBody(segments, indent);
          const trailing = segments[segments.length - 1].breakAfter
            ? `\n${indent}`
            : '';
          edits.push({ range: node.range, text: `${body}${trailing}` });
        }
      }

      return {
        violation,
        edits,
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
        if (!candidate) continue;
        if (planOrphanedImportRemoval(sourceCode, candidate.removed) === null) {
          continue;
        }
        if (
          claimed.some((taken) =>
            candidate.edits.some((edit) => rangesOverlap(edit.range, taken)),
          )
        ) {
          continue;
        }
        claimed.push(violation.node.range);
        planned.push(candidate);
      }

      return planned;
    }

    function checkUseMemoForPassByValue(
      node: TSESTree.CallExpression,
      currentContext: FunctionContext | undefined,
    ) {
      if (!currentContext?.isHook || reported.has(node)) {
        return;
      }

      const validated = validateUseMemoArgument(node);
      if (!validated) {
        return;
      }

      const { callback, returnedExpression } = validated;
      if (matchesExpensiveCalleePattern(callback, expensiveMatchers)) {
        return;
      }

      const classification = classifyUseMemoReturnType(
        node,
        returnedExpression,
      );
      if (
        !classification ||
        classification.indeterminate ||
        !classification.passByValue
      ) {
        return;
      }

      reported.add(node);

      violations.push({
        node,
        callback,
        returnedExpression,
        hookName: currentContext.hookName ?? 'this hook',
        valueType: classification.description,
      });
    }

    function analyzeExpressionList(
      expressions: (
        | TSESTree.Expression
        | TSESTree.SpreadElement
        | null
        | undefined
      )[],
      currentContext: FunctionContext | undefined,
    ) {
      for (const expr of expressions) {
        if (!expr) {
          continue;
        }
        if (expr.type === AST_NODE_TYPES.SpreadElement) {
          analyzeReturnedValue(expr.argument, currentContext);
          continue;
        }
        analyzeReturnedValue(expr, currentContext);
      }
    }

    function analyzeReturnedValue(
      expression: TSESTree.Expression | null | undefined,
      currentContext: FunctionContext | undefined,
    ) {
      if (!expression || !currentContext?.isHook) {
        return;
      }

      switch (expression.type) {
        case AST_NODE_TYPES.CallExpression:
          if (isUseMemoCall(expression, imports, resolveVariable)) {
            checkUseMemoForPassByValue(expression, currentContext);
            return;
          }
          analyzeExpressionList(expression.arguments, currentContext);
          return;
        case AST_NODE_TYPES.NewExpression:
          analyzeExpressionList(expression.arguments ?? [], currentContext);
          return;
        case AST_NODE_TYPES.Identifier: {
          const variable = resolveVariable(expression);
          const memoCall = variable
            ? currentContext.memoVariables.get(variable)
            : undefined;
          if (memoCall) {
            checkUseMemoForPassByValue(memoCall, currentContext);
          }
          return;
        }
        case AST_NODE_TYPES.ConditionalExpression:
          analyzeReturnedValue(expression.test, currentContext);
          analyzeReturnedValue(expression.consequent, currentContext);
          analyzeReturnedValue(expression.alternate, currentContext);
          return;
        case AST_NODE_TYPES.LogicalExpression:
          analyzeReturnedValue(expression.left, currentContext);
          analyzeReturnedValue(expression.right, currentContext);
          return;
        case AST_NODE_TYPES.BinaryExpression:
          if (expression.left.type !== AST_NODE_TYPES.PrivateIdentifier) {
            analyzeReturnedValue(expression.left, currentContext);
          }
          analyzeReturnedValue(expression.right, currentContext);
          return;
        case AST_NODE_TYPES.UnaryExpression:
          analyzeReturnedValue(expression.argument, currentContext);
          return;
        case AST_NODE_TYPES.SequenceExpression: {
          const lastExpression =
            expression.expressions[expression.expressions.length - 1];
          analyzeReturnedValue(lastExpression, currentContext);
          return;
        }
        case AST_NODE_TYPES.ArrayExpression:
          analyzeExpressionList(expression.elements, currentContext);
          return;
        case AST_NODE_TYPES.ObjectExpression: {
          const propertyExpressions = expression.properties.map((property) => {
            if (property.type === AST_NODE_TYPES.SpreadElement) {
              return property.argument;
            }
            if (property.type === AST_NODE_TYPES.Property && property.value) {
              return property.value as TSESTree.Expression;
            }
            return null;
          });
          analyzeExpressionList(propertyExpressions, currentContext);
          return;
        }
        case AST_NODE_TYPES.TSAsExpression:
        case AST_NODE_TYPES.TSTypeAssertion:
        case AST_NODE_TYPES.TSNonNullExpression:
        case AST_NODE_TYPES.TSSatisfiesExpression:
        case AST_NODE_TYPES.ChainExpression:
          analyzeReturnedValue(expression.expression, currentContext);
          return;
        case AST_NODE_TYPES.AwaitExpression:
          analyzeReturnedValue(expression.argument, currentContext);
          return;
      }
    }

    return {
      Program() {
        invalidPatterns.forEach((pattern) => {
          context.report({
            node: sourceCode.ast,
            messageId: 'invalidRegex',
            data: { pattern },
          });
        });
      },
      FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
        const name = getFunctionName(node);
        functionStack.push({
          isHook: isCustomHookName(name),
          hookName: name,
          memoVariables: new WeakMap(),
        });
      },
      'FunctionDeclaration:exit'() {
        functionStack.pop();
      },
      FunctionExpression(node: TSESTree.FunctionExpression) {
        const name = getFunctionName(node);
        functionStack.push({
          isHook: isCustomHookName(name),
          hookName: name,
          memoVariables: new WeakMap(),
        });
      },
      'FunctionExpression:exit'() {
        functionStack.pop();
      },
      ArrowFunctionExpression(node: TSESTree.ArrowFunctionExpression) {
        const name = getFunctionName(node);
        functionStack.push({
          isHook: isCustomHookName(name),
          hookName: name,
          memoVariables: new WeakMap(),
        });
      },
      'ArrowFunctionExpression:exit'(node: TSESTree.ArrowFunctionExpression) {
        const currentContext = functionStack[functionStack.length - 1];
        if (currentContext?.isHook && node.expression) {
          analyzeReturnedValue(
            node.body as TSESTree.Expression,
            currentContext,
          );
        }
        functionStack.pop();
      },
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        const currentContext = functionStack[functionStack.length - 1];
        if (
          !currentContext?.isHook ||
          !node.init ||
          node.init.type !== AST_NODE_TYPES.CallExpression ||
          !isUseMemoCall(node.init, imports, resolveVariable)
        ) {
          return;
        }

        trackPatternVariables(
          node.id,
          node.init,
          currentContext,
          resolveVariable,
        );
      },
      AssignmentExpression(node: TSESTree.AssignmentExpression) {
        const currentContext = functionStack[functionStack.length - 1];
        if (!currentContext?.isHook) {
          return;
        }

        if (
          node.right.type === AST_NODE_TYPES.CallExpression &&
          isUseMemoCall(node.right, imports, resolveVariable)
        ) {
          trackPatternVariables(
            node.left,
            node.right,
            currentContext,
            resolveVariable,
          );
          return;
        }

        if (node.operator === '=') {
          untrackPatternVariables(node.left, currentContext, resolveVariable);
        }
      },
      ReturnStatement(node: TSESTree.ReturnStatement) {
        const currentContext = functionStack[functionStack.length - 1];
        if (!currentContext?.isHook) {
          return;
        }

        analyzeReturnedValue(node.argument, currentContext);
      },
      'Program:exit'() {
        if (violations.length === 0) {
          return;
        }

        const planned = planViolations();
        // One plan over every surviving rewrite: the binding behind the callee
        // is left unreferenced by their union even when no single unwrap strips
        // its last use, and the pass that applies them all resolves every
        // report — so this is the only moment the stranded import is visible.
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
        const removalRanges = importRemoval
          ? importRemoval.map(sparingTrailingComments)
          : [];
        const carrier =
          importRemoval && removalRanges.every((range) => range !== null)
            ? planned[0]
            : undefined;

        for (const violation of violations) {
          context.report({
            node: violation.node,
            messageId: 'primitiveMemo',
            data: {
              hookName: violation.hookName,
              valueType: violation.valueType,
            },
            fix:
              violation === carrier?.violation
                ? (fixer: TSESLint.RuleFixer) => [
                    ...removalRanges
                      .filter((range): range is TextRange => range !== null)
                      .map((range) => fixer.removeRange([range[0], range[1]])),
                    ...planned.flatMap((entry) =>
                      entry.edits.map((edit) =>
                        fixer.replaceTextRange(edit.range, edit.text),
                      ),
                    ),
                  ]
                : undefined,
          });
        }
      },
    };
  },
});

export default noUsememoForPassByValue;

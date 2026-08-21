import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import * as ts from 'typescript';
import { createRule } from '../utils/createRule';

type Options = [
  {
    objectNamePattern?: string[];
    ignoreInLoops?: boolean;
    emptyCheckFunctions?: string[];
  },
];

type MessageIds = 'missingEmptyObjectCheck';

const DEFAULT_OBJECT_SUFFIXES = [
  'Config',
  'Configs',
  'Data',
  'Info',
  'Settings',
  'Options',
  'Props',
  'State',
  'Response',
  'Result',
  'Payload',
  'Map',
  'Record',
  'Object',
  'Obj',
  'Details',
  'Meta',
  'Profile',
  'Request',
  'Params',
  'Context',
];

const DEFAULT_EMPTY_CHECK_FUNCTIONS = ['isEmpty'];

const BOOLEAN_PREFIXES = [
  'is',
  'has',
  'can',
  'should',
  'was',
  'were',
  'will',
  'did',
];

const NON_OBJECT_LIKE_NAMES = [
  'count',
  'index',
  'idx',
  'length',
  'size',
  'total',
  'flag',
  'enabled',
  'ready',
  'items',
  'item',
  'list',
  'lists',
  'array',
  'arr',
];

function hasBooleanPrefixBoundary(name: string): boolean {
  const lower = name.toLowerCase();

  return BOOLEAN_PREFIXES.some((prefix) => {
    if (!lower.startsWith(prefix)) {
      return false;
    }

    const boundary = name.charAt(prefix.length);
    return boundary !== '' && boundary >= 'A' && boundary <= 'Z';
  });
}

function isLoopLike(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.ForStatement ||
    node.type === AST_NODE_TYPES.ForInStatement ||
    node.type === AST_NODE_TYPES.ForOfStatement ||
    node.type === AST_NODE_TYPES.WhileStatement ||
    node.type === AST_NODE_TYPES.DoWhileStatement
  );
}

function isInsideLoop(node: TSESTree.Node | undefined): boolean {
  let current: TSESTree.Node | undefined = node;
  while (current && current.parent) {
    if (isLoopLike(current.parent)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isObjectLikeName(name: string, patterns: Set<string>): boolean {
  const lower = name.toLowerCase();

  if (hasBooleanPrefixBoundary(name)) {
    return false;
  }

  if (NON_OBJECT_LIKE_NAMES.includes(lower)) {
    return false;
  }

  for (const pattern of patterns) {
    if (name.endsWith(pattern) || lower.endsWith(pattern.toLowerCase())) {
      return true;
    }
  }

  return false;
}

function isNullableType(type: ts.Type): boolean {
  return (
    (type.flags & ts.TypeFlags.Null) !== 0 ||
    (type.flags & ts.TypeFlags.Undefined) !== 0 ||
    (type.flags & ts.TypeFlags.Void) !== 0
  );
}

function isNonObjectPrimitive(type: ts.Type): boolean {
  const flag = type.flags;
  return (
    (flag & ts.TypeFlags.StringLike) !== 0 ||
    (flag & ts.TypeFlags.NumberLike) !== 0 ||
    (flag & ts.TypeFlags.BooleanLike) !== 0 ||
    (flag & ts.TypeFlags.BigIntLike) !== 0 ||
    (flag & ts.TypeFlags.ESSymbolLike) !== 0 ||
    (flag & ts.TypeFlags.EnumLike) !== 0
  );
}

function isAnyOrUnknown(type: ts.Type): boolean {
  return (
    (type.flags & ts.TypeFlags.Any) !== 0 ||
    (type.flags & ts.TypeFlags.Unknown) !== 0
  );
}

function hasRequiredProperties(
  type: ts.Type,
  checker: ts.TypeChecker,
): boolean {
  const properties = checker.getPropertiesOfType(type);
  return properties.some(
    (property) => (property.getFlags() & ts.SymbolFlags.Optional) === 0,
  );
}

function isObjectLikeType(
  type: ts.Type,
  checker: ts.TypeChecker,
): 'object' | 'non-object' | 'unknown' {
  if (type.isUnion()) {
    let hasObject = false;
    let hasUnknown = false;
    let hasNonObject = false;
    let hasNonNullable = false;
    for (const part of type.types) {
      if (isNullableType(part)) {
        continue;
      }

      hasNonNullable = true;

      if (isNonObjectPrimitive(part)) {
        hasNonObject = true;
        continue;
      }

      const analysis = isObjectLikeType(part, checker);
      if (analysis === 'object') {
        hasObject = true;
      } else if (analysis === 'unknown') {
        hasUnknown = true;
      } else {
        hasNonObject = true;
      }
    }

    if (hasObject) {
      return 'object';
    }
    if (!hasNonNullable) {
      return 'non-object';
    }
    if (hasUnknown) {
      return 'unknown';
    }
    return hasNonObject ? 'non-object' : 'unknown';
  }

  if ((type.flags & ts.TypeFlags.Intersection) !== 0) {
    const intersectionType = type as ts.IntersectionType;
    let hasObject = false;
    let hasUnknown = false;

    for (const part of intersectionType.types) {
      const analysis = isObjectLikeType(part, checker);
      if (analysis === 'non-object') {
        return 'non-object';
      }
      if (analysis === 'object') {
        hasObject = true;
      } else {
        hasUnknown = true;
      }
    }

    if (hasObject) {
      return 'object';
    }
    return hasUnknown ? 'unknown' : 'non-object';
  }

  if (isAnyOrUnknown(type)) {
    return 'unknown';
  }

  if (isNonObjectPrimitive(type) || isNullableType(type)) {
    return 'non-object';
  }

  if ((type.flags & ts.TypeFlags.Object) === 0) {
    return 'non-object';
  }

  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    return 'non-object';
  }

  if (type.getCallSignatures().length > 0) {
    return 'non-object';
  }

  /**
   * A construct-signature-only type — a class reference, a `…Constructor<P>`
   * interface, the `ComponentClass` half of `ComponentType` — carries behaviour,
   * not data. Its own properties are statics, so `Object.keys()` is `[]` for a
   * plain class or component even when a valid value was supplied, and the
   * emptiness check this rule prescribes would invert the guard rather than
   * harden it. Unions reach this branch through the recursive call above, which
   * matters because a union counts as an object when ANY member does: without
   * this, the constructor half alone classified a whole `ComponentType` union as
   * a data object.
   */
  if (type.getConstructSignatures().length > 0) {
    return 'non-object';
  }

  if (hasRequiredProperties(type, checker)) {
    return 'non-object';
  }

  return 'object';
}

/**
 * Reads through an optional chain to the member access or call it holds.
 * `Object?.keys?.(payload)?.length` parses as a single `ChainExpression`
 * wrapping the whole chain, so a matcher written against a bare
 * `MemberExpression` sees the wrapper and recognizes nothing.
 *
 * Reading through it is sound for the only question asked of it — "is an
 * emptiness check already written here?" — because every optional link guards a
 * nullish RECEIVER, and neither the `Object` global nor the array `Object.keys`
 * hands back is ever nullish. The chained spelling therefore evaluates to
 * exactly what the plain one does, making the two the same guard.
 */
function unwrapOptionalChain(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  while (current.type === AST_NODE_TYPES.ChainExpression) {
    current = current.expression;
  }
  return current;
}

function isObjectKeysLengthExpression(
  node: TSESTree.Node,
  name: string,
): boolean {
  const lengthRead = unwrapOptionalChain(node);
  if (
    lengthRead.type !== AST_NODE_TYPES.MemberExpression ||
    lengthRead.computed ||
    lengthRead.property.type !== AST_NODE_TYPES.Identifier ||
    lengthRead.property.name !== 'length'
  ) {
    return false;
  }

  const keysCall = unwrapOptionalChain(lengthRead.object);
  if (
    keysCall.type !== AST_NODE_TYPES.CallExpression ||
    keysCall.arguments.length !== 1
  ) {
    return false;
  }

  const callee = unwrapOptionalChain(keysCall.callee);
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    callee.object.type !== AST_NODE_TYPES.Identifier ||
    callee.object.name !== 'Object' ||
    callee.property.type !== AST_NODE_TYPES.Identifier ||
    callee.property.name !== 'keys'
  ) {
    return false;
  }

  const argument = keysCall.arguments[0];
  return argument.type === AST_NODE_TYPES.Identifier && argument.name === name;
}

function isZeroLiteral(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Literal && node.value === 0;
}

function isLengthZeroComparison(
  node: TSESTree.BinaryExpression,
  name: string,
): boolean {
  const { operator, left, right } = node;
  const leftIsLength = isObjectKeysLengthExpression(left, name);
  const rightIsLength = isObjectKeysLengthExpression(right, name);
  const leftIsZero = isZeroLiteral(left);
  const rightIsZero = isZeroLiteral(right);

  /**
   * Only zero-length checks signal emptiness: length never drops below zero, and
   * `> 0` means data is present. Restrict operators to equality and zero-bound
   * comparisons to avoid mistaking impossible `length < 0` or presence checks for
   * valid emptiness guards.
   */
  if (operator === '===' || operator === '==') {
    return (leftIsLength && rightIsZero) || (rightIsLength && leftIsZero);
  }

  if (operator === '<=') {
    return leftIsLength && rightIsZero;
  }

  if (operator === '>=') {
    return leftIsZero && rightIsLength;
  }

  return false;
}

function conditionHasEmptyCheck(
  node: TSESTree.Node | undefined,
  name: string,
  emptyCheckFunctions: Set<string>,
  negationDepth = 0,
): boolean {
  if (!node) return false;

  switch (node.type) {
    case AST_NODE_TYPES.LogicalExpression:
      return (
        conditionHasEmptyCheck(
          node.left,
          name,
          emptyCheckFunctions,
          negationDepth,
        ) ||
        conditionHasEmptyCheck(
          node.right,
          name,
          emptyCheckFunctions,
          negationDepth,
        )
      );
    case AST_NODE_TYPES.BinaryExpression:
      if (isLengthZeroComparison(node, name)) {
        return negationDepth % 2 === 0;
      }
      return (
        conditionHasEmptyCheck(
          node.left,
          name,
          emptyCheckFunctions,
          negationDepth,
        ) ||
        conditionHasEmptyCheck(
          node.right,
          name,
          emptyCheckFunctions,
          negationDepth,
        )
      );
    case AST_NODE_TYPES.UnaryExpression:
      if (node.operator === '!') {
        return conditionHasEmptyCheck(
          node.argument,
          name,
          emptyCheckFunctions,
          negationDepth + 1,
        );
      }
      return conditionHasEmptyCheck(
        node.argument,
        name,
        emptyCheckFunctions,
        negationDepth,
      );
    /**
     * A whole optional chain arrives wrapped, so every arm below — each written
     * against a bare member access or call — is handed a node type it does not
     * match. Delegating to the wrapped expression at the SAME negation depth
     * keeps the wrapper invisible, which is what lets
     * `!Object.keys(data)?.length` and `isEmpty?.(data)` count as the emptiness
     * checks they already are instead of being reported as missing ones.
     */
    case AST_NODE_TYPES.ChainExpression:
      return conditionHasEmptyCheck(
        node.expression,
        name,
        emptyCheckFunctions,
        negationDepth,
      );
    case AST_NODE_TYPES.CallExpression: {
      const callee = unwrapOptionalChain(node.callee);
      const firstArgIsTarget =
        node.arguments[0] &&
        node.arguments[0].type === AST_NODE_TYPES.Identifier &&
        node.arguments[0].name === name;
      if (
        callee.type === AST_NODE_TYPES.Identifier &&
        emptyCheckFunctions.has(callee.name) &&
        firstArgIsTarget
      ) {
        return negationDepth % 2 === 0;
      }
      if (
        callee.type === AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.property.type === AST_NODE_TYPES.Identifier &&
        emptyCheckFunctions.has(callee.property.name) &&
        firstArgIsTarget
      ) {
        return negationDepth % 2 === 0;
      }

      return (
        conditionHasEmptyCheck(
          callee,
          name,
          emptyCheckFunctions,
          negationDepth,
        ) ||
        node.arguments.some((argument) =>
          conditionHasEmptyCheck(
            argument,
            name,
            emptyCheckFunctions,
            negationDepth,
          ),
        )
      );
    }
    case AST_NODE_TYPES.MemberExpression:
      /**
       * `!Object.keys(name).length` counts as an emptiness check through negation
       * depth; comparisons like `length < 0` or `length > 0` remain excluded because
       * length is never negative and `> 0` signals presence rather than emptiness.
       */
      if (isObjectKeysLengthExpression(node, name)) {
        return negationDepth % 2 === 1;
      }
      return conditionHasEmptyCheck(
        node.object,
        name,
        emptyCheckFunctions,
        negationDepth,
      );
    case AST_NODE_TYPES.ConditionalExpression:
      return (
        conditionHasEmptyCheck(
          node.test,
          name,
          emptyCheckFunctions,
          negationDepth,
        ) ||
        conditionHasEmptyCheck(
          node.consequent,
          name,
          emptyCheckFunctions,
          negationDepth,
        ) ||
        conditionHasEmptyCheck(
          node.alternate,
          name,
          emptyCheckFunctions,
          negationDepth,
        )
      );
    default:
      return false;
  }
}

function collectNegations(
  node: TSESTree.Expression,
  results: TSESTree.UnaryExpression[],
): void {
  if (node.type === AST_NODE_TYPES.UnaryExpression && node.operator === '!') {
    results.push(node);
  } else if (node.type === AST_NODE_TYPES.LogicalExpression) {
    collectNegations(node.left as TSESTree.Expression, results);
    collectNegations(node.right as TSESTree.Expression, results);
  } else if (node.type === AST_NODE_TYPES.ConditionalExpression) {
    collectNegations(node.test, results);
    collectNegations(node.consequent, results);
    collectNegations(node.alternate, results);
  }
}

/**
 * Answers whether the position a node occupies accepts an arbitrary expression,
 * so that dropping in a bare `||` cannot re-associate against a neighbouring
 * operator. Slots not ranked here fall through to grouping: an extra pair of
 * parentheses is a formatting nit, while a missing pair silently rewrites the
 * guard.
 */
function landsInLooseSlot(node: TSESTree.Node, parent: TSESTree.Node): boolean {
  switch (parent.type) {
    /**
     * Slots whose grammar already delimits the expression — the mandatory
     * parentheses of `if (…)`, `while (…)`, `switch (…)`, the semicolons of
     * `for (;…;)`, a statement boundary, brackets, a template hole.
     */
    case AST_NODE_TYPES.ExpressionStatement:
    case AST_NODE_TYPES.ReturnStatement:
    case AST_NODE_TYPES.ThrowStatement:
    case AST_NODE_TYPES.IfStatement:
    case AST_NODE_TYPES.WhileStatement:
    case AST_NODE_TYPES.DoWhileStatement:
    case AST_NODE_TYPES.ForStatement:
    case AST_NODE_TYPES.ForInStatement:
    case AST_NODE_TYPES.ForOfStatement:
    case AST_NODE_TYPES.SwitchStatement:
    case AST_NODE_TYPES.SwitchCase:
    case AST_NODE_TYPES.ArrayExpression:
    case AST_NODE_TYPES.SpreadElement:
    case AST_NODE_TYPES.TemplateLiteral:
    case AST_NODE_TYPES.JSXExpressionContainer:
    case AST_NODE_TYPES.VariableDeclarator:
      return true;
    /**
     * `?:`, `=` and `,` all bind looser than `||`, so a `||` operand parses
     * whole in every one of their slots.
     */
    case AST_NODE_TYPES.ConditionalExpression:
    case AST_NODE_TYPES.SequenceExpression:
      return true;
    case AST_NODE_TYPES.AssignmentExpression:
      return parent.right === node;
    /** A concise arrow body is an `AssignmentExpression` position. */
    case AST_NODE_TYPES.ArrowFunctionExpression:
      return parent.body === node;
    case AST_NODE_TYPES.Property:
      return parent.value === node;
    /** Arguments are comma-delimited; a callee is a member of the operand. */
    case AST_NODE_TYPES.CallExpression:
    case AST_NODE_TYPES.NewExpression:
      return parent.arguments.some((argument) => argument === node);
    /** Only the bracketed half of a member access delimits its expression. */
    case AST_NODE_TYPES.MemberExpression:
      return parent.computed && parent.property === node;
    /**
     * `||` is the operator the replacement is built from, and regrouping
     * same-operator `||` preserves both the value and the short-circuit order,
     * so neither side needs grouping. `&&` binds tighter, and `??` may not be
     * mixed with `||` unparenthesized at all — both demand it.
     */
    case AST_NODE_TYPES.LogicalExpression:
      return parent.operator === '||';
    default:
      return false;
  }
}

/**
 * Reports whether a matched pair of parentheses already hugs the node. A `(`
 * token immediately before an expression opens a group that the first unmatched
 * `)` after it closes, and the node itself is balanced, so an adjacent `)` is
 * necessarily that partner. Explicit author parentheses and the argument list of
 * a single-argument call both land here.
 */
function isSurroundedByParentheses(
  node: TSESTree.Node,
  sourceCode: Readonly<TSESLint.SourceCode>,
): boolean {
  const before = sourceCode.getTokenBefore(node);
  const after = sourceCode.getTokenAfter(node);
  return (
    before?.type === AST_TOKEN_TYPES.Punctuator &&
    before.value === '(' &&
    after?.type === AST_TOKEN_TYPES.Punctuator &&
    after.value === ')'
  );
}

/**
 * The fixer emits a bare `||` expression, which binds looser than everything but
 * `?:`, assignment and comma, so whether it needs parentheses is a property of
 * where it LANDS, not of the text itself. Wrapping unconditionally emitted
 * `while ((!data || Object.keys(data).length === 0))` — a pair prettier strips on
 * sight, so `--fix` left source no formatter would print (#2082). Never wrapping
 * is the worse error: `a && !data` would become
 * `a && !data || Object.keys(data).length === 0`, which is a different guard.
 *
 * The shared `requiresParenthesesInline` helper answers the same question for a
 * replacement it can see as a node; this fixer composes its emission as text, and
 * the one operator it ever emits is `||`, which collapses the question to the two
 * checks below.
 */
function replacementNeedsParentheses(
  node: TSESTree.Node,
  sourceCode: Readonly<TSESLint.SourceCode>,
): boolean {
  const { parent } = node;
  if (!parent) {
    return false;
  }
  if (isSurroundedByParentheses(node, sourceCode)) {
    return false;
  }
  return !landsInLooseSlot(node, parent);
}

function getRootCondition(node: TSESTree.Node): TSESTree.Expression | null {
  let current: TSESTree.Node | undefined = node;
  while (current && current.parent) {
    const parent = current.parent;
    if (
      (parent.type === AST_NODE_TYPES.IfStatement && parent.test === current) ||
      (parent.type === AST_NODE_TYPES.WhileStatement &&
        parent.test === current) ||
      (parent.type === AST_NODE_TYPES.DoWhileStatement &&
        parent.test === current) ||
      (parent.type === AST_NODE_TYPES.ForStatement &&
        parent.test === current) ||
      (parent.type === AST_NODE_TYPES.ConditionalExpression &&
        parent.test === current)
    ) {
      return current as TSESTree.Expression;
    }
    if (
      parent.type === AST_NODE_TYPES.LogicalExpression ||
      parent.type === AST_NODE_TYPES.BinaryExpression ||
      parent.type === AST_NODE_TYPES.UnaryExpression ||
      parent.type === AST_NODE_TYPES.ConditionalExpression
    ) {
      current = parent;
      continue;
    }
    break;
  }
  return null;
}

export const enforceEmptyObjectCheck: TSESLint.RuleModule<MessageIds, Options> =
  createRule({
    name: 'enforce-empty-object-check',
    meta: {
      type: 'problem',
      docs: {
        description:
          'Ensure object existence checks also guard against empty objects so that empty payloads are treated like missing data.',
        recommended: 'error',
      },
      fixable: 'code',
      schema: [
        {
          type: 'object',
          properties: {
            objectNamePattern: {
              type: 'array',
              items: { type: 'string' },
            },
            ignoreInLoops: {
              type: 'boolean',
            },
            emptyCheckFunctions: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          additionalProperties: false,
        },
      ],
      messages: {
        missingEmptyObjectCheck:
          'What\'s wrong: "{{name}}" is only checked for falsiness, so `{}` passes the guard. Why it matters: empty payloads or configs behave like missing data and can execute "has data" logic incorrectly. How to fix: also check emptiness (for example, Object.keys({{name}}).length === 0 or a configured empty-check helper).',
      },
    },
    defaultOptions: [{}] as Options,
    create(context) {
      const sourceCode = context.getSourceCode();
      const parserServices = sourceCode.parserServices;
      const checker = parserServices?.program?.getTypeChecker();

      const options: Options[0] = context.options[0] ?? {};
      const {
        objectNamePattern = [],
        ignoreInLoops = false,
        emptyCheckFunctions = [],
      } = options;

      const patternSet: Set<string> = new Set([
        ...DEFAULT_OBJECT_SUFFIXES,
        ...objectNamePattern,
      ]);
      const emptyCheckFunctionsSet: Set<string> = new Set([
        ...DEFAULT_EMPTY_CHECK_FUNCTIONS,
        ...emptyCheckFunctions,
      ]);
      const processedExpressions = new WeakSet<TSESTree.Expression>();
      const processedNegations = new WeakSet<TSESTree.UnaryExpression>();

      function isLikelyObject(identifier: TSESTree.Identifier): boolean {
        if (checker && parserServices?.esTreeNodeToTSNodeMap) {
          try {
            const tsNode = parserServices.esTreeNodeToTSNodeMap.get(identifier);
            const type = checker.getTypeAtLocation(tsNode);
            const analysis = isObjectLikeType(type, checker);
            if (analysis === 'object') {
              return true;
            }
            if (analysis === 'non-object') {
              return false;
            }
          } catch {
            // TypeScript parser services can throw when AST-to-TS node mapping fails; fall back to naming heuristic so linting does not crash.
          }
        }
        return isObjectLikeName(identifier.name, patternSet);
      }

      function reportNegation(
        node: TSESTree.UnaryExpression,
        identifier: TSESTree.Identifier,
      ) {
        if (processedNegations.has(node)) {
          return;
        }
        processedNegations.add(node);

        if (ignoreInLoops && isInsideLoop(node)) {
          return;
        }

        const conditionRoot = getRootCondition(node);
        if (
          conditionRoot &&
          conditionHasEmptyCheck(
            conditionRoot,
            identifier.name,
            emptyCheckFunctionsSet,
          )
        ) {
          return;
        }

        if (!isLikelyObject(identifier)) {
          return;
        }

        context.report({
          node,
          messageId: 'missingEmptyObjectCheck',
          data: {
            name: identifier.name,
          },
          fix(fixer) {
            const identifierText = sourceCode.getText(identifier);
            const guard = `${node.operator}${identifierText} || Object.keys(${identifierText}).length === 0`;
            const replacement = replacementNeedsParentheses(node, sourceCode)
              ? `(${guard})`
              : guard;
            return fixer.replaceText(node, replacement);
          },
        });
      }

      function handleTestExpression(expression: TSESTree.Expression) {
        if (processedExpressions.has(expression)) {
          return;
        }
        processedExpressions.add(expression);

        const negations: TSESTree.UnaryExpression[] = [];
        collectNegations(expression, negations);

        for (const negation of negations) {
          if (
            negation.argument.type === AST_NODE_TYPES.Identifier &&
            negation.operator === '!'
          ) {
            reportNegation(negation, negation.argument);
          }
        }
      }

      return {
        IfStatement(node) {
          if (node.test) {
            handleTestExpression(node.test);
          }
        },
        WhileStatement(node) {
          if (node.test) {
            handleTestExpression(node.test);
          }
        },
        DoWhileStatement(node) {
          if (node.test) {
            handleTestExpression(node.test);
          }
        },
        ForStatement(node) {
          if (node.test) {
            handleTestExpression(node.test as TSESTree.Expression);
          }
        },
        ConditionalExpression(node) {
          handleTestExpression(node.test);
        },
      };
    },
  });

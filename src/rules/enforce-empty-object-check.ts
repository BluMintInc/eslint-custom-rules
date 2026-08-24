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
    printWidth?: number;
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

const DEFAULT_PRINT_WIDTH = 80;

/**
 * The shape of the widened condition, as Prettier's printer sees it.
 *
 * The fixer composes its emission as text, so it cannot ask the AST how the
 * result should be laid out: `!data` is a `UnaryExpression` before the fix and a
 * two-operand `||` chain after it, and an operand of an enclosing `||` chain
 * gains two siblings rather than growing longer. Reconstructing the POST-fix
 * shape is what makes the difference visible — Prettier breaks a chain one
 * operand per line, and a chain that gained an operand is a chain that may no
 * longer fit.
 */
type LayoutDoc =
  | { kind: 'leaf'; text: string }
  | { kind: 'group'; inner: LayoutDoc }
  | { kind: 'chain'; operator: string; parts: LayoutDoc[] }
  | {
      kind: 'conditional';
      test: LayoutDoc;
      consequent: LayoutDoc;
      alternate: LayoutDoc;
    };

function flattenDoc(doc: LayoutDoc): string {
  switch (doc.kind) {
    case 'leaf':
      return doc.text;
    case 'group':
      return `(${flattenDoc(doc.inner)})`;
    case 'chain':
      return doc.parts.map(flattenDoc).join(` ${doc.operator} `);
    case 'conditional':
      return `${flattenDoc(doc.test)} ? ${flattenDoc(
        doc.consequent,
      )} : ${flattenDoc(doc.alternate)}`;
  }
}

/**
 * Joins two halves of a binaryish expression into one chain, mirroring
 * Prettier's flattening of a same-operator run into a single group.
 *
 * A `group` never merges: the parentheses it carries are the reason its operator
 * differs from the enclosing one, and folding it in would rewrite the guard.
 */
function joinChain(
  operator: string,
  left: LayoutDoc,
  right: LayoutDoc,
): LayoutDoc {
  const parts: LayoutDoc[] = [];
  for (const side of [left, right]) {
    if (side.kind === 'chain' && side.operator === operator) {
      parts.push(...side.parts);
    } else {
      parts.push(side);
    }
  }
  return { kind: 'chain', operator, parts };
}

/**
 * Whether a chain carries a parenthesized run of its OWN operator.
 *
 * Prettier strips those parentheses and flattens the run into the outer chain,
 * so `a || (b || c)` prints as three operands rather than two. This emitter
 * keeps the text it was given, so the two layouts disagree; declining hands the
 * case back to the one-line emission, which Prettier rewrites either way.
 */
function hasRedundantlyGroupedOperand(doc: LayoutDoc): boolean {
  if (doc.kind !== 'chain') {
    return false;
  }
  return doc.parts.some(
    (part) =>
      part.kind === 'group' &&
      part.inner.kind === 'chain' &&
      part.inner.operator === doc.operator,
  );
}

/**
 * The lines Prettier would print for `doc`, or null when no layout this emitter
 * authors reproduces it.
 *
 * `lines[0]` is placed at `startColumn` by the caller; every later line carries
 * its own indentation. `tailLength` is the text that follows the last line on
 * the same row — the `;` of a declaration — which Prettier counts when deciding
 * whether that row fits.
 *
 * Four layouts are authored, each verified against Prettier 2.8.8 (agora's pin,
 * not this repo's 2.7.1) over a width/indent matrix:
 *
 * - it fits: one line;
 * - a binaryish chain: one operand per line, operator trailing;
 * - a conditional: test on its own line, `?` and `:` branches indented under it;
 * - a parenthesized operand that does not fit: broken inside the parentheses,
 *   with the closing one glued to the last line.
 *
 * Past those, Prettier's answer depends on which sub-expression overflowed — it
 * opens a call's argument list, or switches to its chained-ternary form — and
 * those spellings compose. Rather than emit a line `prettier --check` rejects,
 * the emitter declines and the caller falls back to the one-line replacement,
 * which is no worse than what shipped before the width was measured at all.
 */
function layoutDoc(
  doc: LayoutDoc,
  indent: string,
  startColumn: number,
  printWidth: number,
  tailLength: number,
  forceBreak = false,
): string[] | null {
  const flat = flattenDoc(doc);
  const fitsOnOneLine = startColumn + flat.length + tailLength <= printWidth;
  /**
   * A binaryish chain shares its group with the header parentheses it sits in,
   * so once that group breaks every operand breaks with it — measured: at print
   * width 80 Prettier splits a 74-column chain that would have fitted on the
   * indented line. A conditional owns a nested group and does fall back to one
   * line, which is why the flag is set only by the header caller.
   */
  if (fitsOnOneLine && !(forceBreak && doc.kind === 'chain')) {
    return [flat];
  }

  if (doc.kind === 'chain') {
    return layoutChain(doc, indent, startColumn, printWidth, tailLength);
  }

  if (doc.kind === 'conditional') {
    /** Prettier prints a ternary whose branch is itself a ternary as a chain. */
    if (
      doc.consequent.kind === 'conditional' ||
      doc.alternate.kind === 'conditional'
    ) {
      return null;
    }
    const testFlat = flattenDoc(doc.test);
    if (startColumn + testFlat.length > printWidth) {
      return null;
    }
    const branchIndent = `${indent}  `;
    const consequentLine = `${branchIndent}? ${flattenDoc(doc.consequent)}`;
    const alternateLine = `${branchIndent}: ${flattenDoc(doc.alternate)}`;
    if (
      consequentLine.length > printWidth ||
      alternateLine.length + tailLength > printWidth
    ) {
      return null;
    }
    return [testFlat, consequentLine, alternateLine];
  }

  if (doc.kind === 'group') {
    /**
     * Parentheses add an indentation level to a chain they enclose and none to a
     * conditional, which prints its own — measured on `(a && (b || c))` breaking
     * its continuation two columns in, against `(flag ? a : b)` putting `?` at
     * the same two columns rather than four.
     */
    const innerIndent =
      doc.inner.kind === 'chain' ? `${indent}  ` : (indent as string);
    const innerLines = layoutDoc(
      doc.inner,
      innerIndent,
      startColumn + 1,
      printWidth,
      tailLength + 1,
    );
    if (!innerLines || innerLines.length < 2) {
      return null;
    }
    const lines = [...innerLines];
    lines[0] = `(${lines[0]}`;
    lines[lines.length - 1] = `${lines[lines.length - 1]})`;
    return lines;
  }

  return null;
}

/**
 * A binaryish chain, one operand per line with the operator trailing.
 *
 * Each operand is laid out in turn rather than measured flat, because an operand
 * that overflows is not always a decline: a parenthesized group breaks inside
 * its own parentheses and stays part of the same chain.
 */
function layoutChain(
  doc: Extract<LayoutDoc, { kind: 'chain' }>,
  indent: string,
  startColumn: number,
  printWidth: number,
  tailLength: number,
): string[] | null {
  if (hasRedundantlyGroupedOperand(doc)) {
    return null;
  }
  const rendered: string[] = [];
  for (let index = 0; index < doc.parts.length; index++) {
    const isLast = index === doc.parts.length - 1;
    const column = index === 0 ? startColumn : indent.length;
    /** A trailing ` ||` rides the operand's last line and counts against it. */
    const partTail = isLast ? tailLength : doc.operator.length + 1;
    const partLines = layoutDoc(
      doc.parts[index],
      indent,
      column,
      printWidth,
      partTail,
    );
    if (!partLines) {
      return null;
    }
    const lines = partLines.map((line, offset) =>
      offset === 0 && index > 0 ? indent + line : line,
    );
    if (!isLast) {
      lines[lines.length - 1] = `${lines[lines.length - 1]} ${doc.operator}`;
    }
    rendered.push(...lines);
  }
  return rendered;
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

/**
 * The widest expression the replacement can re-associate against, which is the
 * region a re-layout has to own.
 *
 * `getRootCondition` stops at the nearest test slot, so for `!data ? a : b` it
 * answers `!data` — correct for "is an emptiness check already written here?"
 * and wrong for "what does Prettier lay out?", since the branches share the
 * conditional's group with the widened test.
 */
function getLayoutRoot(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  while (
    current.parent &&
    (current.parent.type === AST_NODE_TYPES.LogicalExpression ||
      current.parent.type === AST_NODE_TYPES.ConditionalExpression)
  ) {
    current = current.parent;
  }
  return current;
}

type DocContext = {
  sourceCode: Readonly<TSESLint.SourceCode>;
  source: string;
  targetRange: readonly [number, number];
  targetDoc: LayoutDoc;
};

const isParenRun = (text: string, paren: '(' | ')'): boolean =>
  text
    .trim()
    .split('')
    .every((character) => character === paren);

/**
 * Reconstructs `node` — as it reads once the replacement is spliced in — over
 * the source span `[segmentStart, segmentEnd)`.
 *
 * The span is passed rather than derived because parentheses are not part of a
 * node's own range: `(a && b) || c` hands back `a && b` for its left operand,
 * and an emitter that printed that text would drop the pair the guard depends
 * on. Splitting the span at the operator token keeps whatever the author wrote
 * around each operand.
 */
function buildDoc(
  node: TSESTree.Node,
  segmentStart: number,
  segmentEnd: number,
  context: DocContext,
): LayoutDoc | null {
  const { source } = context;
  const before = source.slice(segmentStart, node.range[0]);
  const after = source.slice(node.range[1], segmentEnd);
  if (!isParenRun(before, '(') || !isParenRun(after, ')')) {
    return null;
  }
  const depth = before.trim().length;
  /** Prettier strips a doubled pair, so any layout keeping it is not its output. */
  if (depth !== after.trim().length || depth > 1) {
    return null;
  }

  /**
   * The children split the node's OWN span, not the segment: the parentheses
   * the segment carried have just been accounted for, and handing them down
   * again makes the first child look unbalanced and rejects the whole tree.
   */
  const core = buildCoreDoc(node, context);
  if (!core) {
    return null;
  }
  if (depth === 0) {
    return core;
  }
  /**
   * A pair the author wrote around the negation already encloses the emission,
   * so the fixer adds none of its own and the group is read off the source.
   */
  return { kind: 'group', inner: core };
}

function buildCoreDoc(
  node: TSESTree.Node,
  context: DocContext,
): LayoutDoc | null {
  const { sourceCode, source, targetRange } = context;
  const [segmentStart, segmentEnd] = node.range;

  if (node.range[0] === targetRange[0] && node.range[1] === targetRange[1]) {
    return context.targetDoc;
  }

  if (node.type === AST_NODE_TYPES.LogicalExpression) {
    const operatorToken = sourceCode.getTokenAfter(node.left, {
      filter: (token) =>
        token.type === AST_TOKEN_TYPES.Punctuator &&
        token.value === node.operator,
    });
    if (!operatorToken) {
      return null;
    }
    const left = buildDoc(
      node.left,
      segmentStart,
      operatorToken.range[0],
      context,
    );
    const right = buildDoc(
      node.right,
      operatorToken.range[1],
      segmentEnd,
      context,
    );
    if (!left || !right) {
      return null;
    }
    return joinChain(node.operator, left, right);
  }

  if (node.type === AST_NODE_TYPES.ConditionalExpression) {
    const questionToken = sourceCode.getTokenAfter(node.test, {
      filter: (token) =>
        token.type === AST_TOKEN_TYPES.Punctuator && token.value === '?',
    });
    const colonToken = sourceCode.getTokenAfter(node.consequent, {
      filter: (token) =>
        token.type === AST_TOKEN_TYPES.Punctuator && token.value === ':',
    });
    if (!questionToken || !colonToken) {
      return null;
    }
    const test = buildDoc(
      node.test,
      segmentStart,
      questionToken.range[0],
      context,
    );
    const consequent = buildDoc(
      node.consequent,
      questionToken.range[1],
      colonToken.range[0],
      context,
    );
    const alternate = buildDoc(
      node.alternate,
      colonToken.range[1],
      segmentEnd,
      context,
    );
    if (!test || !consequent || !alternate) {
      return null;
    }
    return { kind: 'conditional', test, consequent, alternate };
  }

  /**
   * A leaf is printed as the text it already is, so a node that merely CONTAINS
   * the negation would carry the pre-fix spelling into the emission.
   */
  if (node.range[0] <= targetRange[0] && targetRange[1] <= node.range[1]) {
    return null;
  }

  return { kind: 'leaf', text: source.slice(node.range[0], node.range[1]) };
}

/** The whitespace opening a block's closing-brace line, or null when text precedes it. */
function getClosingBraceIndent(
  block: TSESTree.Node,
  sourceCode: Readonly<TSESLint.SourceCode>,
): string | null {
  const column = block.loc.end.column - 1;
  const line = sourceCode.lines[block.loc.end.line - 1] ?? '';
  const prefix = line.slice(0, column);
  return /^[\t ]*$/.test(prefix) ? prefix : null;
}

/** The whitespace opening the node's line, or null when text precedes it. */
function getLineIndent(
  node: TSESTree.Node,
  sourceCode: Readonly<TSESLint.SourceCode>,
): string | null {
  const line = sourceCode.lines[node.loc.start.line - 1] ?? '';
  const prefix = line.slice(0, node.loc.start.column);
  return /^[\t ]*$/.test(prefix) ? prefix : null;
}

/**
 * Whether a comment sits anywhere in `[start, end)`.
 *
 * A re-layout rewrites every column of the region it owns, which turns a
 * comment from text the fixer merely stepped over into a layout input it would
 * have to place. Declining keeps the one-line replacement, which touches only
 * the negation and so cannot move or drop a marker.
 */
function regionHasComment(
  sourceCode: Readonly<TSESLint.SourceCode>,
  start: number,
  end: number,
): boolean {
  return sourceCode
    .getAllComments()
    .some((comment) => comment.range[1] > start && comment.range[0] < end);
}

/** A replacement that owns more than the negation, so that it can re-wrap it. */
type WidenedFix = { range: [number, number]; text: string };

const collapseSpacing = (text: string): string =>
  text.replace(/\s+/g, ' ').trim();

const isBlank = (text: string): boolean => text.trim() === '';

/** The statement a declaration belongs to, reaching past an `export` wrapper. */
function getDeclarationStatement(
  declaration: TSESTree.Node,
): TSESTree.Node | null {
  const { parent } = declaration;
  if (!parent) {
    return null;
  }
  if (
    parent.type === AST_NODE_TYPES.ExportNamedDeclaration ||
    parent.type === AST_NODE_TYPES.ExportDefaultDeclaration
  ) {
    return parent;
  }
  /** A `for` head is not a line of its own, so it has no statement layout. */
  if (parent.type.startsWith('For')) {
    return null;
  }
  return declaration;
}

type PlanInput = {
  sourceCode: Readonly<TSESLint.SourceCode>;
  target: TSESTree.UnaryExpression;
  identifierText: string;
  needsParentheses: boolean;
  printWidth: number;
};

/**
 * The re-wrapped emission Prettier would print, or null to keep the one-line
 * replacement.
 *
 * Widening the fix's range is what makes the break expressible at all: the
 * negation itself is one operand of a header, and Prettier's decision is about
 * the whole header. Every guard below narrows the region to one this emitter has
 * verified against Prettier rather than guessed at, and a decline is not a lost
 * fix — the caller still rewrites the negation, exactly as it did before the
 * width was measured (#2095).
 */
function planWidenedFix(input: PlanInput): WidenedFix | null {
  const { sourceCode, target, identifierText, needsParentheses } = input;
  const source = sourceCode.getText();
  const root = getLayoutRoot(target);
  const parent = root.parent;
  if (!parent) {
    return null;
  }

  const guard: LayoutDoc = {
    kind: 'chain',
    operator: '||',
    parts: [
      { kind: 'leaf', text: `${target.operator}${identifierText}` },
      { kind: 'leaf', text: `Object.keys(${identifierText}).length === 0` },
    ],
  };
  const context: DocContext = {
    sourceCode,
    source,
    targetRange: target.range,
    targetDoc: needsParentheses ? { kind: 'group', inner: guard } : guard,
  };

  const doc = buildDoc(root, root.range[0], root.range[1], context);
  if (!doc) {
    return null;
  }
  /**
   * The reconstruction is only trustworthy if it reproduces the region it was
   * read from. Comparing it against the spliced source catches every spelling
   * the emitter normalizes away — an unusual gap around an operator, a nested
   * pair of parentheses — as a decline rather than as a silent rewrite.
   *
   * Line breaks are collapsed on both sides because a region Prettier has
   * ALREADY broken is the common case once a header overflows: re-laying it out
   * is the whole point, and comparing it verbatim would decline exactly there.
   * A leaf that spans lines survives that collapse, so it is rejected by the
   * newline check on the reconstruction instead.
   */
  const spliced =
    source.slice(root.range[0], target.range[0]) +
    (needsParentheses
      ? `(${flattenDoc(guard)})`
      : flattenDoc(context.targetDoc)) +
    source.slice(target.range[1], root.range[1]);
  const flat = flattenDoc(doc);
  if (
    flat.includes('\n') ||
    collapseSpacing(flat) !== collapseSpacing(spliced)
  ) {
    return null;
  }

  return (
    planHeaderFix(root, parent, flat, doc, input, source) ??
    planAssignmentFix(root, parent, flat, doc, input, source) ??
    planReturnFix(root, parent, flat, doc, input, source)
  );
}

/**
 * The `if (…) {`, `while (…) {` and `} while (…);` break.
 *
 * The replaced range is the span BETWEEN the parentheses, so whatever follows
 * the closing one — a block, an `else`, the `;` of a `do` — is left untouched.
 */
function planHeaderFix(
  root: TSESTree.Node,
  parent: TSESTree.Node,
  flat: string,
  doc: LayoutDoc,
  { sourceCode, printWidth }: PlanInput,
  source: string,
): WidenedFix | null {
  let keywordPrefix: string;
  let closingSuffix: string;
  let body: TSESTree.Node;

  if (
    (parent.type === AST_NODE_TYPES.IfStatement ||
      parent.type === AST_NODE_TYPES.WhileStatement) &&
    parent.test === root
  ) {
    body =
      parent.type === AST_NODE_TYPES.IfStatement
        ? parent.consequent
        : parent.body;
    /**
     * Past a block, Prettier lays the clause out on its own line and breaks
     * after the closing parenthesis before it breaks the test, which is a
     * second layout rather than a wider version of this one.
     */
    if (body.type !== AST_NODE_TYPES.BlockStatement) {
      return null;
    }
    keywordPrefix =
      parent.type === AST_NODE_TYPES.IfStatement ? 'if (' : 'while (';
    closingSuffix = ') {';
  } else if (
    parent.type === AST_NODE_TYPES.DoWhileStatement &&
    parent.test === root
  ) {
    if (parent.body.type !== AST_NODE_TYPES.BlockStatement) {
      return null;
    }
    body = parent.body;
    keywordPrefix = '} while (';
    closingSuffix = ');';
  } else {
    return null;
  }

  const openParen = sourceCode.getTokenBefore(root);
  const closeParen = sourceCode.getTokenAfter(root);
  if (
    openParen?.value !== '(' ||
    closeParen?.value !== ')' ||
    !isBlank(source.slice(openParen.range[1], root.range[0])) ||
    !isBlank(source.slice(root.range[1], closeParen.range[0]))
  ) {
    return null;
  }
  /** A parenthesis that is not the header's own means an extra, stripped pair. */
  const keyword = sourceCode.getTokenBefore(openParen);
  if (
    keyword?.value !==
    (parent.type === AST_NODE_TYPES.IfStatement ? 'if' : 'while')
  ) {
    return null;
  }
  if (
    parent.type !== AST_NODE_TYPES.DoWhileStatement &&
    source.slice(closeParen.range[1], body.range[0]) !== ' '
  ) {
    return null;
  }
  if (parent.type === AST_NODE_TYPES.DoWhileStatement) {
    const terminator = sourceCode.getTokenAfter(closeParen);
    closingSuffix = terminator?.value === ';' ? ');' : ')';
  }

  /**
   * A `do…while` trailer opens with the body's own closing brace, so the column
   * the emitted line starts at is that brace's, not the `do` keyword's.
   */
  const indent =
    parent.type === AST_NODE_TYPES.DoWhileStatement
      ? getClosingBraceIndent(body, sourceCode)
      : getLineIndent(parent, sourceCode);
  if (indent === null) {
    return null;
  }
  if (regionHasComment(sourceCode, root.range[0], root.range[1])) {
    return null;
  }

  const headerWidth =
    indent.length + keywordPrefix.length + flat.length + closingSuffix.length;
  if (headerWidth <= printWidth) {
    return null;
  }

  const bodyIndent = `${indent}  `;
  const lines = layoutDoc(
    doc,
    bodyIndent,
    bodyIndent.length,
    printWidth,
    0,
    true,
  );
  if (!lines) {
    return null;
  }
  const rendered = [bodyIndent + lines[0], ...lines.slice(1)].join('\n');
  return {
    range: [openParen.range[1], closeParen.range[0]],
    text: `\n${rendered}\n${indent}`,
  };
}

/**
 * The break after `=` in `const x = …;` and `x.y = …;`.
 *
 * The replaced range starts after the `=`, so the declaration's head — its
 * `export`, its type annotation, the assignment target — is left untouched.
 */
function planAssignmentFix(
  root: TSESTree.Node,
  parent: TSESTree.Node,
  flat: string,
  doc: LayoutDoc,
  { sourceCode, printWidth }: PlanInput,
  source: string,
): WidenedFix | null {
  let statement: TSESTree.Node | null = null;

  if (
    parent.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.init === root &&
    parent.parent?.type === AST_NODE_TYPES.VariableDeclaration &&
    /** Prettier lays a second declarator out under the first, not after `=`. */
    parent.parent.declarations.length === 1
  ) {
    statement = getDeclarationStatement(parent.parent);
  } else if (
    parent.type === AST_NODE_TYPES.AssignmentExpression &&
    parent.right === root &&
    parent.operator === '=' &&
    parent.parent?.type === AST_NODE_TYPES.ExpressionStatement
  ) {
    statement = parent.parent;
  }
  if (!statement) {
    return null;
  }

  const equals = sourceCode.getTokenBefore(root);
  if (
    equals?.value !== '=' ||
    !isBlank(source.slice(equals.range[1], root.range[0]))
  ) {
    return null;
  }

  const indent = getLineIndent(statement, sourceCode);
  if (indent === null) {
    return null;
  }
  if (regionHasComment(sourceCode, statement.range[0], statement.range[1])) {
    return null;
  }

  const head = source.slice(statement.range[0], equals.range[1]);
  const tail = source.slice(root.range[1], statement.range[1]);
  if (head.includes('\n') || tail.includes('\n')) {
    return null;
  }

  const statementWidth =
    indent.length + head.length + 1 + flat.length + tail.length;
  if (statementWidth <= printWidth) {
    return null;
  }

  const valueIndent = `${indent}  `;
  const lines = layoutDoc(
    doc,
    valueIndent,
    valueIndent.length,
    printWidth,
    tail.length,
  );
  if (!lines) {
    return null;
  }
  const rendered = [valueIndent + lines[0], ...lines.slice(1)].join('\n');
  return { range: [equals.range[1], root.range[1]], text: `\n${rendered}` };
}

/**
 * The `return … ? … : …;` break.
 *
 * Unlike an assignment, `return` keeps its argument on its own line and lets the
 * conditional break underneath — measured: Prettier never inserts a line break
 * after the keyword. Only a conditional is authored, because a binaryish
 * argument that overflows is re-parenthesized rather than broken in place, and
 * that is a different emission.
 */
function planReturnFix(
  root: TSESTree.Node,
  parent: TSESTree.Node,
  flat: string,
  doc: LayoutDoc,
  { sourceCode, printWidth }: PlanInput,
  source: string,
): WidenedFix | null {
  if (
    (parent.type !== AST_NODE_TYPES.ReturnStatement &&
      parent.type !== AST_NODE_TYPES.ThrowStatement) ||
    parent.argument !== root ||
    doc.kind !== 'conditional'
  ) {
    return null;
  }

  const indent = getLineIndent(parent, sourceCode);
  if (indent === null) {
    return null;
  }
  if (regionHasComment(sourceCode, parent.range[0], parent.range[1])) {
    return null;
  }

  const head = source.slice(parent.range[0], root.range[0]);
  const tail = source.slice(root.range[1], parent.range[1]);
  if (head.includes('\n') || tail.includes('\n')) {
    return null;
  }

  const startColumn = indent.length + head.length;
  if (startColumn + flat.length + tail.length <= printWidth) {
    return null;
  }

  const lines = layoutDoc(doc, indent, startColumn, printWidth, tail.length);
  if (!lines || lines.length < 2) {
    return null;
  }
  return { range: [root.range[0], root.range[1]], text: lines.join('\n') };
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
            printWidth: {
              type: 'number',
              minimum: 1,
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
      const printWidth =
        typeof options.printWidth === 'number' && options.printWidth > 0
          ? options.printWidth
          : DEFAULT_PRINT_WIDTH;

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
            const needsParentheses = replacementNeedsParentheses(
              node,
              sourceCode,
            );
            const replacement = needsParentheses ? `(${guard})` : guard;
            /**
             * The widened condition can push the statement it lives in past the
             * print width, and Prettier answers that by breaking the header —
             * which a replacement confined to the negation cannot express. Past
             * the width the fixer therefore owns the whole condition and emits
             * Prettier's break; within it, and wherever the break is a layout
             * this emitter has not verified, the minimal replacement stands
             * (#2095).
             */
            const widened = planWidenedFix({
              sourceCode,
              target: node,
              identifierText,
              needsParentheses,
              printWidth,
            });
            if (widened) {
              return fixer.replaceTextRange(widened.range, widened.text);
            }
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

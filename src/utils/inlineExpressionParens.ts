import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';

/**
 * Whether a fixer that inlines an expression in place of a larger span must
 * parenthesise what it emits.
 *
 * A fixer replacing a call with the expression the call produced hands the
 * expression a position it was never written in. Wrapping the emission in
 * parentheses makes every such position safe, which is why it is the reflex —
 * but the parentheses are text the fixer writes into an otherwise formatted
 * file, and prettier removes the ones it does not want. A repository that runs
 * `--fix` and then `prettier --check` sees every fixed file go red for
 * parentheses that changed nothing (#2071).
 *
 * The answer is a property of the pair (expression, position): the emission
 * needs parentheses exactly when the expression binds looser than its landing
 * position accepts, or when the two would fuse into different tokens. Both are
 * decided here, erring toward parenthesising — an unmodelled landing position
 * keeps them.
 */

/**
 * Binding strength, ordered so that a larger number binds tighter. The scale
 * has no meaning beyond the comparison; only the relative order matters.
 */
const PRECEDENCE = {
  SEQUENCE: 0,
  ASSIGNMENT: 1,
  CONDITIONAL: 2,
  COALESCE: 3,
  LOGICAL_AND: 4,
  BITWISE_OR: 5,
  BITWISE_XOR: 6,
  BITWISE_AND: 7,
  EQUALITY: 8,
  RELATIONAL: 9,
  SHIFT: 10,
  ADDITIVE: 11,
  MULTIPLICATIVE: 12,
  EXPONENT: 13,
  UNARY: 14,
  UPDATE: 15,
  OPTIONAL_CHAIN: 16,
  MEMBER: 17,
  PRIMARY: 18,
} as const;

/** No expression is tight enough for this position, so parentheses always go. */
const REQUIRES_PARENTHESES = Number.POSITIVE_INFINITY;

const BINARY_PRECEDENCE: Record<string, number> = {
  '|': PRECEDENCE.BITWISE_OR,
  '^': PRECEDENCE.BITWISE_XOR,
  '&': PRECEDENCE.BITWISE_AND,
  '==': PRECEDENCE.EQUALITY,
  '!=': PRECEDENCE.EQUALITY,
  '===': PRECEDENCE.EQUALITY,
  '!==': PRECEDENCE.EQUALITY,
  '<': PRECEDENCE.RELATIONAL,
  '<=': PRECEDENCE.RELATIONAL,
  '>': PRECEDENCE.RELATIONAL,
  '>=': PRECEDENCE.RELATIONAL,
  in: PRECEDENCE.RELATIONAL,
  instanceof: PRECEDENCE.RELATIONAL,
  '<<': PRECEDENCE.SHIFT,
  '>>': PRECEDENCE.SHIFT,
  '>>>': PRECEDENCE.SHIFT,
  '+': PRECEDENCE.ADDITIVE,
  '-': PRECEDENCE.ADDITIVE,
  '*': PRECEDENCE.MULTIPLICATIVE,
  '/': PRECEDENCE.MULTIPLICATIVE,
  '%': PRECEDENCE.MULTIPLICATIVE,
  '**': PRECEDENCE.EXPONENT,
};

const EQUALITY_OPERATORS = new Set(['==', '!=', '===', '!==']);
/**
 * Operators whose operands prettier brackets even where they bind tighter:
 * `(a + b) & mask` reads as a mask over a sum, `a + b & mask` reads as neither.
 */
const BITWISE_OPERATORS = new Set(['&', '|', '^', '<<', '>>', '>>>']);
const MULTIPLICATIVE_OPERATORS = new Set(['*', '/', '%']);
const BITSHIFT_OPERATORS = new Set(['<<', '>>', '>>>']);

/**
 * Whether two operators of equal binding strength read correctly written as one
 * flat run. Where they do not, prettier parenthesises the nested one, because
 * the grouping is an associativity readers routinely misremember: `a % b % c`
 * and `x << y << z` both mean the left-hand pair first, and `**` means the
 * right-hand pair first.
 */
function flattensWith(parentOperator: string, nestedOperator: string): boolean {
  if (parentOperator === '**') {
    return false;
  }
  if (
    EQUALITY_OPERATORS.has(parentOperator) &&
    EQUALITY_OPERATORS.has(nestedOperator)
  ) {
    return false;
  }
  if (
    MULTIPLICATIVE_OPERATORS.has(parentOperator) &&
    MULTIPLICATIVE_OPERATORS.has(nestedOperator) &&
    (parentOperator !== nestedOperator ||
      parentOperator === '%' ||
      nestedOperator === '%')
  ) {
    return false;
  }
  if (
    BITSHIFT_OPERATORS.has(parentOperator) &&
    BITSHIFT_OPERATORS.has(nestedOperator)
  ) {
    return false;
  }
  return true;
}

function precedenceOf(node: TSESTree.Node): number {
  switch (node.type) {
    case AST_NODE_TYPES.SequenceExpression:
      return PRECEDENCE.SEQUENCE;
    case AST_NODE_TYPES.AssignmentExpression:
    case AST_NODE_TYPES.ArrowFunctionExpression:
    case AST_NODE_TYPES.YieldExpression:
      return PRECEDENCE.ASSIGNMENT;
    case AST_NODE_TYPES.ConditionalExpression:
      return PRECEDENCE.CONDITIONAL;
    case AST_NODE_TYPES.LogicalExpression:
      return node.operator === '&&'
        ? PRECEDENCE.LOGICAL_AND
        : PRECEDENCE.COALESCE;
    case AST_NODE_TYPES.BinaryExpression:
      return BINARY_PRECEDENCE[node.operator] ?? PRECEDENCE.RELATIONAL;
    // `as` and `satisfies` take everything to their left, so they behave like a
    // relational operator whose right operand happens to be a type.
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
      return PRECEDENCE.RELATIONAL;
    case AST_NODE_TYPES.UnaryExpression:
    case AST_NODE_TYPES.AwaitExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
      return PRECEDENCE.UNARY;
    case AST_NODE_TYPES.UpdateExpression:
      return PRECEDENCE.UPDATE;
    // An optional chain re-forms around whatever encloses it — `(a?.b).c`
    // evaluates `.c` on `undefined` where `a?.b.c` short-circuits — so it sits
    // below the member positions that would absorb it.
    case AST_NODE_TYPES.ChainExpression:
      return PRECEDENCE.OPTIONAL_CHAIN;
    case AST_NODE_TYPES.CallExpression:
    case AST_NODE_TYPES.MemberExpression:
    case AST_NODE_TYPES.NewExpression:
    case AST_NODE_TYPES.TaggedTemplateExpression:
    case AST_NODE_TYPES.TSNonNullExpression:
    case AST_NODE_TYPES.ImportExpression:
      return PRECEDENCE.MEMBER;
    default:
      return PRECEDENCE.PRIMARY;
  }
}

/**
 * The binding strength the landing position accepts unparenthesised.
 *
 * Positions are named explicitly and anything unnamed demands parentheses: a
 * position nobody modelled — a `class ... extends`, a decorator, a `for`
 * initialiser where an `in` operator is read as the loop's own — is exactly
 * where a permissive default does its damage.
 */
function requiredPrecedenceAt(node: TSESTree.Node): number {
  const parent = node.parent;
  if (!parent) {
    return REQUIRES_PARENTHESES;
  }

  switch (parent.type) {
    // Positions bounded by a token on both sides, where anything but a comma
    // sequence keeps its shape.
    case AST_NODE_TYPES.ArrayExpression:
    case AST_NODE_TYPES.JSXExpressionContainer:
    case AST_NODE_TYPES.TemplateLiteral:
    case AST_NODE_TYPES.ReturnStatement:
    case AST_NODE_TYPES.ThrowStatement:
    case AST_NODE_TYPES.VariableDeclarator:
    case AST_NODE_TYPES.PropertyDefinition:
    case AST_NODE_TYPES.Property:
    case AST_NODE_TYPES.IfStatement:
    case AST_NODE_TYPES.WhileStatement:
    case AST_NODE_TYPES.DoWhileStatement:
    case AST_NODE_TYPES.SwitchStatement:
    case AST_NODE_TYPES.SwitchCase:
    case AST_NODE_TYPES.ExpressionStatement:
    case AST_NODE_TYPES.ExportDefaultDeclaration:
    case AST_NODE_TYPES.SequenceExpression:
      return PRECEDENCE.ASSIGNMENT;

    // `extends` takes a LeftHandSideExpression, so anything an operator builds
    // needs the parentheses back.
    case AST_NODE_TYPES.ClassDeclaration:
    case AST_NODE_TYPES.ClassExpression:
      return parent.superClass === node
        ? PRECEDENCE.MEMBER
        : REQUIRES_PARENTHESES;

    case AST_NODE_TYPES.CallExpression:
    case AST_NODE_TYPES.NewExpression:
      if (parent.callee !== node) {
        return PRECEDENCE.ASSIGNMENT;
      }
      // A `new` callee swallows a following argument list, so a callee that is
      // itself a call changes which call the arguments belong to.
      return parent.type === AST_NODE_TYPES.NewExpression
        ? REQUIRES_PARENTHESES
        : PRECEDENCE.MEMBER;

    case AST_NODE_TYPES.MemberExpression:
      return parent.object === node ? PRECEDENCE.MEMBER : PRECEDENCE.ASSIGNMENT;

    case AST_NODE_TYPES.TaggedTemplateExpression:
      return parent.tag === node ? PRECEDENCE.MEMBER : PRECEDENCE.ASSIGNMENT;

    case AST_NODE_TYPES.TSNonNullExpression:
      return PRECEDENCE.MEMBER;

    case AST_NODE_TYPES.UnaryExpression:
    case AST_NODE_TYPES.AwaitExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
      return PRECEDENCE.UNARY;

    // `x as T` reads its operand as far left as the grammar allows, and
    // prettier parenthesises any operator expression underneath it.
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
      return PRECEDENCE.UNARY;

    // `...a + b` spreads the sum, yet reads as spreading `a`; prettier writes
    // the parentheses back for anything an operator builds, and leaves a unary
    // one alone.
    case AST_NODE_TYPES.SpreadElement:
      return PRECEDENCE.UNARY;

    case AST_NODE_TYPES.BinaryExpression:
    case AST_NODE_TYPES.LogicalExpression: {
      const operatorPrecedence = precedenceOf(parent);
      // `**` is right-associative, and its left operand additionally refuses a
      // unary expression outright: `-1 ** 2` is a SyntaxError.
      if (
        parent.type === AST_NODE_TYPES.BinaryExpression &&
        parent.operator === '**'
      ) {
        return parent.left === node ? PRECEDENCE.UNARY + 1 : operatorPrecedence;
      }
      return parent.left === node ? operatorPrecedence : operatorPrecedence + 1;
    }

    case AST_NODE_TYPES.ConditionalExpression:
      return parent.test === node
        ? PRECEDENCE.CONDITIONAL + 1
        : PRECEDENCE.ASSIGNMENT;

    case AST_NODE_TYPES.ArrowFunctionExpression:
      return parent.body === node
        ? PRECEDENCE.ASSIGNMENT
        : REQUIRES_PARENTHESES;

    case AST_NODE_TYPES.AssignmentExpression:
      return parent.right === node
        ? PRECEDENCE.ASSIGNMENT
        : REQUIRES_PARENTHESES;

    default:
      return REQUIRES_PARENTHESES;
  }
}

/**
 * Whether the node sits in the initialiser of a `for` header, where an `in`
 * operator is read as the head of a `for...in` loop instead.
 */
function isInsideForInitializer(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | undefined = node;
  while (current?.parent) {
    const { parent } = current;
    if (
      parent.type === AST_NODE_TYPES.ForStatement ||
      parent.type === AST_NODE_TYPES.ForInStatement ||
      parent.type === AST_NODE_TYPES.ForOfStatement
    ) {
      return parent.type === AST_NODE_TYPES.ForStatement
        ? parent.init === current
        : parent.left === current;
    }
    if (
      parent.type === AST_NODE_TYPES.BlockStatement ||
      parent.type === AST_NODE_TYPES.Program ||
      parent.type === AST_NODE_TYPES.FunctionDeclaration ||
      parent.type === AST_NODE_TYPES.FunctionExpression ||
      parent.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      return false;
    }
    current = parent;
  }
  return false;
}

function containsInOperator(node: TSESTree.Node, depth = 0): boolean {
  if (depth > 20) {
    return true;
  }
  if (node.type === AST_NODE_TYPES.BinaryExpression && node.operator === 'in') {
    return true;
  }
  return Object.entries(node as unknown as Record<string, unknown>).some(
    ([key, value]) => {
      if (key === 'parent') return false;
      if (Array.isArray(value)) {
        return value.some(
          (child) =>
            child &&
            typeof child === 'object' &&
            'type' in child &&
            containsInOperator(child as TSESTree.Node, depth + 1),
        );
      }
      return (
        !!value &&
        typeof value === 'object' &&
        'type' in (value as object) &&
        containsInOperator(value as TSESTree.Node, depth + 1)
      );
    },
  );
}

/** Whether one of the two operators is `??`, which cannot mix with `&&`/`||`. */
function mixesCoalesceWithLogical(
  first: TSESTree.Node,
  second: TSESTree.Node,
): boolean {
  const isCoalesce = (node: TSESTree.Node) =>
    node.type === AST_NODE_TYPES.LogicalExpression && node.operator === '??';
  const isLogical = (node: TSESTree.Node) =>
    node.type === AST_NODE_TYPES.LogicalExpression && node.operator !== '??';
  return (
    (isCoalesce(first) && isLogical(second)) ||
    (isLogical(first) && isCoalesce(second))
  );
}

function operatorOf(node: TSESTree.Node): string | null {
  return node.type === AST_NODE_TYPES.BinaryExpression ||
    node.type === AST_NODE_TYPES.LogicalExpression
    ? node.operator
    : null;
}

const IDENTIFIER_CHARACTER = /[\w$]/;

/**
 * Whether the characters meeting at a seam would lex as one token — `-` beside
 * `-1` becoming `--`, or a word running into the word beside it.
 */
function fusesWithNeighbour(left: string, right: string): boolean {
  if (left === '' || right === '') {
    return false;
  }
  if (IDENTIFIER_CHARACTER.test(left) && IDENTIFIER_CHARACTER.test(right)) {
    return true;
  }
  const pair = `${left}${right}`;
  return ['--', '++', '//', '/*', '<!', '**'].includes(pair);
}

/**
 * A string in statement position is a directive, and a statement opening with
 * `{`, `function` or `class` is read as a block or a declaration. `export
 * default` accepts a declaration too, but never a directive.
 */
function isStatementStartHazard(
  replacement: TSESTree.Expression,
  text: string,
  parentType: AST_NODE_TYPES,
): boolean {
  if (
    parentType === AST_NODE_TYPES.ExpressionStatement &&
    replacement.type === AST_NODE_TYPES.Literal &&
    typeof replacement.value === 'string'
  ) {
    return true;
  }
  return /^\s*(\{|function\b|class\b|let\s*\[)/.test(text);
}

/**
 * Positions where the parentheses survive `prettier --write`, so omitting them
 * leaves the emission just as unformatted as a redundant pair does.
 *
 * Every rule here only ADDS parentheses, so a wrong one costs formatting noise
 * and never meaning. Two of them double as grammar rules: an `as` expression
 * beside a `&` or `|` has its operator swallowed by the type, and a `??` cannot
 * sit beside `&&` or `||` at all.
 */
function prettierWritesParentheses(
  replacement: TSESTree.Expression,
  replaced: TSESTree.Node,
  parent: TSESTree.Node,
): boolean {
  // An expression whose value is a side effect reads as a mistake unbracketed,
  // and prettier brackets it everywhere but in statement position.
  if (
    (replacement.type === AST_NODE_TYPES.AssignmentExpression ||
      replacement.type === AST_NODE_TYPES.SequenceExpression ||
      replacement.type === AST_NODE_TYPES.YieldExpression) &&
    parent.type !== AST_NODE_TYPES.ExpressionStatement
  ) {
    return true;
  }

  if (
    parent.type === AST_NODE_TYPES.ArrowFunctionExpression &&
    parent.body === replaced &&
    replacement.type === AST_NODE_TYPES.ConditionalExpression
  ) {
    return true;
  }

  if (
    parent.type === AST_NODE_TYPES.ConditionalExpression &&
    parent.test !== replaced &&
    replacement.type === AST_NODE_TYPES.ConditionalExpression
  ) {
    return true;
  }

  const parentOperator = operatorOf(parent);
  if (parentOperator !== null) {
    if (
      replacement.type === AST_NODE_TYPES.TSAsExpression ||
      replacement.type === AST_NODE_TYPES.TSSatisfiesExpression
    ) {
      return true;
    }
    const replacementOperator = operatorOf(replacement);
    if (replacementOperator !== null) {
      if (
        parent.type === AST_NODE_TYPES.LogicalExpression &&
        replacement.type === AST_NODE_TYPES.LogicalExpression
      ) {
        return parentOperator !== replacementOperator;
      }
      if (precedenceOf(parent) === precedenceOf(replacement)) {
        return !flattensWith(parentOperator, replacementOperator);
      }
      // A tighter-binding operand still gets bracketed under a bitwise or
      // shift parent, and `%` gets bracketed under `+`/`-`: those are the
      // groupings readers have to look up rather than read.
      return replacementOperator === '%'
        ? parentOperator === '+' || parentOperator === '-'
        : BITWISE_OPERATORS.has(parentOperator);
    }
  }

  if (
    parent.type === AST_NODE_TYPES.ConditionalExpression &&
    (replacement.type === AST_NODE_TYPES.TSAsExpression ||
      replacement.type === AST_NODE_TYPES.TSSatisfiesExpression)
  ) {
    return true;
  }

  // A number is written with the token that also introduces a decimal point, so
  // `1.toFixed(2)` does not parse, and prettier writes `(1.5).length` even
  // where it does. An optional `?.` separates the two on its own.
  return (
    parent.type === AST_NODE_TYPES.MemberExpression &&
    parent.object === replaced &&
    !parent.optional &&
    replacement.type === AST_NODE_TYPES.Literal &&
    typeof replacement.value === 'number'
  );
}

export type InlineParenthesesInput = {
  /** The expression the fixer emits. */
  replacement: TSESTree.Expression;
  /** The node whose range the emission takes over. */
  replaced: TSESTree.Node;
  /** The exact text the fixer would emit, unparenthesised. */
  text: string;
  /** The source the replacement lands in, for the seams around it. */
  sourceText: string;
};

export function requiresParenthesesInline({
  replacement,
  replaced,
  text,
  sourceText,
}: InlineParenthesesInput): boolean {
  const parent = replaced.parent;

  if (precedenceOf(replacement) < requiredPrecedenceAt(replaced)) {
    return true;
  }

  if (parent && mixesCoalesceWithLogical(parent, replacement)) {
    return true;
  }

  if (parent && prettierWritesParentheses(replacement, replaced, parent)) {
    return true;
  }

  // An `in` operator inside a `for` header belongs to the loop, not to the
  // expression that was written with it.
  if (containsInOperator(replacement) && isInsideForInitializer(replaced)) {
    return true;
  }

  if (
    (parent?.type === AST_NODE_TYPES.ExpressionStatement ||
      parent?.type === AST_NODE_TYPES.ExportDefaultDeclaration) &&
    isStatementStartHazard(replacement, text, parent.type)
  ) {
    return true;
  }

  const before = sourceText.slice(
    Math.max(0, replaced.range[0] - 1),
    replaced.range[0],
  );
  const after = sourceText.slice(replaced.range[1], replaced.range[1] + 1);
  return (
    fusesWithNeighbour(before, text.slice(0, 1)) ||
    fusesWithNeighbour(text.slice(-1), after)
  );
}

/**
 * Whether the node occupies a restricted production, where a line terminator
 * beside it ends the construct through automatic semicolon insertion instead of
 * being ignored as whitespace.
 *
 * This is the one place where parentheses around an inlined expression carry
 * meaning rather than formatting. A fixer emitting a carried comment on its own
 * line puts a terminator in the middle of what it writes; bare after `return`,
 * ASI closes the statement at the comment, so the function hands back
 * `undefined` and the expression it was written to produce becomes dead code
 * (#1963). A postfix `++` reads the same way from the other side: a terminator
 * between the operand and the operator splits them into two statements.
 *
 * `yield*` tolerates a terminator after its `*`, and is treated as restricted
 * regardless, because the cost of a redundant pair here is formatting and the
 * cost of a missing one is a silent change of value.
 */
export function isRestrictedProduction(node: TSESTree.Node): boolean {
  const parent = node.parent;
  if (!parent) {
    return false;
  }
  switch (parent.type) {
    case AST_NODE_TYPES.ReturnStatement:
    case AST_NODE_TYPES.ThrowStatement:
    case AST_NODE_TYPES.YieldExpression:
      return parent.argument === node;
    case AST_NODE_TYPES.UpdateExpression:
      return !parent.prefix && parent.argument === node;
    default:
      return false;
  }
}

import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'flattenPushCalls';

type PushCallStatement = {
  statement: TSESTree.ExpressionStatement;
  call: TSESTree.CallExpression;
  targetKey: string;
  calleeText: string;
};

const PUSH_METHOD_NAME = 'push';

/**
 * Prettier collapses an argument list that fits its print width, so a merged
 * call emitted one-argument-per-line below this column count is rewritten the
 * moment the formatter runs. Matching the default width keeps the fix
 * canonical.
 */
const PRINT_WIDTH = 80;

function getRangeStart(
  node: TSESTree.Node,
  sourceCode: TSESLint.SourceCode,
): number {
  return node.range?.[0] ?? sourceCode.getIndexFromLoc(node.loc.start);
}

function getRangeEnd(
  node: TSESTree.Node,
  sourceCode: TSESLint.SourceCode,
): number {
  return node.range?.[1] ?? sourceCode.getIndexFromLoc(node.loc.end);
}

function unwrapExpression(
  expression: TSESTree.Expression,
): TSESTree.Expression {
  let current: TSESTree.Expression = expression;

  /**
   * Peel off harmless wrappers to compare the underlying array identity
   * (e.g., arr!.push(), arr as Foo, (arr).push()).
   */
  while (true) {
    if (current.type === AST_NODE_TYPES.TSNonNullExpression) {
      current = current.expression;
      continue;
    }

    if (
      current.type === AST_NODE_TYPES.TSAsExpression ||
      current.type === AST_NODE_TYPES.TSTypeAssertion ||
      current.type === AST_NODE_TYPES.TSInstantiationExpression ||
      current.type === AST_NODE_TYPES.TSSatisfiesExpression
    ) {
      current = current.expression as TSESTree.Expression;
      continue;
    }

    if (current.type === AST_NODE_TYPES.ChainExpression) {
      current = (current as TSESTree.ChainExpression)
        .expression as TSESTree.Expression;
      continue;
    }

    break;
  }

  return current;
}

function getPropertyKey(
  property: TSESTree.Expression | TSESTree.PrivateIdentifier,
  computed: boolean,
): string | null {
  if (!computed && property.type === AST_NODE_TYPES.Identifier) {
    return property.name;
  }

  if (property.type === AST_NODE_TYPES.Literal) {
    const value =
      typeof property.value === 'string' || typeof property.value === 'number'
        ? property.value
        : null;
    return value !== null ? String(value) : null;
  }

  return null;
}

function getCalleeRange(
  call: TSESTree.CallExpression,
  sourceCode: TSESLint.SourceCode,
): TSESTree.Range {
  const calleeStart = getRangeStart(call.callee, sourceCode);
  const calleeEnd = call.typeParameters
    ? getRangeEnd(call.typeParameters, sourceCode)
    : getRangeEnd(call.callee, sourceCode);

  return [calleeStart, calleeEnd];
}

function getCalleeWithTypeParams(
  call: TSESTree.CallExpression,
  sourceCode: TSESLint.SourceCode,
): string {
  const [calleeStart, calleeEnd] = getCalleeRange(call, sourceCode);
  return sourceCode.text.slice(calleeStart, calleeEnd);
}

function getPreferredCallee(group: PushCallStatement[]): PushCallStatement {
  const withTypeParams = group.find((entry) => entry.call.typeParameters);
  return withTypeParams ?? group[0];
}

/**
 * Locates the parentheses that delimit the argument list. The opening token
 * cannot be derived from the first argument because a parenthesized argument
 * would yield its own wrapper paren instead.
 */
function getArgumentListParens(
  call: TSESTree.CallExpression,
  sourceCode: TSESLint.SourceCode,
): { openParen: TSESTree.Token; closeParen: TSESTree.Token } | null {
  const anchor = call.typeParameters ?? call.callee;
  const openParen = sourceCode.getTokenAfter(anchor, {
    filter: (token) =>
      token.type === AST_TOKEN_TYPES.Punctuator && token.value === '(',
  });
  const closeParen = sourceCode.getLastToken(call);

  if (!openParen || !closeParen || closeParen.value !== ')') return null;

  return { openParen, closeParen };
}

function getExpressionIdentity(expression: TSESTree.Expression): string | null {
  const node = unwrapExpression(expression);

  switch (node.type) {
    case AST_NODE_TYPES.Identifier:
      return `id:${node.name}`;
    case AST_NODE_TYPES.ThisExpression:
      return 'this';
    case AST_NODE_TYPES.Super:
      return 'super';
    case AST_NODE_TYPES.Literal:
      if (typeof node.value === 'string' || typeof node.value === 'number') {
        return `lit:${String(node.value)}`;
      }
      return null;
    case AST_NODE_TYPES.MemberExpression: {
      if (node.property.type === AST_NODE_TYPES.PrivateIdentifier) return null;
      const objectKey = getExpressionIdentity(
        node.object as TSESTree.Expression,
      );
      const propertyKey = getPropertyKey(node.property, Boolean(node.computed));
      if (!objectKey || !propertyKey) return null;
      return `${objectKey}.${propertyKey}`;
    }
    default:
      return null;
  }
}

function isSafeMemberChain(expression: TSESTree.Expression): boolean {
  const node = unwrapExpression(expression);

  if (
    node.type === AST_NODE_TYPES.Identifier ||
    node.type === AST_NODE_TYPES.ThisExpression ||
    node.type === AST_NODE_TYPES.Super
  ) {
    return true;
  }

  if (node.type === AST_NODE_TYPES.MemberExpression) {
    if (node.property.type === AST_NODE_TYPES.PrivateIdentifier) {
      return false;
    }

    if (node.computed || node.property.type !== AST_NODE_TYPES.Identifier) {
      return false;
    }

    return isSafeMemberChain(node.object as TSESTree.Expression);
  }

  return false;
}

function hasForbiddenSideEffects(
  node: TSESTree.Node | null | undefined,
): boolean {
  if (!node) return false;

  const astNodeType = (node as { type: string }).type;
  if (astNodeType === 'ParenthesizedExpression') {
    return hasForbiddenSideEffects(
      (node as { expression: TSESTree.Expression }).expression,
    );
  }

  switch (node.type) {
    case AST_NODE_TYPES.Identifier:
    case AST_NODE_TYPES.Literal:
    case AST_NODE_TYPES.ThisExpression:
    case AST_NODE_TYPES.Super:
      return false;
    case AST_NODE_TYPES.CallExpression:
    case AST_NODE_TYPES.NewExpression:
    case AST_NODE_TYPES.UpdateExpression:
    case AST_NODE_TYPES.AwaitExpression:
    case AST_NODE_TYPES.YieldExpression:
    case AST_NODE_TYPES.TaggedTemplateExpression:
    case AST_NODE_TYPES.ImportExpression:
    case AST_NODE_TYPES.AssignmentExpression:
      return true;
    case AST_NODE_TYPES.UnaryExpression:
      if (node.operator === 'delete') return true;
      return hasForbiddenSideEffects(node.argument);
    case AST_NODE_TYPES.BinaryExpression:
    case AST_NODE_TYPES.LogicalExpression:
      return (
        hasForbiddenSideEffects(node.left) ||
        hasForbiddenSideEffects(node.right)
      );
    case AST_NODE_TYPES.ConditionalExpression:
      return (
        hasForbiddenSideEffects(node.test) ||
        hasForbiddenSideEffects(node.consequent) ||
        hasForbiddenSideEffects(node.alternate)
      );
    case AST_NODE_TYPES.MemberExpression:
      return (
        hasForbiddenSideEffects(node.object as TSESTree.Node) ||
        (node.computed &&
          hasForbiddenSideEffects(node.property as TSESTree.Node))
      );
    case AST_NODE_TYPES.ChainExpression:
      return hasForbiddenSideEffects(node.expression);
    case AST_NODE_TYPES.SequenceExpression:
      return node.expressions.some((expr) => hasForbiddenSideEffects(expr));
    case AST_NODE_TYPES.TemplateLiteral:
      return node.expressions.some((expr) => hasForbiddenSideEffects(expr));
    case AST_NODE_TYPES.ArrayExpression:
      return node.elements.some((elem) =>
        elem ? hasForbiddenSideEffects(elem as TSESTree.Node) : false,
      );
    case AST_NODE_TYPES.ObjectExpression:
      return node.properties.some((prop) => {
        if (prop.type === AST_NODE_TYPES.Property) {
          return (
            (prop.computed &&
              hasForbiddenSideEffects(prop.key as TSESTree.Node)) ||
            hasForbiddenSideEffects(prop.value as TSESTree.Node)
          );
        }
        if (prop.type === AST_NODE_TYPES.SpreadElement) {
          return hasForbiddenSideEffects(prop.argument);
        }
        return false;
      });
    case AST_NODE_TYPES.SpreadElement:
      return hasForbiddenSideEffects(node.argument);
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
    case AST_NODE_TYPES.TSNonNullExpression:
    case AST_NODE_TYPES.TSInstantiationExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
      return hasForbiddenSideEffects(node.expression);
    default:
      return false;
  }
}

function canSafelyFix(group: PushCallStatement[]): boolean {
  return group.every((entry) => {
    const callee = entry.call.callee as TSESTree.MemberExpression;
    if (
      callee.property.type === AST_NODE_TYPES.PrivateIdentifier ||
      callee.computed ||
      callee.property.type !== AST_NODE_TYPES.Identifier
    ) {
      return false;
    }

    if (!isSafeMemberChain(callee.object as TSESTree.Expression)) {
      return false;
    }

    if (hasForbiddenSideEffects(callee.object as TSESTree.Node)) {
      return false;
    }

    return entry.call.arguments.every((arg) => {
      if (arg.type === AST_NODE_TYPES.SpreadElement) {
        return !hasForbiddenSideEffects(arg.argument);
      }

      return !hasForbiddenSideEffects(arg);
    });
  });
}

/**
 * `Array.prototype.push` is variadic, so merging consecutive appends onto one
 * array preserves meaning. A method named `push` on any other receiver need not
 * be: Next.js's `Router.push(url, as, options)` and react-router's
 * `history.push(path, state)` are POSITIONAL, so folding two navigations into
 * one call performs a single navigation with the address bar masked by the
 * second argument. The merge is therefore gated on syntactic evidence that the
 * receiver is an array, and stays silent without it — a missed consolidation
 * costs far less than a fix that changes what the code does.
 */
const ARRAY_TYPE_NAMES = new Set(['Array', 'ReadonlyArray']);
const ARRAY_FACTORY_METHODS = new Set(['from', 'of']);
const ARRAY_RETURNING_METHODS = new Set([
  'map',
  'filter',
  'slice',
  'concat',
  'split',
]);
/** Hooks whose array type argument describes the binding they hand back. */
const ARRAY_STATE_HOOKS = new Set(['useState', 'useRef']);

type FunctionNode =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

function isFunctionNode(node: TSESTree.Node): node is FunctionNode {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

function isArrayTypeNode(node: TSESTree.TypeNode | undefined): boolean {
  if (!node) return false;

  switch (node.type) {
    case AST_NODE_TYPES.TSArrayType:
    case AST_NODE_TYPES.TSTupleType:
      return true;
    case AST_NODE_TYPES.TSTypeReference:
      return (
        node.typeName.type === AST_NODE_TYPES.Identifier &&
        ARRAY_TYPE_NAMES.has(node.typeName.name)
      );
    case AST_NODE_TYPES.TSTypeOperator:
      return (
        node.operator === 'readonly' && isArrayTypeNode(node.typeAnnotation)
      );
    /** A union counts only when every member is an array, so `T[] | undefined`
     * — whose `push` can be absent — does not. */
    case AST_NODE_TYPES.TSUnionType:
      return node.types.every((member) => isArrayTypeNode(member));
    default:
      return false;
  }
}

function isArrayAnnotation(
  annotation: TSESTree.TSTypeAnnotation | undefined,
): boolean {
  return isArrayTypeNode(annotation?.typeAnnotation);
}

function hasArrayTypeArgument(call: TSESTree.CallExpression): boolean {
  return isArrayTypeNode(call.typeParameters?.params[0]);
}

function getCalleeName(call: TSESTree.CallExpression): string | null {
  const callee = unwrapExpression(call.callee as TSESTree.Expression);

  if (callee.type === AST_NODE_TYPES.Identifier) return callee.name;

  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return callee.property.name;
  }

  return null;
}

function isArrayStateHookCall(
  expression: TSESTree.Expression | null | undefined,
): boolean {
  if (!expression) return false;

  const node = unwrapExpression(expression);
  if (node.type !== AST_NODE_TYPES.CallExpression) return false;

  const name = getCalleeName(node);
  return (
    name !== null && ARRAY_STATE_HOOKS.has(name) && hasArrayTypeArgument(node)
  );
}

/**
 * A call whose RESULT is an array. The state hooks are deliberately absent:
 * `useRef<T[]>()` hands back a ref object and `useState<T[]>()` a tuple, so
 * only the destructured head of that tuple is an array.
 */
function isArrayProducingCall(call: TSESTree.CallExpression): boolean {
  const callee = unwrapExpression(call.callee as TSESTree.Expression);
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    callee.property.type !== AST_NODE_TYPES.Identifier
  ) {
    return false;
  }

  const object = unwrapExpression(callee.object as TSESTree.Expression);
  if (object.type === AST_NODE_TYPES.Identifier && object.name === 'Array') {
    return ARRAY_FACTORY_METHODS.has(callee.property.name);
  }

  return ARRAY_RETURNING_METHODS.has(callee.property.name);
}

function isArrayInitializer(
  expression: TSESTree.Expression | null | undefined,
): boolean {
  if (!expression) return false;

  const node = unwrapExpression(expression);

  switch (node.type) {
    case AST_NODE_TYPES.ArrayExpression:
      return true;
    case AST_NODE_TYPES.NewExpression:
      return (
        node.callee.type === AST_NODE_TYPES.Identifier &&
        node.callee.name === 'Array'
      );
    case AST_NODE_TYPES.CallExpression:
      return isArrayProducingCall(node);
    default:
      return false;
  }
}

function isArrayDeclarator(
  declarator: TSESTree.VariableDeclarator,
  name: TSESTree.Identifier,
): boolean {
  if (declarator.id === name) {
    return isArrayInitializer(declarator.init);
  }

  /**
   * The head of a `useState<T[]>()` / `useRef<T[]>()` tuple holds the array
   * itself. Every other destructured binding holds an ELEMENT of whatever was
   * destructured, which says nothing about the binding.
   */
  return (
    declarator.id.type === AST_NODE_TYPES.ArrayPattern &&
    declarator.id.elements[0] === name &&
    isArrayStateHookCall(declarator.init)
  );
}

function isArrayParameterElement(
  param: TSESTree.Parameter,
  name: TSESTree.Identifier,
): boolean {
  switch (param.type) {
    case AST_NODE_TYPES.AssignmentPattern:
      return param.left === name && isArrayInitializer(param.right);
    /** A rest parameter binds an array by construction. */
    case AST_NODE_TYPES.RestElement:
      return param.argument === name;
    case AST_NODE_TYPES.TSParameterProperty:
      return isArrayParameterElement(param.parameter, name);
    default:
      return false;
  }
}

function isArrayParameter(
  fn: FunctionNode,
  name: TSESTree.Identifier,
): boolean {
  return fn.params.some((param) => isArrayParameterElement(param, name));
}

function hasDefinitionArrayEvidence(def: TSESLint.Scope.Definition): boolean {
  const name = def.name;
  /** A binding introduced by anything but a plain name carries no annotation. */
  if (name.type !== AST_NODE_TYPES.Identifier) return false;

  if (isArrayAnnotation(name.typeAnnotation)) return true;

  if (def.node.type === AST_NODE_TYPES.VariableDeclarator) {
    return isArrayDeclarator(def.node, name);
  }

  return isFunctionNode(def.node) && isArrayParameter(def.node, name);
}

function isArrayParameterProperty(
  param: TSESTree.TSParameterProperty,
  name: string,
): boolean {
  const binding =
    param.parameter.type === AST_NODE_TYPES.AssignmentPattern
      ? param.parameter.left
      : param.parameter;

  if (binding.type !== AST_NODE_TYPES.Identifier || binding.name !== name) {
    return false;
  }

  return (
    isArrayAnnotation(binding.typeAnnotation) ||
    (param.parameter.type === AST_NODE_TYPES.AssignmentPattern &&
      isArrayInitializer(param.parameter.right))
  );
}

function hasClassPropertyArrayEvidence(
  classBody: TSESTree.ClassBody,
  name: string,
): boolean {
  return classBody.body.some((member) => {
    if (member.type === AST_NODE_TYPES.PropertyDefinition) {
      if (getPropertyKey(member.key, Boolean(member.computed)) !== name) {
        return false;
      }
      return (
        isArrayAnnotation(member.typeAnnotation) ||
        isArrayInitializer(member.value)
      );
    }

    if (
      member.type === AST_NODE_TYPES.MethodDefinition &&
      member.kind === 'constructor'
    ) {
      return member.value.params.some(
        (param) =>
          param.type === AST_NODE_TYPES.TSParameterProperty &&
          isArrayParameterProperty(param, name),
      );
    }

    return false;
  });
}

/**
 * The class whose fields describe `this` at this position. A plain function
 * rebinds `this` to whatever calls it, so fields declared around it say nothing
 * about the receiver; an arrow function keeps the lexical `this`, and a method's
 * own function expression is the class's.
 */
function findEnclosingClassBody(
  node: TSESTree.Node,
): TSESTree.ClassBody | null {
  let current: TSESTree.Node | undefined = node.parent;

  while (current) {
    if (current.type === AST_NODE_TYPES.ClassBody) return current;

    if (current.type === AST_NODE_TYPES.FunctionDeclaration) return null;

    if (current.type === AST_NODE_TYPES.FunctionExpression) {
      const owner = current.parent;
      const isClassMember =
        owner !== undefined &&
        (owner.type === AST_NODE_TYPES.MethodDefinition ||
          owner.type === AST_NODE_TYPES.PropertyDefinition);
      if (!isClassMember) return null;
    }

    current = current.parent;
  }

  return null;
}

function isPushCallStatement(
  statement: TSESTree.Statement,
  sourceCode: TSESLint.SourceCode,
): PushCallStatement | null {
  if (statement.type !== AST_NODE_TYPES.ExpressionStatement) return null;

  const expr = statement.expression;
  if (expr.type !== AST_NODE_TYPES.CallExpression) return null;

  if (expr.optional) return null;
  const callee = expr.callee;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.optional ||
    callee.property.type === AST_NODE_TYPES.PrivateIdentifier
  ) {
    return null;
  }

  const propertyName =
    callee.property.type === AST_NODE_TYPES.Identifier
      ? callee.property.name
      : callee.property.type === AST_NODE_TYPES.Literal
      ? callee.property.value
      : null;

  if (propertyName !== PUSH_METHOD_NAME) return null;

  const targetKey = getExpressionIdentity(callee.object as TSESTree.Expression);
  if (!targetKey) return null;

  return {
    statement,
    call: expr,
    targetKey,
    calleeText: getCalleeWithTypeParams(expr, sourceCode),
  };
}

function getLineIndent(
  targetNode: TSESTree.Node,
  sourceCode: TSESLint.SourceCode,
): string {
  const start = getRangeStart(targetNode, sourceCode);
  const text = sourceCode.text;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const indentMatch = text.slice(lineStart, start).match(/^[\t ]*/u);
  return indentMatch ? indentMatch[0] : '';
}

function normalizeIndentation(text: string): string {
  const lines = text.split('\n');
  const indents = lines
    .slice(1)
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^[\t ]*/u)?.[0].length ?? 0);

  const minIndent = indents.length > 0 ? Math.min(...indents) : 0;
  if (minIndent === 0) return text;

  return [
    lines[0],
    ...lines
      .slice(1)
      .map((line) => line.slice(Math.min(minIndent, line.length))),
  ].join('\n');
}

function indentText(text: string, indent: string): string {
  const normalized = normalizeIndentation(text);
  return normalized
    .split('\n')
    .map((line) => indent + line)
    .join('\n');
}

function indentComment(text: string, indent: string): string {
  const normalized = normalizeIndentation(text).split('\n');
  if (normalized.length === 1) return `${indent}${normalized[0]}`;

  const continuationLines = normalized.slice(1);
  const meaningfulLines = continuationLines.filter(
    (line) => line.trim().length > 0,
  );
  /**
   * Block comments conventionally align their continuation asterisks one column
   * past the opening slash, so keep that alignment when re-indenting.
   */
  const isStarAligned =
    meaningfulLines.length > 0 &&
    meaningfulLines.every((line) => line.trim().startsWith('*'));
  const continuationIndent = isStarAligned ? `${indent} ` : indent;

  return [
    `${indent}${normalized[0]}`,
    ...continuationLines.map((line) => `${continuationIndent}${line}`),
  ].join('\n');
}

function formatComments(
  comments: TSESTree.Comment[],
  indent: string,
  sourceCode: TSESLint.SourceCode,
): string[] {
  return comments.map((comment) =>
    indentComment(sourceCode.getText(comment), indent),
  );
}

function getLeadingCommentsBetween(
  sourceCode: TSESLint.SourceCode,
  previousStatement: TSESTree.Statement,
  current: TSESTree.Statement,
): TSESTree.Comment[] {
  const previousEnd = getRangeEnd(previousStatement, sourceCode);
  return sourceCode
    .getCommentsBefore(current)
    .filter((comment) => comment.range[0] >= previousEnd);
}

export const flattenPushCalls = createRule<[], MessageIds>({
  name: 'flatten-push-calls',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Consolidate consecutive push calls on the same array into a single push with multiple arguments.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      flattenPushCalls: [
        'What’s wrong: "{{target}}" is pushed to using multiple consecutive ".push(...)" calls.',
        'Why it matters: repeated calls add property-access overhead and obscure that these values belong to one append operation.',
        'How to fix: merge them into a single ".push(...)" call with multiple arguments (for example, "{{target}}.push(a, b, c)").',
      ].join(' '),
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();

    /**
     * Evidence is cached per binding rather than per receiver expression, so a
     * long run of pushes onto one array resolves its declaration once.
     */
    const evidenceByVariable = new Map<TSESLint.Scope.Variable, boolean>();
    const evidenceByClassProperty = new Map<string, boolean>();
    let variablesByReference: Map<
      TSESTree.Node,
      TSESLint.Scope.Variable | null
    > | null = null;

    /**
     * Resolution runs off the scope manager's own reference list rather than
     * the scope of the visited node: `Program` yields the global scope, whose
     * chain does not reach the module scope a top-level `const` lives in.
     */
    function resolveReference(
      identifier: TSESTree.Identifier,
    ): TSESLint.Scope.Variable | null {
      if (!variablesByReference) {
        const resolved = new Map<
          TSESTree.Node,
          TSESLint.Scope.Variable | null
        >();
        sourceCode.scopeManager?.scopes.forEach((scope) => {
          scope.references.forEach((reference) => {
            resolved.set(reference.identifier, reference.resolved);
          });
        });
        variablesByReference = resolved;
      }

      return variablesByReference.get(identifier) ?? null;
    }

    function hasVariableArrayEvidence(
      variable: TSESLint.Scope.Variable,
    ): boolean {
      const cached = evidenceByVariable.get(variable);
      if (cached !== undefined) return cached;

      const evidence = variable.defs.some((def) =>
        hasDefinitionArrayEvidence(def),
      );
      evidenceByVariable.set(variable, evidence);
      return evidence;
    }

    function hasThisPropertyArrayEvidence(
      receiver: TSESTree.MemberExpression,
    ): boolean {
      const name = getPropertyKey(
        receiver.property,
        Boolean(receiver.computed),
      );
      if (name === null) return false;

      const classBody = findEnclosingClassBody(receiver);
      if (!classBody) return false;

      const key = `${classBody.range[0]}:${name}`;
      const cached = evidenceByClassProperty.get(key);
      if (cached !== undefined) return cached;

      const evidence = hasClassPropertyArrayEvidence(classBody, name);
      evidenceByClassProperty.set(key, evidence);
      return evidence;
    }

    /**
     * Whether the receiver is syntactically an array. Anything the source does
     * not describe — an unresolved name, a member chain, a call result — counts
     * as no evidence, which keeps the rule silent rather than guessing.
     */
    function hasArrayReceiverEvidence(receiver: TSESTree.Expression): boolean {
      const node = unwrapExpression(receiver);

      if (node.type === AST_NODE_TYPES.ArrayExpression) return true;

      if (node.type === AST_NODE_TYPES.Identifier) {
        const variable = resolveReference(node);
        return variable !== null && hasVariableArrayEvidence(variable);
      }

      if (
        node.type === AST_NODE_TYPES.MemberExpression &&
        unwrapExpression(node.object as TSESTree.Expression).type ===
          AST_NODE_TYPES.ThisExpression
      ) {
        return hasThisPropertyArrayEvidence(node);
      }

      return false;
    }

    /**
     * An argument together with the comments that sit immediately around it
     * inside the argument list, so the merged call can carry them along.
     */
    type ArgumentChunk = {
      leading: TSESTree.Comment[];
      trailing: TSESTree.Comment[];
      text: string;
      range: TSESTree.Range;
      endLine: number;
    };

    type PushSegment = {
      /** Comments that belong on their own line ahead of the next argument. */
      comments: TSESTree.Comment[];
      chunks: ArgumentChunk[];
    };

    /** An argument rendered with its comments split around the separating comma. */
    type RenderedArgument = {
      body: string;
      beforeComma: string;
      afterComma: string;
    };

    function buildChunks(call: TSESTree.CallExpression): ArgumentChunk[] {
      return call.arguments.map((arg) => ({
        leading: sourceCode.getCommentsBefore(arg),
        trailing: sourceCode.getCommentsAfter(arg),
        text: sourceCode.getText(arg),
        range: arg.range,
        endLine: arg.loc.end.line,
      }));
    }

    function buildSegments(group: PushCallStatement[]): PushSegment[] | null {
      const segments: PushSegment[] = [];

      for (let index = 0; index < group.length; index++) {
        const entry = group[index];
        const parens = getArgumentListParens(entry.call, sourceCode);
        if (!parens) return null;

        const previousStatement = index > 0 ? group[index - 1].statement : null;
        const interstitialComments =
          previousStatement === null
            ? []
            : getLeadingCommentsBetween(
                sourceCode,
                previousStatement,
                entry.statement,
              );
        /**
         * An argument-less call contributes no argument to anchor its comments,
         * so they float forward to the next argument instead.
         */
        const emptyCallComments =
          entry.call.arguments.length === 0
            ? sourceCode
                .getCommentsInside(entry.call)
                .filter(
                  (comment) => comment.range[0] >= parens.openParen.range[1],
                )
            : [];

        segments.push({
          comments: [...interstitialComments, ...emptyCallComments],
          chunks: buildChunks(entry.call),
        });
      }

      return segments;
    }

    /**
     * Comments that the merged call cannot host — for instance one wedged
     * between the callee and its argument list — would be destroyed by the fix,
     * so the violation is reported without one.
     */
    function findUnhostableComments(
      group: PushCallStatement[],
      segments: PushSegment[],
      calleeRange: TSESTree.Range,
    ): TSESTree.Comment[] {
      const groupStart = group[0].statement.range[0];
      const groupEnd = group[group.length - 1].statement.range[1];
      const carried = new Set<TSESTree.Comment>();
      const preservedRanges: TSESTree.Range[] = [calleeRange];

      segments.forEach((segment) => {
        segment.comments.forEach((comment) => carried.add(comment));
        segment.chunks.forEach((chunk) => {
          chunk.leading.forEach((comment) => carried.add(comment));
          chunk.trailing.forEach((comment) => carried.add(comment));
          preservedRanges.push(chunk.range);
        });
      });

      return sourceCode.getAllComments().filter((comment) => {
        if (comment.range[0] < groupStart || comment.range[1] > groupEnd) {
          return false;
        }
        if (carried.has(comment)) return false;
        return !preservedRanges.some(
          (range) =>
            comment.range[0] >= range[0] && comment.range[1] <= range[1],
        );
      });
    }

    /**
     * A comment survives a collapse onto one line only as a single-line block
     * comment: a line comment would swallow the rest of the call, and a block
     * comment carrying newlines keeps the list broken either way.
     */
    function isInlineSafeComment(comment: TSESTree.Comment): boolean {
      return (
        comment.type === AST_TOKEN_TYPES.Block &&
        !sourceCode.getText(comment).includes('\n')
      );
    }

    function collectComments(segments: PushSegment[]): TSESTree.Comment[] {
      return segments.flatMap((segment) => [
        ...segment.comments,
        ...segment.chunks.flatMap((chunk) => [
          ...chunk.leading,
          ...chunk.trailing,
        ]),
      ]);
    }

    function canRenderSingleLine(segments: PushSegment[]): boolean {
      const hasMultilineArgument = segments.some((segment) =>
        segment.chunks.some((chunk) => chunk.text.includes('\n')),
      );
      if (hasMultilineArgument) return false;

      return collectComments(segments).every(isInlineSafeComment);
    }

    function renderSingleLineArguments(segments: PushSegment[]): string {
      const parts: string[] = [];
      let pendingComments: string[] = [];

      segments.forEach((segment) => {
        pendingComments = pendingComments.concat(
          segment.comments.map((comment) => sourceCode.getText(comment)),
        );

        segment.chunks.forEach((chunk) => {
          const rendered = [
            ...pendingComments,
            ...chunk.leading.map((comment) => sourceCode.getText(comment)),
            chunk.text,
            ...chunk.trailing.map((comment) => sourceCode.getText(comment)),
          ];
          pendingComments = [];
          parts.push(rendered.join(' '));
        });
      });

      /**
       * Comments trailing the final argument have no following argument to lead,
       * so they ride along behind it.
       */
      if (pendingComments.length > 0 && parts.length > 0) {
        parts[parts.length - 1] = [parts[parts.length - 1], ...pendingComments]
          .join(' ')
          .trimEnd();
      }

      return parts.join(', ');
    }

    function detectSemicolon(
      first: PushCallStatement,
      last: PushCallStatement,
    ): boolean {
      return (
        sourceCode.getLastToken(last.statement)?.value === ';' ||
        sourceCode.getLastToken(first.statement)?.value === ';'
      );
    }

    /**
     * A comment sharing the argument's line stays glued to the argument ahead of
     * the separating comma, mirroring how prettier prints one — except for a
     * line comment, which has to follow the comma or it would comment it out.
     */
    function formatTrailingComments(
      chunk: ArgumentChunk,
      argumentIndent: string,
    ): Pick<RenderedArgument, 'beforeComma' | 'afterComma'> {
      let previousLine = chunk.endLine;
      let beforeComma = '';
      const afterComma: string[] = [];

      chunk.trailing.forEach((comment) => {
        const text = sourceCode.getText(comment);
        const sharesLine = comment.loc.start.line === previousLine;
        previousLine = comment.loc.end.line;

        if (sharesLine && isInlineSafeComment(comment)) {
          beforeComma += ` ${text}`;
          return;
        }

        afterComma.push(
          sharesLine ? ` ${text}` : `\n${indentComment(text, argumentIndent)}`,
        );
      });

      return { beforeComma, afterComma: afterComma.join('') };
    }

    function formatMultilineArguments(
      segments: PushSegment[],
      argumentIndent: string,
    ): RenderedArgument[] {
      const renderedArguments: RenderedArgument[] = [];
      let pendingComments: string[] = [];

      segments.forEach((segment) => {
        pendingComments = pendingComments.concat(
          formatComments(segment.comments, argumentIndent, sourceCode),
        );

        segment.chunks.forEach((chunk) => {
          const bodyLines = [
            ...pendingComments,
            ...formatComments(chunk.leading, argumentIndent, sourceCode),
            indentText(chunk.text, argumentIndent),
          ];
          pendingComments = [];

          renderedArguments.push({
            body: bodyLines.join('\n'),
            ...formatTrailingComments(chunk, argumentIndent),
          });
        });
      });

      return attachTrailingComments(renderedArguments, pendingComments);
    }

    function attachTrailingComments(
      renderedArguments: RenderedArgument[],
      pendingComments: string[],
    ): RenderedArgument[] {
      if (pendingComments.length === 0 || renderedArguments.length === 0) {
        return renderedArguments;
      }

      const lastIndex = renderedArguments.length - 1;
      const last = renderedArguments[lastIndex];
      renderedArguments[lastIndex] = {
        ...last,
        afterComma: `${last.afterComma}\n${pendingComments.join('\n')}`,
      };

      return renderedArguments;
    }

    /**
     * Every argument keeps a comma, the last one included: prettier writes a
     * trailing comma into any argument list it breaks across lines.
     */
    function buildMultilineReplacement(
      calleeText: string,
      renderedArguments: RenderedArgument[],
      baseIndent: string,
      hasSemicolon: boolean,
    ): string {
      const argsText = renderedArguments
        .map(
          (argument) =>
            `${argument.body}${argument.beforeComma},${argument.afterComma}`,
        )
        .join('\n');

      return `${calleeText}(\n${argsText}\n${baseIndent})${
        hasSemicolon ? ';' : ''
      }`;
    }

    function buildSingleLineReplacement(
      calleeText: string,
      segments: PushSegment[],
      hasSemicolon: boolean,
    ): string {
      return `${calleeText}(${renderSingleLineArguments(segments)})${
        hasSemicolon ? ';' : ''
      }`;
    }

    function buildReplacement(group: PushCallStatement[]): string | null {
      const first = group[0];
      const last = group[group.length - 1];
      const preferredCallee = getPreferredCallee(group);

      const segments = buildSegments(group);
      if (!segments) return null;

      const unhostableComments = findUnhostableComments(
        group,
        segments,
        getCalleeRange(preferredCallee.call, sourceCode),
      );
      if (unhostableComments.length > 0) return null;

      const hasSemicolon = detectSemicolon(first, last);
      const singleLine = canRenderSingleLine(segments)
        ? buildSingleLineReplacement(
            preferredCallee.calleeText,
            segments,
            hasSemicolon,
          )
        : null;
      /**
       * The call starts at its own column rather than at the line indent, so a
       * statement sharing a line (a `case` clause, say) is measured where it
       * actually sits.
       */
      const startColumn = first.statement.loc.start.column;

      const baseIndent = getLineIndent(first.statement, sourceCode);
      const argumentIndent = `${baseIndent}  `;

      const replacement =
        singleLine !== null && startColumn + singleLine.length <= PRINT_WIDTH
          ? singleLine
          : buildMultilineReplacement(
              preferredCallee.calleeText,
              formatMultilineArguments(segments, argumentIndent),
              baseIndent,
              hasSemicolon,
            );

      const currentText = sourceCode
        .getText()
        .slice(first.statement.range[0], last.statement.range[1]);

      return currentText === replacement ? null : replacement;
    }

    function findConsecutivePushGroup(
      statements: TSESTree.Statement[],
      startIndex: number,
      firstInfo: PushCallStatement,
    ): { group: PushCallStatement[]; nextIndex: number } {
      const group: PushCallStatement[] = [firstInfo];
      let cursor = startIndex + 1;

      while (cursor < statements.length) {
        const next = isPushCallStatement(statements[cursor], sourceCode);
        if (!next || next.targetKey !== firstInfo.targetKey) break;
        group.push(next);
        cursor += 1;
      }

      return { group, nextIndex: cursor };
    }

    function shouldReportViolation(group: PushCallStatement[]): boolean {
      if (group.length <= 1) return false;

      const totalArgs = group.reduce(
        (count, entry) => count + entry.call.arguments.length,
        0,
      );

      const firstArgs = group[0].call.arguments.length;
      if (totalArgs <= firstArgs || !canSafelyFix(group)) return false;

      const receiver = (group[0].call.callee as TSESTree.MemberExpression)
        .object as TSESTree.Expression;
      return hasArrayReceiverEvidence(receiver);
    }

    function reportViolation(group: PushCallStatement[]): void {
      context.report({
        node: group[0].call.callee,
        messageId: 'flattenPushCalls',
        data: {
          target: sourceCode.getText(
            (group[0].call.callee as TSESTree.MemberExpression).object,
          ),
        },
        fix(fixer) {
          const replacement = buildReplacement(group);
          if (!replacement) return null;
          return fixer.replaceTextRange(
            [
              group[0].statement.range[0],
              group[group.length - 1].statement.range[1],
            ],
            replacement,
          );
        },
      });
    }

    function checkStatements(statements: TSESTree.Statement[]): void {
      for (let i = 0; i < statements.length; i++) {
        const info = isPushCallStatement(statements[i], sourceCode);
        if (!info) continue;

        const { group, nextIndex } = findConsecutivePushGroup(
          statements,
          i,
          info,
        );

        if (shouldReportViolation(group)) {
          reportViolation(group);
        }

        i = nextIndex - 1;
      }
    }

    return {
      Program(node) {
        checkStatements(node.body);
      },
      BlockStatement(node) {
        checkStatements(node.body);
      },
      SwitchCase(node) {
        checkStatements(node.consequent);
      },
    };
  },
});

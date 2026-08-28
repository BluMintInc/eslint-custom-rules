import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'nonBooleanReturn';
type Options = [
  {
    prefixes?: string[];
  },
];

const DEFAULT_PREFIXES = ['is', 'has', 'should'];

function unwrapTypeNode(node: TSESTree.TypeNode): TSESTree.TypeNode {
  let current:
    | TSESTree.TypeNode
    | (TSESTree.TypeNode & { typeAnnotation?: TSESTree.TypeNode }) = node;
  while (
    (current as any).type === 'TSParenthesizedType' &&
    (current as any).typeAnnotation
  ) {
    current = (current as any).typeAnnotation as TSESTree.TypeNode;
  }
  return current;
}

/**
 * Expression wrappers that restate a type and leave the runtime value alone.
 *
 * `isExpressionBooleanLike` already reaches through these in the RETURN
 * position (#1606, #1829); the naming site asks the same question one node
 * higher, so `const isReady = (() => 'yes') as P` is the very function
 * `const isReady = () => 'yes'` declares and must answer for it (#2176).
 */
const TYPE_ONLY_EXPRESSION_WRAPPERS = new Set<string>([
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSTypeAssertion,
]);

type TypeOnlyExpressionWrapper =
  | TSESTree.TSAsExpression
  | TSESTree.TSSatisfiesExpression
  | TSESTree.TSNonNullExpression
  | TSESTree.TSTypeAssertion;

function isTypeOnlyExpressionWrapper(
  node: TSESTree.Node,
): node is TypeOnlyExpressionWrapper {
  return TYPE_ONLY_EXPRESSION_WRAPPERS.has(node.type);
}

/**
 * Descends to the value a name is actually bound to. Wrappers nest
 * (`(fn as unknown) as P`), so one unwrap is not enough.
 *
 * Parentheses need no handling of their own: the parser records them in token
 * ranges rather than as a node, so `(() => 'yes')` already arrives here as the
 * arrow function itself.
 */
function unwrapTypeOnlyExpression<T extends TSESTree.Node>(
  node: T,
): T | TSESTree.Expression {
  let current: T | TSESTree.Expression = node;
  while (isTypeOnlyExpressionWrapper(current)) {
    current = current.expression;
  }
  return current;
}

/**
 * Climbs to the node that gives a function its name, stepping over the
 * type-only wrappers that sit between the two.
 *
 * The climb only crosses a wrapper whose asserted operand is the node beneath,
 * so a construct that merely *contains* a function — `(fn as P) || fallback`
 * hands the name a value that may not be the function at all — still stops it.
 */
function nameBearingParentOf(node: TSESTree.Node): TSESTree.Node | undefined {
  let child: TSESTree.Node = node;
  let parent = child.parent;
  while (
    parent &&
    isTypeOnlyExpressionWrapper(parent) &&
    parent.expression === child
  ) {
    child = parent;
    parent = child.parent;
  }
  return parent;
}

function isUppercaseLetter(char: string): boolean {
  return char >= 'A' && char <= 'Z';
}

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

function startsWithBooleanPrefix(name: string, prefixes: string[]): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  for (const prefix of prefixes) {
    const p = prefix.toLowerCase();
    if (lower.startsWith(p)) {
      if (name.length === p.length) return true; // edge: exact match like "is"
      const next = name[p.length];
      if (isUppercaseLetter(next) || next === '_' || isDigit(next)) {
        return true;
      }
    }
  }
  return false;
}

function isTsBooleanLike(typeNode: TSESTree.TypeNode | undefined): boolean {
  if (!typeNode) return false;

  typeNode = unwrapTypeNode(typeNode);

  if (typeNode.type === AST_NODE_TYPES.TSBooleanKeyword) return true;

  if (
    typeNode.type === AST_NODE_TYPES.TSLiteralType &&
    typeof (typeNode.literal as { value?: unknown }).value === 'boolean'
  ) {
    return true;
  }

  const isBooleanishUnionMember = (
    t: TSESTree.TypeNode,
  ): t is TSESTree.TypeNode => {
    const unwrapped = unwrapTypeNode(t);
    return (
      unwrapped.type === AST_NODE_TYPES.TSBooleanKeyword ||
      (unwrapped.type === AST_NODE_TYPES.TSLiteralType &&
        typeof (unwrapped.literal as { value?: unknown }).value ===
          'boolean') ||
      unwrapped.type === AST_NODE_TYPES.TSUndefinedKeyword ||
      unwrapped.type === AST_NODE_TYPES.TSNullKeyword ||
      unwrapped.type === AST_NODE_TYPES.TSVoidKeyword
    );
  };

  // Allow unions like boolean | undefined | null | void
  if (typeNode.type === AST_NODE_TYPES.TSUnionType) {
    return typeNode.types.every((t) => isBooleanishUnionMember(t));
  }

  // Promise<boolean> (or Promise<boolean | undefined | null>)
  if (
    typeNode.type === AST_NODE_TYPES.TSTypeReference &&
    typeNode.typeName.type === AST_NODE_TYPES.Identifier &&
    typeNode.typeName.name === 'Promise' &&
    typeNode.typeParameters?.params?.length
  ) {
    const inner = typeNode.typeParameters.params[0] as
      | TSESTree.TypeNode
      | undefined;
    if (!inner) return false;
    const resolvedInner = unwrapTypeNode(inner);
    if (isBooleanishUnionMember(resolvedInner)) return true;
    const innerType: any = resolvedInner;
    if (
      innerType.type === AST_NODE_TYPES.TSUnionType &&
      Array.isArray(innerType.types) &&
      innerType.types.every((t: TSESTree.TypeNode) =>
        isBooleanishUnionMember(t),
      )
    ) {
      return true;
    }
  }

  return false;
}

function isExpressionBooleanLike(
  expr: TSESTree.Expression,
): boolean | 'non' | 'unknown' {
  switch (expr.type) {
    // Assertion wrappers restate a type but never change the runtime value, so
    // the expression beneath one still decides what the function returns
    // (#1606). Recursing per level rather than unwrapping the whole chain at
    // once is what lets a boolean declared at any level answer first, and it
    // reaches through nesting such as `({...} as const)!`.
    // `enforce-object-literal-as-const` ships in the same recommended config
    // and appends `as const` to returned object literals by `--fix`, so
    // without this the plugin's own fixer silences the report.
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
      // A declared boolean-like type is the same promise an explicit return
      // annotation makes, which the rule already accepts; `as const` names no
      // type at all and falls through to the asserted expression.
      if (isTsBooleanLike(expr.typeAnnotation)) return true;
      return isExpressionBooleanLike(expr.expression);
    case AST_NODE_TYPES.TSNonNullExpression:
      return isExpressionBooleanLike(expr.expression);
    // `a?.b` wraps the access in a ChainExpression, which only records that the
    // access short-circuits — the value still comes from the node beneath, as
    // with the assertion wrappers above (#1829). Nothing here is a carve-out for
    // optional chains: `arr?.length` is `number | undefined`, a worse instance
    // of the misleading prefix than the `number` that `arr.length` reports.
    case AST_NODE_TYPES.ChainExpression:
      return isExpressionBooleanLike(expr.expression);
    case AST_NODE_TYPES.Literal:
      return typeof expr.value === 'boolean' ? true : 'non';
    case AST_NODE_TYPES.TemplateLiteral:
      return 'non';
    case AST_NODE_TYPES.ObjectExpression:
    case AST_NODE_TYPES.ArrayExpression:
    case AST_NODE_TYPES.NewExpression:
    case AST_NODE_TYPES.ClassExpression:
    case AST_NODE_TYPES.FunctionExpression:
    case AST_NODE_TYPES.ArrowFunctionExpression:
      return 'non';
    case AST_NODE_TYPES.UnaryExpression:
      if (expr.operator === '!') return true; // !x or !!x
      if (expr.operator === 'void') return 'non';
      return 'unknown';
    case AST_NODE_TYPES.BinaryExpression: {
      const cmp = ['===', '!==', '==', '!=', '>', '<', '>=', '<='];
      return cmp.includes(expr.operator) ? true : 'unknown';
    }
    case AST_NODE_TYPES.LogicalExpression:
      // && and || often return non-boolean operands; don't infer true
      return 'unknown';
    case AST_NODE_TYPES.MemberExpression: {
      if (
        expr.property.type === AST_NODE_TYPES.Identifier &&
        expr.property.name === 'length'
      ) {
        return 'non';
      }
      return 'unknown';
    }
    case AST_NODE_TYPES.ConditionalExpression: {
      const cons = isExpressionBooleanLike(expr.consequent);
      const alt = isExpressionBooleanLike(expr.alternate);
      if (cons === true && alt === true) return true;
      if (cons === 'non' || alt === 'non') return 'non';
      return 'unknown';
    }
    case AST_NODE_TYPES.CallExpression: {
      if (
        expr.callee.type === AST_NODE_TYPES.Identifier &&
        expr.callee.name === 'Boolean'
      ) {
        return true;
      }
      return 'unknown';
    }
    case AST_NODE_TYPES.Identifier:
      if (expr.name === 'undefined') return 'non';
      return 'unknown';
    case AST_NODE_TYPES.AwaitExpression:
      return 'unknown';
    default:
      return 'unknown';
  }
}

function getReturnTypeNode(
  node: TSESTree.FunctionLike,
): TSESTree.TypeNode | undefined {
  if (node.returnType?.typeAnnotation) return node.returnType.typeAnnotation;
  return undefined;
}

function hasTypePredicate(node: TSESTree.FunctionLike): boolean {
  return (
    node.returnType?.typeAnnotation?.type === AST_NODE_TYPES.TSTypePredicate
  );
}

function collectReturnExpressions(
  fn: TSESTree.FunctionLike,
): TSESTree.Expression[] {
  const results: TSESTree.Expression[] = [];
  const visited = new Set<TSESTree.Node>();

  function visit(n: TSESTree.Node | null | undefined) {
    if (!n || visited.has(n)) return;
    visited.add(n);

    // Do not traverse into nested functions/classes
    if (
      n.type === AST_NODE_TYPES.FunctionDeclaration ||
      n.type === AST_NODE_TYPES.FunctionExpression ||
      n.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      n.type === AST_NODE_TYPES.ClassDeclaration ||
      n.type === AST_NODE_TYPES.ClassExpression
    ) {
      if (n === fn) {
        // traverse this function's body
        // continue
      } else {
        return;
      }
    }

    if (n.type === AST_NODE_TYPES.ReturnStatement) {
      if (n.argument && n.argument.type) {
        results.push(n.argument as TSESTree.Expression);
      } else {
        // return; without value
        // Represent as Identifier 'undefined' to treat as non-boolean
        // We won't push undefined, but handle later by a flag
        (results as any).noValueReturn = true;
      }
    }

    for (const key of Object.keys(n)) {
      if (key === 'parent' || key === 'range' || key === 'loc') continue;
      const value: any = (n as any)[key];
      if (!value) continue;
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === 'object' && 'type' in child)
            visit(child);
        }
      } else if (value && typeof value === 'object' && 'type' in value) {
        visit(value);
      }
    }
  }

  if (fn.type === AST_NODE_TYPES.ArrowFunctionExpression && fn.expression) {
    // expression-bodied arrow function: synthesize a return
    const bodyExpr = fn.body as TSESTree.Expression;
    results.push(bodyExpr);
    return results;
  }

  if (fn.body && fn.body.type === AST_NODE_TYPES.BlockStatement) visit(fn.body);
  return results;
}

export const noMisleadingBooleanPrefixes = createRule<Options, MessageIds>({
  name: 'no-misleading-boolean-prefixes',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Reserve boolean-style prefixes (is/has/should) for functions that actually return boolean values to avoid misleading call sites.',
      recommended: 'error',
    },
    schema: [
      {
        type: 'object',
        properties: {
          prefixes: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      nonBooleanReturn:
        'Function "{{name}}" uses a boolean-style prefix but its return value is not guaranteed to be boolean. Boolean prefixes promise a yes/no answer; returning strings, objects, or void misleads callers and hides incorrect branching. Return a real boolean (e.g., add an explicit comparison or Boolean(...)) or rename the function to drop the boolean-style prefix (prefixes treated as boolean: {{prefixes}}).',
    },
  },
  defaultOptions: [{ prefixes: DEFAULT_PREFIXES }],
  create(context, [options]) {
    const prefixes = (options && options.prefixes) || DEFAULT_PREFIXES;

    function shouldCheckName(name: string): boolean {
      return startsWithBooleanPrefix(name, prefixes);
    }

    function report(node: TSESTree.Node, name: string) {
      context.report({
        node,
        messageId: 'nonBooleanReturn',
        data: { name, prefixes: prefixes.join(', ') },
      });
    }

    function checkFunctionLike(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression,
      name: string,
      reportNode: TSESTree.Node,
    ) {
      if (!shouldCheckName(name)) return;

      // Type predicate allows boolean-like
      if (hasTypePredicate(node)) return;

      const typeNode = getReturnTypeNode(node);
      if (typeNode) {
        if (isTsBooleanLike(typeNode)) return;
        // Explicit non-boolean annotation
        report(reportNode, name);
        return;
      }

      const returns = collectReturnExpressions(node);
      const noValueReturn = (returns as any).noValueReturn === true;
      if (noValueReturn) {
        report(reportNode, name);
        return;
      }

      if (returns.length === 0) {
        // No returns implies void
        report(reportNode, name);
        return;
      }

      for (const expr of returns) {
        const kind = isExpressionBooleanLike(expr);
        if (kind === 'non') {
          report(reportNode, name);
          return;
        }
      }
      // If we can't determine it's non-boolean, do not report to avoid false positives
    }

    /**
     * Judges a class field only when it holds a function literal.
     *
     * Each gate excludes a member that makes no return-value promise, so none of
     * them is conservatism for its own sake: a data field (`isDone = false`,
     * `hasItems = compute()`) is a value rather than a callable contract, a
     * computed key names a variable instead of the member a caller writes, and a
     * `declare`, definite-assignment or abstract field carries no initializer
     * whose returns could be read.
     */
    function checkClassProperty(
      node: TSESTree.PropertyDefinition | TSESTree.TSAbstractPropertyDefinition,
    ) {
      if (node.computed || node.declare) return;
      if (node.key.type !== AST_NODE_TYPES.Identifier) return;
      const value = node.value && unwrapTypeOnlyExpression(node.value);
      if (
        !value ||
        (value.type !== AST_NODE_TYPES.FunctionExpression &&
          value.type !== AST_NODE_TYPES.ArrowFunctionExpression)
      ) {
        return;
      }
      checkFunctionLike(value, node.key.name, node.key);
    }

    return {
      FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
        if (!node.id) return;
        checkFunctionLike(node, node.id.name, node.id);
      },
      FunctionExpression(node: TSESTree.FunctionExpression) {
        // Every gate below reads the name-bearing parent rather than the
        // syntactic one, so a type-only wrapper cannot detach the function from
        // its name — nor let two arms claim the same member (#2176).
        const parent = nameBearingParentOf(node);
        // Prefer variable declarator or method/property name
        if (
          parent?.type === AST_NODE_TYPES.VariableDeclarator &&
          parent.id.type === AST_NODE_TYPES.Identifier
        ) {
          checkFunctionLike(node, parent.id.name, parent.id);
          return;
        }
        // If part of a property or method, let dedicated visitors handle it to avoid duplicates
        if (parent?.type === AST_NODE_TYPES.Property) return;
        if (parent?.type === AST_NODE_TYPES.MethodDefinition) return;
        // A named function expression assigned to a class field carries two
        // names — its own `id` and the field's key — and the field key is the
        // one every call site writes. Without this bail-out the class-member
        // arm below and the `node.id` fallback both fire on the same site.
        if (parent?.type === AST_NODE_TYPES.PropertyDefinition) return;
        if (node.id) {
          checkFunctionLike(node, node.id.name, node.id);
        }
      },
      ArrowFunctionExpression(node: TSESTree.ArrowFunctionExpression) {
        const parent = nameBearingParentOf(node);
        if (
          parent?.type === AST_NODE_TYPES.VariableDeclarator &&
          parent.id.type === AST_NODE_TYPES.Identifier
        ) {
          checkFunctionLike(node, parent.id.name, parent.id);
          return;
        }
        // If part of a property, let the Property visitor handle it to avoid duplicates
        if (parent?.type === AST_NODE_TYPES.Property) return;
      },
      MethodDefinition(node: TSESTree.MethodDefinition) {
        if (node.key.type !== AST_NODE_TYPES.Identifier) return;
        const name = node.key.name;
        const fn = node.value;
        if (fn.type === AST_NODE_TYPES.TSEmptyBodyFunctionExpression) return;
        checkFunctionLike(fn, name, node.key);
      },
      Property(node: TSESTree.Property) {
        if (node.key.type !== AST_NODE_TYPES.Identifier) return;
        const value = unwrapTypeOnlyExpression(node.value);
        if (
          value.type === AST_NODE_TYPES.FunctionExpression ||
          value.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          checkFunctionLike(value, node.key.name, node.key);
        }
      },
      // A class field holding a function is a function everywhere it matters:
      // `instance.isReady()` reads the same whether the member was written as a
      // method or as `isReady = () => ...`, so the boolean prefix makes the same
      // promise to the same call sites. Keying the class arm on `MethodDefinition`
      // alone let a single `=` silence the rule (#2155), and the bound-property
      // spelling is what an interface demanding a bound member forces.
      //
      // `TSAbstractPropertyDefinition` is registered beside it so the class arm
      // subscribes to every key a field declaration can parse as, matching the
      // inverse boolean-naming rule in the same recommended config. An abstract
      // field parses with no initializer, so the value gate leaves that arm
      // silent — the key is here to keep the two spellings from drifting apart.
      PropertyDefinition: checkClassProperty,
      TSAbstractPropertyDefinition: checkClassProperty,
    };
  },
});

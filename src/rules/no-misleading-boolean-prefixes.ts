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
        'Reserve boolean-style prefixes (is/has/should) for functions that actually return boolean values.',
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
        'Function "{{name}}" uses a boolean-style prefix but does not return a boolean value.',
    },
  },
  defaultOptions: [{ prefixes: DEFAULT_PREFIXES }],
  create(context, [options]) {
    const prefixes = (options && options.prefixes) || DEFAULT_PREFIXES;

    function shouldCheckName(name: string): boolean {
      return startsWithBooleanPrefix(name, prefixes);
    }

    function report(node: TSESTree.Node, name: string) {
      context.report({ node, messageId: 'nonBooleanReturn', data: { name } });
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

    return {
      FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
        if (!node.id) return;
        checkFunctionLike(node, node.id.name, node.id);
      },
      FunctionExpression(node: TSESTree.FunctionExpression) {
        // Prefer variable declarator or method/property name
        if (
          node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
          node.parent.id.type === AST_NODE_TYPES.Identifier
        ) {
          checkFunctionLike(node, node.parent.id.name, node.parent.id);
          return;
        }
        // If part of a property or method, let dedicated visitors handle it to avoid duplicates
        if (node.parent?.type === AST_NODE_TYPES.Property) return;
        if (node.parent?.type === AST_NODE_TYPES.MethodDefinition) return;
        if (node.id) {
          checkFunctionLike(node, node.id.name, node.id);
        }
      },
      ArrowFunctionExpression(node: TSESTree.ArrowFunctionExpression) {
        if (
          node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
          node.parent.id.type === AST_NODE_TYPES.Identifier
        ) {
          checkFunctionLike(node, node.parent.id.name, node.parent.id);
          return;
        }
        // If part of a property, let the Property visitor handle it to avoid duplicates
        if (node.parent?.type === AST_NODE_TYPES.Property) return;
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
        if (
          node.value.type === AST_NODE_TYPES.FunctionExpression ||
          node.value.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          checkFunctionLike(node.value, node.key.name, node.key);
        }
      },
    };
  },
});

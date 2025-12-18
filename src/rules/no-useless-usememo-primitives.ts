import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { classifyExpressionType as classifyExpressionTypeTs } from '../utils/tsTypeClassifier';

type Options = [
  {
    ignoreCallExpressions?: boolean;
    ignoreSymbol?: boolean;
    tsOnly?: boolean;
  },
];

type MessageIds = 'uselessUseMemoPrimitive';

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

    function classifyExpressionType(expr: TSESTree.Expression) {
      if (!checker || !tsModule || !parserServices) {
        return { status: 'unknown' as const, kind: 'primitive value' };
      }

      return classifyExpressionTypeTs(expr, {
        checker,
        tsModule,
        parserServices,
        options,
      });
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

        const typeEvaluation = classifyExpressionType(returnedExpression);
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

        context.report({
          node,
          messageId: 'uselessUseMemoPrimitive',
          data: {
            valueKind,
          },
          fix(fixer) {
            const replacement = `(${sourceCode.getText(returnedExpression)})`;
            return fixer.replaceText(node, replacement);
          },
        });
      },
    };
  },
});

export default noUselessUsememoPrimitives;

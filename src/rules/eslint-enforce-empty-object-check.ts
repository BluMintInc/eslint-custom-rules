import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
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

const BOOLEAN_PREFIXES = ['is', 'has', 'can', 'should', 'was', 'were', 'will', 'did'];

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

function nameLooksObjectLike(name: string, patterns: Set<string>): boolean {
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
  return (type.flags & ts.TypeFlags.Any) !== 0 || (type.flags & ts.TypeFlags.Unknown) !== 0;
}

function hasRequiredProperties(type: ts.Type, checker: ts.TypeChecker): boolean {
  const properties = checker.getPropertiesOfType(type);
  return properties.some((property) => (property.getFlags() & ts.SymbolFlags.Optional) === 0);
}

function isObjectLikeType(type: ts.Type, checker: ts.TypeChecker): 'object' | 'non-object' | 'unknown' {
  if (type.isUnion()) {
    let hasObject = false;
    for (const part of type.types) {
      if (isNonObjectPrimitive(part)) {
        return 'non-object';
      }
      if (isNullableType(part)) {
        continue;
      }

      const analysis = isObjectLikeType(part, checker);
      if (analysis === 'non-object') {
        return 'non-object';
      }
      if (analysis === 'object') {
        hasObject = true;
      }
    }
    return hasObject ? 'object' : 'unknown';
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

  if (hasRequiredProperties(type, checker)) {
    return 'non-object';
  }

  return 'object';
}

function isObjectKeysLengthExpression(node: TSESTree.Node, name: string): boolean {
  if (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    node.property.type === AST_NODE_TYPES.Identifier &&
    node.property.name === 'length' &&
    node.object.type === AST_NODE_TYPES.CallExpression &&
    node.object.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.object.callee.computed &&
    node.object.callee.object.type === AST_NODE_TYPES.Identifier &&
    node.object.callee.object.name === 'Object' &&
    node.object.callee.property.type === AST_NODE_TYPES.Identifier &&
    node.object.callee.property.name === 'keys' &&
    node.object.arguments.length === 1 &&
    node.object.arguments[0].type === AST_NODE_TYPES.Identifier &&
    node.object.arguments[0].name === name
  ) {
    return true;
  }
  return false;
}

function isZeroLiteral(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Literal && node.value === 0;
}

function isLengthZeroComparison(node: TSESTree.BinaryExpression, name: string): boolean {
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
        conditionHasEmptyCheck(node.left, name, emptyCheckFunctions, negationDepth) ||
        conditionHasEmptyCheck(node.right, name, emptyCheckFunctions, negationDepth)
      );
    case AST_NODE_TYPES.BinaryExpression:
      if (isLengthZeroComparison(node, name)) {
        return negationDepth % 2 === 0;
      }
      return (
        conditionHasEmptyCheck(node.left, name, emptyCheckFunctions, negationDepth) ||
        conditionHasEmptyCheck(node.right, name, emptyCheckFunctions, negationDepth)
      );
    case AST_NODE_TYPES.UnaryExpression:
      if (node.operator === '!') {
        return conditionHasEmptyCheck(node.argument, name, emptyCheckFunctions, negationDepth + 1);
      }
      return conditionHasEmptyCheck(node.argument, name, emptyCheckFunctions, negationDepth);
    case AST_NODE_TYPES.CallExpression: {
      const callee = node.callee;
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
        conditionHasEmptyCheck(callee, name, emptyCheckFunctions, negationDepth) ||
        node.arguments.some((argument) =>
          conditionHasEmptyCheck(argument, name, emptyCheckFunctions, negationDepth),
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
      return conditionHasEmptyCheck(node.object, name, emptyCheckFunctions, negationDepth);
    case AST_NODE_TYPES.ConditionalExpression:
      return (
        conditionHasEmptyCheck(node.test, name, emptyCheckFunctions, negationDepth) ||
        conditionHasEmptyCheck(node.consequent, name, emptyCheckFunctions, negationDepth) ||
        conditionHasEmptyCheck(node.alternate, name, emptyCheckFunctions, negationDepth)
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

function getRootCondition(node: TSESTree.Node): TSESTree.Expression | null {
  let current: TSESTree.Node | undefined = node;
  while (current && current.parent) {
    const parent = current.parent;
    if (
      (parent.type === AST_NODE_TYPES.IfStatement && parent.test === current) ||
      (parent.type === AST_NODE_TYPES.WhileStatement && parent.test === current) ||
      (parent.type === AST_NODE_TYPES.DoWhileStatement && parent.test === current) ||
      (parent.type === AST_NODE_TYPES.ForStatement && parent.test === current) ||
      (parent.type === AST_NODE_TYPES.ConditionalExpression && parent.test === current)
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

export const eslintEnforceEmptyObjectCheck: TSESLint.RuleModule<MessageIds, Options> =
  createRule({
    name: 'eslint-enforce-empty-object-check',
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
      const { objectNamePattern = [], ignoreInLoops = false, emptyCheckFunctions = [] } = options;

      const patternSet: Set<string> = new Set([...DEFAULT_OBJECT_SUFFIXES, ...objectNamePattern]);
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
            // Fall back to naming heuristic when type lookup fails
          }
        }
        return nameLooksObjectLike(identifier.name, patternSet);
      }

      function reportNegation(node: TSESTree.UnaryExpression, identifier: TSESTree.Identifier) {
        if (processedNegations.has(node)) {
          return;
        }
        processedNegations.add(node);

        if (ignoreInLoops && isInsideLoop(node)) {
          return;
        }

        const conditionRoot = getRootCondition(node);
        if (conditionRoot && conditionHasEmptyCheck(conditionRoot, identifier.name, emptyCheckFunctionsSet)) {
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
            const replacement = `(${node.operator}${identifierText} || Object.keys(${identifierText}).length === 0)`;
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

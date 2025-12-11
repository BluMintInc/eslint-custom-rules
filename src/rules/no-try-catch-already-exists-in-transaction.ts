import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noAlreadyExistsCatchInTransaction';

type CatchContext = {
  errorAliases: Set<string>;
  codeAliases: Set<string>;
};

const ALREADY_EXISTS_STRINGS = new Set(['already-exists', 'ALREADY_EXISTS']);
const ALREADY_EXISTS_NUMBERS = new Set([6, '6']);

function unwrapChainExpression(
  expression: TSESTree.LeftHandSideExpression | TSESTree.ChainExpression,
): TSESTree.LeftHandSideExpression {
  if (expression.type === AST_NODE_TYPES.ChainExpression) {
    return expression.expression as TSESTree.LeftHandSideExpression;
  }
  return expression;
}

function isRunTransactionCall(node: TSESTree.CallExpression): boolean {
  const callee = unwrapChainExpression(node.callee);

  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === 'runTransaction';
  }

  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    const property = callee.property;
    return (
      !callee.computed &&
      property.type === AST_NODE_TYPES.Identifier &&
      property.name === 'runTransaction'
    );
  }

  return false;
}

function getCallbackArgument(
  args: TSESTree.CallExpressionArgument[],
): TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | null {
  for (const arg of args) {
    if (
      arg.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      arg.type === AST_NODE_TYPES.FunctionExpression
    ) {
      return arg;
    }
  }
  return null;
}

function isErrorAliasExpression(
  expression: TSESTree.Expression | TSESTree.PrivateIdentifier,
  context: CatchContext,
): boolean {
  if (expression.type === AST_NODE_TYPES.Identifier) {
    return context.errorAliases.has(expression.name);
  }

  if (
    expression.type === AST_NODE_TYPES.TSAsExpression ||
    expression.type === AST_NODE_TYPES.TSTypeAssertion
  ) {
    return isErrorAliasExpression(expression.expression, context);
  }

  if (expression.type === AST_NODE_TYPES.MemberExpression) {
    return isErrorAliasExpression(expression.object, context);
  }

  if (expression.type === AST_NODE_TYPES.ChainExpression) {
    return isErrorAliasExpression(expression.expression, context);
  }

  return false;
}

function isCodeProperty(
  property: TSESTree.Expression | TSESTree.PrivateIdentifier,
) {
  if (property.type === AST_NODE_TYPES.Identifier) {
    return property.name === 'code';
  }
  if (property.type === AST_NODE_TYPES.Literal) {
    return property.value === 'code';
  }
  return false;
}

function isErrorCodeExpression(
  expression: TSESTree.Expression | TSESTree.PrivateIdentifier | null,
  context: CatchContext,
): boolean {
  if (!expression) {
    return false;
  }

  if (expression.type === AST_NODE_TYPES.Identifier) {
    return context.codeAliases.has(expression.name);
  }

  const unwrapped =
    expression.type === AST_NODE_TYPES.ChainExpression
      ? expression.expression
      : expression;

  if (unwrapped.type === AST_NODE_TYPES.MemberExpression) {
    return (
      isCodeProperty(unwrapped.property) &&
      isErrorAliasExpression(unwrapped.object, context)
    );
  }

  return false;
}

function isAlreadyExistsLiteral(
  expression: TSESTree.Expression | TSESTree.PrivateIdentifier | null,
): string | null {
  if (!expression) {
    return null;
  }

  if (expression.type === AST_NODE_TYPES.PrivateIdentifier) {
    return null;
  }

  if (expression.type === AST_NODE_TYPES.Literal) {
    if (ALREADY_EXISTS_STRINGS.has(`${expression.value}`)) {
      return `${expression.value}`;
    }
    if (ALREADY_EXISTS_NUMBERS.has(expression.value as number | string)) {
      return `${expression.value}`;
    }
  }

  if (
    expression.type === AST_NODE_TYPES.TemplateLiteral &&
    expression.expressions.length === 0 &&
    expression.quasis.length === 1
  ) {
    const raw = expression.quasis[0].value.cooked;
    if (raw && ALREADY_EXISTS_STRINGS.has(raw)) {
      return raw;
    }
  }

  return null;
}

function isAlreadyExistsComparison(
  expression: TSESTree.Expression,
  context: CatchContext,
): string | null {
  if (expression.type !== AST_NODE_TYPES.BinaryExpression) {
    return null;
  }

  if (!['==', '==='].includes(expression.operator)) {
    return null;
  }

  const leftLiteral = isAlreadyExistsLiteral(expression.left);
  const rightLiteral = isAlreadyExistsLiteral(expression.right);

  if (leftLiteral && isErrorCodeExpression(expression.right, context)) {
    return leftLiteral;
  }

  if (rightLiteral && isErrorCodeExpression(expression.left, context)) {
    return rightLiteral;
  }

  return null;
}

function addAliasesFromDeclarator(
  declarator: TSESTree.VariableDeclarator,
  context: CatchContext,
) {
  const init = declarator.init;
  const id = declarator.id;

  const initIsAliasSource =
    !!init &&
    (isErrorAliasExpression(init as TSESTree.Expression, context) ||
      (init.type === AST_NODE_TYPES.AssignmentExpression &&
        isErrorAliasExpression(init.right as TSESTree.Expression, context)));

  if (id.type === AST_NODE_TYPES.Identifier && initIsAliasSource) {
    context.errorAliases.add(id.name);
  }

  if (id.type === AST_NODE_TYPES.ObjectPattern && initIsAliasSource) {
    for (const property of id.properties) {
      if (property.type !== AST_NODE_TYPES.Property) {
        continue;
      }
      const value = property.value;
      if (
        isCodeProperty(property.key as TSESTree.Expression) &&
        value.type === AST_NODE_TYPES.Identifier
      ) {
        context.codeAliases.add(value.name);
      }
    }
  }
}

function containsAlreadyExistsCheck(
  node: TSESTree.Node | null | undefined,
  context: CatchContext,
): string | null {
  if (!node) {
    return null;
  }

  switch (node.type) {
    case AST_NODE_TYPES.BlockStatement: {
      for (const statement of node.body) {
        const found = containsAlreadyExistsCheck(statement, context);
        if (found) return found;
      }
      return null;
    }
    case AST_NODE_TYPES.ExpressionStatement:
      return containsAlreadyExistsCheck(node.expression, context);
    case AST_NODE_TYPES.ReturnStatement:
      return containsAlreadyExistsCheck(node.argument, context);
    case AST_NODE_TYPES.IfStatement: {
      const testMatch = containsAlreadyExistsCheck(node.test, context);
      if (testMatch) return testMatch;
      const consequentMatch = containsAlreadyExistsCheck(
        node.consequent,
        context,
      );
      if (consequentMatch) return consequentMatch;
      return containsAlreadyExistsCheck(node.alternate, context);
    }
    case AST_NODE_TYPES.SwitchStatement: {
      const discriminantIsCode = isErrorCodeExpression(
        node.discriminant as TSESTree.Expression,
        context,
      );
      for (const switchCase of node.cases) {
        const caseLiteral = isAlreadyExistsLiteral(switchCase.test);
        if (discriminantIsCode && caseLiteral) {
          return caseLiteral;
        }
        const found = switchCase.consequent
          .map((stmt) => containsAlreadyExistsCheck(stmt, context))
          .find(Boolean);
        if (found) return found as string;
      }
      return null;
    }
    case AST_NODE_TYPES.VariableDeclaration: {
      for (const declarator of node.declarations) {
        addAliasesFromDeclarator(declarator, context);
        const found = containsAlreadyExistsCheck(declarator.init, context);
        if (found) return found;
      }
      return null;
    }
    case AST_NODE_TYPES.VariableDeclarator:
      addAliasesFromDeclarator(node, context);
      return containsAlreadyExistsCheck(node.init, context);
    case AST_NODE_TYPES.AssignmentExpression:
      if (
        node.left.type === AST_NODE_TYPES.Identifier &&
        isErrorAliasExpression(node.right as TSESTree.Expression, context)
      ) {
        context.errorAliases.add(node.left.name);
      }
      return containsAlreadyExistsCheck(node.right, context);
    case AST_NODE_TYPES.CallExpression:
    case AST_NODE_TYPES.NewExpression: {
      const calleeMatch = containsAlreadyExistsCheck(node.callee, context);
      if (calleeMatch) return calleeMatch;
      for (const arg of node.arguments) {
        const found = containsAlreadyExistsCheck(arg as TSESTree.Node, context);
        if (found) return found;
      }
      return null;
    }
    case AST_NODE_TYPES.LogicalExpression: {
      const leftMatch = containsAlreadyExistsCheck(node.left, context);
      if (leftMatch) return leftMatch;
      return containsAlreadyExistsCheck(node.right, context);
    }
    case AST_NODE_TYPES.BinaryExpression:
      return (
        isAlreadyExistsComparison(node, context) ||
        containsAlreadyExistsCheck(node.left, context) ||
        containsAlreadyExistsCheck(node.right, context)
      );
    case AST_NODE_TYPES.ConditionalExpression: {
      const testMatch = containsAlreadyExistsCheck(node.test, context);
      if (testMatch) return testMatch;
      const consequentMatch = containsAlreadyExistsCheck(
        node.consequent,
        context,
      );
      if (consequentMatch) return consequentMatch;
      return containsAlreadyExistsCheck(node.alternate, context);
    }
    case AST_NODE_TYPES.MemberExpression:
      return containsAlreadyExistsCheck(node.object, context);
    case AST_NODE_TYPES.ChainExpression:
      return containsAlreadyExistsCheck(node.expression, context);
    case AST_NODE_TYPES.AwaitExpression:
    case AST_NODE_TYPES.UnaryExpression:
    case AST_NODE_TYPES.UpdateExpression:
      return containsAlreadyExistsCheck(node.argument, context);
    case AST_NODE_TYPES.TemplateLiteral:
      return null;
    case AST_NODE_TYPES.TryStatement: {
      const blockMatch = containsAlreadyExistsCheck(node.block, context);
      if (blockMatch) return blockMatch;
      const handlerMatch = containsAlreadyExistsCheck(
        node.handler?.body,
        context,
      );
      if (handlerMatch) return handlerMatch;
      return containsAlreadyExistsCheck(node.finalizer, context);
    }
    default:
      return null;
  }
}

function createCatchContext(handler: TSESTree.CatchClause): CatchContext {
  const errorAliases = new Set<string>();
  const codeAliases = new Set<string>();

  const param = handler.param;

  if (param?.type === AST_NODE_TYPES.Identifier) {
    errorAliases.add(param.name);
  } else if (param?.type === AST_NODE_TYPES.ObjectPattern) {
    for (const property of param.properties) {
      if (property.type !== AST_NODE_TYPES.Property) {
        continue;
      }
      const value = property.value;
      if (
        isCodeProperty(property.key as TSESTree.Expression) &&
        value.type === AST_NODE_TYPES.Identifier
      ) {
        codeAliases.add(value.name);
      }
    }
  }

  return { errorAliases, codeAliases };
}

export const noTryCatchAlreadyExistsInTransaction = createRule<[], MessageIds>({
  name: 'no-try-catch-already-exists-in-transaction',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow catching ALREADY_EXISTS errors inside Firestore transaction callbacks',
      recommended: 'error',
    },
    schema: [],
    messages: {
      noAlreadyExistsCatchInTransaction:
        'Do not catch ALREADY_EXISTS ({{codeLiteral}}) inside Firestore transaction callbacks. Firestore retries transaction bodies on contention, so this catch will re-run even though ALREADY_EXISTS is permanent. Move the try/catch outside the transaction or use runCreateForgivenessTransaction so the handler runs once.',
    },
  },
  defaultOptions: [],
  create(context) {
    const transactionBodies = new Set<TSESTree.Node>();

    function isInsideTransaction(node: TSESTree.Node): boolean {
      let current: TSESTree.Node | undefined = node;
      while (current) {
        if (transactionBodies.has(current)) {
          return true;
        }
        current = current.parent as TSESTree.Node | undefined;
      }
      return false;
    }

    return {
      CallExpression(node) {
        if (!isRunTransactionCall(node)) {
          return;
        }

        const callback = getCallbackArgument(node.arguments);
        if (callback && callback.body.type === AST_NODE_TYPES.BlockStatement) {
          transactionBodies.add(callback.body);
        }
      },

      'CallExpression:exit'(node: TSESTree.CallExpression) {
        if (!isRunTransactionCall(node)) {
          return;
        }

        const callback = getCallbackArgument(node.arguments);
        if (callback && callback.body.type === AST_NODE_TYPES.BlockStatement) {
          transactionBodies.delete(callback.body);
        }
      },

      TryStatement(node) {
        if (!isInsideTransaction(node)) {
          return;
        }

        const handler = node.handler;
        if (!handler) {
          return;
        }

        const catchContext = createCatchContext(handler);
        const match = containsAlreadyExistsCheck(handler.body, catchContext);

        if (match) {
          context.report({
            node: handler,
            messageId: 'noAlreadyExistsCatchInTransaction',
            data: { codeLiteral: match },
          });
        }
      },
    };
  },
});

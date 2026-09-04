import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { ASTHelpers } from '../utils/ASTHelpers';
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

type ModuleRoot = {
  /** Leading path segments of the package, e.g. `['@google-cloud']`. */
  packageSegments: string[];
  /** The product segment that follows them. */
  product: string;
};

/**
 * The package surfaces whose `runTransaction` is the Firestore one.
 *
 * The bare name is not unique to Firestore: `firebase/database` exports a
 * `runTransaction` for the Realtime Database, which re-applies its update
 * function locally on conflict and carries no gRPC status codes, so
 * `ALREADY_EXISTS` is not part of its error model and neither remedy this rule
 * offers exists there — `runCreateForgivenessTransaction` is backend-Firestore
 * only. Reporting an RTDB transaction leaves a developer with no way to comply.
 */
const FIRESTORE_MODULE_ROOTS: ModuleRoot[] = [
  { packageSegments: ['firebase'], product: 'firestore' },
  { packageSegments: ['firebase-admin'], product: 'firestore' },
  { packageSegments: ['@firebase'], product: 'firestore' },
  { packageSegments: ['@google-cloud'], product: 'firestore' },
];

/**
 * Split a module source into path segments with any version suffix dropped, so
 * a pinned specifier (`firebase@10/firestore`) reduces to the same root as the
 * plain one. A `@` at the start of a segment marks a scope, not a version.
 */
function moduleSegments(source: string): string[] {
  return source.split('/').map((segment) => {
    const versionIndex = segment.indexOf('@', 1);
    return versionIndex === -1 ? segment : segment.slice(0, versionIndex);
  });
}

/**
 * Match the package root structurally rather than against one spelling: a deep
 * entry point (`firebase/firestore/lite`), a build variant
 * (`@firebase/firestore-compat`) and a pinned version all name the same
 * product, and a trailing segment must not defeat the check.
 */
function isFirestoreModuleSource(source: string): boolean {
  const segments = moduleSegments(source);
  return FIRESTORE_MODULE_ROOTS.some(({ packageSegments, product }) => {
    if (
      !packageSegments.every((segment, index) => segments[index] === segment)
    ) {
      return false;
    }
    const productSegment = segments[packageSegments.length];
    return (
      productSegment === product || !!productSegment?.startsWith(`${product}-`)
    );
  });
}

/**
 * The module `name` is imported from, or null when the file declares the name
 * itself (a local helper, a parameter) or nothing declares it at all.
 */
function importedSourceOf(
  scope: TSESLint.Scope.Scope,
  name: string,
): string | null {
  const variable = ASTHelpers.findVariableInScope(scope, name);
  if (!variable) {
    return null;
  }
  for (const def of variable.defs) {
    const specifier = def.node;
    if (
      specifier.type !== AST_NODE_TYPES.ImportSpecifier &&
      specifier.type !== AST_NODE_TYPES.ImportDefaultSpecifier &&
      specifier.type !== AST_NODE_TYPES.ImportNamespaceSpecifier
    ) {
      continue;
    }
    const declaration = specifier.parent;
    if (
      declaration?.type !== AST_NODE_TYPES.ImportDeclaration ||
      typeof declaration.source.value !== 'string'
    ) {
      continue;
    }
    return declaration.source.value;
  }
  return null;
}

/**
 * The identifier whose binding carries the call's provenance: the callee for
 * `runTransaction(...)`, and the root of the member chain for
 * `database.runTransaction(...)`, since the receiver is what an import names
 * and the property alone matches every `<anything>.runTransaction`.
 */
function provenanceIdentifier(
  callee: TSESTree.LeftHandSideExpression,
): TSESTree.Identifier | null {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee;
  }

  let current: TSESTree.Node = callee;
  while (
    current.type === AST_NODE_TYPES.MemberExpression ||
    current.type === AST_NODE_TYPES.ChainExpression ||
    current.type === AST_NODE_TYPES.TSNonNullExpression
  ) {
    current =
      current.type === AST_NODE_TYPES.MemberExpression
        ? current.object
        : current.expression;
  }

  return current.type === AST_NODE_TYPES.Identifier ? current : null;
}

/**
 * Whether a `runTransaction` call is the Firestore one this rule speaks about.
 *
 * The gate speaks only when it knows: a binding that resolves to an import is
 * judged by its module source, and anything else — a bare call, a parameter, a
 * local helper, a member call on an unresolvable receiver — keeps the rule's
 * posture of reporting, since a name with no traceable origin is far more often
 * Firestore (`db.runTransaction(...)`) than not.
 */
function isFirestoreTransactionCall(
  node: TSESTree.CallExpression,
  context: Readonly<TSESLint.RuleContext<string, readonly unknown[]>>,
): boolean {
  if (!isRunTransactionCall(node)) {
    return false;
  }

  const carrier = provenanceIdentifier(unwrapChainExpression(node.callee));
  if (!carrier) {
    return true;
  }

  const source = importedSourceOf(
    ASTHelpers.getScope(context, node),
    carrier.name,
  );
  if (source === null) {
    return true;
  }

  return isFirestoreModuleSource(source);
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
        if (!isFirestoreTransactionCall(node, context)) {
          return;
        }

        const callback = getCallbackArgument(node.arguments);
        if (callback && callback.body.type === AST_NODE_TYPES.BlockStatement) {
          transactionBodies.add(callback.body);
        }
      },

      'CallExpression:exit'(node: TSESTree.CallExpression) {
        if (!isFirestoreTransactionCall(node, context)) {
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

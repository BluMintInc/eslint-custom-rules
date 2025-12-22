import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

const ON_REQUEST_MODULE = 'functions/src/v2/https/onRequest';
const HTTPS_ERROR_IMPORT_PATH = 'functions/src/util/errors/HttpsError';

type FunctionNode =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

type MessageIds =
  | 'useHttpsErrorForStatus'
  | 'useHttpsErrorForComputedStatus'
  | 'useHttpsErrorForWrapper';

type ViolationKind = 'status' | 'computedStatus' | 'wrapper';

type PotentialViolation = {
  node: TSESTree.Node;
  functionNode: FunctionNode;
  responseName: string;
  kind: ViolationKind;
  statusCode: number | null;
  method: string;
  messageExample: string;
  calleeName?: string;
};

const isFunctionLike = (node: TSESTree.Node | null): node is FunctionNode =>
  !!node &&
  (node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression);

const isIdentifierWithName = (
  node: TSESTree.Node | null | undefined,
  name: string,
): node is TSESTree.Identifier =>
  !!node && node.type === AST_NODE_TYPES.Identifier && node.name === name;

const unwrapTypedExpression = (
  expression: TSESTree.Expression,
): TSESTree.Expression => {
  let current: TSESTree.Expression = expression;

  while (
    current.type === AST_NODE_TYPES.TSAsExpression ||
    current.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    current.type === AST_NODE_TYPES.TSTypeAssertion ||
    current.type === AST_NODE_TYPES.TSNonNullExpression
  ) {
    current = current.expression;
  }

  return current;
};

const getResponseParamNames = (node: FunctionNode): string[] => {
  const extractName = (param: TSESTree.Parameter): string | null => {
    if (param.type === AST_NODE_TYPES.Identifier) {
      return param.name;
    }
    if (
      param.type === AST_NODE_TYPES.AssignmentPattern &&
      param.left.type === AST_NODE_TYPES.Identifier
    ) {
      return param.left.name;
    }
    if (
      param.type === AST_NODE_TYPES.RestElement &&
      param.argument.type === AST_NODE_TYPES.Identifier
    ) {
      return param.argument.name;
    }
    return null;
  };

  return node.params.reduce<string[]>((acc, param, index) => {
    const name = extractName(param);
    if (!name) return acc;

    const lowered = name.toLowerCase();
    const likelyResponse =
      lowered === 'res' || lowered === 'response' || lowered === 'resp';

    // In typical Express handlers, the response param is the second argument (req, res),
    // so we treat the second parameter as a likely response name even if it doesn't match
    // 'res', 'response', or 'resp'.
    if (likelyResponse || index === 1) {
      acc.push(name);
    }

    return acc;
  }, []);
};

const getStatusCodeFromArg = (
  arg?: TSESTree.Expression | TSESTree.SpreadElement | null,
): number | null => {
  if (!arg || arg.type === AST_NODE_TYPES.SpreadElement) {
    return null;
  }

  if (arg.type === AST_NODE_TYPES.Literal && typeof arg.value === 'number') {
    return arg.value;
  }

  return null;
};

const mapStatusToHttpsCode = (status: number | null): string => {
  if (status === 400) return 'invalid-argument';
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'permission-denied';
  if (status === 404) return 'not-found';
  if (status === 409) return 'already-exists';
  if (status === 412 || status === 422) return 'failed-precondition';
  if (status === 429) return 'resource-exhausted';
  if (status === 499 || status === 504) return 'deadline-exceeded';
  if (status === 500) return 'internal';
  if (status === 502 || status === 503) return 'unavailable';
  return 'unknown';
};

const findNearestFunction = (
  ancestors: TSESTree.Node[],
): FunctionNode | null => {
  for (let idx = ancestors.length - 1; idx >= 0; idx -= 1) {
    const ancestor = ancestors[idx];
    if (isFunctionLike(ancestor)) {
      return ancestor;
    }
  }
  return null;
};

const getMessageExample = (call: TSESTree.CallExpression): string => {
  const firstArg = call.arguments[0];

  if (
    firstArg &&
    firstArg.type === AST_NODE_TYPES.Literal &&
    typeof firstArg.value === 'string'
  ) {
    return firstArg.value;
  }

  if (
    firstArg &&
    firstArg.type === AST_NODE_TYPES.TemplateLiteral &&
    firstArg.expressions.length === 0
  ) {
    return firstArg.quasis.map((part) => part.value.raw).join('');
  }

  return 'provide a descriptive message';
};

const getObjectNameFromExpression = (
  node: TSESTree.Expression | TSESTree.PrivateIdentifier,
): string | null => {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name;
  }

  if (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    node.property.type === AST_NODE_TYPES.Identifier &&
    node.object.type === AST_NODE_TYPES.Identifier
  ) {
    return `${node.object.name}.${node.property.name}`;
  }

  return null;
};

const getCalleeDisplayName = (
  callee: TSESTree.LeftHandSideExpression,
): string => {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }

  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    const objectName = getObjectNameFromExpression(callee.object);

    if (objectName) {
      return `${objectName}.${callee.property.name}`;
    }
    return callee.property.name;
  }

  return 'helper';
};

type StatusCallInfo = {
  responseName: string;
  statusCode: number | null;
  method: string;
};

const isStatusMember = (
  member: TSESTree.MemberExpression,
  propertyName: string,
): member is TSESTree.MemberExpression & {
  object: TSESTree.Identifier;
  property: TSESTree.Identifier;
} =>
  !member.computed &&
  member.property.type === AST_NODE_TYPES.Identifier &&
  member.property.name === propertyName &&
  member.object.type === AST_NODE_TYPES.Identifier;

const getStatusInfoFromStatusCall = (
  call: TSESTree.CallExpression,
): { responseName: string; statusCode: number | null } | null => {
  if (
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    isStatusMember(call.callee, 'status')
  ) {
    return {
      responseName: call.callee.object.name,
      statusCode: getStatusCodeFromArg(call.arguments[0]),
    };
  }

  return null;
};

const findStatusCall = (
  node: TSESTree.CallExpression,
): StatusCallInfo | null => {
  if (
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    isStatusMember(node.callee, 'sendStatus')
  ) {
    return {
      responseName: node.callee.object.name,
      statusCode: getStatusCodeFromArg(node.arguments[0]),
      method: 'sendStatus',
    };
  }

  if (
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    isStatusMember(node.callee, 'status')
  ) {
    const parent = node.parent;
    if (
      parent &&
      parent.type === AST_NODE_TYPES.MemberExpression &&
      parent.object === node &&
      parent.parent &&
      parent.parent.type === AST_NODE_TYPES.CallExpression
    ) {
      return null;
    }

    return {
      responseName: node.callee.object.name,
      statusCode: getStatusCodeFromArg(node.arguments[0]),
      method: 'status',
    };
  }

  if (
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    node.callee.object.type === AST_NODE_TYPES.CallExpression
  ) {
    const statusInfo = getStatusInfoFromStatusCall(node.callee.object);
    if (!statusInfo) {
      return null;
    }

    const method =
      node.callee.property.type === AST_NODE_TYPES.Identifier
        ? node.callee.property.name
        : 'status';

    return {
      ...statusInfo,
      method,
    };
  }

  return null;
};

const isErrorStatus = (statusCode: number | null): boolean =>
  statusCode === null || statusCode >= 400;

export const requireHttpsErrorInOnRequestHandlers: TSESLint.RuleModule<
  MessageIds,
  never[]
> = createRule({
  name: 'no-res-error-status-in-onrequest',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid sending 4xx/5xx Express responses inside onRequest handlers; throw structured HttpsError instances instead so the wrapper can format, log, and map errors consistently.',
      recommended: 'error',
    },
    schema: [],
    messages: {
      useHttpsErrorForStatus:
        "HTTP status {{statusCode}} sent via `{{responseName}}.{{method}}` inside an onRequest handler bypasses the centralized HttpsError pipeline. Throw new HttpsError('{{httpsCode}}', '{{messageExample}}', details) instead and import HttpsError from {{httpsErrorImport}} so the wrapper formats and logs the error consistently.",
      useHttpsErrorForComputedStatus:
        "Computed HTTP status sent via `{{responseName}}.{{method}}` inside an onRequest handler cannot be mapped to the expected HttpsError codes. Choose an explicit HttpsError code (e.g., invalid-argument, permission-denied) and throw new HttpsError('{{httpsCode}}', '{{messageExample}}', details) after importing from {{httpsErrorImport}} so the wrapper can standardize logging and response shape.",
      useHttpsErrorForWrapper:
        "`{{calleeName}}` receives the Express response object `{{responseName}}` inside an onRequest handler, which writes HTTP errors directly and skips the HttpsError wrapper. Refactor this helper to throw new HttpsError('{{httpsCode}}', '{{messageExample}}', details) (import from {{httpsErrorImport}}) so onRequest can handle formatting, status mapping, and logging.",
    },
  },
  defaultOptions: [],
  create(context) {
    const onRequestIdentifiers = new Set<string>();
    const onRequestNamespaces = new Set<string>();
    const handlerFunctions = new Set<FunctionNode>();
    const responseNamesByFunction = new Map<FunctionNode, string[]>();
    const pendingViolations: PotentialViolation[] = [];

    const recordFunction = (node: FunctionNode) => {
      responseNamesByFunction.set(node, getResponseParamNames(node));
    };

    const extractFunctionFromDefinition = (
      def: TSESLint.Scope.Definition,
    ): FunctionNode | null => {
      const defNode = def.node as TSESTree.Node;

      if (isFunctionLike(defNode)) {
        return defNode;
      }

      if (defNode.type === AST_NODE_TYPES.VariableDeclarator && defNode.init) {
        const initializer = unwrapTypedExpression(defNode.init);
        if (isFunctionLike(initializer)) {
          return initializer;
        }
      }

      return null;
    };

    const resolveFunctionFromIdentifier = (
      identifier: TSESTree.Identifier,
    ): FunctionNode | null => {
      let scope: TSESLint.Scope.Scope | null = context.getScope();

      while (scope) {
        const variable =
          scope.set.get(identifier.name) ??
          scope.variables.find(
            (candidate) => candidate.name === identifier.name,
          );

        if (variable) {
          for (const def of variable.defs) {
            const fn = extractFunctionFromDefinition(def);
            if (fn) {
              return fn;
            }
          }
        }

        scope = scope.upper;
      }

      return null;
    };

    const isDirectOnRequestHandler = (fn: FunctionNode): boolean => {
      return handlerFunctions.has(fn);
    };

    function findInFunctionChain<T>(
      startNode: FunctionNode,
      callback: (fn: FunctionNode) => T | null | undefined | false,
    ): T | null {
      let current: TSESTree.Node | undefined = startNode;
      while (current) {
        if (isFunctionLike(current)) {
          const result = callback(current);
          if (result) {
            return result;
          }
        }
        current = current.parent;
      }
      return null;
    }

    const isWithinOnRequest = (fn: FunctionNode): boolean =>
      !!findInFunctionChain(fn, (current) => isDirectOnRequestHandler(current));

    const hasResponseBinding = (
      fn: FunctionNode,
      responseName: string,
    ): boolean =>
      !!findInFunctionChain(fn, (current) => {
        const params = responseNamesByFunction.get(current) ?? [];
        return params.includes(responseName);
      });

    const findResponseIdentifierInArgs = (
      fn: FunctionNode,
      call: TSESTree.CallExpression,
    ): string | null =>
      findInFunctionChain(fn, (current) => {
        const params = responseNamesByFunction.get(current) ?? [];
        return params.find((name) =>
          call.arguments.some((arg) =>
            isIdentifierWithName(arg as TSESTree.Node, name),
          ),
        );
      });

    const getAncestors = (node: TSESTree.Node): TSESTree.Node[] => {
      const ancestors: TSESTree.Node[] = [];
      let current: TSESTree.Node | undefined | null = node.parent as
        | TSESTree.Node
        | undefined
        | null;
      while (current) {
        ancestors.unshift(current);
        current = current.parent as TSESTree.Node | undefined | null;
      }
      return ancestors;
    };

    return {
      ImportDeclaration(node) {
        if (node.source.value !== ON_REQUEST_MODULE) {
          return;
        }

        node.specifiers.forEach((specifier) => {
          if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
            onRequestIdentifiers.add(specifier.local.name);
          } else if (
            specifier.type === AST_NODE_TYPES.ImportSpecifier &&
            specifier.imported.type === AST_NODE_TYPES.Identifier &&
            specifier.imported.name === 'onRequest'
          ) {
            onRequestIdentifiers.add(specifier.local.name);
          } else if (
            specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier
          ) {
            onRequestNamespaces.add(specifier.local.name);
          }
        });
      },

      FunctionDeclaration: recordFunction,
      FunctionExpression: recordFunction,
      ArrowFunctionExpression: recordFunction,

      CallExpression(node) {
        const isOnRequestCallee = (
          callee: TSESTree.LeftHandSideExpression,
        ): boolean => {
          if (callee.type === AST_NODE_TYPES.Identifier) {
            return onRequestIdentifiers.has(callee.name);
          }

          if (
            callee.type === AST_NODE_TYPES.MemberExpression &&
            !callee.computed &&
            callee.property.type === AST_NODE_TYPES.Identifier &&
            callee.property.name === 'onRequest' &&
            callee.object.type === AST_NODE_TYPES.Identifier
          ) {
            return onRequestNamespaces.has(callee.object.name);
          }

          return false;
        };

        if (isOnRequestCallee(node.callee)) {
          const handlerArg = [...node.arguments]
            .reverse()
            .find(
              (
                arg,
              ): arg is
                | TSESTree.ArrowFunctionExpression
                | TSESTree.FunctionExpression
                | TSESTree.Identifier
                | TSESTree.TSAsExpression
                | TSESTree.TSSatisfiesExpression
                | TSESTree.TSTypeAssertion
                | TSESTree.TSNonNullExpression =>
                arg.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                arg.type === AST_NODE_TYPES.FunctionExpression ||
                arg.type === AST_NODE_TYPES.Identifier ||
                arg.type === AST_NODE_TYPES.TSAsExpression ||
                arg.type === AST_NODE_TYPES.TSSatisfiesExpression ||
                arg.type === AST_NODE_TYPES.TSTypeAssertion ||
                arg.type === AST_NODE_TYPES.TSNonNullExpression,
            );

          if (handlerArg) {
            const expression = unwrapTypedExpression(handlerArg);
            if (isFunctionLike(expression)) {
              handlerFunctions.add(expression);
            } else if (expression.type === AST_NODE_TYPES.Identifier) {
              const resolvedHandler = resolveFunctionFromIdentifier(expression);
              if (resolvedHandler) {
                handlerFunctions.add(resolvedHandler);
              }
            }
          }
        }

        const statusInfo = findStatusCall(node);
        if (statusInfo) {
          const { responseName, statusCode, method } = statusInfo;
          if (!isErrorStatus(statusCode)) {
            return;
          }

          const functionNode = findNearestFunction(getAncestors(node));
          if (!functionNode) {
            return;
          }

          if (!hasResponseBinding(functionNode, responseName)) {
            return;
          }

          pendingViolations.push({
            node,
            functionNode,
            responseName,
            kind: statusCode === null ? 'computedStatus' : 'status',
            statusCode,
            method,
            messageExample: getMessageExample(node),
          });

          return;
        }

        const functionNode = findNearestFunction(getAncestors(node));
        if (!functionNode) {
          return;
        }

        const responseName = findResponseIdentifierInArgs(functionNode, node);

        const calleeUsesResponseDirectly =
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.object.type === AST_NODE_TYPES.Identifier &&
          responseName === node.callee.object.name;

        if (!responseName || calleeUsesResponseDirectly) {
          return;
        }

        pendingViolations.push({
          node,
          functionNode,
          responseName,
          kind: 'wrapper',
          statusCode: null,
          method: 'wrapper',
          messageExample: getMessageExample(node),
          calleeName: getCalleeDisplayName(node.callee),
        });
      },

      'Program:exit'() {
        pendingViolations.forEach((violation) => {
          if (!isWithinOnRequest(violation.functionNode)) {
            return;
          }

          const httpsCode = mapStatusToHttpsCode(violation.statusCode);
          const commonData = {
            responseName: violation.responseName,
            messageExample: violation.messageExample,
            httpsCode,
            httpsErrorImport: HTTPS_ERROR_IMPORT_PATH,
          };

          if (violation.kind === 'wrapper') {
            context.report({
              node: violation.node,
              messageId: 'useHttpsErrorForWrapper',
              data: {
                ...commonData,
                calleeName: violation.calleeName ?? 'helper',
              },
            });
            return;
          }

          if (violation.kind === 'computedStatus') {
            context.report({
              node: violation.node,
              messageId: 'useHttpsErrorForComputedStatus',
              data: {
                ...commonData,
                method: violation.method,
              },
            });
            return;
          }

          context.report({
            node: violation.node,
            messageId: 'useHttpsErrorForStatus',
            data: {
              ...commonData,
              method: violation.method,
              statusCode:
                violation.statusCode !== null
                  ? violation.statusCode.toString()
                  : 'computed status',
            },
          });
        });
      },
    };
  },
});

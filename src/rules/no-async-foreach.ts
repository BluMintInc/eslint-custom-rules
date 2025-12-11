import { TSESLint, TSESTree } from '@typescript-eslint/utils';

type AsyncCallbackNode =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression
  | TSESTree.FunctionDeclaration;

const getCallbackLabel = (
  node: AsyncCallbackNode,
  fallbackName?: string,
): string => {
  const declaredName =
    (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') &&
    node.id?.name
      ? node.id.name
      : null;

  const functionName =
    declaredName ??
    (node.type !== 'ArrowFunctionExpression' ? fallbackName : undefined);

  if (functionName) {
    return `function "${functionName}"`;
  }

  if (node.type === 'ArrowFunctionExpression') {
    return fallbackName
      ? `arrow function "${fallbackName}"`
      : 'arrow function';
  }

  return 'function expression';
};

const findVariableInScope = (
  scope: TSESLint.Scope.Scope | null,
  name: string,
): TSESLint.Scope.Variable | null => {
  let currentScope: TSESLint.Scope.Scope | null = scope;
  while (currentScope) {
    const variable = currentScope.set.get(name);
    if (variable) {
      return variable;
    }
    currentScope = currentScope.upper;
  }
  return null;
};

const getAsyncCallbackInfo = (
  callback: TSESTree.CallExpressionArgument,
  scope: TSESLint.Scope.Scope | null,
): { callbackLabel: string } | null => {
  if (
    (callback.type === 'ArrowFunctionExpression' ||
      callback.type === 'FunctionExpression') &&
    callback.async
  ) {
    return {
      callbackLabel: getCallbackLabel(callback),
    };
  }

  if (callback.type !== 'Identifier') {
    return null;
  }

  const variable = findVariableInScope(scope, callback.name);
  if (!variable) {
    return null;
  }

  for (const def of variable.defs) {
    if (def.node.type === 'FunctionDeclaration' && def.node.async) {
      return {
        callbackLabel: getCallbackLabel(
          def.node,
          def.node.id?.name ?? callback.name,
        ),
      };
    }

    if (def.node.type === 'VariableDeclarator') {
      const init = def.node.init;
      if (
        init &&
        (init.type === 'ArrowFunctionExpression' ||
          init.type === 'FunctionExpression') &&
        init.async
      ) {
        const name =
          (def.node.id.type === 'Identifier' && def.node.id.name) || callback.name;
        return {
          callbackLabel: getCallbackLabel(init, name),
        };
      }
    }
  }

  return null;
};

export const noAsyncForEach: TSESLint.RuleModule<'noAsyncForEach', []> = {
  create(context) {
    const sourceCode =
      (context as TSESLint.RuleContext<'noAsyncForEach', []> & {
        sourceCode?: TSESLint.SourceCode;
      }).sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node: TSESTree.CallExpression) {
        const callee = node.callee;
        const callback = node.arguments[0];

        if (
          callee.type === 'MemberExpression' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'forEach' &&
          callback
        ) {
          const scope =
            (
              sourceCode as TSESLint.SourceCode & {
                getScope?: (
                  node: TSESTree.Node,
                ) => TSESLint.Scope.Scope | null;
              }
            ).getScope?.(callback) ?? context.getScope();
          const asyncCallbackInfo = getAsyncCallbackInfo(
            callback,
            scope,
          );

          if (asyncCallbackInfo) {
            context.report({
              node,
              messageId: 'noAsyncForEach',
              data: asyncCallbackInfo,
            });
          }
        }
      },
    };
  },
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow Array.forEach with async callbacks because forEach ignores returned promises, leading to parallel execution and unhandled rejections. Use a for...of loop when you need to await each iteration or map with Promise.all when concurrency is intended.',
      recommended: 'error',
    },
    messages: {
      noAsyncForEach:
        'Async {{callbackLabel}} passed to Array.forEach runs without awaiting each item. Array.forEach ignores returned promises, so async work executes in parallel and rejections go unhandled. Use a for...of loop to await sequentially or map with Promise.all when you want controlled concurrency.',
    },
    schema: [],
  },
  defaultOptions: [],
};

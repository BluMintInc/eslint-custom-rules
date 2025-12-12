import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';

type AsyncCallbackNode =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression
  | TSESTree.FunctionDeclaration;

type AsyncCallbackInfo = { callbackLabel: string };

const getFunctionDescription = (
  node: AsyncCallbackNode,
  fallbackName?: string,
): string => {
  const declaredName =
    (node.type === AST_NODE_TYPES.FunctionDeclaration ||
      node.type === AST_NODE_TYPES.FunctionExpression) &&
    node.id?.name
      ? node.id.name
      : null;

  const isArrowFunction = node.type === AST_NODE_TYPES.ArrowFunctionExpression;
  const functionName = declaredName ?? (isArrowFunction ? undefined : fallbackName);

  if (functionName) {
    return `function "${functionName}"`;
  }

  if (node.type === AST_NODE_TYPES.ArrowFunctionExpression) {
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

const isAsyncFunctionExpression = (
  node: unknown,
): node is
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression => {
  if (!node || typeof node !== 'object') {
    return false;
  }

  const typedNode = node as TSESTree.Node;

  return (
    (typedNode.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      typedNode.type === AST_NODE_TYPES.FunctionExpression) &&
    (typedNode as TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression)
      .async === true
  );
};

const getSourceCode = (
  context: TSESLint.RuleContext<'noAsyncForEach', []>,
): TSESLint.SourceCode => {
  const typedContext = context as TSESLint.RuleContext<'noAsyncForEach', []> & {
    sourceCode?: TSESLint.SourceCode;
  };

  return typedContext.sourceCode ?? context.getSourceCode();
};

const getScope = (
  context: TSESLint.RuleContext<'noAsyncForEach', []>,
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Node,
): TSESLint.Scope.Scope | null => {
  const typedSourceCode = sourceCode as TSESLint.SourceCode & {
    getScope?: (scopedNode: TSESTree.Node) => TSESLint.Scope.Scope | null;
  };

  return typedSourceCode.getScope?.(node) ?? context.getScope();
};

const analyzeInlineCallback = (
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): AsyncCallbackInfo | null => {
  if (!callback.async) {
    return null;
  }

  return {
    callbackLabel: getFunctionDescription(callback),
  };
};

const getAsyncFunctionDeclarationInfo = (
  definition: TSESLint.Scope.Definition,
  callbackName: string,
): AsyncCallbackInfo | null => {
  if (
    definition.node.type === AST_NODE_TYPES.FunctionDeclaration &&
    definition.node.async
  ) {
    return {
      callbackLabel: getFunctionDescription(
        definition.node,
        definition.node.id?.name ?? callbackName,
      ),
    };
  }

  return null;
};

const getAsyncVariableDeclaratorInfo = (
  definition: TSESLint.Scope.Definition,
  callbackName: string,
): AsyncCallbackInfo | null => {
  if (definition.node.type !== AST_NODE_TYPES.VariableDeclarator) {
    return null;
  }

  const initializerExpression = definition.node.init;
  if (!isAsyncFunctionExpression(initializerExpression)) {
    return null;
  }

  const name =
    (definition.node.id.type === AST_NODE_TYPES.Identifier &&
      definition.node.id.name) ||
    callbackName;

  return {
    callbackLabel: getFunctionDescription(initializerExpression, name),
  };
};

const analyzeVariableDefinition = (
  definition: TSESLint.Scope.Definition,
  callbackName: string,
): AsyncCallbackInfo | null =>
  getAsyncFunctionDeclarationInfo(definition, callbackName) ??
  getAsyncVariableDeclaratorInfo(definition, callbackName);

const getReferenceWriteExpression = (
  reference: TSESLint.Scope.Reference,
): TSESTree.Node | null => {
  const parent = reference.identifier.parent;

  if (reference.writeExpr) {
    return reference.writeExpr;
  }

  if (parent?.type === AST_NODE_TYPES.AssignmentExpression) {
    return parent.right;
  }

  if (parent?.type === AST_NODE_TYPES.VariableDeclarator && parent.init) {
    return parent.init;
  }

  return null;
};

const analyzeVariableReference = (
  reference: TSESLint.Scope.Reference,
): AsyncCallbackInfo | null => {
  if (typeof reference.isWrite === 'function' && !reference.isWrite()) {
    return null;
  }

  const writeExpr = getReferenceWriteExpression(reference);
  if (!isAsyncFunctionExpression(writeExpr)) {
    return null;
  }

  const name =
    (writeExpr.type === AST_NODE_TYPES.FunctionExpression &&
      writeExpr.id?.name) ||
    reference.identifier.name;

  return {
    callbackLabel: getFunctionDescription(writeExpr, name),
  };
};

const analyzeCallbackAsyncStatus = (
  callback: TSESTree.CallExpressionArgument,
  scope: TSESLint.Scope.Scope | null,
): AsyncCallbackInfo | null => {
  if (
    callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    callback.type === AST_NODE_TYPES.FunctionExpression
  ) {
    return analyzeInlineCallback(callback);
  }

  if (callback.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }

  const variable = findVariableInScope(scope, callback.name);
  if (!variable) {
    return null;
  }

  for (const definition of variable.defs) {
    const definitionResult = analyzeVariableDefinition(
      definition,
      callback.name,
    );

    if (definitionResult) {
      return definitionResult;
    }
  }

  for (const reference of variable.references) {
    const referenceResult = analyzeVariableReference(reference);
    if (referenceResult) {
      return referenceResult;
    }
  }

  return null;
};

export const noAsyncForEach: TSESLint.RuleModule<'noAsyncForEach', []> = {
  create(context) {
    const sourceCode = getSourceCode(context);

    return {
      CallExpression(node: TSESTree.CallExpression) {
        const callee = node.callee;
        const callback = node.arguments[0];

        if (
          callee.type === AST_NODE_TYPES.MemberExpression &&
          callee.property.type === AST_NODE_TYPES.Identifier &&
          callee.property.name === 'forEach' &&
          callback
        ) {
          const scope = getScope(context, sourceCode, callback);
          const asyncCallbackInfo = analyzeCallbackAsyncStatus(
            callback,
            scope,
          );

          if (asyncCallbackInfo) {
            context.report({
              node: callback,
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

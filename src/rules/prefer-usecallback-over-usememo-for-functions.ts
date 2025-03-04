import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type Options = [];
type MessageIds = 'preferUseCallback';

export const preferUseCallbackOverUseMemoForFunctions = createRule<Options, MessageIds>({
  name: 'prefer-usecallback-over-usememo-for-functions',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce using useCallback instead of useMemo for memoizing functions',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferUseCallback: 'Use useCallback instead of useMemo for memoizing functions',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        // Check if the call is to useMemo
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === 'useMemo' &&
          node.arguments.length > 0
        ) {
          const callback = node.arguments[0];

          // Check if the callback is an arrow function or function expression
          if (
            (callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
              callback.type === AST_NODE_TYPES.FunctionExpression) &&
            callback.body
          ) {
            // Case 1: Arrow function with block body that returns a function
            if (
              callback.body.type === AST_NODE_TYPES.BlockStatement &&
              callback.body.body.length === 1 &&
              callback.body.body[0].type === AST_NODE_TYPES.ReturnStatement &&
              callback.body.body[0].argument &&
              (callback.body.body[0].argument.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                callback.body.body[0].argument.type === AST_NODE_TYPES.FunctionExpression)
            ) {
              reportAndFix(node, context);
            }
            // Case 2: Arrow function with implicit return of a function
            else if (
              callback.body.type === AST_NODE_TYPES.ArrowFunctionExpression ||
              callback.body.type === AST_NODE_TYPES.FunctionExpression
            ) {
              reportAndFix(node, context);
            }
          }
        }
      },
    };
  },
});

function reportAndFix(node, context) {
  const sourceCode = context.getSourceCode();
  const useMemoCallback = node.arguments[0];
  const dependencyArray = node.arguments[1] ? sourceCode.getText(node.arguments[1]) : '[]';

  // Get the returned function from useMemo
  let returnedFunction;
  if (useMemoCallback.body.type === AST_NODE_TYPES.BlockStatement) {
    // For block body arrow functions or function expressions
    const returnStatement = useMemoCallback.body.body[0];
    returnedFunction = returnStatement.argument;
  } else {
    // For implicit return arrow functions
    returnedFunction = useMemoCallback.body;
  }

  // Create the useCallback replacement
  const returnedFunctionText = sourceCode.getText(returnedFunction);

  // Check if useMemo has TypeScript generic type parameters
  const hasTypeParameters = node.typeParameters !== undefined;
  const typeParametersText = hasTypeParameters ? sourceCode.getText(node.typeParameters) : '';

  context.report({
    node,
    messageId: 'preferUseCallback',
    fix: (fixer) => {
      return fixer.replaceText(
        node,
        `useCallback${typeParametersText}(${returnedFunctionText}, ${dependencyArray})`
      );
    },
  });
}

export default preferUseCallbackOverUseMemoForFunctions;

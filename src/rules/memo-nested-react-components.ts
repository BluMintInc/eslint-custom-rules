import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'memoNestedReactComponents';

/**
 * Checks if a node is a JSX element or fragment
 */
const isJsxElement = (node: TSESTree.Node | null): boolean => {
  if (!node) return false;

  if (node.type === AST_NODE_TYPES.ConditionalExpression) {
    return isJsxElement(node.consequent) || isJsxElement(node.alternate);
  }

  // For logical expressions like '&&', check both sides
  if (node.type === AST_NODE_TYPES.LogicalExpression) {
    return isJsxElement(node.left) || isJsxElement(node.right);
  }

  return (
    node.type === AST_NODE_TYPES.JSXElement ||
    node.type === AST_NODE_TYPES.JSXFragment
  );
};

/**
 * Checks if a node contains JSX in a map or other array method
 */
const containsJsxInArrayMethod = (node: TSESTree.CallExpression): boolean => {
  if (
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    node.callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    // Check array methods like map, filter, etc.
    const arrayMethods = ['map', 'filter', 'find', 'findIndex', 'some', 'every', 'reduce'];
    if (
      arrayMethods.includes(node.callee.property.name) &&
      node.arguments.length > 0
    ) {
      const callback = node.arguments[0];
      if (
        (callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          callback.type === AST_NODE_TYPES.FunctionExpression)
      ) {
        // Check if the callback returns JSX
        if (isJsxElement(callback.body)) {
          return true;
        }

        // Check if it's a block statement with JSX
        if (
          callback.body.type === AST_NODE_TYPES.BlockStatement &&
          callback.body.body.some(
            (s) =>
              s.type === AST_NODE_TYPES.ReturnStatement &&
              s.argument &&
              isJsxElement(s.argument)
          )
        ) {
          return true;
        }
      }
    }
  }
  return false;
};

const containsJsxInFunction = (
  node: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): boolean => {
  const body = node.body;

  // Direct JSX return
  if (isJsxElement(body)) {
    return true;
  }

  // Check for array methods returning JSX in the direct return
  if (body.type === AST_NODE_TYPES.CallExpression) {
    if (containsJsxInArrayMethod(body)) {
      return true;
    }
  }

  // JSX in block statement
  if (body.type === AST_NODE_TYPES.BlockStatement) {
    for (const statement of body.body) {
      // Check return statements
      if (
        statement.type === AST_NODE_TYPES.ReturnStatement &&
        statement.argument
      ) {
        if (isJsxElement(statement.argument)) {
          return true;
        }

        // Check for array methods in return statements
        if (
          statement.argument.type === AST_NODE_TYPES.CallExpression &&
          containsJsxInArrayMethod(statement.argument)
        ) {
          return true;
        }
      }

      // Check if statements
      if (statement.type === AST_NODE_TYPES.IfStatement) {
        if (
          statement.consequent.type === AST_NODE_TYPES.ReturnStatement &&
          statement.consequent.argument &&
          isJsxElement(statement.consequent.argument)
        ) {
          return true;
        }
        if (
          statement.consequent.type === AST_NODE_TYPES.BlockStatement &&
          statement.consequent.body.some(
            (s) =>
              s.type === AST_NODE_TYPES.ReturnStatement &&
              s.argument &&
              isJsxElement(s.argument),
          )
        ) {
          return true;
        }
        if (statement.alternate) {
          if (
            statement.alternate.type === AST_NODE_TYPES.ReturnStatement &&
            statement.alternate.argument &&
            isJsxElement(statement.alternate.argument)
          ) {
            return true;
          }
          if (
            statement.alternate.type === AST_NODE_TYPES.BlockStatement &&
            statement.alternate.body.some(
              (s) =>
                s.type === AST_NODE_TYPES.ReturnStatement &&
                s.argument &&
                isJsxElement(s.argument),
            )
          ) {
            return true;
          }
        }
      }

      // Check switch statements
      if (statement.type === AST_NODE_TYPES.SwitchStatement) {
        for (const switchCase of statement.cases) {
          for (const caseStatement of switchCase.consequent) {
            if (
              caseStatement.type === AST_NODE_TYPES.ReturnStatement &&
              caseStatement.argument
            ) {
              if (isJsxElement(caseStatement.argument)) {
                return true;
              }

              // Check for array methods in switch case returns
              if (
                caseStatement.argument.type === AST_NODE_TYPES.CallExpression &&
                containsJsxInArrayMethod(caseStatement.argument)
              ) {
                return true;
              }
            }
          }
        }
      }
    }
  }

  return false;
};

/**
 * Checks if a node is a useCallback or useDeepCompareCallback call
 */
const isCallbackHook = (node: TSESTree.CallExpression): boolean => {
  if (node.callee.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }

  return (
    node.callee.name === 'useCallback' ||
    node.callee.name === 'useDeepCompareCallback'
  );
};

/**
 * Generates a fix for converting useCallback to useMemo with memo wrapper
 */
const generateFix = (
  node: TSESTree.CallExpression,
  context: any,
  isDeepCompare: boolean,
): (fixer: any) => any => {
  const sourceCode = context.getSourceCode();
  const callbackFunction = node.arguments[0] as TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;
  const dependencies = node.arguments[1] ? sourceCode.getText(node.arguments[1]) : '[]';

  // Extract function parameters
  let paramsText = '';
  if (callbackFunction.params.length > 0) {
    paramsText = sourceCode.getText().slice(
      callbackFunction.params[0].range[0],
      callbackFunction.params[callbackFunction.params.length - 1].range[1]
    );
  }

  // Extract function body
  let bodyText = '';
  if (callbackFunction.body.type === AST_NODE_TYPES.BlockStatement) {
    bodyText = sourceCode.getText(callbackFunction.body);
  } else {
    // For arrow functions with implicit return
    bodyText = `{ return ${sourceCode.getText(callbackFunction.body)}; }`;
  }

  // Get the variable name if this is part of a variable declaration
  let componentName = 'UnmemoizedComponent';
  if (
    node.parent &&
    node.parent.type === AST_NODE_TYPES.VariableDeclarator &&
    node.parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    componentName = `${node.parent.id.name}Unmemoized`;
  }

  // Create the fixed code
  const memoHook = isDeepCompare ? 'useDeepCompareMemo' : 'useMemo';

  return (fixer) => {
    return fixer.replaceText(
      node,
      `${memoHook}(() => {
  return memo(function ${componentName}(${paramsText}) ${bodyText});
}, ${dependencies})`
    );
  };
};

export const memoNestedReactComponents = createRule<[], MessageIds>({
  name: 'memo-nested-react-components',
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent creating React components inside useCallback or useDeepCompareCallback without proper memoization',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      memoNestedReactComponents:
        'React components should not be created inside useCallback/useDeepCompareCallback. Use useMemo/useDeepCompareMemo with memo() wrapper instead.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        // Check if this is a useCallback or useDeepCompareCallback call
        if (!isCallbackHook(node)) {
          return;
        }

        // Check if there are arguments
        if (node.arguments.length === 0) {
          return;
        }

        // Get the callback function
        const callbackFunction = node.arguments[0];
        if (
          callbackFunction.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
          callbackFunction.type !== AST_NODE_TYPES.FunctionExpression
        ) {
          return;
        }

        // Check if the callback function returns JSX
        if (containsJsxInFunction(callbackFunction)) {
          const isDeepCompare =
            node.callee.type === AST_NODE_TYPES.Identifier &&
            node.callee.name === 'useDeepCompareCallback';

          context.report({
            node,
            messageId: 'memoNestedReactComponents',
            fix: generateFix(node, context, isDeepCompare),
          });
        }
      },
    };
  },
});

export default memoNestedReactComponents;

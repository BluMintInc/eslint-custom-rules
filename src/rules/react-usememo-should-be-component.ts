import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'useMemoShouldBeComponent';

/**
 * Checks if a node is a JSX element or fragment
 */
const isJsxElement = (node: TSESTree.Node | null): boolean => {
  if (!node) return false;

  if (node.type === AST_NODE_TYPES.ConditionalExpression) {
    return isJsxElement(node.consequent) || isJsxElement(node.alternate);
  }

  return (
    node.type === AST_NODE_TYPES.JSXElement ||
    node.type === AST_NODE_TYPES.JSXFragment
  );
};

/**
 * Checks if a block statement contains JSX elements
 */
const containsJsxInBlockStatement = (node: TSESTree.BlockStatement): boolean => {
  for (const statement of node.body) {
    // Check return statements
    if (statement.type === AST_NODE_TYPES.ReturnStatement && statement.argument) {
      if (isJsxElement(statement.argument)) {
        return true;
      }
    }

    // Check if statements
    if (statement.type === AST_NODE_TYPES.IfStatement) {
      if (statement.consequent.type === AST_NODE_TYPES.ReturnStatement &&
          statement.consequent.argument && isJsxElement(statement.consequent.argument)) {
        return true;
      }
      if (statement.consequent.type === AST_NODE_TYPES.BlockStatement &&
          containsJsxInBlockStatement(statement.consequent)) {
        return true;
      }
      if (statement.alternate) {
        if (statement.alternate.type === AST_NODE_TYPES.ReturnStatement &&
            statement.alternate.argument && isJsxElement(statement.alternate.argument)) {
          return true;
        }
        if (statement.alternate.type === AST_NODE_TYPES.BlockStatement &&
            containsJsxInBlockStatement(statement.alternate)) {
          return true;
        }
      }
    }
  }
  return false;
};

/**
 * Checks if a useMemo call contains JSX elements
 */
const containsJsxInUseMemo = (node: TSESTree.CallExpression): boolean => {
  if (
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'useMemo' &&
    node.arguments.length > 0
  ) {
    const callback = node.arguments[0];
    if (callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        callback.type === AST_NODE_TYPES.FunctionExpression) {
      const body = callback.body;

      // Direct JSX return
      if (isJsxElement(body)) {
        return true;
      }

      // JSX in block statement
      if (body.type === AST_NODE_TYPES.BlockStatement) {
        return containsJsxInBlockStatement(body);
      }

      // Check for array.map() returning JSX
      if (body.type === AST_NODE_TYPES.CallExpression &&
          body.callee.type === AST_NODE_TYPES.MemberExpression &&
          body.callee.property.type === AST_NODE_TYPES.Identifier &&
          body.callee.property.name === 'map') {
        const mapCallback = body.arguments[0];
        if ((mapCallback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
             mapCallback.type === AST_NODE_TYPES.FunctionExpression) &&
            isJsxElement(mapCallback.body)) {
          return true;
        }
      }
    }
  }
  return false;
};

export const reactUseMemoShouldBeComponent = createRule<[], MessageIds>({
  name: 'react-usememo-should-be-component',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce that useMemo hooks returning React nodes should be abstracted into separate React components',
      recommended: 'error',
    },
    schema: [],
    messages: {
      useMemoShouldBeComponent:
        'useMemo returning JSX should be extracted into a separate component. Use React.memo() for component memoization instead.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        if (containsJsxInUseMemo(node)) {
          context.report({
            node,
            messageId: 'useMemoShouldBeComponent',
          });
        }
      },
    };
  },
});

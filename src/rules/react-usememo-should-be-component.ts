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
 * Checks if an object contains JSX elements in its properties
 */
const containsJsxInObject = (node: TSESTree.ObjectExpression): boolean => {
  for (const property of node.properties) {
    if (property.type === AST_NODE_TYPES.Property && property.value) {
      if (isJsxElement(property.value)) {
        return true;
      }

      // Check nested objects
      if (property.value.type === AST_NODE_TYPES.ObjectExpression) {
        if (containsJsxInObject(property.value)) {
          return true;
        }
      }
    }
  }
  return false;
};

/**
 * Checks if a switch statement contains JSX elements
 */
const containsJsxInSwitchStatement = (node: TSESTree.SwitchStatement): boolean => {
  for (const switchCase of node.cases) {
    for (const statement of switchCase.consequent) {
      if (statement.type === AST_NODE_TYPES.ReturnStatement && statement.argument) {
        if (isJsxElement(statement.argument)) {
          return true;
        }
      }

      if (statement.type === AST_NODE_TYPES.BlockStatement) {
        if (containsJsxInBlockStatement(statement)) {
          return true;
        }
      }
    }
  }
  return false;
};

/**
 * Checks if a function contains JSX elements
 */
const containsJsxInFunction = (node: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression): boolean => {
  const body = node.body;

  // Direct JSX return
  if (isJsxElement(body)) {
    return true;
  }

  // JSX in block statement
  if (body.type === AST_NODE_TYPES.BlockStatement) {
    return containsJsxInBlockStatement(body);
  }

  // Check for array methods returning JSX
  if (body.type === AST_NODE_TYPES.CallExpression) {
    if (body.callee.type === AST_NODE_TYPES.MemberExpression &&
        body.callee.property.type === AST_NODE_TYPES.Identifier) {
      // Check array methods like map, filter, find, etc.
      const arrayMethods = ['map', 'filter', 'find', 'findIndex', 'some', 'every', 'reduce'];
      if (arrayMethods.includes(body.callee.property.name) && body.arguments.length > 0) {
        const callback = body.arguments[0];
        if ((callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
             callback.type === AST_NODE_TYPES.FunctionExpression) &&
            containsJsxInFunction(callback)) {
          return true;
        }
      }
    }

    // Check for IIFE
    if ((body.callee.type === AST_NODE_TYPES.ArrowFunctionExpression ||
         body.callee.type === AST_NODE_TYPES.FunctionExpression) &&
        containsJsxInFunction(body.callee)) {
      return true;
    }

    // Check for IIFE with parentheses
    if (body.callee.type === AST_NODE_TYPES.CallExpression) {
      return containsJsxInExpression(body);
    }
  }

  return false;
};

/**
 * Checks if an expression contains JSX elements
 */
const containsJsxInExpression = (node: TSESTree.Expression): boolean => {
  if (!node) return false;

  if (isJsxElement(node)) {
    return true;
  }

  switch (node.type) {
    case AST_NODE_TYPES.ConditionalExpression:
      return containsJsxInExpression(node.consequent) || containsJsxInExpression(node.alternate);

    case AST_NODE_TYPES.LogicalExpression:
      return containsJsxInExpression(node.left) || containsJsxInExpression(node.right);

    case AST_NODE_TYPES.ObjectExpression:
      return containsJsxInObject(node);

    case AST_NODE_TYPES.CallExpression:
      // Check if it's an IIFE
      if (node.callee.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          node.callee.type === AST_NODE_TYPES.FunctionExpression) {
        return containsJsxInFunction(node.callee);
      }

      // Check array methods
      if (node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.property.type === AST_NODE_TYPES.Identifier) {
        const arrayMethods = ['map', 'filter', 'find', 'findIndex', 'some', 'every', 'reduce'];
        if (arrayMethods.includes(node.callee.property.name) && node.arguments.length > 0) {
          const callback = node.arguments[0];
          if ((callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
               callback.type === AST_NODE_TYPES.FunctionExpression)) {
            return containsJsxInFunction(callback);
          }
        }
      }

      // Check arguments for JSX
      for (const arg of node.arguments) {
        if (arg.type !== AST_NODE_TYPES.SpreadElement && containsJsxInExpression(arg)) {
          return true;
        }
      }
      return false;

    case AST_NODE_TYPES.ArrowFunctionExpression:
    case AST_NODE_TYPES.FunctionExpression:
      return containsJsxInFunction(node);

    default:
      return false;
  }
};

/**
 * Checks if a block statement contains JSX elements
 */
const containsJsxInBlockStatement = (node: TSESTree.BlockStatement): boolean => {
  for (const statement of node.body) {
    // Check return statements
    if (statement.type === AST_NODE_TYPES.ReturnStatement && statement.argument) {
      if (containsJsxInExpression(statement.argument)) {
        return true;
      }
    }

    // Check if statements
    if (statement.type === AST_NODE_TYPES.IfStatement) {
      if (statement.consequent.type === AST_NODE_TYPES.ReturnStatement &&
          statement.consequent.argument && containsJsxInExpression(statement.consequent.argument)) {
        return true;
      }
      if (statement.consequent.type === AST_NODE_TYPES.BlockStatement &&
          containsJsxInBlockStatement(statement.consequent)) {
        return true;
      }
      if (statement.alternate) {
        if (statement.alternate.type === AST_NODE_TYPES.ReturnStatement &&
            statement.alternate.argument && containsJsxInExpression(statement.alternate.argument)) {
          return true;
        }
        if (statement.alternate.type === AST_NODE_TYPES.BlockStatement &&
            containsJsxInBlockStatement(statement.alternate)) {
          return true;
        }
        if (statement.alternate.type === AST_NODE_TYPES.IfStatement) {
          // Handle else if
          if (containsJsxInExpression(statement.alternate.test)) {
            return true;
          }
          if (statement.alternate.consequent &&
              ((statement.alternate.consequent.type === AST_NODE_TYPES.ReturnStatement &&
                statement.alternate.consequent.argument &&
                containsJsxInExpression(statement.alternate.consequent.argument)) ||
               (statement.alternate.consequent.type === AST_NODE_TYPES.BlockStatement &&
                containsJsxInBlockStatement(statement.alternate.consequent)))) {
            return true;
          }
        }
      }
    }

    // Check switch statements
    if (statement.type === AST_NODE_TYPES.SwitchStatement) {
      if (containsJsxInSwitchStatement(statement)) {
        return true;
      }
    }

    // Check variable declarations for JSX
    if (statement.type === AST_NODE_TYPES.VariableDeclaration) {
      for (const declarator of statement.declarations) {
        if (declarator.init && containsJsxInExpression(declarator.init)) {
          return true;
        }
      }
    }

    // Check expressions
    if (statement.type === AST_NODE_TYPES.ExpressionStatement &&
        containsJsxInExpression(statement.expression)) {
      return true;
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
      return containsJsxInFunction(callback);
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

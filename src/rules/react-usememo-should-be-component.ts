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

  // For logical expressions like '&&', the result can be a non-JSX value
  if (node.type === AST_NODE_TYPES.LogicalExpression) {
    // If it's a logical AND (&&), it can return the left operand which might be non-JSX
    if (node.operator === '&&') {
      return false;
    }
    // For other logical operators, check both sides
    return isJsxElement(node.left) || isJsxElement(node.right);
  }

  return (
    node.type === AST_NODE_TYPES.JSXElement ||
    node.type === AST_NODE_TYPES.JSXFragment
  );
};

/**
 * Checks if a variable is used multiple times in a component
 */
const isUsedMultipleTimes = (
  variableName: string,
  node: TSESTree.Node,
): boolean => {
  // Find the function component that contains this node
  let currentNode: TSESTree.Node | undefined = node;
  let functionNode: TSESTree.Node | undefined;

  // Walk up the AST to find the function component
  while (currentNode.parent) {
    currentNode = currentNode.parent;
    if (
      currentNode.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      currentNode.type === AST_NODE_TYPES.FunctionDeclaration ||
      currentNode.type === AST_NODE_TYPES.FunctionExpression
    ) {
      functionNode = currentNode;
      break;
    }
  }

  if (!functionNode) {
    return false;
  }

  // Count occurrences of the variable in the function body
  let count = 0;

  // Function to recursively search for references to the variable
  const findReferences = (searchNode: TSESTree.Node) => {
    if (!searchNode) return;

    // Check if this node is a reference to our variable
    if (
      searchNode.type === AST_NODE_TYPES.Identifier &&
      searchNode.name === variableName &&
      // Exclude the declaration itself
      !(
        searchNode.parent &&
        searchNode.parent.type === AST_NODE_TYPES.VariableDeclarator &&
        searchNode.parent.id === searchNode
      )
    ) {
      count++;
    }

    // Recursively check all properties of the node
    for (const key in searchNode) {
      if (key === 'parent') continue; // Skip parent to avoid circular references

      const child = (searchNode as any)[key];
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) {
          child.forEach((item) => {
            if (item && typeof item === 'object') {
              findReferences(item);
            }
          });
        } else {
          findReferences(child);
        }
      }
    }
  };

  // Start the search from the function body
  if (functionNode.type === AST_NODE_TYPES.ArrowFunctionExpression) {
    findReferences(functionNode.body);
  } else if (
    functionNode.type === AST_NODE_TYPES.FunctionDeclaration ||
    functionNode.type === AST_NODE_TYPES.FunctionExpression
  ) {
    findReferences(functionNode.body);
  }

  // Return true if the variable is referenced more than once
  return count > 1;
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
const containsJsxInSwitchStatement = (
  node: TSESTree.SwitchStatement,
): boolean => {
  for (const switchCase of node.cases) {
    for (const statement of switchCase.consequent) {
      if (
        statement.type === AST_NODE_TYPES.ReturnStatement &&
        statement.argument
      ) {
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
const containsJsxInFunction = (
  node:
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionExpression
    | TSESTree.FunctionDeclaration,
): boolean => {
  // For FunctionDeclaration, we need to check the body
  if (node.type === AST_NODE_TYPES.FunctionDeclaration) {
    if (node.body && node.body.type === AST_NODE_TYPES.BlockStatement) {
      return containsJsxInBlockStatement(node.body);
    }
    return false;
  }

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
    if (
      body.callee.type === AST_NODE_TYPES.MemberExpression &&
      body.callee.property.type === AST_NODE_TYPES.Identifier
    ) {
      // Check array methods like map, filter, find, etc.
      const arrayMethods = [
        'map',
        'filter',
        'find',
        'findIndex',
        'some',
        'every',
        'reduce',
      ];
      if (
        arrayMethods.includes(body.callee.property.name) &&
        body.arguments.length > 0
      ) {
        const callback = body.arguments[0];
        if (
          (callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            callback.type === AST_NODE_TYPES.FunctionExpression) &&
          containsJsxInFunction(callback)
        ) {
          return true;
        }
      }
    }

    // Check for IIFE
    if (
      (body.callee.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        body.callee.type === AST_NODE_TYPES.FunctionExpression) &&
      containsJsxInFunction(body.callee)
    ) {
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
 *
 * This function is used to determine if a useMemo hook is returning JSX directly.
 * We want to avoid flagging useMemo hooks that return data structures that happen to contain JSX,
 * as these are typically used for configuration or data preparation, not for rendering components.
 */
const containsJsxInExpression = (node: TSESTree.Expression): boolean => {
  if (!node) return false;

  // Direct JSX element or fragment
  if (isJsxElement(node)) {
    return true;
  }

  switch (node.type) {
    case AST_NODE_TYPES.ConditionalExpression:
      return (
        containsJsxInExpression(node.consequent) ||
        containsJsxInExpression(node.alternate)
      );

    case AST_NODE_TYPES.LogicalExpression:
      // For logical AND (&&) expressions, if the left side can be falsy,
      // then the expression can return a non-JSX value, so we should not flag it
      if (node.operator === '&&') {
        // If the left side is a boolean expression or can be falsy, this can return a non-JSX value
        return false;
      }

      return (
        containsJsxInExpression(node.left) ||
        containsJsxInExpression(node.right)
      );

    case AST_NODE_TYPES.ObjectExpression:
      // Special case: If this is an object with both JSX and non-JSX properties,
      // it's likely a data structure that happens to contain JSX, not a component
      let hasNonJsxProperties = false;
      let hasJsxProperties = false;

      for (const property of node.properties) {
        if (property.type === AST_NODE_TYPES.Property && property.value) {
          if (isJsxElement(property.value)) {
            hasJsxProperties = true;
          } else if (property.value.type !== AST_NODE_TYPES.ObjectExpression) {
            hasNonJsxProperties = true;
          }
        }
      }

      // If the object has both JSX and non-JSX properties, it's likely a data object
      // that happens to contain JSX, not a component that should be extracted
      if (hasNonJsxProperties && hasJsxProperties) {
        return false;
      }

      // If it only has JSX properties, it might be a collection of components
      if (hasJsxProperties && !hasNonJsxProperties) {
        return true;
      }

      return containsJsxInObject(node);

    case AST_NODE_TYPES.CallExpression:
      // Special case for array methods that return data structures with JSX
      if (
        node.callee.type === AST_NODE_TYPES.MemberExpression &&
        node.callee.property.type === AST_NODE_TYPES.Identifier &&
        node.callee.property.name === 'map' &&
        node.arguments.length > 0
      ) {
        // Map operations that return JSX elements are a valid pattern and should not be flagged
        // This is a common pattern for rendering lists of components
        return false;
      }

      // Check if it's an IIFE
      if (
        node.callee.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        node.callee.type === AST_NODE_TYPES.FunctionExpression
      ) {
        return containsJsxInFunction(node.callee);
      }

      // Check array methods
      if (
        node.callee.type === AST_NODE_TYPES.MemberExpression &&
        node.callee.property.type === AST_NODE_TYPES.Identifier
      ) {
        const arrayMethods = [
          'filter',
          'find',
          'findIndex',
          'some',
          'every',
          'reduce',
        ];
        if (
          arrayMethods.includes(node.callee.property.name) &&
          node.arguments.length > 0
        ) {
          const callback = node.arguments[0];
          if (
            callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            callback.type === AST_NODE_TYPES.FunctionExpression
          ) {
            return containsJsxInFunction(callback);
          }
        }
      }

      // Check arguments for JSX
      for (const arg of node.arguments) {
        if (
          arg.type !== AST_NODE_TYPES.SpreadElement &&
          containsJsxInExpression(arg)
        ) {
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
const containsJsxInBlockStatement = (
  node: TSESTree.BlockStatement,
): boolean => {
  for (const statement of node.body) {
    // Check return statements
    if (
      statement.type === AST_NODE_TYPES.ReturnStatement &&
      statement.argument
    ) {
      if (containsJsxInExpression(statement.argument)) {
        return true;
      }
    }

    // Check if statements
    if (statement.type === AST_NODE_TYPES.IfStatement) {
      if (
        statement.consequent.type === AST_NODE_TYPES.ReturnStatement &&
        statement.consequent.argument &&
        containsJsxInExpression(statement.consequent.argument)
      ) {
        return true;
      }
      if (
        statement.consequent.type === AST_NODE_TYPES.BlockStatement &&
        containsJsxInBlockStatement(statement.consequent)
      ) {
        return true;
      }
      if (statement.alternate) {
        if (
          statement.alternate.type === AST_NODE_TYPES.ReturnStatement &&
          statement.alternate.argument &&
          containsJsxInExpression(statement.alternate.argument)
        ) {
          return true;
        }
        if (
          statement.alternate.type === AST_NODE_TYPES.BlockStatement &&
          containsJsxInBlockStatement(statement.alternate)
        ) {
          return true;
        }
        if (statement.alternate.type === AST_NODE_TYPES.IfStatement) {
          // Handle else if
          if (containsJsxInExpression(statement.alternate.test)) {
            return true;
          }
          if (
            statement.alternate.consequent &&
            ((statement.alternate.consequent.type ===
              AST_NODE_TYPES.ReturnStatement &&
              statement.alternate.consequent.argument &&
              containsJsxInExpression(
                statement.alternate.consequent.argument,
              )) ||
              (statement.alternate.consequent.type ===
                AST_NODE_TYPES.BlockStatement &&
                containsJsxInBlockStatement(statement.alternate.consequent)))
          ) {
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
    if (
      statement.type === AST_NODE_TYPES.ExpressionStatement &&
      containsJsxInExpression(statement.expression)
    ) {
      return true;
    }
  }
  return false;
};

/**
 * Checks if a useMemo call directly returns JSX elements
 *
 * This function distinguishes between:
 * 1. useMemo returning JSX directly (invalid)
 * 2. useMemo returning an object that contains JSX properties (valid)
 * 3. useMemo returning non-JSX values like numbers, strings, etc. (valid)
 *
 * The rule should only fire when useMemo explicitly returns ReactNode from JSX.
 */
const containsJsxInUseMemo = (node: TSESTree.CallExpression): boolean => {
  if (
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'useMemo' &&
    node.arguments.length > 0
  ) {
    const callback = node.arguments[0];
    if (
      callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      callback.type === AST_NODE_TYPES.FunctionExpression
    ) {
      // For block statements, we need to check if any return statement contains JSX
      if (callback.body.type === AST_NODE_TYPES.BlockStatement) {
        // Check each return statement to see if it returns JSX directly (not via mapping)
        for (const statement of callback.body.body) {
          if (
            statement.type === AST_NODE_TYPES.ReturnStatement &&
            statement.argument
          ) {
            // Skip if the return statement is a map function that returns JSX elements
            if (
              statement.argument.type === AST_NODE_TYPES.CallExpression &&
              statement.argument.callee.type === AST_NODE_TYPES.MemberExpression &&
              statement.argument.callee.property.type === AST_NODE_TYPES.Identifier &&
              statement.argument.callee.property.name === 'map'
            ) {
              // This is a map function, which is a valid pattern - don't flag it
              return false;
            }

            // Direct JSX element return - this should be flagged
            if (isJsxElement(statement.argument)) {
              return true;
            }
          }
        }

        // If we didn't find any return statements with direct JSX, check for more complex patterns
        // but exclude map operations
        return containsJsxInBlockStatement(callback.body);
      } else {
        // Direct JSX element - this is the primary case we want to catch
        if (isJsxElement(callback.body)) {
          return true;
        }

        // Special case for logical expressions that can return non-JSX values
        if (
          callback.body.type === AST_NODE_TYPES.LogicalExpression &&
          callback.body.operator === '&&'
        ) {
          return false;
        }

        // Special case for map operations that return JSX elements
        if (
          callback.body.type === AST_NODE_TYPES.CallExpression &&
          callback.body.callee.type === AST_NODE_TYPES.MemberExpression &&
          callback.body.callee.property.type === AST_NODE_TYPES.Identifier &&
          callback.body.callee.property.name === 'map'
        ) {
          // This is a map function, which is a valid pattern - don't flag it
          return false;
        }

        // For non-JSX expressions, we need to check if they contain JSX
        return containsJsxInExpression(callback.body);
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
      description:
        'Enforce that useMemo hooks explicitly returning JSX should be abstracted into separate React components',
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
          // Check if this is a variable declaration
          if (
            node.parent &&
            node.parent.type === AST_NODE_TYPES.VariableDeclarator &&
            node.parent.id.type === AST_NODE_TYPES.Identifier
          ) {
            const variableName = node.parent.id.name;

            // Check if the variable is used multiple times in the component
            if (isUsedMultipleTimes(variableName, node)) {
              // If the variable is used multiple times, allow it
              return;
            }
          }

          context.report({
            node,
            messageId: 'useMemoShouldBeComponent',
          });
        }
      },
    };
  },
});

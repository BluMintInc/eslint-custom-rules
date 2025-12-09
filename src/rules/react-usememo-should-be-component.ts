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
 * Checks if a variable is used as a prop value in a JSX element
 */
const isUsedAsComponentProp = (
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

  // Track all variables that eventually flow to JSX props
  const jsxPropVariables = new Set<string>();

  /**
   * Recursively analyze the function body to find all variables that flow to JSX props
   */
  const analyzeNode = (searchNode: TSESTree.Node) => {
    if (!searchNode) return;

    // Check JSX attributes for direct variable usage
    if (searchNode.type === AST_NODE_TYPES.JSXAttribute && searchNode.value) {
      if (searchNode.value.type === AST_NODE_TYPES.JSXExpressionContainer) {
        extractVariablesFromExpression(searchNode.value.expression);
      }
    }

    // Check JSX spread attributes
    if (searchNode.type === AST_NODE_TYPES.JSXSpreadAttribute) {
      extractVariablesFromExpression(searchNode.argument);
    }

    // Check JSX children - but only if it's NOT a JSX attribute value
    if (searchNode.type === AST_NODE_TYPES.JSXExpressionContainer) {
      // Skip if this is a JSX attribute value
      if (
        searchNode.parent &&
        searchNode.parent.type === AST_NODE_TYPES.JSXAttribute
      ) {
        return; // This is a prop, not children
      }

      // Skip if this is a JSX spread attribute
      if (
        searchNode.parent &&
        searchNode.parent.type === AST_NODE_TYPES.JSXSpreadAttribute
      ) {
        return; // This is a spread prop, not children
      }

      // This is JSX children, so we don't extract variables for prop detection
      return;
    }

    // Recursively analyze child nodes
    for (const key in searchNode) {
      if (key === 'parent') continue;

      const child = (searchNode as any)[key];
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) {
          child.forEach((item) => {
            if (item && typeof item === 'object') {
              analyzeNode(item);
            }
          });
        } else {
          analyzeNode(child);
        }
      }
    }
  };

  /**
   * Extract variables from an expression that could flow to JSX props
   */
  const extractVariablesFromExpression = (
    expr: TSESTree.Expression | TSESTree.JSXEmptyExpression | null,
  ) => {
    if (!expr) return;

    // Skip JSX empty expressions
    if (expr.type === AST_NODE_TYPES.JSXEmptyExpression) {
      return;
    }

    // Direct identifier
    if (expr.type === AST_NODE_TYPES.Identifier) {
      jsxPropVariables.add(expr.name);
      return;
    }

    // Conditional expression: condition ? a : b
    if (expr.type === AST_NODE_TYPES.ConditionalExpression) {
      extractVariablesFromExpression(expr.consequent);
      extractVariablesFromExpression(expr.alternate);
      return;
    }

    // Logical expression: a && b, a || b
    if (expr.type === AST_NODE_TYPES.LogicalExpression) {
      extractVariablesFromExpression(expr.left);
      extractVariablesFromExpression(expr.right);
      return;
    }

    // Object expression: {prop: variable}
    if (expr.type === AST_NODE_TYPES.ObjectExpression) {
      for (const prop of expr.properties) {
        if (prop.type === AST_NODE_TYPES.Property && prop.value) {
          extractVariablesFromExpression(prop.value as TSESTree.Expression);
        }
        if (prop.type === AST_NODE_TYPES.SpreadElement) {
          extractVariablesFromExpression(prop.argument);
        }
      }
      return;
    }

    // Array expression: [variable, ...]
    if (expr.type === AST_NODE_TYPES.ArrayExpression) {
      for (const element of expr.elements) {
        if (element && element.type !== AST_NODE_TYPES.SpreadElement) {
          extractVariablesFromExpression(element);
        } else if (element && element.type === AST_NODE_TYPES.SpreadElement) {
          extractVariablesFromExpression(element.argument);
        }
      }
      return;
    }

    // Call expression: func(variable)
    if (expr.type === AST_NODE_TYPES.CallExpression) {
      // For now, don't extract variables from function calls
      // This is a conservative approach to avoid false positives
      return;
    }

    // Member expression: obj.prop
    if (expr.type === AST_NODE_TYPES.MemberExpression) {
      extractVariablesFromExpression(expr.object);
      return;
    }
  };

  /**
   * Find a function definition by name in the current scope
   */
  const findFunctionDefinition = (
    functionName: string,
    contextNode: TSESTree.Node,
  ): TSESTree.Node | null => {
    // Walk up to find the containing function/block scope
    let current: TSESTree.Node | undefined = contextNode;
    while (current && current.parent) {
      current = current.parent;
      if (
        current.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        current.type === AST_NODE_TYPES.FunctionDeclaration ||
        current.type === AST_NODE_TYPES.FunctionExpression ||
        current.type === AST_NODE_TYPES.BlockStatement
      ) {
        break;
      }
    }

    if (!current) return null;

    // Search for function declarations/expressions in this scope
    const searchInNode = (node: TSESTree.Node): TSESTree.Node | null => {
      // Variable declarator with function expression
      if (
        node.type === AST_NODE_TYPES.VariableDeclarator &&
        node.id.type === AST_NODE_TYPES.Identifier &&
        node.id.name === functionName &&
        node.init &&
        (node.init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          node.init.type === AST_NODE_TYPES.FunctionExpression)
      ) {
        return node.init;
      }

      // Function declaration
      if (
        node.type === AST_NODE_TYPES.FunctionDeclaration &&
        node.id &&
        node.id.name === functionName
      ) {
        return node;
      }

      // Recursively search child nodes
      for (const key in node) {
        if (key === 'parent') continue;

        const child = (node as any)[key];
        if (child && typeof child === 'object') {
          if (Array.isArray(child)) {
            for (const item of child) {
              if (item && typeof item === 'object') {
                const result = searchInNode(item);
                if (result) return result;
              }
            }
          } else {
            const result = searchInNode(child);
            if (result) return result;
          }
        }
      }

      return null;
    };

    return searchInNode(current);
  };

  /**
   * Check if a function returns JSX and uses its arguments as props
   */
  const functionReturnsJSXWithArgsAsProps = (
    functionNode: TSESTree.Node,
  ): boolean => {
    if (
      functionNode.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
      functionNode.type !== AST_NODE_TYPES.FunctionExpression &&
      functionNode.type !== AST_NODE_TYPES.FunctionDeclaration
    ) {
      return false;
    }

    // Get the function body
    let body: TSESTree.Node;
    if (functionNode.type === AST_NODE_TYPES.FunctionDeclaration) {
      body = functionNode.body;
    } else {
      body = functionNode.body;
    }

    // Check if the function returns JSX
    const returnsJSX = (node: TSESTree.Node): boolean => {
      if (node.type === AST_NODE_TYPES.ReturnStatement && node.argument) {
        return isJsxElement(node.argument);
      }

      if (isJsxElement(node)) {
        return true;
      }

      // Recursively check child nodes
      for (const key in node) {
        if (key === 'parent') continue;

        const child = (node as any)[key];
        if (child && typeof child === 'object') {
          if (Array.isArray(child)) {
            for (const item of child) {
              if (item && typeof item === 'object' && returnsJSX(item)) {
                return true;
              }
            }
          } else if (returnsJSX(child)) {
            return true;
          }
        }
      }

      return false;
    };

    return returnsJSX(body);
  };

  // Analyze the function body to find all variables used in JSX props
  if (functionNode.type === AST_NODE_TYPES.ArrowFunctionExpression) {
    analyzeNode(functionNode.body);
  } else if (
    functionNode.type === AST_NODE_TYPES.FunctionDeclaration ||
    functionNode.type === AST_NODE_TYPES.FunctionExpression
  ) {
    analyzeNode(functionNode.body);
  }

  // Special case: Check for function calls in return statements that use variables as arguments
  // and the function returns JSX with those arguments as props
  const checkFunctionCallsInReturns = (searchNode: TSESTree.Node) => {
    if (
      searchNode.type === AST_NODE_TYPES.ReturnStatement &&
      searchNode.argument
    ) {
      if (searchNode.argument.type === AST_NODE_TYPES.CallExpression) {
        const callExpr = searchNode.argument;
        if (callExpr.callee.type === AST_NODE_TYPES.Identifier) {
          const functionName = callExpr.callee.name;

          // Look for the function definition
          if (functionNode) {
            const functionDef = findFunctionDefinition(
              functionName,
              functionNode,
            );
            if (functionDef && functionReturnsJSXWithArgsAsProps(functionDef)) {
              // This function returns JSX and uses its arguments as props
              for (const arg of callExpr.arguments) {
                if (arg.type !== AST_NODE_TYPES.SpreadElement) {
                  extractVariablesFromExpression(arg);
                } else {
                  extractVariablesFromExpression(arg.argument);
                }
              }
            }
          }
        }
      }
    }

    // Recursively check child nodes
    for (const key in searchNode) {
      if (key === 'parent') continue;

      const child = (searchNode as any)[key];
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) {
          child.forEach((item) => {
            if (item && typeof item === 'object') {
              checkFunctionCallsInReturns(item);
            }
          });
        } else {
          checkFunctionCallsInReturns(child);
        }
      }
    }
  };

  // Check for function calls in return statements
  if (functionNode.type === AST_NODE_TYPES.ArrowFunctionExpression) {
    checkFunctionCallsInReturns(functionNode.body);
  } else if (
    functionNode.type === AST_NODE_TYPES.FunctionDeclaration ||
    functionNode.type === AST_NODE_TYPES.FunctionExpression
  ) {
    checkFunctionCallsInReturns(functionNode.body);
  }

  // Now we need to trace variable assignments to see if our target variable flows to any JSX prop variable
  const variableFlows = new Map<string, Set<string>>();

  /**
   * Analyze variable assignments and flows
   */
  const analyzeVariableFlows = (searchNode: TSESTree.Node) => {
    if (!searchNode) return;

    // Variable declaration: const x = y
    if (
      searchNode.type === AST_NODE_TYPES.VariableDeclarator &&
      searchNode.id.type === AST_NODE_TYPES.Identifier &&
      searchNode.init
    ) {
      const targetVar = searchNode.id.name;
      const sourceVars = extractVariableNames(searchNode.init);
      if (!variableFlows.has(targetVar)) {
        variableFlows.set(targetVar, new Set());
      }
      sourceVars.forEach((sourceVar) => {
        variableFlows.get(targetVar)!.add(sourceVar);
      });
    }

    // Object destructuring: const {a, b} = obj
    if (
      searchNode.type === AST_NODE_TYPES.VariableDeclarator &&
      searchNode.id.type === AST_NODE_TYPES.ObjectPattern &&
      searchNode.init
    ) {
      const sourceVars = extractVariableNames(searchNode.init);
      for (const prop of searchNode.id.properties) {
        if (
          prop.type === AST_NODE_TYPES.Property &&
          prop.value.type === AST_NODE_TYPES.Identifier
        ) {
          const targetVar = prop.value.name;
          if (!variableFlows.has(targetVar)) {
            variableFlows.set(targetVar, new Set());
          }
          sourceVars.forEach((sourceVar) => {
            variableFlows.get(targetVar)!.add(sourceVar);
          });
        }
      }
    }

    // Array destructuring: const [a, b] = arr
    if (
      searchNode.type === AST_NODE_TYPES.VariableDeclarator &&
      searchNode.id.type === AST_NODE_TYPES.ArrayPattern &&
      searchNode.init
    ) {
      const sourceVars = extractVariableNames(searchNode.init);
      for (const element of searchNode.id.elements) {
        if (element && element.type === AST_NODE_TYPES.Identifier) {
          const targetVar = element.name;
          if (!variableFlows.has(targetVar)) {
            variableFlows.set(targetVar, new Set());
          }
          sourceVars.forEach((sourceVar) => {
            variableFlows.get(targetVar)!.add(sourceVar);
          });
        }
      }
    }

    // Recursively analyze child nodes
    for (const key in searchNode) {
      if (key === 'parent') continue;

      const child = (searchNode as any)[key];
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) {
          child.forEach((item) => {
            if (item && typeof item === 'object') {
              analyzeVariableFlows(item);
            }
          });
        } else {
          analyzeVariableFlows(child);
        }
      }
    }
  };

  /**
   * Extract variable names from an expression
   */
  const extractVariableNames = (expr: TSESTree.Expression): string[] => {
    const variables: string[] = [];

    const extract = (node: TSESTree.Node) => {
      if (node.type === AST_NODE_TYPES.Identifier) {
        variables.push(node.name);
      } else if (node.type === AST_NODE_TYPES.ObjectExpression) {
        for (const prop of node.properties) {
          if (prop.type === AST_NODE_TYPES.Property && prop.value) {
            extract(prop.value);
          }
          if (prop.type === AST_NODE_TYPES.SpreadElement) {
            extract(prop.argument);
          }
        }
      } else if (node.type === AST_NODE_TYPES.ArrayExpression) {
        for (const element of node.elements) {
          if (element) {
            extract(element);
          }
        }
      } else {
        // Recursively check other node types
        for (const key in node) {
          if (key === 'parent') continue;
          const child = (node as any)[key];
          if (child && typeof child === 'object') {
            if (Array.isArray(child)) {
              child.forEach((item) => {
                if (item && typeof item === 'object') {
                  extract(item);
                }
              });
            } else {
              extract(child);
            }
          }
        }
      }
    };

    extract(expr);
    return variables;
  };

  // Analyze variable flows in the function
  if (functionNode.type === AST_NODE_TYPES.ArrowFunctionExpression) {
    analyzeVariableFlows(functionNode.body);
  } else if (
    functionNode.type === AST_NODE_TYPES.FunctionDeclaration ||
    functionNode.type === AST_NODE_TYPES.FunctionExpression
  ) {
    analyzeVariableFlows(functionNode.body);
  }

  // Check if our target variable flows to any JSX prop variable
  const checkVariableFlow = (
    varName: string,
    visited = new Set<string>(),
  ): boolean => {
    if (visited.has(varName)) return false;
    visited.add(varName);

    // Direct usage in JSX prop
    if (jsxPropVariables.has(varName)) {
      return true;
    }

    // Check if any variable that flows from this one is used in JSX props
    for (const [targetVar, sourceVars] of variableFlows.entries()) {
      if (sourceVars.has(varName) && checkVariableFlow(targetVar, visited)) {
        return true;
      }
    }

    return false;
  };

  return checkVariableFlow(variableName);
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

  // Check for array methods returning arrays (do not flag arrays of JSX)
  if (body.type === AST_NODE_TYPES.CallExpression) {
    if (
      body.callee.type === AST_NODE_TYPES.MemberExpression &&
      body.callee.property.type === AST_NODE_TYPES.Identifier
    ) {
      const arrayReturningMethods = new Set([
        'map',
        'flatMap',
        'filter',
        'reduce',
        'concat',
        'slice',
      ]);
      if (arrayReturningMethods.has(body.callee.property.name)) {
        // Returning an array (even if its elements are JSX) should not be flagged
        return false;
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
      // Do not flag arrays of JSX: common array-producing patterns
      if (
        node.callee.type === AST_NODE_TYPES.MemberExpression &&
        node.callee.property.type === AST_NODE_TYPES.Identifier
      ) {
        const arrayReturningMethods = new Set([
          'map',
          'flatMap',
          'filter',
          'reduce',
          'concat',
          'slice',
        ]);
        if (arrayReturningMethods.has(node.callee.property.name)) {
          return false;
        }
      }

      // Array.from(...) returns an array as well
      if (
        node.callee.type === AST_NODE_TYPES.MemberExpression &&
        node.callee.object.type === AST_NODE_TYPES.Identifier &&
        node.callee.object.name === 'Array' &&
        node.callee.property.type === AST_NODE_TYPES.Identifier &&
        node.callee.property.name === 'from'
      ) {
        return false;
      }

      // Check if it's an IIFE
      if (
        node.callee.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        node.callee.type === AST_NODE_TYPES.FunctionExpression
      ) {
        return containsJsxInFunction(node.callee);
      }

      // Do not flag based on JSX in arguments of non-IIFE calls
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
        if (declarator.init) {
          // Ignore nested function expressions (helpers/callbacks) even if they return JSX
          if (
            declarator.init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            declarator.init.type === AST_NODE_TYPES.FunctionExpression
          ) {
            continue;
          }
          if (containsJsxInExpression(declarator.init)) {
            return true;
          }
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
        // Check each return statement to see if it returns JSX
        for (const statement of callback.body.body) {
          if (
            statement.type === AST_NODE_TYPES.ReturnStatement &&
            statement.argument &&
            isJsxElement(statement.argument)
          ) {
            return true;
          }
        }

        // If we didn't find any return statements with JSX, check for more complex patterns
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
          'useMemo result "{{memoName}}" returns JSX, which hides a component inside a memoized value. JSX needs component identity so React can manage props, state, and dev tooling; wrapping it in useMemo bypasses that boundary and makes reuse/debugging harder. Extract this JSX into its own component and memoize it with React.memo if stability is required.',
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

            // Check if the variable is used as a prop value in a JSX element
            if (isUsedAsComponentProp(variableName, node)) {
              // If the variable is used as a prop value, allow it
              return;
            }
          }

          const memoName =
            node.parent &&
            node.parent.type === AST_NODE_TYPES.VariableDeclarator &&
            node.parent.id.type === AST_NODE_TYPES.Identifier
              ? node.parent.id.name
              : 'useMemo return value';

          context.report({
            node,
            messageId: 'useMemoShouldBeComponent',
            data: {
              memoName,
            },
          });
        }
      },
    };
  },
});

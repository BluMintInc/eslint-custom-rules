import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';

export const noUndefinedNullPassthrough: TSESLint.RuleModule<
  'unexpected',
  never[]
> = createRule({
  create(context) {
    return {
      FunctionDeclaration(node) {
        // Skip functions with no parameters
        if (node.params.length === 0) {
          return;
        }

        // Skip React hooks (functions starting with 'use')
        if (
          node.id &&
          node.id.type === 'Identifier' &&
          node.id.name.startsWith('use')
        ) {
          return;
        }

        // For functions with exactly one parameter, check if it's passing through null/undefined
        if (node.params.length === 1) {
          checkFunctionBody(node.body, node.params[0], context);
        } else {
          // For functions with multiple parameters, check for early returns without arguments
          checkFunctionBodyForEarlyReturns(node.body, node.params, context);
        }
      },
      ArrowFunctionExpression(node) {
        // Skip functions with no parameters
        if (node.params.length === 0) {
          return;
        }

        // Skip if the function is part of a variable declaration that starts with 'use' (React hook)
        const parent = node.parent;
        if (
          parent &&
          parent.type === 'VariableDeclarator' &&
          parent.id.type === 'Identifier' &&
          parent.id.name.startsWith('use')
        ) {
          return;
        }

        // For arrow functions with block body
        if (node.body.type === 'BlockStatement') {
          if (node.params.length === 1) {
            checkFunctionBody(node.body, node.params[0], context);
          } else {
            // For functions with multiple parameters, check for early returns without arguments
            checkFunctionBodyForEarlyReturns(node.body, node.params, context);
          }
        } else if (node.params.length === 1) {
          // For arrow functions with expression body (implicit return) and one parameter
          checkImplicitReturn(node, context);
        }
      },
      FunctionExpression(node) {
        // Skip functions with no parameters
        if (node.params.length === 0) {
          return;
        }

        // Skip if the function is part of a variable declaration that starts with 'use' (React hook)
        const parent = node.parent;
        if (
          parent &&
          parent.type === 'VariableDeclarator' &&
          parent.id.type === 'Identifier' &&
          parent.id.name.startsWith('use')
        ) {
          return;
        }

        // For functions with exactly one parameter, check if it's passing through null/undefined
        if (node.params.length === 1) {
          checkFunctionBody(node.body, node.params[0], context);
        } else {
          // For functions with multiple parameters, check for early returns without arguments
          checkFunctionBodyForEarlyReturns(node.body, node.params, context);
        }
      },
    };
  },

  name: 'no-undefined-null-passthrough',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Avoid functions that return undefined or null when their single argument is undefined or null',
      recommended: 'error',
    },
    schema: [],
    messages: {
      unexpected:
        'Avoid functions that return undefined or null when their single argument is undefined or null. Move the null/undefined check to the caller instead.',
    },
  },
  defaultOptions: [],
});

/**
 * Check function body for early returns when parameter is null/undefined
 */
function checkFunctionBody(
  body: TSESTree.BlockStatement,
  param: TSESTree.Parameter,
  context: TSESLint.RuleContext<'unexpected', never[]>,
): void {
  // Get the parameter name
  let paramName: string | null = null;
  if (param.type === 'Identifier') {
    paramName = param.name;
  } else if (
    param.type === 'AssignmentPattern' &&
    param.left.type === 'Identifier'
  ) {
    paramName = param.left.name;
  }

  if (!paramName) return;

  // Look for early returns based on parameter being null/undefined
  for (const statement of body.body) {
    if (statement.type === 'IfStatement') {
      const test = statement.test;

      // Check for patterns like: if (!param) return;
      // or if (param === null) return;
      // or if (param === undefined) return;
      if (isNullUndefinedCheck(test, paramName)) {
        // Check if the consequent is a block statement with a return
        if (statement.consequent.type === 'BlockStatement') {
          for (const consequentStmt of statement.consequent.body) {
            if (
              consequentStmt.type === 'ReturnStatement' &&
              (!consequentStmt.argument ||
                isNullOrUndefinedLiteral(consequentStmt.argument))
            ) {
              // Check if there's a transformation in the function
              const hasTransformation = checkForTransformation(body, paramName);
              if (!hasTransformation) {
                context.report({
                  node: statement,
                  messageId: 'unexpected',
                });
              }
              return;
            }
          }
        }
        // Check if the consequent is a direct return statement
        else if (
          statement.consequent.type === 'ReturnStatement' &&
          (!statement.consequent.argument ||
            isNullOrUndefinedLiteral(statement.consequent.argument))
        ) {
          // Check if there's a transformation in the function
          const hasTransformation = checkForTransformation(body, paramName);
          if (!hasTransformation) {
            context.report({
              node: statement,
              messageId: 'unexpected',
            });
          }
          return;
        }
      }
    }
  }
}

/**
 * Check if the function body contains a transformation of the parameter
 */
function checkForTransformation(
  body: TSESTree.BlockStatement,
  paramName: string | null,
): boolean {
  if (!paramName) return false;

  // Look for return statements or other statements that use the parameter in a transformation
  for (const statement of body.body) {
    if (statement.type === 'ReturnStatement' && statement.argument) {
      // Check for various transformation patterns
      if (containsParameterTransformation(statement.argument, paramName)) {
        return true;
      }
    }
    // Check for other statements that might contain transformations (like for loops with yield)
    if (
      statement.type === 'ForStatement' ||
      statement.type === 'ForInStatement' ||
      statement.type === 'ForOfStatement'
    ) {
      if (containsTransformationInStatement(statement, paramName)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a statement contains a transformation of the parameter
 */
function containsTransformationInStatement(
  statement: TSESTree.Statement,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _paramName: string,
): boolean {
  // For generator functions, check if there are yield expressions with external function calls
  if (
    statement.type === 'ForOfStatement' &&
    statement.body.type === 'BlockStatement'
  ) {
    for (const stmt of statement.body.body) {
      if (
        stmt.type === 'ExpressionStatement' &&
        stmt.expression.type === 'YieldExpression' &&
        stmt.expression.argument &&
        stmt.expression.argument.type === 'CallExpression' &&
        stmt.expression.argument.callee.type === 'Identifier'
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if an expression contains a transformation of the parameter
 * A transformation is considered to be calling external functions with the parameter,
 * not just calling methods on the parameter itself.
 */
function containsParameterTransformation(
  node: TSESTree.Expression,
  paramName: string,
): boolean {
  // Check for direct function calls with the parameter: transformData(data)
  // This is considered a transformation because it's calling an external function
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' && // External function call
    node.arguments.some(
      (arg) => arg.type === 'Identifier' && arg.name === paramName,
    )
  ) {
    return true;
  }

  // Check for Object.* method calls: Object.keys(data), Object.values(data), Object.entries(data)
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    node.callee.object.type === 'Identifier' &&
    node.callee.object.name === 'Object' &&
    node.arguments.some(
      (arg) => arg.type === 'Identifier' && arg.name === paramName,
    )
  ) {
    return true;
  }

  // Check for chained operations that start with external functions: Object.entries(rounds).reduce(...).sort(...)
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    node.callee.object.type === 'CallExpression' &&
    node.callee.object.callee.type === 'MemberExpression' &&
    node.callee.object.callee.object.type === 'Identifier' &&
    node.callee.object.callee.object.name === 'Object' &&
    node.callee.object.arguments.some(
      (arg) => arg.type === 'Identifier' && arg.name === paramName,
    )
  ) {
    return true;
  }

  // Method calls on the parameter itself (like data.process(), items.filter())
  // are NOT considered transformations for the purpose of this rule
  return false;
}

/**
 * Check arrow functions with expression bodies (implicit returns)
 */
function checkImplicitReturn(
  node: TSESTree.ArrowFunctionExpression,
  context: TSESLint.RuleContext<'unexpected', never[]>,
): void {
  // Get the parameter name
  let paramName: string | null = null;
  if (node.params[0].type === 'Identifier') {
    paramName = node.params[0].name;
  } else if (
    node.params[0].type === 'AssignmentPattern' &&
    node.params[0].left.type === 'Identifier'
  ) {
    paramName = node.params[0].left.name;
  }

  if (!paramName) return;

  // Check for patterns like: (param) => param ? param.value : null
  if (node.body.type === 'ConditionalExpression') {
    const test = node.body.test;
    if (
      isParameterReference(test, paramName) &&
      isNullOrUndefinedLiteral(node.body.alternate)
    ) {
      context.report({
        node,
        messageId: 'unexpected',
      });
    }
  } else if (node.body.type === 'LogicalExpression') {
    // Check for (param) => param && doSomething(param)
    if (
      node.body.operator === '&&' &&
      isParameterReference(node.body.left, paramName)
    ) {
      context.report({
        node,
        messageId: 'unexpected',
      });
    }
  } else if (node.body.type === 'Identifier' && node.body.name === paramName) {
    // Check for (param) => param
    context.report({
      node,
      messageId: 'unexpected',
    });
  }
}

/**
 * Check if an expression is testing if a parameter is null or undefined
 */
function isNullUndefinedCheck(
  node: TSESTree.Expression,
  paramName: string,
): boolean {
  // Check for !param
  if (
    node.type === 'UnaryExpression' &&
    node.operator === '!' &&
    node.argument.type === 'Identifier' &&
    node.argument.name === paramName
  ) {
    return true;
  }

  // Check for param === null, param === undefined, etc.
  if (
    node.type === 'BinaryExpression' &&
    (node.operator === '===' ||
      node.operator === '==' ||
      node.operator === '!==' ||
      node.operator === '!=')
  ) {
    const left = node.left;
    const right = node.right;

    // param === null/undefined
    if (
      left.type === 'Identifier' &&
      left.name === paramName &&
      isNullOrUndefinedLiteral(right)
    ) {
      return true;
    }

    // null/undefined === param
    if (
      right.type === 'Identifier' &&
      right.name === paramName &&
      left.type !== 'PrivateIdentifier' && // Ensure left is not a PrivateIdentifier
      isNullOrUndefinedLiteral(left)
    ) {
      return true;
    }
  }

  // Check for param === null || param === undefined
  if (node.type === 'LogicalExpression' && node.operator === '||') {
    return (
      isNullUndefinedCheck(node.left, paramName) ||
      isNullUndefinedCheck(node.right, paramName)
    );
  }

  return false;
}

/**
 * Check if a node is a null or undefined literal
 */
function isNullOrUndefinedLiteral(node: TSESTree.Expression): boolean {
  if (node.type === 'Literal' && node.value === null) {
    return true;
  }

  if (node.type === 'Identifier' && node.name === 'undefined') {
    return true;
  }

  return false;
}

/**
 * Check if a node is a reference to the parameter
 */
function isParameterReference(
  node: TSESTree.Expression,
  paramName: string | null,
): boolean {
  if (!paramName) return false;
  return node.type === 'Identifier' && node.name === paramName;
}

/**
 * Check function body for early returns without arguments (implicit undefined)
 * based on parameter null/undefined checks
 */
function checkFunctionBodyForEarlyReturns(
  body: TSESTree.BlockStatement,
  params: TSESTree.Parameter[],
  context: TSESLint.RuleContext<'unexpected', never[]>,
): void {
  // Get parameter names
  const paramNames = params
    .map((param) => {
      if (param.type === 'Identifier') {
        return param.name;
      } else if (
        param.type === 'AssignmentPattern' &&
        param.left.type === 'Identifier'
      ) {
        return param.left.name;
      }
      return null;
    })
    .filter((name): name is string => name !== null);

  if (paramNames.length === 0) return;

  // Look for early returns without arguments based on parameter checks
  for (const statement of body.body) {
    if (statement.type === 'IfStatement') {
      const test = statement.test;

      // Check if the test is checking any parameter for null/undefined
      const isParameterCheck = paramNames.some((paramName) =>
        isNullUndefinedCheck(test, paramName),
      );

      if (isParameterCheck) {
        // Check if the consequent is a return without arguments
        if (
          statement.consequent.type === 'ReturnStatement' &&
          !statement.consequent.argument
        ) {
          context.report({
            node: statement,
            messageId: 'unexpected',
          });
        } else if (statement.consequent.type === 'BlockStatement') {
          // Check if the block contains only a return without arguments
          for (const consequentStmt of statement.consequent.body) {
            if (
              consequentStmt.type === 'ReturnStatement' &&
              !consequentStmt.argument
            ) {
              context.report({
                node: statement,
                messageId: 'unexpected',
              });
              break;
            }
          }
        }
      }
    }
  }
}

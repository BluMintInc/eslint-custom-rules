import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';

export const noUndefinedNullPassthrough: TSESLint.RuleModule<'unexpected', never[]> =
  createRule({
    create(context) {
      return {
        FunctionDeclaration(node) {
          // Only apply to functions with exactly one parameter
          if (node.params.length !== 1) {
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

          checkFunctionBody(node.body, node.params[0], context);
        },
        ArrowFunctionExpression(node) {
          // Only apply to arrow functions with exactly one parameter
          if (node.params.length !== 1) {
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
            checkFunctionBody(node.body, node.params[0], context);
          } else {
            // For arrow functions with expression body (implicit return)
            checkImplicitReturn(node, context);
          }
        },
        FunctionExpression(node) {
          // Only apply to functions with exactly one parameter
          if (node.params.length !== 1) {
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

          checkFunctionBody(node.body, node.params[0], context);
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
  context: TSESLint.RuleContext<'unexpected', never[]>
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
  paramName: string | null
): boolean {
  if (!paramName) return false;

  // Look for return statements that call functions with the parameter
  for (const statement of body.body) {
    if (statement.type === 'ReturnStatement' && statement.argument) {
      // Check for return transformData(data) pattern
      if (
        statement.argument.type === 'CallExpression' &&
        statement.argument.arguments.some(arg =>
          arg.type === 'Identifier' && arg.name === paramName
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check arrow functions with expression bodies (implicit returns)
 */
function checkImplicitReturn(
  node: TSESTree.ArrowFunctionExpression,
  context: TSESLint.RuleContext<'unexpected', never[]>
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
  paramName: string
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
    (node.operator === '===' || node.operator === '==' ||
     node.operator === '!==' || node.operator === '!=')
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
  if (
    node.type === 'LogicalExpression' &&
    node.operator === '||'
  ) {
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
  paramName: string | null
): boolean {
  if (!paramName) return false;
  return node.type === 'Identifier' && node.name === paramName;
}

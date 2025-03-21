import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noTypeAssertionReturns' | 'useExplicitVariable';

type Options = [
  {
    allowAsConst?: boolean;
    allowTypePredicates?: boolean;
  },
];

const defaultOptions: Options[0] = {
  allowAsConst: true,
  allowTypePredicates: true,
};

/**
 * Checks if a type assertion is 'as const'
 */
function isAsConstAssertion(node: TSESTree.TSAsExpression): boolean {
  const typeAnnotation = node.typeAnnotation;
  return (
    typeAnnotation.type === AST_NODE_TYPES.TSTypeReference &&
    typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier &&
    typeAnnotation.typeName.name === 'const'
  );
}

/**
 * Checks if a node is a type predicate (using 'is' keyword)
 */
function isTypePredicate(node: TSESTree.TSTypeAnnotation): boolean {
  return node.typeAnnotation.type === AST_NODE_TYPES.TSTypePredicate;
}

/**
 * Checks if a node is inside a return statement
 */
function isInsideReturnStatement(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | undefined = node;

  while (current?.parent) {
    // If we encounter a variable declaration before a return statement,
    // then the node is not directly inside a return statement
    if (current.parent.type === AST_NODE_TYPES.VariableDeclarator ||
        current.parent.type === AST_NODE_TYPES.VariableDeclaration) {
      return false;
    }

    if (current.parent.type === AST_NODE_TYPES.ReturnStatement) {
      return true;
    }
    current = current.parent;
  }

  return false;
}

/**
 * Checks if a node is inside a conditional statement
 */
function isInsideConditionalStatement(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | undefined = node;

  while (current?.parent) {
    if (
      current.parent.type === AST_NODE_TYPES.IfStatement ||
      current.parent.type === AST_NODE_TYPES.WhileStatement ||
      current.parent.type === AST_NODE_TYPES.DoWhileStatement ||
      current.parent.type === AST_NODE_TYPES.ForStatement ||
      current.parent.type === AST_NODE_TYPES.ConditionalExpression
    ) {
      // If we're in a conditional statement but not in a return statement, it's valid
      return !isInsideReturnStatement(current.parent);
    }
    current = current.parent;
  }

  return false;
}

/**
 * Checks if a type assertion is used to access a property
 */
function isPropertyAccess(
  node: TSESTree.TSAsExpression | TSESTree.TSTypeAssertion,
): boolean {
  return (
    node.parent?.type === AST_NODE_TYPES.MemberExpression &&
    node.parent.object === node
  );
}

/**
 * Checks if a type assertion is used within an array includes check
 */
function isArrayIncludesCheck(
  node: TSESTree.TSAsExpression | TSESTree.TSTypeAssertion,
): boolean {
  return (
    node.parent?.type === AST_NODE_TYPES.CallExpression &&
    node.parent.arguments.includes(node) &&
    node.parent.callee.type === AST_NODE_TYPES.MemberExpression &&
    node.parent.callee.property.type === AST_NODE_TYPES.Identifier &&
    node.parent.callee.property.name === 'includes'
  );
}

export const noTypeAssertionReturns = createRule<Options, MessageIds>({
  name: 'no-type-assertion-returns',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce typing variables before returning them, rather than using type assertions or explicit return types',
      recommended: 'error',
      requiresTypeChecking: false,
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          allowAsConst: { type: 'boolean' },
          allowTypePredicates: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noTypeAssertionReturns:
        'Type assertions in return statements are not allowed. Type the variable explicitly before returning it.',
      useExplicitVariable:
        'Explicit return type annotations are not allowed. Type the variable explicitly before returning it.',
    },
  },
  defaultOptions: [defaultOptions],
  create(context, [options]) {
    const mergedOptions = { ...defaultOptions, ...options };

    /**
     * Checks if a node is inside a JSX attribute or object property (which could be JSX props)
     */
    function isInsideJSXAttributeOrObjectProperty(
      node: TSESTree.Node,
    ): boolean {
      let current: TSESTree.Node | undefined = node;

      while (current?.parent) {
        // Direct JSX attribute
        if (current.parent.type === AST_NODE_TYPES.JSXAttribute) {
          return true;
        }

        // Object property (which could be JSX props)
        if (current.parent.type === AST_NODE_TYPES.Property) {
          return true;
        }

        current = current.parent;
      }

      return false;
    }

    /**
     * Common function to check if a type assertion should be allowed
     */
    function shouldAllowTypeAssertion(
      node: TSESTree.TSAsExpression | TSESTree.TSTypeAssertion,
    ): boolean {
      // If the parent is a return statement, we already handle it in ReturnStatement
      if (node.parent?.type === AST_NODE_TYPES.ReturnStatement) {
        return true;
      }

      // If the parent is an arrow function, we already handle it in ArrowFunctionExpression
      if (node.parent?.type === AST_NODE_TYPES.ArrowFunctionExpression) {
        return true;
      }

      // If the parent is a variable declarator, this is a variable declaration with type assertion
      // which is a valid pattern and should not be flagged
      if (node.parent?.type === AST_NODE_TYPES.VariableDeclarator) {
        return true;
      }

      // Allow type assertions within conditional statements (if, while, do-while, for)
      if (
        node.parent?.type === AST_NODE_TYPES.IfStatement ||
        node.parent?.type === AST_NODE_TYPES.WhileStatement ||
        node.parent?.type === AST_NODE_TYPES.DoWhileStatement ||
        node.parent?.type === AST_NODE_TYPES.ForStatement
      ) {
        return true;
      }

      // Allow type assertions within logical expressions (which are often used in conditions)
      if (node.parent?.type === AST_NODE_TYPES.LogicalExpression) {
        return true;
      }

      // Allow type assertions within method calls like array.includes()
      if (
        node.parent?.type === AST_NODE_TYPES.CallExpression &&
        node.parent.callee.type === AST_NODE_TYPES.MemberExpression
      ) {
        return true;
      }

      // Allow type assertions within array includes checks
      if (isArrayIncludesCheck(node)) {
        return true;
      }

      // Allow type assertions within conditional expressions, but only if they're not part of a return statement
      if (
        node.parent?.type === AST_NODE_TYPES.ConditionalExpression &&
        !isInsideReturnStatement(node)
      ) {
        return true;
      }

      // Allow type assertions used to access properties in conditional contexts
      if (isPropertyAccess(node) && isInsideConditionalStatement(node)) {
        return true;
      }

      // Allow type assertions in object instantiations (as constructor arguments)
      if (
        node.parent?.type === AST_NODE_TYPES.ObjectExpression &&
        node.parent.parent?.type === AST_NODE_TYPES.NewExpression
      ) {
        return true;
      }

      // Allow type assertions as arguments to constructors
      if (
        node.parent?.type === AST_NODE_TYPES.NewExpression ||
        (node.parent?.type === AST_NODE_TYPES.CallExpression &&
          node.parent.parent?.type === AST_NODE_TYPES.NewExpression)
      ) {
        return true;
      }

      // Allow type assertions as arguments to constructor calls
      if (
        node.parent?.type === AST_NODE_TYPES.CallExpression
      ) {
        let current: TSESTree.Node | undefined = node.parent;
        while (current?.parent) {
          if (current.parent.type === AST_NODE_TYPES.NewExpression) {
            return true;
          }
          current = current.parent;
        }
      }

      // Allow type assertions in JSX attributes/props or object properties
      if (isInsideJSXAttributeOrObjectProperty(node)) {
        return true;
      }

      // Only flag type assertions in return statements
      if (!isInsideReturnStatement(node)) {
        return true;
      }

      return false;
    }

    /**
     * Check if the current file is a .f.ts file
     */
    function isFunctionFile(context: any): boolean {
      const filename = context.getFilename();
      return filename.endsWith('.f.ts');
    }

    /**
     * Common function to check function return types
     */
    function checkFunctionReturnType(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression,
    ) {
      if (!node.returnType) return;

      // Skip checking return types in .f.ts files
      if (isFunctionFile(context)) {
        return;
      }

      // Allow type predicates if configured
      if (
        mergedOptions.allowTypePredicates &&
        isTypePredicate(node.returnType)
      ) {
        return;
      }

      // If type predicates are not allowed, report them
      if (
        !mergedOptions.allowTypePredicates &&
        isTypePredicate(node.returnType)
      ) {
        context.report({
          node: node.returnType,
          messageId: 'useExplicitVariable',
        });
        return;
      }

      // Check if the function has a return statement with a direct value (not a variable)
      if (node.body && node.body.type === AST_NODE_TYPES.BlockStatement) {
        for (const statement of node.body.body) {
          if (
            statement.type === AST_NODE_TYPES.ReturnStatement &&
            statement.argument
          ) {
            // If returning a variable reference, that's fine
            if (statement.argument.type === AST_NODE_TYPES.Identifier) {
              continue;
            }

            // If returning an object literal, array literal, or other complex expression
            // without first assigning it to a typed variable, that's a problem
            if (
              statement.argument.type === AST_NODE_TYPES.ObjectExpression ||
              statement.argument.type === AST_NODE_TYPES.ArrayExpression ||
              statement.argument.type === AST_NODE_TYPES.CallExpression
            ) {
              context.report({
                node: node.returnType,
                messageId: 'useExplicitVariable',
              });
              break;
            }
          }
        }
      }
    }

    return {
      // Check for return statements with type assertions
      ReturnStatement(node) {
        if (!node.argument) return;

        // Check for type assertions using 'as' keyword
        if (node.argument.type === AST_NODE_TYPES.TSAsExpression) {
          // Allow 'as const' assertions if configured
          if (mergedOptions.allowAsConst && isAsConstAssertion(node.argument)) {
            return;
          }

          // For nested type assertions, only report the outermost one
          if (node.argument.expression.type === AST_NODE_TYPES.TSAsExpression) {
            context.report({
              node: node.argument,
              messageId: 'noTypeAssertionReturns',
            });
            return;
          }

          context.report({
            node: node.argument,
            messageId: 'noTypeAssertionReturns',
          });
        }

        // Check for type assertions using angle bracket syntax
        if (node.argument.type === AST_NODE_TYPES.TSTypeAssertion) {
          context.report({
            node: node.argument,
            messageId: 'noTypeAssertionReturns',
          });
        }
      },

      // Check functions with explicit return types
      FunctionDeclaration(node) {
        checkFunctionReturnType(node);
      },

      // Check function expressions with explicit return types
      FunctionExpression(node) {
        checkFunctionReturnType(node);
      },

      // Check arrow functions
      ArrowFunctionExpression(node) {
        // For arrow functions with expression bodies (no block)
        if (node.body.type !== AST_NODE_TYPES.BlockStatement) {
          // Check for explicit return type
          if (node.returnType) {
            // Skip checking return types in .f.ts files
            if (isFunctionFile(context)) {
              return;
            }

            // Allow type predicates if configured
            if (
              mergedOptions.allowTypePredicates &&
              isTypePredicate(node.returnType)
            ) {
              return;
            }

            // If type predicates are not allowed, report them
            if (
              !mergedOptions.allowTypePredicates &&
              isTypePredicate(node.returnType)
            ) {
              context.report({
                node: node.returnType,
                messageId: 'useExplicitVariable',
              });
              return;
            }

            // If returning an object literal with explicit return type, report it
            if (
              node.body.type === AST_NODE_TYPES.ObjectExpression ||
              node.body.type === AST_NODE_TYPES.ArrayExpression
            ) {
              context.report({
                node: node.returnType,
                messageId: 'useExplicitVariable',
              });
            }
          }

          // Check for type assertions in the body
          if (node.body.type === AST_NODE_TYPES.TSAsExpression) {
            // Allow 'as const' assertions if configured
            if (mergedOptions.allowAsConst && isAsConstAssertion(node.body)) {
              return;
            }

            context.report({
              node: node.body,
              messageId: 'noTypeAssertionReturns',
            });
          } else if (node.body.type === AST_NODE_TYPES.TSTypeAssertion) {
            context.report({
              node: node.body,
              messageId: 'noTypeAssertionReturns',
            });
          }
        } else if (node.returnType) {
          // For arrow functions with block bodies
          checkFunctionReturnType(node);
        }
      },

      // Check for array methods with type assertions
      CallExpression() {
        // Skip this check as we'll handle it in the TSAsExpression and TSTypeAssertion handlers
      },

      // Check for type assertions in expressions
      TSAsExpression(node) {
        // Allow 'as const' assertions if configured
        if (mergedOptions.allowAsConst && isAsConstAssertion(node)) {
          return;
        }

        // Use the common function to check if the type assertion should be allowed
        if (shouldAllowTypeAssertion(node)) {
          return;
        }

        // For standalone type assertions in expressions
        context.report({
          node,
          messageId: 'noTypeAssertionReturns',
        });
      },

      // Check for type assertions using angle bracket syntax
      TSTypeAssertion(node) {
        // Use the common function to check if the type assertion should be allowed
        if (shouldAllowTypeAssertion(node)) {
          return;
        }

        // For standalone type assertions in expressions
        context.report({
          node,
          messageId: 'noTypeAssertionReturns',
        });
      },
    };
  },
});

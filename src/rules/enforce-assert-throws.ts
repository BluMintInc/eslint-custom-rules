import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'assertShouldThrow' | 'shouldBeAssertPrefixed';

export const enforceAssertThrows = createRule<[], MessageIds>({
  name: 'enforce-assert-throws',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce that functions with assert- prefix must throw an error or call process.exit(1), and functions that call assert- prefixed methods should be prefixed with assert- themselves',
      recommended: 'error',
    },
    schema: [],
    messages: {
      assertShouldThrow:
        'Functions with assert- prefix must throw an error or call process.exit(1). Either rename the function or add a throw/exit statement.',
      shouldBeAssertPrefixed:
        'Functions that call assert- prefixed methods should be prefixed with assert- themselves. Either rename the function to start with assert- or avoid calling assert- methods.',
    },
  },
  defaultOptions: [],
  create(context) {
    function callsAssertMethod(node: TSESTree.Node): boolean {
      let hasAssertCall = false;

      function walk(node: TSESTree.Node): void {
        if (hasAssertCall) return; // Early exit if we found an assert call

        if (node.type === AST_NODE_TYPES.CallExpression) {
          const callee = node.callee;
          if (callee.type === AST_NODE_TYPES.Identifier) {
            if (callee.name.toLowerCase().startsWith('assert')) {
              hasAssertCall = true;
              return;
            }
          }
          if (callee.type === AST_NODE_TYPES.MemberExpression) {
            const property = callee.property;
            if (property.type === AST_NODE_TYPES.Identifier) {
              if (property.name.toLowerCase().startsWith('assert')) {
                hasAssertCall = true;
                return;
              }
            }
          }
        }

        // Don't check calls in nested functions
        if (
          node.type === AST_NODE_TYPES.FunctionDeclaration ||
          node.type === AST_NODE_TYPES.FunctionExpression ||
          node.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          if (node !== currentFunction) {
            return;
          }
        }

        // Handle specific node types that contain other nodes
        switch (node.type) {
          case AST_NODE_TYPES.BlockStatement:
            node.body.forEach((stmt) => walk(stmt));
            break;
          case AST_NODE_TYPES.IfStatement:
            walk(node.consequent);
            if (node.alternate) {
              walk(node.alternate);
            }
            break;
          case AST_NODE_TYPES.ExpressionStatement:
            walk(node.expression);
            break;
          case AST_NODE_TYPES.ReturnStatement:
            if (node.argument) {
              walk(node.argument);
            }
            break;
          case AST_NODE_TYPES.AwaitExpression:
            walk(node.argument);
            break;
          case AST_NODE_TYPES.VariableDeclaration:
            node.declarations.forEach((decl) => walk(decl));
            break;
          case AST_NODE_TYPES.VariableDeclarator:
            if (node.init) {
              walk(node.init);
            }
            break;
          default:
            // Handle other node types generically
            for (const key of Object.keys(node)) {
              if (key === 'parent' || key === 'range' || key === 'loc') continue;
              const value = node[key as keyof typeof node];
              if (Array.isArray(value)) {
                value.forEach((item) => {
                  if (item && typeof item === 'object' && 'type' in item) {
                    walk(item as TSESTree.Node);
                  }
                });
              } else if (
                value &&
                typeof value === 'object' &&
                'type' in value
              ) {
                walk(value as TSESTree.Node);
              }
            }
        }
      }

      walk(node);
      return hasAssertCall;
    }

    function isAssertionCall(node: TSESTree.Node): boolean {
      if (node.type === AST_NODE_TYPES.ExpressionStatement) {
        const expression = node.expression;
        if (expression.type === AST_NODE_TYPES.CallExpression) {
          const callee = expression.callee;
          if (callee.type === AST_NODE_TYPES.Identifier) {
            return callee.name.toLowerCase().startsWith('assert');
          }
          if (callee.type === AST_NODE_TYPES.MemberExpression) {
            const property = callee.property;
            if (property.type === AST_NODE_TYPES.Identifier) {
              return property.name.toLowerCase().startsWith('assert');
            }
          }
        }
      }
      return false;
    }

    function isProcessExit1(node: TSESTree.Node): boolean {
      if (node.type === AST_NODE_TYPES.CallExpression) {
        const callee = node.callee;
        if (
          callee.type === AST_NODE_TYPES.MemberExpression &&
          callee.object.type === AST_NODE_TYPES.Identifier &&
          callee.object.name === 'process' &&
          callee.property.type === AST_NODE_TYPES.Identifier &&
          callee.property.name === 'exit'
        ) {
          const args = node.arguments;
          if (args.length === 1) {
            const arg = args[0];
            if (arg.type === AST_NODE_TYPES.Literal && arg.value === 1) {
              return true;
            }
            // Handle numeric literal 1 in different forms
            if (
              arg.type === AST_NODE_TYPES.UnaryExpression &&
              arg.operator === '+' &&
              arg.argument.type === AST_NODE_TYPES.Literal &&
              arg.argument.value === 1
            ) {
              return true;
            }
          }
        }
      }
      return false;
    }

    function hasThrowStatement(node: TSESTree.Node): boolean {
      let hasThrow = false;

      function walk(node: TSESTree.Node): void {
        if (node.type === AST_NODE_TYPES.ThrowStatement) {
          hasThrow = true;
          return;
        }

        // Check for process.exit(1)
        if (node.type === AST_NODE_TYPES.ExpressionStatement) {
          if (isProcessExit1(node.expression)) {
            hasThrow = true;
            return;
          }
        }

        // Check for assertion function calls
        if (isAssertionCall(node)) {
          hasThrow = true;
          return;
        }

        // Don't check throw statements in nested functions
        if (
          node.type === AST_NODE_TYPES.FunctionDeclaration ||
          node.type === AST_NODE_TYPES.FunctionExpression ||
          node.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          if (node !== currentFunction) {
            return;
          }
        }

        // Check catch blocks for process.exit(1)
        if (node.type === AST_NODE_TYPES.CatchClause) {
          walk(node.body);
          return;
        }

        // Handle TryStatement specially
        if (node.type === AST_NODE_TYPES.TryStatement) {
          walk(node.block);
          if (node.handler) {
            walk(node.handler);
          }
          if (node.finalizer) {
            walk(node.finalizer);
          }
          return;
        }

        // Handle BlockStatement specially
        if (node.type === AST_NODE_TYPES.BlockStatement) {
          node.body.forEach((stmt) => walk(stmt));
          return;
        }

        // Handle IfStatement specially
        if (node.type === AST_NODE_TYPES.IfStatement) {
          walk(node.consequent);
          if (node.alternate) {
            walk(node.alternate);
          }
          return;
        }

        // Handle other node types
        for (const key of Object.keys(node)) {
          const value = node[key as keyof typeof node];
          if (Array.isArray(value)) {
            value.forEach((item) => {
              if (item && typeof item === 'object' && !('parent' in item)) {
                walk(item as TSESTree.Node);
              }
            });
          } else if (
            value &&
            typeof value === 'object' &&
            !('parent' in value)
          ) {
            walk(value as TSESTree.Node);
          }
        }
      }

      walk(node);
      return hasThrow;
    }

    let currentFunction: TSESTree.Node | null = null;

    function checkFunction(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression
        | TSESTree.MethodDefinition,
    ): void {
      let functionName = '';

      if (node.type === AST_NODE_TYPES.MethodDefinition) {
        functionName =
          node.key.type === AST_NODE_TYPES.Identifier ? node.key.name : '';
      } else if (node.type === AST_NODE_TYPES.FunctionDeclaration && node.id) {
        functionName = node.id.name;
      } else if (
        node.type === AST_NODE_TYPES.FunctionExpression ||
        node.type === AST_NODE_TYPES.ArrowFunctionExpression
      ) {
        const parent = node.parent;
        if (
          parent &&
          parent.type === AST_NODE_TYPES.VariableDeclarator &&
          parent.id.type === AST_NODE_TYPES.Identifier
        ) {
          functionName = parent.id.name;
        }
      }

      currentFunction = node;
      const functionBody =
        node.type === AST_NODE_TYPES.MethodDefinition
          ? node.value.body
          : node.body;

      if (functionName.toLowerCase().startsWith('assert')) {
        // Check that assert- prefixed functions throw or call other assert functions
        if (functionBody && !hasThrowStatement(functionBody)) {
          context.report({
            node,
            messageId: 'assertShouldThrow',
          });
        }
      } else if (functionName && functionBody) {
        // Check that functions calling assert- methods are themselves prefixed with assert-
        if (callsAssertMethod(functionBody)) {
          context.report({
            node,
            messageId: 'shouldBeAssertPrefixed',
          });
        }
      }
      currentFunction = null;
    }

    return {
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction,
      MethodDefinition: checkFunction,
    };
  },
});

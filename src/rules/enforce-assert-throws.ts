import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

function isCallbackFunctionNode(node: TSESTree.Node): boolean {
  if (
    node.type !== AST_NODE_TYPES.FunctionExpression &&
    node.type !== AST_NODE_TYPES.ArrowFunctionExpression
  ) {
    return false;
  }

  const parent = node.parent;
  if (!parent) return false;

  if (parent.type === AST_NODE_TYPES.CallExpression) {
    const grandParent = parent.parent;
    if (
      grandParent &&
      (grandParent.type === AST_NODE_TYPES.ConditionalExpression ||
        grandParent.type === AST_NODE_TYPES.LogicalExpression)
    ) {
      return true;
    }
    return parent.arguments.includes(node as any) || parent.callee === node;
  }

  if (
    parent.type === AST_NODE_TYPES.ConditionalExpression ||
    parent.type === AST_NODE_TYPES.LogicalExpression
  ) {
    return true;
  }

  return false;
}

function isTypeLikeNode(node: TSESTree.Node): boolean {
  return node.type.startsWith('TS') || node.type.endsWith('TypeAnnotation');
}

type MessageIds = 'assertShouldThrow' | 'shouldBeAssertPrefixed';

export const enforceAssertThrows = createRule<[], MessageIds>({
  name: 'enforce-assert-throws',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce that functions with an assert prefix must throw an error or call process.exit(1), and functions that call assert-prefixed methods should themselves be assert-prefixed',
      recommended: 'error',
    },
    schema: [],
    messages: {
      assertShouldThrow:
        'Assert helper "{{functionName}}" does not throw, exit, or delegate to another assert helper. Assert-prefixed functions are fail-fast guards; letting them return normally hides failed checks and allows callers to continue with invalid state. Throw an error, call process.exit(1), or rename the function if it should not halt execution.',
      shouldBeAssertPrefixed:
        'Function "{{functionName}}" calls an assert-prefixed helper but is not assert-prefixed itself. The assert- prefix signals that the function terminates on failed checks; without it, callers may assume it returns safely and keep running after an assertion aborts. Rename the function to start with "assert" or avoid calling assert helpers from non-assert functions.',
    },
  },
  defaultOptions: [],
  create(context) {
    function callsAssertMethod(node: TSESTree.Node): boolean {
      let hasAssertCall = false;

      function walk(node: TSESTree.Node): void {
        if (hasAssertCall) return; // Early exit if we found an assert call
        if (isTypeLikeNode(node)) return;

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

        // Handle nested functions - only skip if it's a standalone function, not a callback
        if (
          node.type === AST_NODE_TYPES.FunctionDeclaration ||
          node.type === AST_NODE_TYPES.FunctionExpression ||
          node.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          if (node !== currentFunction) {
            // Allow traversing into callback functions
            if (!isCallbackFunctionNode(node)) {
              return;
            }
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
          case AST_NODE_TYPES.ConditionalExpression:
            walk(node.consequent);
            walk(node.alternate);
            break;
          case AST_NODE_TYPES.LogicalExpression:
            walk(node.left);
            walk(node.right);
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
          case AST_NODE_TYPES.CallExpression:
            // Walk through arguments to find callback functions
            node.arguments.forEach((arg) => walk(arg));
            break;
          case AST_NODE_TYPES.FunctionExpression:
          case AST_NODE_TYPES.ArrowFunctionExpression:
            // For callback functions, walk their body
            if (isCallbackFunctionNode(node)) {
              if (node.body.type === AST_NODE_TYPES.BlockStatement) {
                walk(node.body);
              } else {
                // Arrow function with expression body
                walk(node.body);
              }
            }
            break;
          case AST_NODE_TYPES.ForStatement:
          case AST_NODE_TYPES.ForInStatement:
          case AST_NODE_TYPES.ForOfStatement:
          case AST_NODE_TYPES.WhileStatement:
          case AST_NODE_TYPES.DoWhileStatement:
            walk(node.body);
            break;
          case AST_NODE_TYPES.SwitchStatement:
            node.cases.forEach((caseNode) => walk(caseNode));
            break;
          case AST_NODE_TYPES.SwitchCase:
            node.consequent.forEach((stmt) => walk(stmt));
            break;
          case AST_NODE_TYPES.LabeledStatement:
          case AST_NODE_TYPES.WithStatement:
            walk(node.body);
            break;
          case AST_NODE_TYPES.TryStatement:
            walk(node.block);
            if (node.handler) {
              walk(node.handler);
            }
            if (node.finalizer) {
              walk(node.finalizer);
            }
            break;
          case AST_NODE_TYPES.CatchClause:
            walk(node.body);
            break;
          default:
            // Handle other node types generically
            for (const key of Object.keys(node)) {
              if (key === 'parent' || key === 'range' || key === 'loc')
                continue;
              const value = node[key as keyof typeof node];
              if (Array.isArray(value)) {
                value.forEach((item) => {
                  if (
                    item &&
                    typeof item === 'object' &&
                    'type' in item &&
                    !isTypeLikeNode(item as TSESTree.Node)
                  ) {
                    walk(item as TSESTree.Node);
                  }
                });
              } else if (
                value &&
                typeof value === 'object' &&
                'type' in value &&
                !isTypeLikeNode(value as TSESTree.Node)
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

    // Check if a call expression is calling an assert-prefixed method
    function isCallingAssertMethod(
      node: TSESTree.Node,
      functionBody?: TSESTree.BlockStatement | null,
    ): boolean {
      if (node.type === AST_NODE_TYPES.ReturnStatement && node.argument) {
        return isCallingAssertMethodInExpression(
          node.argument,
          functionBody || undefined,
        );
      } else if (node.type === AST_NODE_TYPES.ExpressionStatement) {
        return isCallingAssertMethodInExpression(
          node.expression,
          functionBody || undefined,
        );
      }
      return false;
    }

    function isCallingAssertMethodInExpression(
      expression: TSESTree.Expression,
      functionBody?: TSESTree.BlockStatement,
    ): boolean {
      // Handle direct call: this.assertSomething()
      if (expression.type === AST_NODE_TYPES.CallExpression) {
        const callee = expression.callee;
        if (callee.type === AST_NODE_TYPES.MemberExpression) {
          const property = callee.property;
          if (property.type === AST_NODE_TYPES.Identifier) {
            return property.name.toLowerCase().startsWith('assert');
          }
        } else if (callee.type === AST_NODE_TYPES.Identifier) {
          // Check if it's a direct assert function call
          if (callee.name.toLowerCase().startsWith('assert')) {
            return true;
          }
          // Check if it's a variable that was assigned an assert method
          if (
            functionBody &&
            isCallingVariableAssignedAssertMethod(expression, functionBody)
          ) {
            return true;
          }
        }

        // Handle chained calls: this.assertA().then(() => this.assertB())
        if (
          callee.type === AST_NODE_TYPES.MemberExpression &&
          callee.property.type === AST_NODE_TYPES.Identifier
        ) {
          // Check if the method name is 'then' or other promise-related methods
          if (['then', 'catch', 'finally'].includes(callee.property.name)) {
            // Check if the first part of the chain is an assert call
            if (callee.object.type === AST_NODE_TYPES.CallExpression) {
              const objectCallee = callee.object.callee;
              if (
                objectCallee.type === AST_NODE_TYPES.MemberExpression &&
                objectCallee.property.type === AST_NODE_TYPES.Identifier
              ) {
                if (
                  objectCallee.property.name.toLowerCase().startsWith('assert')
                ) {
                  return true;
                }
              }
            }

            // Check if any of the arguments to then/catch/finally are calling assert methods
            if (expression.arguments.length > 0) {
              for (const arg of expression.arguments) {
                if (
                  arg.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                  arg.type === AST_NODE_TYPES.FunctionExpression
                ) {
                  // Check the function body for assert calls
                  if (arg.body.type === AST_NODE_TYPES.BlockStatement) {
                    for (const stmt of arg.body.body) {
                      if (isCallingAssertMethod(stmt)) {
                        return true;
                      }
                    }
                  } else if (arg.body.type === AST_NODE_TYPES.CallExpression) {
                    // Arrow function with expression body
                    const arrowCallee = arg.body.callee;
                    if (
                      arrowCallee.type === AST_NODE_TYPES.MemberExpression &&
                      arrowCallee.property.type === AST_NODE_TYPES.Identifier
                    ) {
                      if (
                        arrowCallee.property.name
                          .toLowerCase()
                          .startsWith('assert')
                      ) {
                        return true;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Handle await expression: await this.assertSomething()
      if (expression.type === AST_NODE_TYPES.AwaitExpression) {
        return isCallingAssertMethodInExpression(
          expression.argument,
          functionBody,
        );
      }

      // Handle ternary expressions: condition ? this.assertA() : this.assertB()
      if (expression.type === AST_NODE_TYPES.ConditionalExpression) {
        return (
          isCallingAssertMethodInExpression(
            expression.consequent,
            functionBody,
          ) ||
          isCallingAssertMethodInExpression(expression.alternate, functionBody)
        );
      }

      // Handle logical expressions: this.assertA() || this.assertB()
      if (expression.type === AST_NODE_TYPES.LogicalExpression) {
        return (
          isCallingAssertMethodInExpression(expression.left, functionBody) ||
          isCallingAssertMethodInExpression(expression.right, functionBody)
        );
      }

      return false;
    }

    // Special case for the method chaining pattern in the test
    function hasPromiseChainWithAssertMethods(node: TSESTree.Node): boolean {
      const walkChain = (callExpr: TSESTree.CallExpression): boolean => {
        let current: TSESTree.CallExpression | null = callExpr;

        while (current) {
          const callee = current.callee;

          if (
            callee.type === AST_NODE_TYPES.MemberExpression &&
            callee.property.type === AST_NODE_TYPES.Identifier &&
            callee.property.name.toLowerCase().startsWith('assert')
          ) {
            return true;
          }

          if (
            callee.type === AST_NODE_TYPES.MemberExpression &&
            callee.object.type === AST_NODE_TYPES.CallExpression
          ) {
            // Walk further up any chained call (then/catch/finally or other links).
            current = callee.object;
            continue;
          }

          break;
        }

        return false;
      };

      if (node.type === AST_NODE_TYPES.ReturnStatement && node.argument) {
        if (
          node.argument.type === AST_NODE_TYPES.CallExpression &&
          walkChain(node.argument)
        ) {
          return true;
        }
      }

      if (node.type === AST_NODE_TYPES.VariableDeclaration) {
        for (const declarator of node.declarations) {
          if (
            declarator.init &&
            declarator.init.type === AST_NODE_TYPES.AwaitExpression &&
            declarator.init.argument.type === AST_NODE_TYPES.CallExpression &&
            walkChain(declarator.init.argument)
          ) {
            return true;
          }
        }
      }

      return false;
    }

    // Check if a variable is assigned an assert method
    function isVariableAssignedAssertMethod(
      node: TSESTree.Node,
      variableName: string,
    ): boolean {
      if (node.type === AST_NODE_TYPES.VariableDeclaration) {
        for (const declarator of node.declarations) {
          if (
            declarator.id.type === AST_NODE_TYPES.Identifier &&
            declarator.id.name === variableName &&
            declarator.init
          ) {
            if (
              declarator.init.type === AST_NODE_TYPES.MemberExpression &&
              declarator.init.property.type === AST_NODE_TYPES.Identifier
            ) {
              return declarator.init.property.name
                .toLowerCase()
                .startsWith('assert');
            }
          }
        }
      }
      return false;
    }

    // Check if a call expression is calling a variable that was assigned an assert method
    function isCallingVariableAssignedAssertMethod(
      expression: TSESTree.CallExpression,
      functionBody: TSESTree.BlockStatement,
    ): boolean {
      if (expression.callee.type === AST_NODE_TYPES.Identifier) {
        const variableName = expression.callee.name;
        // Check if this variable was assigned an assert method in the function body
        for (const stmt of functionBody.body) {
          if (isVariableAssignedAssertMethod(stmt, variableName)) {
            return true;
          }
        }
      }
      return false;
    }

    function hasThrowStatement(node: TSESTree.Node): boolean {
      let hasThrow = false;
      const functionBody =
        node.type === AST_NODE_TYPES.BlockStatement ? node : null;

      function walk(node: TSESTree.Node): void {
        if (hasThrow) return; // Early exit if we already found a throw
        if (isTypeLikeNode(node)) return;

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

        // Check for calls to other assert methods
        if (isCallingAssertMethod(node, functionBody)) {
          hasThrow = true;
          return;
        }

        // Check for promise chains with assert methods
        if (hasPromiseChainWithAssertMethods(node)) {
          hasThrow = true;
          return;
        }

        // Handle nested functions - only skip if it's a standalone function, not a callback
        if (
          node.type === AST_NODE_TYPES.FunctionDeclaration ||
          node.type === AST_NODE_TYPES.FunctionExpression ||
          node.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          if (node !== currentFunction) {
            // Allow traversing into callback functions
            if (!isCallbackFunctionNode(node)) {
              return;
            }
          }
        }

        // Handle specific node types that need special traversal
        switch (node.type) {
          case AST_NODE_TYPES.CatchClause:
            walk(node.body);
            return;

          case AST_NODE_TYPES.TryStatement:
            walk(node.block);
            if (node.handler) {
              walk(node.handler);
            }
            if (node.finalizer) {
              walk(node.finalizer);
            }
            return;

          case AST_NODE_TYPES.BlockStatement:
            node.body.forEach((stmt) => walk(stmt));
            return;

          case AST_NODE_TYPES.IfStatement:
            walk(node.consequent);
            if (node.alternate) {
              walk(node.alternate);
            }
            return;

          case AST_NODE_TYPES.ConditionalExpression:
            walk(node.consequent);
            walk(node.alternate);
            return;

          case AST_NODE_TYPES.LogicalExpression:
            walk(node.left);
            walk(node.right);
            return;

          case AST_NODE_TYPES.ForStatement:
            walk(node.body);
            return;

          case AST_NODE_TYPES.ForInStatement:
            walk(node.body);
            return;

          case AST_NODE_TYPES.ForOfStatement:
            walk(node.body);
            return;

          case AST_NODE_TYPES.WhileStatement:
            walk(node.body);
            return;

          case AST_NODE_TYPES.DoWhileStatement:
            walk(node.body);
            return;

          case AST_NODE_TYPES.SwitchStatement:
            node.cases.forEach((caseNode) => walk(caseNode));
            return;

          case AST_NODE_TYPES.SwitchCase:
            node.consequent.forEach((stmt) => walk(stmt));
            return;

          case AST_NODE_TYPES.LabeledStatement:
            walk(node.body);
            return;

          case AST_NODE_TYPES.WithStatement:
            walk(node.body);
            return;

          case AST_NODE_TYPES.ExpressionStatement:
            walk(node.expression);
            return;

          case AST_NODE_TYPES.ReturnStatement:
            if (node.argument) {
              walk(node.argument);
            }
            return;

          case AST_NODE_TYPES.CallExpression:
            // Walk through arguments to find callback functions
            node.arguments.forEach((arg) => walk(arg));
            return;

          case AST_NODE_TYPES.FunctionExpression:
          case AST_NODE_TYPES.ArrowFunctionExpression:
            // For callback functions, walk their body
            if (isCallbackFunctionNode(node)) {
              if (node.body.type === AST_NODE_TYPES.BlockStatement) {
                walk(node.body);
              } else {
                // Arrow function with expression body
                walk(node.body);
              }
            }
            return;

          case AST_NODE_TYPES.VariableDeclaration:
            node.declarations.forEach((decl) => walk(decl));
            return;

          case AST_NODE_TYPES.VariableDeclarator:
            if (node.init) {
              walk(node.init);
            }
            return;

          case AST_NODE_TYPES.AwaitExpression:
            walk(node.argument);
            return;

          default:
            // Handle other node types generically
            for (const key of Object.keys(node)) {
              if (key === 'parent' || key === 'range' || key === 'loc')
                continue;
              const value = node[key as keyof typeof node];
              if (Array.isArray(value)) {
                value.forEach((item) => {
                  if (
                    item &&
                    typeof item === 'object' &&
                    'type' in item &&
                    !isTypeLikeNode(item as TSESTree.Node)
                  ) {
                    walk(item as TSESTree.Node);
                  }
                });
              } else if (
                value &&
                typeof value === 'object' &&
                'type' in value &&
                !isTypeLikeNode(value as TSESTree.Node)
              ) {
                walk(value as TSESTree.Node);
              }
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

      const displayName = functionName || 'this function';

      currentFunction = node;
      const functionBody =
        node.type === AST_NODE_TYPES.MethodDefinition
          ? node.value.body
          : node.body;

      if (functionName.toLowerCase().startsWith('assert')) {
        // Check that assert-prefixed functions throw or call other assert functions
        if (functionBody && !hasThrowStatement(functionBody)) {
          context.report({
            node,
            messageId: 'assertShouldThrow',
            data: { functionName: displayName },
          });
        }
      } else if (functionName && functionBody) {
        // Check that functions calling assert-prefixed methods are themselves prefixed with assert
        if (callsAssertMethod(functionBody)) {
          context.report({
            node,
            messageId: 'shouldBeAssertPrefixed',
            data: { functionName: displayName },
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

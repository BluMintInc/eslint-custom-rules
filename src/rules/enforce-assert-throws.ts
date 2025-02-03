import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'assertShouldThrow';

export const enforceAssertThrows = createRule<[], MessageIds>({
  name: 'enforce-assert-throws',
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce that functions with assert- prefix must throw an error',
      recommended: 'error',
    },
    schema: [],
    messages: {
      assertShouldThrow:
        'Functions with assert- prefix must throw an error. Either rename the function or add a throw statement.',
    },
  },
  defaultOptions: [],
  create(context) {
    function hasThrowStatement(node: TSESTree.Node): boolean {
      let hasThrow = false;

      function walk(node: TSESTree.Node): void {
        if (node.type === AST_NODE_TYPES.ThrowStatement) {
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

        // Don't count throws in catch blocks that are just re-throwing
        if (node.type === AST_NODE_TYPES.CatchClause) {
          return;
        }

        // Handle BlockStatement specially
        if (node.type === AST_NODE_TYPES.BlockStatement) {
          node.body.forEach(stmt => walk(stmt));
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
            value.forEach(item => {
              if (item && typeof item === 'object' && !('parent' in item)) {
                walk(item as TSESTree.Node);
              }
            });
          } else if (value && typeof value === 'object' && !('parent' in value)) {
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
        functionName = node.key.type === AST_NODE_TYPES.Identifier ? node.key.name : '';
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

      if (functionName.toLowerCase().startsWith('assert')) {
        currentFunction = node;
        const functionBody =
          node.type === AST_NODE_TYPES.MethodDefinition ? node.value.body : node.body;

        if (functionBody && !hasThrowStatement(functionBody)) {
          context.report({
            node,
            messageId: 'assertShouldThrow',
          });
        }
        currentFunction = null;
      }
    }

    return {
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction,
      MethodDefinition: checkFunction,
    };
  },
});

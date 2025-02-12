import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'requireConstantKey';

export const requireRouterStateConstantKey = createRule<[], MessageIds>({
  name: 'require-router-state-constant-key',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce using constant variables for useRouterState key parameter',
      recommended: 'warn',
    },
    schema: [],
    messages: {
      requireConstantKey:
        'useRouterState key should be a constant variable with "as const" assertion',
    },
  },
  defaultOptions: [],
  create(context) {
    function isConstantVariable(node: TSESTree.Node): boolean {
      if (node.type === AST_NODE_TYPES.Identifier) {
        const variable = context.getScope().variables.find(
          v => v.name === node.name
        );
        if (!variable) return false;

        const def = variable.defs[0];
        if (!def) return false;

        if (def.node.type === AST_NODE_TYPES.VariableDeclarator) {
          const init = def.node.init;
          if (!init) return false;

          // Check for "as const" assertion
          if (init.type === AST_NODE_TYPES.TSAsExpression) {
            const typeAnnotation = init.typeAnnotation;
            return (
              typeAnnotation.type === AST_NODE_TYPES.TSTypeReference &&
              typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier &&
              typeAnnotation.typeName.name === 'const'
            );
          }
        }
      }
      return false;
    }

    function isValidKey(node: TSESTree.Node): boolean {
      // Allow string literals in test files
      if (context.getFilename().includes('.test.')) {
        return true;
      }

      // Allow template literals for dynamic keys
      if (node.type === AST_NODE_TYPES.TemplateLiteral) {
        return true;
      }

      // Allow member expressions (e.g., ROUTER_KEYS.MATCH)
      if (node.type === AST_NODE_TYPES.MemberExpression) {
        const obj = node.object;
        return obj.type === AST_NODE_TYPES.Identifier && isConstantVariable(obj);
      }

      // Allow logical expressions where at least one operand is constant
      if (node.type === AST_NODE_TYPES.LogicalExpression) {
        return isValidKey(node.left) || isValidKey(node.right);
      }

      // Allow identifiers that are constants
      if (node.type === AST_NODE_TYPES.Identifier) {
        return isConstantVariable(node);
      }

      return false;
    }

    return {
      CallExpression(node) {
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === 'useRouterState' &&
          node.arguments.length > 0
        ) {
          const arg = node.arguments[0];
          if (arg.type === AST_NODE_TYPES.ObjectExpression) {
            const keyProp = arg.properties.find(
              prop =>
                prop.type === AST_NODE_TYPES.Property &&
                prop.key.type === AST_NODE_TYPES.Identifier &&
                prop.key.name === 'key'
            );

            if (keyProp && 'value' in keyProp) {
              if (!isValidKey(keyProp.value)) {
                context.report({
                  node: keyProp,
                  messageId: 'requireConstantKey',
                });
              }
            }
          }
        }
      },
    };
  },
});

import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noClassInstanceDestructuring';

export const noClassInstanceDestructuring = createRule<[], MessageIds>({
  name: 'no-class-instance-destructuring',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow destructuring of class instances to prevent loss of `this` context',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      noClassInstanceDestructuring:
        'Avoid destructuring class instances as it can lead to loss of `this` context. Use direct property access instead.',
    },
  },
  defaultOptions: [],
  create(context) {
    function isClassInstance(node: TSESTree.Expression): boolean {
      // Check for new expressions
      if (node.type === AST_NODE_TYPES.NewExpression) {
        return true;
      }

      // Check for identifiers that might be class instances
      if (node.type === AST_NODE_TYPES.Identifier) {
        const variable = context.getScope().variables.find(
          (v) => v.name === node.name
        );
        if (variable?.defs[0]?.node.type === AST_NODE_TYPES.VariableDeclarator) {
          const init = (variable.defs[0].node as TSESTree.VariableDeclarator).init;
          return init?.type === AST_NODE_TYPES.NewExpression;
        }
      }

      return false;
    }

    return {
      VariableDeclarator(node) {
        if (
          node.id.type === AST_NODE_TYPES.ObjectPattern &&
          node.init &&
          isClassInstance(node.init)
        ) {
          const objectPattern = node.id;
          context.report({
            node,
            messageId: 'noClassInstanceDestructuring',
            *fix(fixer) {
              const sourceCode = context.getSourceCode();
              for (const prop of objectPattern.properties) {
                if (prop.type === AST_NODE_TYPES.Property) {
                  const key = prop.key.type === AST_NODE_TYPES.Identifier ? prop.key.name : sourceCode.getText(prop.key);
                  const value = prop.value.type === AST_NODE_TYPES.Identifier ? prop.value.name : sourceCode.getText(prop.value);

                  // Replace destructuring with property access
                  if (node.init) {
                    yield fixer.replaceText(
                      node,
                      `${value} = ${sourceCode.getText(node.init)}.${key}`
                    );
                  }
                }
              }
            },
          });
        }
      },
    };
  },
});

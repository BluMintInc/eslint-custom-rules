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
        const variableDef = context.getScope().variables.find(
          (variableDef) => variableDef.name === node.name
        );
        if (variableDef?.defs[0]?.node.type === AST_NODE_TYPES.VariableDeclarator) {
          const init = (variableDef.defs[0].node as TSESTree.VariableDeclarator).init;
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
            fix(fixer) {
              const sourceCode = context.getSourceCode();
              const properties = objectPattern.properties;

              // For single property, use simple replacement
              if (properties.length === 1) {
                const prop = properties[0];
                if (prop.type === AST_NODE_TYPES.Property) {
                  const key = prop.key.type === AST_NODE_TYPES.Identifier ? prop.key.name : sourceCode.getText(prop.key);
                  const value = prop.value.type === AST_NODE_TYPES.Identifier ? prop.value.name : sourceCode.getText(prop.value);
                  return fixer.replaceText(
                    node,
                    `const ${value} = ${sourceCode.getText(node.init)}.${key}`
                  );
                }
              }

              // For multiple properties, create multiple declarations
              const declarations = properties
                .filter((prop): prop is TSESTree.Property => prop.type === AST_NODE_TYPES.Property)
                .map(prop => {
                  const key = prop.key.type === AST_NODE_TYPES.Identifier ? prop.key.name : sourceCode.getText(prop.key);
                  const value = prop.value.type === AST_NODE_TYPES.Identifier ? prop.value.name : sourceCode.getText(prop.value);
                  return `const ${value} = ${sourceCode.getText(node.init)}.${key}`;
                })
                .join(';\n');

              return fixer.replaceText(node, declarations);
            },
          });
        }
      },
    };
  },
});

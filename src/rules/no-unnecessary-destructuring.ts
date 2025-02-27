import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

export const noUnnecessaryDestructuring = createRule({
  name: 'no-unnecessary-destructuring',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Avoid unnecessary object destructuring when there is only one property inside the destructured object',
      recommended: 'error',
    },
    messages: {
      noUnnecessaryDestructuring:
        'Avoid unnecessary object destructuring with a single rest property. Use the object directly instead of `{ ...obj }`.',
    },
    schema: [],
    fixable: 'code',
  },
  defaultOptions: [],
  create(context) {
    return {
      VariableDeclarator(node) {
        // Check if we have a destructuring pattern
        if (
          node.id.type === 'ObjectPattern' &&
          node.id.properties.length === 1 &&
          node.id.properties[0].type === 'RestElement'
        ) {
          const restElement = node.id.properties[0] as TSESTree.RestElement;

          // Report the issue
          context.report({
            node,
            messageId: 'noUnnecessaryDestructuring',
            fix(fixer) {
              const sourceCode = context.getSourceCode();
              const restName = sourceCode.getText(restElement.argument);

              // Handle the case where init might be null
              if (!node.init) {
                return null;
              }

              const initText = sourceCode.getText(node.init);

              // Replace the destructuring with direct assignment
              return fixer.replaceText(
                node,
                `${restName} = ${initText}`
              );
            },
          });
        }
      },
    };
  },
});

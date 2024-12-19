import { createRule } from '../utils/createRule';

export = createRule<[], 'callbackPropPrefix' | 'callbackFunctionPrefix'>({
  name: 'consistent-callback-naming',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce consistent naming conventions for callback props and functions',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      callbackPropPrefix:
        'Callback props must be prefixed with "on" (e.g., onClick, onChange)',
      callbackFunctionPrefix:
        'Callback functions should not use "handle" prefix, use descriptive verb phrases instead',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      // Check JSX attributes for callback props
      JSXAttribute(node: any) {
        if (
          node.value &&
          node.value.type === 'JSXExpressionContainer' &&
          node.value.expression.type === 'Identifier'
        ) {
          const propName = node.name.name;
          const valueName = node.value.expression.name;

          // Skip React's built-in event handlers
          if (propName.match(/^on[A-Z]/)) {
            return;
          }

          // Check if the value name indicates it's a callback function
          const isCallbackValue = valueName.startsWith('handle') || 
                                valueName.match(/^(on|set)[A-Z]/);

          if (isCallbackValue && !propName.startsWith('on')) {
            context.report({
              node,
              messageId: 'callbackPropPrefix',
              fix(fixer) {
                // Convert camelCase to PascalCase for the event name
                const eventName =
                  propName.charAt(0).toUpperCase() + propName.slice(1);
                return fixer.replaceText(node.name, `on${eventName}`);
              },
            });
          }
        }
      },

      // Check function declarations and variable declarations for callback functions
      'FunctionDeclaration, VariableDeclarator'(node: any) {
        const functionName = node.id?.name;

        if (functionName && functionName.startsWith('handle')) {
          context.report({
            node,
            messageId: 'callbackFunctionPrefix',
            fix(fixer) {
              // Remove 'handle' prefix and convert first character to lowercase
              const newName =
                functionName.slice(6).charAt(0).toLowerCase() +
                functionName.slice(7);
              return fixer.replaceText(node.id, newName);
            },
          });
        }
      },

      // Check object property methods
      Property(node: any) {
        if (
          node.method &&
          node.key.name &&
          node.key.name.startsWith('handle')
        ) {
          context.report({
            node: node.key,
            messageId: 'callbackFunctionPrefix',
            fix(fixer) {
              // Remove 'handle' prefix and convert first character to lowercase
              const newName =
                node.key.name.slice(6).charAt(0).toLowerCase() +
                node.key.name.slice(7);
              return fixer.replaceText(node.key, newName);
            },
          });
        }
      },
    };
  },
});

import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferUtilityFunctionOverPrivateStatic';

export const preferUtilityFunctionOverPrivateStatic = createRule<
  [],
  MessageIds
>({
  name: 'prefer-utility-function-over-private-static',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce abstraction of private static methods into utility functions',
      recommended: 'error',
    },
    schema: [],
    messages: {
      preferUtilityFunctionOverPrivateStatic:
        'Private static methods should be abstracted into standalone utility functions for better reusability and testability',
    },
  },
  defaultOptions: [],
  create(context) {
    // Helper function to check if a node contains 'this' references
    const hasThisReference = (node: TSESTree.Node): boolean => {
      if (!node) return false;

      // If this is a ThisExpression, we found a reference
      if (node.type === 'ThisExpression') {
        return true;
      }

      // Check all child properties that are objects or arrays
      for (const key in node) {
        const child = (node as any)[key];

        // Skip non-object properties and special properties
        if (!child || typeof child !== 'object' || key === 'parent') {
          continue;
        }

        // If it's an array, check each element
        if (Array.isArray(child)) {
          for (const item of child) {
            if (item && typeof item === 'object' && hasThisReference(item)) {
              return true;
            }
          }
        } else if (hasThisReference(child)) {
          // If it's an object, recursively check it
          return true;
        }
      }

      return false;
    };

    return {
      'MethodDefinition[static=true][accessibility="private"]'(
        node: TSESTree.MethodDefinition,
      ) {
        const sourceCode = context.getSourceCode();
        const methodBody = node.value.body;

        if (!methodBody) {
          return;
        }

        // Get the method body text to check size
        const bodyText = sourceCode.getText(methodBody);
        const lineCount = bodyText.split('\n').length;

        // Skip small methods (less than 4 lines including braces)
        if (lineCount < 4) {
          return;
        }

        // Check if the method uses 'this' keyword by traversing the AST
        const usesThis = hasThisReference(methodBody);

        // If the method doesn't use 'this', it's a good candidate for extraction
        if (!usesThis) {
          context.report({
            node,
            messageId: 'preferUtilityFunctionOverPrivateStatic',
          });
        }
      },
    };
  },
});

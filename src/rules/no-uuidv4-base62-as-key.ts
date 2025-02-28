import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noUuidv4Base62AsKey';
type Options = [];

export const noUuidv4Base62AsKey = createRule<Options, MessageIds>({
  name: 'no-uuidv4-base62-as-key',
  meta: {
    type: 'problem',
    docs: {
      description: 'Avoid using uuidv4Base62() as React list keys',
      recommended: 'error',
    },
    messages: {
      noUuidv4Base62AsKey:
        'Avoid using uuidv4Base62() as a key in React list iterations. Use a stable identifier from the data instead.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    // Track JSXElements that are direct children of a map callback
    const mapCallbackElements = new Set<TSESTree.JSXElement>();

    // Helper function to process map calls
    const processMapCall = (node: TSESTree.CallExpression) => {
      // Get the callback function
      const callback = node.arguments[0];

      if (
        callback &&
        (callback.type === 'ArrowFunctionExpression' ||
          callback.type === 'FunctionExpression')
      ) {
        // Find the return statement or expression
        let returnExpr: TSESTree.Expression | null = null;

        if (
          callback.type === 'ArrowFunctionExpression' &&
          callback.expression &&
          callback.body.type !== 'BlockStatement'
        ) {
          // Arrow function with implicit return
          returnExpr = callback.body;
        } else {
          // Look for return statements in the function body
          const body = callback.body;
          if (body.type === 'BlockStatement') {
            for (const stmt of body.body) {
              if (stmt.type === 'ReturnStatement' && stmt.argument) {
                returnExpr = stmt.argument;
                break;
              }
            }
          }
        }

        // If we found a JSX element as the return value, mark it
        if (returnExpr && returnExpr.type === 'JSXElement') {
          mapCallbackElements.add(returnExpr);
        }
      }
    };

    // Helper function to check if a node is a uuidv4Base62 call
    const isUuidv4Base62Call = (node: TSESTree.Node): boolean => {
      if (node.type !== 'CallExpression') return false;

      const callee = node.callee;
      if (callee.type === 'Identifier') {
        return callee.name === 'uuidv4Base62';
      }

      return false;
    };

    return {
      // Find array.map() calls
      'CallExpression[callee.property.name="map"]'(node: TSESTree.CallExpression) {
        processMapCall(node);
      },

      // Check JSX elements for key props using uuidv4Base62
      JSXElement(node: TSESTree.JSXElement) {
        // Only check elements that are part of a map callback
        if (!mapCallbackElements.has(node)) {
          return;
        }

        // Check if this element has a key prop
        const openingElement = node.openingElement;
        const attributes = openingElement.attributes;

        for (const attr of attributes) {
          if (
            attr.type === 'JSXAttribute' &&
            attr.name.name === 'key' &&
            attr.value &&
            attr.value.type === 'JSXExpressionContainer'
          ) {
            const expression = attr.value.expression;

            // Check if the key is using uuidv4Base62()
            if (isUuidv4Base62Call(expression)) {
              context.report({
                node: attr,
                messageId: 'noUuidv4Base62AsKey',
              });
            }
          }
        }
      },

      // Handle conditional expressions that might contain map callbacks
      ConditionalExpression(node: TSESTree.ConditionalExpression) {
        // Check both the consequent and alternate branches
        if (
          node.consequent.type === 'CallExpression' &&
          node.consequent.callee.type === 'MemberExpression' &&
          node.consequent.callee.property.type === 'Identifier' &&
          node.consequent.callee.property.name === 'map'
        ) {
          processMapCall(node.consequent);
        }

        if (
          node.alternate.type === 'CallExpression' &&
          node.alternate.callee.type === 'MemberExpression' &&
          node.alternate.callee.property.type === 'Identifier' &&
          node.alternate.callee.property.name === 'map'
        ) {
          processMapCall(node.alternate);
        }
      },

      // Handle logical expressions (&&, ||) that might contain map callbacks
      LogicalExpression(node: TSESTree.LogicalExpression) {
        if (
          node.right.type === 'CallExpression' &&
          node.right.callee.type === 'MemberExpression' &&
          node.right.callee.property.type === 'Identifier' &&
          node.right.callee.property.name === 'map'
        ) {
          processMapCall(node.right);
        }
      },
    };
  },
});

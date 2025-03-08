import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'keyOnlyOutermostElement' | 'fragmentShouldHaveKey';
type Options = [];

export const keyOnlyOutermostElement = createRule<Options, MessageIds>({
  name: 'key-only-outermost-element',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce that only the outermost element in list rendering has a key prop',
      recommended: 'error',
    },
    messages: {
      keyOnlyOutermostElement:
        'Only the outermost element in a list rendering should have a key prop. Remove the key from this nested element.',
      fragmentShouldHaveKey:
        'Fragment used as the outermost element in a list should use <React.Fragment key={...}> instead of shorthand syntax.',
    },
    schema: [],
    fixable: 'code',
  },
  defaultOptions: [],
  create(context) {
    // Track JSXElements that are direct children of a map callback
    const mapCallbackElements = new Set<TSESTree.JSXElement>();
    // Track JSXFragments that are direct children of a map callback
    const mapCallbackFragments = new Set<TSESTree.JSXFragment>();
    // Track JSX attributes that have already been reported to avoid duplicate reports
    const reportedAttributes = new Set<TSESTree.JSXAttribute>();

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

        // If we found a JSX element or fragment as the return value, mark it
        if (returnExpr) {
          if (returnExpr.type === 'JSXElement') {
            mapCallbackElements.add(returnExpr);
          } else if (returnExpr.type === 'JSXFragment') {
            mapCallbackFragments.add(returnExpr);

            // Check if it's a shorthand fragment (<>)
            // Shorthand fragments can't have keys, so suggest using React.Fragment
            context.report({
              node: returnExpr.openingFragment,
              messageId: 'fragmentShouldHaveKey',
            });
          }
        }
      }
    };

    return {
      // Find array.map() calls
      'CallExpression[callee.property.name="map"]'(
        node: TSESTree.CallExpression,
      ) {
        processMapCall(node);
      },

      // Check all JSX elements for key props
      JSXElement(node: TSESTree.JSXElement) {
        // Skip if this is the outermost element in a map callback
        if (mapCallbackElements.has(node)) {
          return;
        }

        // Check if this element has a key prop
        const openingElement = node.openingElement;
        const attributes = openingElement.attributes;

        for (let i = 0; i < attributes.length; i++) {
          const attr = attributes[i];
          if (
            attr.type === 'JSXAttribute' &&
            attr.name.name === 'key' &&
            !reportedAttributes.has(attr)
          ) {
            // Check if this element is nested inside a map callback element or fragment
            let parent = node.parent;
            let isNestedInMapCallback = false;

            while (parent) {
              if (
                (parent.type === 'JSXElement' &&
                  mapCallbackElements.has(parent)) ||
                (parent.type === 'JSXFragment' &&
                  mapCallbackFragments.has(parent))
              ) {
                isNestedInMapCallback = true;
                break;
              }
              parent = parent.parent;
            }

            if (isNestedInMapCallback) {
              // Mark this attribute as reported to avoid duplicate reports
              reportedAttributes.add(attr);

              const sourceCode = context.getSourceCode();
              context.report({
                node: attr,
                messageId: 'keyOnlyOutermostElement',
                fix(fixer) {
                  // Find the exact range of the attribute in the source code
                  const startPos = attr.range[0];
                  const endPos = attr.range[1];

                  // Get the text before and after the attribute to check for whitespace
                  const fullText = sourceCode.getText();

                  // Check if there's a space after the attribute
                  let rangeEnd = endPos;
                  if (
                    rangeEnd < fullText.length &&
                    fullText[rangeEnd] === ' '
                  ) {
                    rangeEnd++;
                  }

                  return fixer.replaceTextRange([startPos, rangeEnd], '');
                },
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

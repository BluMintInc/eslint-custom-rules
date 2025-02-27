import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'keyOnlyOutermostElement';
type Options = [];

export const keyOnlyOutermostElement = createRule<Options, MessageIds>({
  name: 'key-only-outermost-element',
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce that only the outermost element in list rendering has a key prop',
      recommended: 'error',
    },
    messages: {
      keyOnlyOutermostElement:
        'Only the outermost element in a list rendering should have a key prop. Remove the key from this nested element.',
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

    return {
      // Find array.map() calls
      'CallExpression[callee.property.name="map"]'(node: TSESTree.CallExpression) {
        // Get the callback function
        const callback = node.arguments[0];

        if (callback && (
          callback.type === 'ArrowFunctionExpression' ||
          callback.type === 'FunctionExpression'
        )) {
          // Find the return statement or expression
          let returnExpr: TSESTree.Expression | null = null;

          if (callback.type === 'ArrowFunctionExpression' &&
              callback.expression &&
              callback.body.type !== 'BlockStatement') {
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

          // If we found a JSX element as the return value, mark it as a map callback element
          if (returnExpr) {
            if (returnExpr.type === 'JSXElement') {
              mapCallbackElements.add(returnExpr);
            } else if (returnExpr.type === 'JSXFragment') {
              mapCallbackFragments.add(returnExpr);
            }
          }
        }
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
          if (attr.type === 'JSXAttribute' && attr.name.name === 'key') {
            // Check if this element is nested inside a map callback element or fragment
            let parent = node.parent;
            let isNestedInMapCallback = false;

            while (parent) {
              if ((parent.type === 'JSXElement' && mapCallbackElements.has(parent)) ||
                  (parent.type === 'JSXFragment' && mapCallbackFragments.has(parent))) {
                isNestedInMapCallback = true;
                break;
              }
              parent = parent.parent;
            }

            if (isNestedInMapCallback) {
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
                  if (rangeEnd < fullText.length && fullText[rangeEnd] === ' ') {
                    rangeEnd++;
                  }

                  return fixer.replaceTextRange([startPos, rangeEnd], '');
                },
              });
            }
          }
        }
      },

      // Also check for keys in JSX elements that are children of fragments in map callbacks
      'JSXFragment > JSXElement > JSXOpeningElement > JSXAttribute[name.name="key"]'(
        node: TSESTree.JSXAttribute
      ) {
        if (node.parent && node.parent.parent && node.parent.parent.parent) {
          const jsxFragment = node.parent.parent.parent;

          if (jsxFragment.type === 'JSXFragment' && mapCallbackFragments.has(jsxFragment)) {
            const sourceCode = context.getSourceCode();
            context.report({
              node,
              messageId: 'keyOnlyOutermostElement',
              fix(fixer) {
                // Find the exact range of the attribute in the source code
                const startPos = node.range[0];
                const endPos = node.range[1];

                // Get the text before and after the attribute to check for whitespace
                const fullText = sourceCode.getText();

                // Check if there's a space after the attribute
                let rangeEnd = endPos;
                if (rangeEnd < fullText.length && fullText[rangeEnd] === ' ') {
                  rangeEnd++;
                }

                return fixer.replaceTextRange([startPos, rangeEnd], '');
              },
            });
          }
        }
      }
    };
  },
});

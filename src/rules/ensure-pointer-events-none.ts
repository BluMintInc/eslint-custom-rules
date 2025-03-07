import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'missingPointerEventsNone';
type Options = [];

/**
 * Checks if a string contains a pseudo-element selector (::before or ::after)
 */
function hasPseudoElementSelector(selector: string): boolean {
  return /::?(before|after)\b/i.test(selector);
}

/**
 * Checks if a property name is position with absolute or fixed value
 */
function isAbsoluteOrFixedPosition(
  propertyName: string,
  propertyValue?: string,
): boolean {
  if (propertyName !== 'position') return false;
  return propertyValue === 'absolute' || propertyValue === 'fixed';
}

/**
 * Checks if a property is pointer-events with a value
 */
function isPointerEventsProperty(propertyName: string): boolean {
  return propertyName === 'pointerEvents' || propertyName === 'pointer-events';
}

export const ensurePointerEventsNone = createRule<Options, MessageIds>({
  name: 'ensure-pointer-events-none',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Ensure pointer-events: none is added to non-interactive pseudo-elements',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      missingPointerEventsNone:
        'Pseudo-elements (::before, ::after) with position: absolute or fixed should have pointer-events: none to prevent blocking interactions with underlying elements',
    },
  },
  defaultOptions: [],
  create(context) {
    // Track style objects that have position: absolute or fixed
    const absolutePositionedStyles = new Map<
      TSESTree.ObjectExpression,
      boolean
    >();

    // Track style objects that already have pointer-events defined
    const stylesWithPointerEvents = new Map<
      TSESTree.ObjectExpression,
      string
    >();

    /**
     * Process a CSS-in-JS style object to check for position: absolute/fixed and pointer-events
     */
    function processStyleObject(node: TSESTree.ObjectExpression) {
      let hasAbsolutePosition = false;
      let pointerEventsValue: string | undefined;

      // Check each property in the style object
      for (const property of node.properties) {
        if (property.type !== AST_NODE_TYPES.Property) continue;

        let propertyName = '';
        let propertyValue: string | undefined;

        // Get property name
        if (property.key.type === AST_NODE_TYPES.Identifier) {
          propertyName = property.key.name;
        } else if (
          property.key.type === AST_NODE_TYPES.Literal &&
          typeof property.key.value === 'string'
        ) {
          propertyName = property.key.value;
        }

        // Get property value if it's a string literal
        if (property.value.type === AST_NODE_TYPES.Literal) {
          propertyValue = String(property.value.value);
        } else if (property.value.type === AST_NODE_TYPES.Identifier) {
          propertyValue = property.value.name;
        }

        // Check if this is position: absolute/fixed
        if (isAbsoluteOrFixedPosition(propertyName, propertyValue)) {
          hasAbsolutePosition = true;
        }

        // Check if this is pointer-events property
        if (isPointerEventsProperty(propertyName)) {
          if (property.value.type === AST_NODE_TYPES.Literal) {
            pointerEventsValue = String(property.value.value);
          } else if (property.value.type === AST_NODE_TYPES.Identifier) {
            pointerEventsValue = property.value.name;
          }
        }
      }

      // Store the results for this style object
      absolutePositionedStyles.set(node, hasAbsolutePosition);
      if (pointerEventsValue !== undefined) {
        stylesWithPointerEvents.set(node, pointerEventsValue);
      }
    }

    /**
     * Check if a style object needs pointer-events: none
     */
    function checkStyleObject(
      node: TSESTree.ObjectExpression,
      selector?: string,
    ) {
      const isPseudoElement = selector && hasPseudoElementSelector(selector);
      const isAbsolutePositioned = absolutePositionedStyles.get(node) || false;
      const pointerEventsValue = stylesWithPointerEvents.get(node);

      // If this is a pseudo-element with absolute positioning but no pointer-events
      if (
        isPseudoElement &&
        isAbsolutePositioned &&
        pointerEventsValue === undefined
      ) {
        context.report({
          node,
          messageId: 'missingPointerEventsNone',
          fix(fixer) {
            // Find the last property in the object
            const sourceCode = context.getSourceCode();
            const properties = node.properties;
            if (properties.length === 0) return null;

            const lastProperty = properties[properties.length - 1];
            const lastPropertyToken = sourceCode.getLastToken(lastProperty);

            if (lastPropertyToken) {
              return fixer.insertTextAfter(
                lastPropertyToken,
                `, pointerEvents: 'none'`,
              );
            }
            return null;
          },
        });
      }

      // If this is a pseudo-element with absolute positioning and pointer-events: auto
      if (
        isPseudoElement &&
        isAbsolutePositioned &&
        pointerEventsValue === 'auto'
      ) {
        // Don't report an error if pointer-events is explicitly set to 'auto'
        // This is an intentional choice by the developer
      }
    }

    return {
      // Check for pseudo-element selectors in styled-components and similar libraries
      TaggedTemplateExpression(node: TSESTree.TaggedTemplateExpression) {
        // Check if this is a styled-components template
        const tag = node.tag;
        let isStyledComponent = false;

        if (
          tag.type === AST_NODE_TYPES.MemberExpression &&
          tag.object.type === AST_NODE_TYPES.Identifier &&
          tag.object.name === 'styled'
        ) {
          isStyledComponent = true;
        } else if (
          tag.type === AST_NODE_TYPES.Identifier &&
          (tag.name === 'styled' || tag.name === 'css')
        ) {
          isStyledComponent = true;
        }

        if (isStyledComponent) {
          // For styled-components, we need to check the template content
          const template = node.quasi.quasis.map((q) => q.value.raw).join('');

          // Check if it contains a pseudo-element with position: absolute/fixed
          if (
            hasPseudoElementSelector(template) &&
            (template.includes('position: absolute') ||
              template.includes('position: fixed'))
          ) {
            // Check if it's missing pointer-events: none
            if (
              !template.includes('pointer-events: none') &&
              !template.includes('pointer-events:none')
            ) {
              context.report({
                node,
                messageId: 'missingPointerEventsNone',
              });
            }
          }
        }
      },

      // Process style objects in JSX
      JSXAttribute(node: TSESTree.JSXAttribute) {
        if (
          node.name.type !== AST_NODE_TYPES.JSXIdentifier ||
          node.name.name !== 'style'
        )
          return;

        if (
          node.value?.type === AST_NODE_TYPES.JSXExpressionContainer &&
          node.value.expression.type === AST_NODE_TYPES.ObjectExpression
        ) {
          processStyleObject(node.value.expression);
          checkStyleObject(node.value.expression);
        }
      },

      // Process style objects in regular JavaScript/TypeScript
      ObjectExpression(node: TSESTree.ObjectExpression) {
        // Skip if parent is not a variable declaration or assignment
        const parent = node.parent;
        if (!parent) return;

        // Check if this might be a style object
        let isStyleObject = false;
        let selector: string | undefined;

        if (
          parent.type === AST_NODE_TYPES.VariableDeclarator &&
          parent.id.type === AST_NODE_TYPES.Identifier &&
          /style/i.test(parent.id.name)
        ) {
          isStyleObject = true;
        } else if (
          parent.type === AST_NODE_TYPES.Property &&
          parent.key.type === AST_NODE_TYPES.Identifier &&
          /style/i.test(parent.key.name)
        ) {
          isStyleObject = true;
        } else if (parent.type === AST_NODE_TYPES.CallExpression) {
          // Check for CSS-in-JS libraries like emotion's css() function
          const callee = parent.callee;
          if (
            callee.type === AST_NODE_TYPES.Identifier &&
            callee.name === 'css'
          ) {
            isStyleObject = true;
          }
        }

        if (isStyleObject) {
          processStyleObject(node);
          checkStyleObject(node, selector);
        }
      },

      // Process CSS-in-JS libraries that use objects with selectors
      Property(node: TSESTree.Property) {
        // Check for patterns like { '&::before': { ... } }
        if (
          node.key.type === AST_NODE_TYPES.Literal &&
          typeof node.key.value === 'string' &&
          hasPseudoElementSelector(node.key.value) &&
          node.value.type === AST_NODE_TYPES.ObjectExpression
        ) {
          processStyleObject(node.value);
          checkStyleObject(node.value, node.key.value);
        }
      },
    };
  },
});

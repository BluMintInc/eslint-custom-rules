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

/**
 * The inset offsets that position a pseudo-element relative to its origin box.
 */
const INSET_PROPERTIES = new Set(['top', 'right', 'bottom', 'left']);

type OffsetSign = 'positive' | 'negative' | 'zero' | 'unknown';

/**
 * Classifies the sign of a leading numeric length in a string offset value
 * (e.g. '-6px' -> negative, '0'/'0px' -> zero, '6px' -> positive). Anything
 * that does not start with an optional-minus number is unknown.
 */
function classifyOffsetString(raw: string): OffsetSign {
  const match = raw.trim().match(/^(-?)(\d+(?:\.\d+)?|\.\d+)/);
  if (!match) return 'unknown';
  const numericPart = parseFloat(match[2]);
  if (numericPart === 0) return 'zero';
  return match[1] === '-' ? 'negative' : 'positive';
}

/**
 * Classifies an inset offset property value (top/right/bottom/left) as a
 * positive, negative, zero, or unknown length. Only the shapes that can be
 * resolved statically are classified; variables, member expressions, template
 * literals, and calls are treated as unknown and never counted toward the
 * hit-slop exemption.
 */
function classifyOffsetValue(value: TSESTree.Node): OffsetSign {
  if (value.type === AST_NODE_TYPES.Literal) {
    if (typeof value.value === 'number') {
      if (value.value === 0) return 'zero';
      return value.value < 0 ? 'negative' : 'positive';
    }
    if (typeof value.value === 'string') {
      return classifyOffsetString(value.value);
    }
    return 'unknown';
  }

  // Negative numeric literals parse as `-` UnaryExpression over a number.
  if (
    value.type === AST_NODE_TYPES.UnaryExpression &&
    value.operator === '-' &&
    value.argument.type === AST_NODE_TYPES.Literal &&
    typeof value.argument.value === 'number'
  ) {
    return value.argument.value === 0 ? 'zero' : 'negative';
  }

  return 'unknown';
}

function formatSelector(selector?: string): string {
  if (!selector) return 'pseudo-element';
  const trimmedSelector = selector.trim();
  const candidates = trimmedSelector
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const match = candidate.match(/::?(before|after)\b/i);
    if (match) return `::${match[1].toLowerCase()}`;
  }

  if (trimmedSelector.length === 0) return 'pseudo-element';

  const snippet = trimmedSelector.slice(0, 40);
  return trimmedSelector.length > 40 ? `${snippet}...` : trimmedSelector;
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
        'What\'s wrong: pseudo-element "{{selector}}" uses absolute or fixed positioning without pointer-events: none. ' +
        'Why it matters: positioned overlays capture clicks, hover, and focus, blocking the underlying control and harming accessibility. ' +
        'How to fix: add pointer-events: none so the pseudo-element stays decorative and does not intercept interactions.',
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

    // Track style objects that are hit-slop touch-target extensions: an
    // absolute/fixed overlay whose inset offsets only extend beyond the origin
    // box (>=1 negative, none positive). A browser attributes pointer events on
    // a pseudo-element to its origin element, so such an overlay cannot occlude
    // the control and must not be flagged (its autofix would shrink the tap
    // target, the very accessibility regression this rule exists to prevent).
    const hitSlopStyles = new Map<TSESTree.ObjectExpression, boolean>();

    /**
     * Process a CSS-in-JS style object to check for position: absolute/fixed and pointer-events
     */
    function processStyleObject(node: TSESTree.ObjectExpression) {
      let hasAbsolutePosition = false;
      let pointerEventsValue: string | undefined;
      let hasNegativeOffset = false;
      let hasPositiveOffset = false;

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

        // Track inset offsets to detect hit-slop touch-target extensions
        if (INSET_PROPERTIES.has(propertyName)) {
          const sign = classifyOffsetValue(property.value);
          if (sign === 'negative') {
            hasNegativeOffset = true;
          } else if (sign === 'positive') {
            hasPositiveOffset = true;
          }
        }
      }

      // Store the results for this style object
      absolutePositionedStyles.set(node, hasAbsolutePosition);
      if (pointerEventsValue !== undefined) {
        stylesWithPointerEvents.set(node, pointerEventsValue);
      }

      // A hit-slop extension only enlarges the tappable area: it is
      // absolute/fixed and its inset offsets extend outward (>=1 negative, none
      // positive). Such overlays cannot occlude the control they belong to.
      hitSlopStyles.set(
        node,
        hasAbsolutePosition && hasNegativeOffset && !hasPositiveOffset,
      );
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

      // A hit-slop touch-target extension extends the origin element's tappable
      // area outward; because pointer events on it are attributed to the origin
      // control, it cannot block anything. Skip reporting (and its destructive
      // shrink-the-tap-target autofix).
      if (hitSlopStyles.get(node)) {
        return;
      }

      // If this is a pseudo-element with absolute positioning but no pointer-events
      if (
        isPseudoElement &&
        isAbsolutePositioned &&
        pointerEventsValue === undefined
      ) {
        context.report({
          node,
          messageId: 'missingPointerEventsNone',
          data: {
            selector: formatSelector(selector),
          },
          fix(fixer) {
            // Find the last property in the object
            const sourceCode = context.sourceCode;
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
                data: {
                  selector: formatSelector(template),
                },
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

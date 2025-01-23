import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'compositingLayer';

// Convert camelCase to kebab-case
function toKebabCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
}

// Normalize property name to kebab-case for consistent lookup
function normalizePropertyName(name: string): string {
  // If already contains hyphens, assume it's kebab-case
  if (name.includes('-')) return name.toLowerCase();
  // Convert camelCase to kebab-case
  return toKebabCase(name).toLowerCase();
}

const COMPOSITING_PROPERTIES = new Set([
  'filter',
  'backdrop-filter',
  'will-change',
  'transform',
  'perspective',
  'backface-visibility',
  'contain',
  'mix-blend-mode',
  'opacity',
]);

const COMPOSITING_VALUES = new Set([
  'translate3d',
  'scale3d',
  'translateZ',
  'transparent',
]);

export const noCompositingLayerProps = createRule<[], MessageIds>({
  name: 'no-compositing-layer-props',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Warn when using CSS properties that trigger compositing layers',
      recommended: 'warn',
    },
    schema: [],
    messages: {
      compositingLayer: '{{property}} may trigger a new compositing layer which can impact performance. Consider using alternative properties or add an eslint-disable comment if the layer promotion is intentional.',
    },
  },
  defaultOptions: [],
  create(context) {
    const seenNodes = new WeakSet<TSESTree.Node>();

    function checkPropertyValue(value: string): boolean {
      return COMPOSITING_VALUES.has(value) ||
        value.includes('translate3d') ||
        value.includes('scale3d') ||
        value.includes('translateZ');
    }

    function checkProperty(propertyName: string, propertyValue?: string): boolean {
      const normalizedName = normalizePropertyName(propertyName);
      if (COMPOSITING_PROPERTIES.has(normalizedName)) {
        // Special case for opacity - only warn if it's animated or fractional
        if (normalizedName === 'opacity') {
          if (!propertyValue) return false;
          const numValue = Number.parseFloat(propertyValue);
          if (isNaN(numValue)) return false;
          return numValue > 0 && numValue < 1;
        }
        return true;
      }
      if (propertyValue && checkPropertyValue(propertyValue)) {
        return true;
      }
      return false;
    }

    function checkNode(node: TSESTree.Property): void {
      // Skip if we've already processed this node
      if (seenNodes.has(node)) return;
      seenNodes.add(node);

      let propertyName = '';
      let propertyValue = '';

      // Get property name
      if (node.key.type === AST_NODE_TYPES.Identifier) {
        propertyName = node.key.name;
      } else if (node.key.type === AST_NODE_TYPES.Literal) {
        propertyName = String(node.key.value);
      }

      // Get property value if it's a string literal or numeric literal
      if (node.value.type === AST_NODE_TYPES.Literal) {
        propertyValue = String(node.value.value);
      }

      if (checkProperty(propertyName, propertyValue)) {
        context.report({
          node,
          messageId: 'compositingLayer',
          data: {
            property: propertyName,
          },
        });
      }
    }

    return {
      // Handle object literal properties (inline styles)
      Property(node: TSESTree.Property) {
        if (node.parent?.type !== AST_NODE_TYPES.ObjectExpression) return;
        checkNode(node);
      },

      // Handle JSX style attributes
      JSXAttribute(node: TSESTree.JSXAttribute) {
        if (node.name.name !== 'style') return;

        if (node.value?.type === AST_NODE_TYPES.JSXExpressionContainer &&
            node.value.expression.type === AST_NODE_TYPES.ObjectExpression) {
          node.value.expression.properties.forEach((prop) => {
            if (prop.type === AST_NODE_TYPES.Property) {
              checkNode(prop);
            }
          });
        }
      },
    };
  },
});

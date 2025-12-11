"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noCompositingLayerProps = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
// Convert camelCase to kebab-case
function toKebabCase(str) {
    return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
// Normalize property name to kebab-case for consistent lookup
function normalizePropertyName(name) {
    // If already contains hyphens, assume it's kebab-case
    if (name.includes('-'))
        return name.toLowerCase();
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
exports.noCompositingLayerProps = (0, createRule_1.createRule)({
    name: 'no-compositing-layer-props',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Warn when using CSS properties that trigger compositing layers, which can impact performance. Properties like transform, opacity, filter, and will-change create new GPU layers. While sometimes beneficial for animations, excessive layer creation can increase memory usage and hurt performance. This rule checks both regular style objects and MUI sx props. Consider alternatives or explicitly document intentional layer promotion.',
            recommended: 'error',
        },
        schema: [],
        messages: {
            compositingLayer: '{{property}} may trigger a new compositing layer which can impact performance. Consider using alternative properties or add an eslint-disable comment if the layer promotion is intentional.',
        },
    },
    defaultOptions: [],
    create(context) {
        const seenNodes = new WeakSet();
        function checkPropertyValue(value) {
            return (COMPOSITING_VALUES.has(value) ||
                value.includes('translate3d') ||
                value.includes('scale3d') ||
                value.includes('translateZ'));
        }
        function checkProperty(propertyName, propertyValue) {
            const normalizedName = normalizePropertyName(propertyName);
            if (COMPOSITING_PROPERTIES.has(normalizedName)) {
                // Special case for opacity - only warn if it's animated or fractional
                if (normalizedName === 'opacity') {
                    if (!propertyValue)
                        return false;
                    const numValue = Number.parseFloat(propertyValue);
                    if (Number.isNaN(numValue))
                        return false;
                    return numValue > 0 && numValue < 1;
                }
                return true;
            }
            if (propertyValue && checkPropertyValue(propertyValue)) {
                return true;
            }
            return false;
        }
        function isStyleContext(node) {
            let current = node;
            while (current?.parent) {
                // Check for JSX style attribute
                if (current.parent.type === utils_1.AST_NODE_TYPES.JSXAttribute &&
                    current.parent.name.type === utils_1.AST_NODE_TYPES.JSXIdentifier &&
                    (current.parent.name.name === 'style' ||
                        current.parent.name.name === 'sx')) {
                    return true;
                }
                // Check for style-related variable names or properties
                if (current.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                    current.id.type === utils_1.AST_NODE_TYPES.Identifier &&
                    /style/i.test(current.id.name)) {
                    return true;
                }
                // Check for style-related object property assignments
                if (current.parent.type === utils_1.AST_NODE_TYPES.Property &&
                    current.parent.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                    (/style/i.test(current.parent.key.name) ||
                        current.parent.key.name === 'sx')) {
                    return true;
                }
                // Skip if we're in a TypeScript type definition
                if (current.type === utils_1.AST_NODE_TYPES.TSTypeAliasDeclaration ||
                    current.type === utils_1.AST_NODE_TYPES.TSInterfaceDeclaration ||
                    current.type === utils_1.AST_NODE_TYPES.TSPropertySignature) {
                    return false;
                }
                current = current.parent;
            }
            return false;
        }
        function checkNode(node) {
            // Skip if we've already processed this node
            if (seenNodes.has(node))
                return;
            seenNodes.add(node);
            // Skip if not in a style context
            if (!isStyleContext(node))
                return;
            let propertyName = '';
            let propertyValue = '';
            // Get property name
            if (node.key.type === utils_1.AST_NODE_TYPES.Identifier) {
                propertyName = node.key.name;
            }
            else if (node.key.type === utils_1.AST_NODE_TYPES.Literal) {
                propertyName = String(node.key.value);
            }
            // Get property value if it's a string literal or numeric literal
            if (node.value.type === utils_1.AST_NODE_TYPES.Literal) {
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
            Property(node) {
                if (node.parent?.type !== utils_1.AST_NODE_TYPES.ObjectExpression)
                    return;
                checkNode(node);
            },
            // Handle JSX style and sx attributes
            JSXAttribute(node) {
                if (node.name.name !== 'style' && node.name.name !== 'sx')
                    return;
                if (node.value?.type === utils_1.AST_NODE_TYPES.JSXExpressionContainer &&
                    node.value.expression.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                    node.value.expression.properties.forEach((prop) => {
                        if (prop.type === utils_1.AST_NODE_TYPES.Property) {
                            checkNode(prop);
                        }
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=no-compositing-layer-props.js.map
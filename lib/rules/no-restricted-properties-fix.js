"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noRestrictedPropertiesFix = void 0;
const createRule_1 = require("../utils/createRule");
const utils_1 = require("@typescript-eslint/utils");
/**
 * This rule is a wrapper around the core ESLint no-restricted-properties rule
 * that adds special handling for Object.keys() and Object.values() results.
 * It prevents false positives when accessing standard array properties/methods
 * on the arrays returned by Object.keys() and Object.values().
 */
exports.noRestrictedPropertiesFix = (0, createRule_1.createRule)({
    name: 'no-restricted-properties-fix',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Disallow certain properties on certain objects, with special handling for Object.keys() and Object.values()',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [
            {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        object: { type: 'string' },
                        property: { type: 'string' },
                        message: { type: 'string' },
                        allowObjects: {
                            type: 'array',
                            items: { type: 'string' },
                        },
                    },
                    additionalProperties: false,
                },
            },
        ],
        messages: {
            restrictedProperty: 'Access to "{{objectName}}.{{propertyName}}" is restricted. {{restrictionReason}}Restricted properties often bypass safer APIs, hide side effects, or encourage patterns this codebase forbids. Use the allowed alternative from your rule configuration or remove this property access.',
        },
    },
    defaultOptions: [[]],
    create(context, [restrictedProperties]) {
        if (!restrictedProperties || restrictedProperties.length === 0) {
            return {};
        }
        const SAFE_ARRAY_PROPERTIES = new Set([
            'length',
            'sort',
            'filter',
            'map',
            'reduce',
            'forEach',
            'join',
            'slice',
            'concat',
        ]);
        /**
         * Keeps the templated message readable by only adding a trailing space
         * when a restriction reason is provided.
         */
        function formatRestrictionReason(message) {
            return message ? `${message} ` : '';
        }
        /**
         * Checks if the given node is a result of Object.keys() or Object.values()
         * @param node The node to check
         * @returns True if the node is a result of Object.keys() or Object.values()
         */
        function isObjectKeysOrValuesResult(node) {
            if (node.type !== utils_1.AST_NODE_TYPES.CallExpression) {
                return false;
            }
            const callee = node.callee;
            if (callee.type !== utils_1.AST_NODE_TYPES.MemberExpression) {
                return false;
            }
            if (callee.object.type !== utils_1.AST_NODE_TYPES.Identifier ||
                callee.object.name !== 'Object') {
                return false;
            }
            if (callee.property.type !== utils_1.AST_NODE_TYPES.Identifier ||
                (callee.property.name !== 'keys' && callee.property.name !== 'values')) {
                return false;
            }
            return true;
        }
        return {
            MemberExpression(node) {
                // Skip if the object is a result of Object.keys() or Object.values()
                if (isObjectKeysOrValuesResult(node.object)) {
                    if (node.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                        SAFE_ARRAY_PROPERTIES.has(node.property.name)) {
                        return;
                    }
                }
                // Apply the original rule logic
                for (const restrictedProp of restrictedProperties) {
                    const objectMatches = restrictedProp.object &&
                        node.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                        node.object.name === restrictedProp.object;
                    const propertyMatches = restrictedProp.property &&
                        ((node.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                            node.property.name === restrictedProp.property) ||
                            (node.property.type === utils_1.AST_NODE_TYPES.Literal &&
                                node.property.value === restrictedProp.property));
                    // If both object and property are restricted
                    if (restrictedProp.object &&
                        restrictedProp.property &&
                        objectMatches &&
                        propertyMatches) {
                        context.report({
                            node,
                            messageId: 'restrictedProperty',
                            data: {
                                objectName: restrictedProp.object,
                                propertyName: restrictedProp.property,
                                restrictionReason: formatRestrictionReason(restrictedProp.message),
                            },
                            fix: () => null,
                        });
                    }
                    // If only property is restricted (for any object)
                    else if (!restrictedProp.object &&
                        restrictedProp.property &&
                        propertyMatches) {
                        // Check if the object is in the allowObjects list
                        if (restrictedProp.allowObjects &&
                            node.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                            restrictedProp.allowObjects.includes(node.object.name)) {
                            continue;
                        }
                        const objectName = node.object.type === utils_1.AST_NODE_TYPES.Identifier
                            ? node.object.name
                            : 'unknown';
                        context.report({
                            node,
                            messageId: 'restrictedProperty',
                            data: {
                                objectName,
                                propertyName: restrictedProp.property,
                                restrictionReason: formatRestrictionReason(restrictedProp.message),
                            },
                            fix: () => null,
                        });
                    }
                    // If only object is restricted (any property)
                    else if (restrictedProp.object &&
                        !restrictedProp.property &&
                        objectMatches) {
                        const propertyName = node.property.type === utils_1.AST_NODE_TYPES.Identifier
                            ? node.property.name
                            : node.property.type === utils_1.AST_NODE_TYPES.Literal
                                ? String(node.property.value)
                                : 'unknown';
                        context.report({
                            node,
                            messageId: 'restrictedProperty',
                            data: {
                                objectName: restrictedProp.object,
                                propertyName,
                                restrictionReason: formatRestrictionReason(restrictedProp.message),
                            },
                            fix: () => null,
                        });
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=no-restricted-properties-fix.js.map
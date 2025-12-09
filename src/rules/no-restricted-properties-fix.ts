import { createRule } from '../utils/createRule';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

type MessageIds = 'restrictedProperty';

/**
 * This rule is a wrapper around the core ESLint no-restricted-properties rule
 * that adds special handling for Object.keys() and Object.values() results.
 * It prevents false positives when accessing standard array properties/methods
 * on the arrays returned by Object.keys() and Object.values().
 */
export const noRestrictedPropertiesFix = createRule<
  [
    {
      object?: string;
      property?: string;
      message?: string;
      allowObjects?: string[];
    }[],
  ],
  MessageIds
>({
  name: 'no-restricted-properties-fix',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow certain properties on certain objects, with special handling for Object.keys() and Object.values()',
      recommended: 'error',
    },
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
      restrictedProperty:
        'Access to "{{objectName}}.{{propertyName}}" is restricted. {{restrictionReason}}Restricted properties often bypass safer APIs, hide side effects, or encourage patterns this codebase forbids. Use the allowed alternative from your rule configuration or remove this property access.',
    },
  },
  defaultOptions: [[]],
  create(context, [restrictedProperties]) {
    if (!restrictedProperties || restrictedProperties.length === 0) {
      return {};
    }

    /**
     * Checks if the given node is a result of Object.keys() or Object.values()
     * @param node The node to check
     * @returns True if the node is a result of Object.keys() or Object.values()
     */
    function isObjectKeysOrValuesResult(node: any): boolean {
      // Check if the node is a call expression
      if (node.type !== AST_NODE_TYPES.CallExpression) {
        return false;
      }

      // Check if the callee is a member expression (e.g., Object.keys)
      if (node.callee.type !== AST_NODE_TYPES.MemberExpression) {
        return false;
      }

      // Check if the object is 'Object'
      if (
        node.callee.object.type !== AST_NODE_TYPES.Identifier ||
        node.callee.object.name !== 'Object'
      ) {
        return false;
      }

      // Check if the property is 'keys' or 'values'
      if (
        node.callee.property.type !== AST_NODE_TYPES.Identifier ||
        (node.callee.property.name !== 'keys' &&
          node.callee.property.name !== 'values')
      ) {
        return false;
      }

      return true;
    }

    return {
      MemberExpression(node) {
        // Skip if the object is a result of Object.keys() or Object.values()
        if (isObjectKeysOrValuesResult(node.object)) {
          // Allow common array methods and properties
          const safeArrayProperties = [
            'length',
            'sort',
            'filter',
            'map',
            'reduce',
            'forEach',
            'join',
            'slice',
            'concat',
          ];

          if (
            node.property.type === AST_NODE_TYPES.Identifier &&
            safeArrayProperties.includes(node.property.name)
          ) {
            return;
          }
        }

        // Apply the original rule logic
        for (const restrictedProp of restrictedProperties) {
          const objectName =
            restrictedProp.object &&
            node.object.type === AST_NODE_TYPES.Identifier &&
            node.object.name === restrictedProp.object;

          const propertyName =
            restrictedProp.property &&
            ((node.property.type === AST_NODE_TYPES.Identifier &&
              node.property.name === restrictedProp.property) ||
              (node.property.type === AST_NODE_TYPES.Literal &&
                node.property.value === restrictedProp.property));

          // If both object and property are restricted
          if (
            restrictedProp.object &&
            restrictedProp.property &&
            objectName &&
            propertyName
          ) {
            context.report({
              node,
              messageId: 'restrictedProperty',
              data: {
                objectName: restrictedProp.object,
                propertyName: restrictedProp.property,
                restrictionReason: restrictedProp.message
                  ? `${restrictedProp.message} `
                  : '',
              },
            });
          }
          // If only property is restricted (for any object)
          else if (
            !restrictedProp.object &&
            restrictedProp.property &&
            propertyName
          ) {
            // Check if the object is in the allowObjects list
            if (
              restrictedProp.allowObjects &&
              node.object.type === AST_NODE_TYPES.Identifier &&
              restrictedProp.allowObjects.includes(node.object.name)
            ) {
              continue;
            }

            const objectName =
              node.object.type === AST_NODE_TYPES.Identifier
                ? node.object.name
                : 'unknown';

            context.report({
              node,
              messageId: 'restrictedProperty',
              data: {
                objectName,
                propertyName: restrictedProp.property,
                restrictionReason: restrictedProp.message
                  ? `${restrictedProp.message} `
                  : '',
              },
            });
          }
          // If only object is restricted (any property)
          else if (
            restrictedProp.object &&
            !restrictedProp.property &&
            objectName
          ) {
            const propertyName =
              node.property.type === AST_NODE_TYPES.Identifier
                ? node.property.name
                : node.property.type === AST_NODE_TYPES.Literal
                ? String(node.property.value)
                : 'unknown';

            context.report({
              node,
              messageId: 'restrictedProperty',
              data: {
                objectName: restrictedProp.object,
                propertyName,
                restrictionReason: restrictedProp.message
                  ? `${restrictedProp.message} `
                  : '',
              },
            });
          }
        }
      },
    };
  },
});

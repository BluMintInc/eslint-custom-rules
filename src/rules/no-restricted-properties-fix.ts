import { createRule } from '../utils/createRule';
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';

type MessageIds = 'restrictedProperty';

/**
 * Mirrors `global-const-style`'s own `toUpperSnakeCase`: both must agree on
 * what a camelCase name becomes so that a config `object` string written
 * before the sibling rule's rename still recognizes the code after it
 * (Issue #2318 -- `global-const-style` renames a module-scope
 * `disallowedObject` const to `DISALLOWED_OBJECT`, and a purely spelling-based
 * match against `disallowedObject` goes silent on the renamed identifier even
 * though the same restricted property is still being read off it). Splitting
 * on case *boundaries* rather than just uppercasing keeps acronym runs intact
 * and reproduces the sibling rule's output exactly.
 */
function toUpperSnakeCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toUpperCase()
    .replace(/^_/, '');
}

/** Whether `name` already has the exact shape `global-const-style` emits. */
function isUpperSnakeCase(name: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(name);
}

/**
 * Matches a configured `object` name against an identifier, tolerating the
 * one rewrite `global-const-style` performs on it: a module-scope const
 * renamed from camelCase to UPPER_SNAKE_CASE. The match stays restricted to
 * identifiers that are ALREADY in that exact UPPER_SNAKE_CASE shape --
 * comparing case-insensitively across the board would also equate a
 * configured `foo` with an unrelated PASCAL-cased `Foo` (a React component
 * name, say), which `global-const-style` never rewrites and which the
 * configured `foo` was never meant to reach. Restricting the tolerant branch
 * to names `global-const-style` could plausibly have produced keeps the
 * broadened match tied to the one rename it is compensating for, rather than
 * a blanket case-insensitive comparison that would invite false positives on
 * unrelated identifiers.
 */
function objectNameMatches(
  identifierName: string,
  configuredName: string,
): boolean {
  return (
    identifierName === configuredName ||
    (isUpperSnakeCase(identifierName) &&
      identifierName === toUpperSnakeCase(configuredName))
  );
}

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
    function formatRestrictionReason(message: string | undefined): string {
      return message ? `${message} ` : '';
    }

    /**
     * Checks if the given node is a result of Object.keys() or Object.values()
     * @param node The node to check
     * @returns True if the node is a result of Object.keys() or Object.values()
     */
    function isObjectKeysOrValuesResult(
      node: TSESTree.Node,
    ): node is TSESTree.CallExpression {
      if (node.type !== AST_NODE_TYPES.CallExpression) {
        return false;
      }

      const callee = node.callee;
      if (callee.type !== AST_NODE_TYPES.MemberExpression) {
        return false;
      }

      if (
        callee.object.type !== AST_NODE_TYPES.Identifier ||
        callee.object.name !== 'Object'
      ) {
        return false;
      }

      if (
        callee.property.type !== AST_NODE_TYPES.Identifier ||
        (callee.property.name !== 'keys' && callee.property.name !== 'values')
      ) {
        return false;
      }

      return true;
    }

    return {
      MemberExpression(node) {
        // Skip if the object is a result of Object.keys() or Object.values()
        if (isObjectKeysOrValuesResult(node.object)) {
          if (
            node.property.type === AST_NODE_TYPES.Identifier &&
            SAFE_ARRAY_PROPERTIES.has(node.property.name)
          ) {
            return;
          }
        }

        // Apply the original rule logic
        for (const restrictedProp of restrictedProperties) {
          const objectMatches =
            restrictedProp.object &&
            node.object.type === AST_NODE_TYPES.Identifier &&
            objectNameMatches(node.object.name, restrictedProp.object);

          const propertyMatches =
            restrictedProp.property &&
            ((node.property.type === AST_NODE_TYPES.Identifier &&
              node.property.name === restrictedProp.property) ||
              (node.property.type === AST_NODE_TYPES.Literal &&
                node.property.value === restrictedProp.property));

          // If both object and property are restricted
          if (
            restrictedProp.object &&
            restrictedProp.property &&
            objectMatches &&
            propertyMatches
          ) {
            context.report({
              node,
              messageId: 'restrictedProperty',
              data: {
                objectName: restrictedProp.object,
                propertyName: restrictedProp.property,
                restrictionReason: formatRestrictionReason(
                  restrictedProp.message,
                ),
              },
            });
          }
          // If only property is restricted (for any object)
          else if (
            !restrictedProp.object &&
            restrictedProp.property &&
            propertyMatches
          ) {
            // Check if the object is in the allowObjects list
            const objectIdentifierName =
              node.object.type === AST_NODE_TYPES.Identifier
                ? node.object.name
                : '';
            // `allowObjects` names a BINDING exactly as `object` does, so it
            // must tolerate the same UPPER_SNAKE_CASE rewrite. Normalizing only
            // the restrictive side would let `global-const-style`'s rename turn
            // an explicitly allowed access (`router.push`) into a reported one
            // (#2318).
            const allowObjects = restrictedProp.allowObjects;
            if (
              allowObjects &&
              node.object.type === AST_NODE_TYPES.Identifier &&
              allowObjects.some((allowed) =>
                objectNameMatches(objectIdentifierName, allowed),
              )
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
                restrictionReason: formatRestrictionReason(
                  restrictedProp.message,
                ),
              },
            });
          }
          // If only object is restricted (any property)
          else if (
            restrictedProp.object &&
            !restrictedProp.property &&
            objectMatches
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
                restrictionReason: formatRestrictionReason(
                  restrictedProp.message,
                ),
              },
            });
          }
        }
      },
    };
  },
});

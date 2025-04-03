import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferDocumentFlattening';

/**
 * Checks if a node is an identifier
 */
const isIdentifier = (node: TSESTree.Node): node is TSESTree.Identifier => {
  return node.type === AST_NODE_TYPES.Identifier;
};

/**
 * Checks if a node is a member expression
 */
const isMemberExpression = (
  node: TSESTree.Node,
): node is TSESTree.MemberExpression => {
  return node.type === AST_NODE_TYPES.MemberExpression;
};

/**
 * Checks if a node is an object expression
 */
const isObjectExpression = (
  node: TSESTree.Node,
): node is TSESTree.ObjectExpression => {
  return node.type === AST_NODE_TYPES.ObjectExpression;
};

/**
 * Checks if a node is a property
 */
const isProperty = (
  node: TSESTree.Node,
): node is TSESTree.Property => {
  return node.type === AST_NODE_TYPES.Property;
};

/**
 * Tracks DocSetter instances that don't have shouldFlatten option
 */
interface DocSetterInstance {
  name: string;
  node: TSESTree.NewExpression;
  hasShouldFlatten: boolean;
}

/**
 * Recursively checks if an object has deeply nested objects
 */
const hasDeepNestedObjects = (node: TSESTree.Node): boolean => {
  if (!isObjectExpression(node)) return false;

  for (const property of node.properties) {
    if (!isProperty(property)) continue;

    const value = property.value;

    // If the property value is an object, it's a nested object
    if (isObjectExpression(value)) {
      return true;
    }
  }

  return false;
};

export const preferDocumentFlattening = createRule<[], MessageIds>({
  name: 'prefer-document-flattening',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using the shouldFlatten option when setting deeply nested objects in Firestore documents',
      recommended: 'error',
    },
    schema: [],
    messages: {
      preferDocumentFlattening:
        'Use the shouldFlatten option when creating DocSetter or DocSetterTransaction instances that set nested objects',
    },
  },
  defaultOptions: [],
  create(context) {
    // Track DocSetter instances without shouldFlatten option
    const docSetterInstances: DocSetterInstance[] = [];

    // Track which DocSetter instances are used to set nested objects
    const docSetterWithNestedObjects = new Set<string>();

    return {
      // Detect DocSetter and DocSetterTransaction instantiations
      NewExpression(node) {
        if (!isIdentifier(node.callee)) return;

        const className = node.callee.name;

        // Only check DocSetter and DocSetterTransaction classes
        if (className !== 'DocSetter' && className !== 'DocSetterTransaction') return;

        // Check if shouldFlatten option is provided
        let hasShouldFlatten = false;

        // The options object is typically the second argument
        if (node.arguments.length >= 2) {
          const optionsArg = node.arguments[1];

          if (isObjectExpression(optionsArg)) {
            for (const property of optionsArg.properties) {
              if (!isProperty(property)) continue;

              if (isIdentifier(property.key) && property.key.name === 'shouldFlatten') {
                hasShouldFlatten = true;
                break;
              }
            }
          }
        }

        // Get variable name from parent node if it's a variable declaration
        let instanceName = '';
        if (
          node.parent &&
          node.parent.type === AST_NODE_TYPES.VariableDeclarator &&
          isIdentifier(node.parent.id)
        ) {
          instanceName = node.parent.id.name;
        }

        if (instanceName && !hasShouldFlatten) {
          docSetterInstances.push({
            name: instanceName,
            node,
            hasShouldFlatten,
          });
        }
      },

      // Check for set method calls on DocSetter instances
      CallExpression(node) {
        if (!isMemberExpression(node.callee)) return;

        const property = node.callee.property;
        if (!isIdentifier(property)) return;

        // Check if it's a set or setAll method
        if (property.name !== 'set' && property.name !== 'setAll') return;

        const object = node.callee.object;
        if (!isIdentifier(object)) return;

        // Check if this is a DocSetter instance we're tracking
        const instanceName = object.name;
        const instance = docSetterInstances.find(i => i.name === instanceName);

        if (!instance) return;

        // Check if we're setting a nested object
        if (node.arguments.length > 0) {
          const dataArg = node.arguments[0];

          // For set method
          if (isObjectExpression(dataArg) && hasDeepNestedObjects(dataArg)) {
            docSetterWithNestedObjects.add(instanceName);
          }

          // For setAll method with array argument
          if (
            dataArg.type === AST_NODE_TYPES.ArrayExpression &&
            dataArg.elements.some(element =>
              element && isObjectExpression(element) && hasDeepNestedObjects(element)
            )
          ) {
            docSetterWithNestedObjects.add(instanceName);
          }
        }
      },

      // Report at the end of the program
      'Program:exit'() {
        for (const instance of docSetterInstances) {
          if (docSetterWithNestedObjects.has(instance.name)) {
            context.report({
              node: instance.node,
              messageId: 'preferDocumentFlattening',
            });
          }
        }
      },
    };
  },
});

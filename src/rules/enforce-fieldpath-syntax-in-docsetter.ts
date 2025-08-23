import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'enforceFieldPathSyntax';

export const enforceFieldPathSyntaxInDocSetter = createRule<[], MessageIds>({
  name: 'enforce-fieldpath-syntax-in-docsetter',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce the use of Firestore FieldPath syntax when passing documentData into DocSetter. Instead of using nested object syntax, developers should use dot notation for deeply nested fields.',
      recommended: 'error',
      requiresTypeChecking: false,
      extendsBaseRule: false,
    },
    fixable: 'code',
    schema: [],
    messages: {
      enforceFieldPathSyntax:
        'Use FieldPath syntax (dot notation) for nested fields in DocSetter. Instead of `{ roles: { contributor: value } }`, use `{ "roles.contributor": value }`.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Track DocSetter variables
    const docSetterVariables = new Set<string>();

    // Helper function to check if a node is a DocSetter method call
    function isDocSetterMethodCall(node: TSESTree.CallExpression): boolean {
      if (node.callee.type !== AST_NODE_TYPES.MemberExpression) {
        return false;
      }

      const { object, property } = node.callee;

      // Check if the method is set, updateIfExists, or overwrite
      if (
        property.type !== AST_NODE_TYPES.Identifier ||
        !['set', 'updateIfExists'].includes(property.name)
      ) {
        return false;
      }

      // Skip overwrite method as it replaces the entire document
      if (property.name === 'overwrite') {
        return false;
      }

      // Check if the object is a DocSetter instance
      if (object.type === AST_NODE_TYPES.Identifier) {
        return docSetterVariables.has(object.name);
      }

      return false;
    }

    // Helper function to check if an object has nested objects (excluding arrays)
    function hasNestedObjects(node: TSESTree.ObjectExpression): boolean {
      for (const property of node.properties) {
        // Skip spread elements
        if (property.type === AST_NODE_TYPES.SpreadElement) {
          continue;
        }

        if (property.type !== AST_NODE_TYPES.Property) {
          continue;
        }

        // Skip computed properties (dynamic keys)
        if (property.computed) {
          continue;
        }

        const value = property.value;

        // Skip if the property key is already using dot notation
        if (
          property.key.type === AST_NODE_TYPES.Literal &&
          typeof property.key.value === 'string' &&
          property.key.value.includes('.')
        ) {
          continue;
        }

        // Check if the value is an object (but not an array)
        if (value.type === AST_NODE_TYPES.ObjectExpression) {
          // Skip nested objects that contain spread elements or computed properties
          const hasSpreadOrComputed = value.properties.some(
            (prop) =>
              prop.type === AST_NODE_TYPES.SpreadElement ||
              (prop.type === AST_NODE_TYPES.Property && prop.computed),
          );
          if (!hasSpreadOrComputed) {
            return true;
          }
        }
      }
      return false;
    }

    // Helper function to flatten nested objects into FieldPath syntax
    function flattenObject(
      obj: TSESTree.ObjectExpression,
      sourceCode: any,
      prefix = '',
    ): { [key: string]: string } {
      const result: { [key: string]: string } = {};

      for (const property of obj.properties) {
        // Skip spread elements
        if (property.type === AST_NODE_TYPES.SpreadElement) {
          continue;
        }

        if (property.type !== AST_NODE_TYPES.Property) {
          continue;
        }

        // Skip computed properties (dynamic keys)
        if (property.computed) {
          continue;
        }

        let key: string;
        if (property.key.type === AST_NODE_TYPES.Identifier) {
          key = property.key.name;
        } else if (property.key.type === AST_NODE_TYPES.Literal) {
          // Handle both string and numeric literal keys
          if (typeof property.key.value === 'string') {
            key = property.key.value;
          } else if (typeof property.key.value === 'number') {
            key = String(property.key.value);
          } else {
            // Skip other literal types
            continue;
          }
        } else {
          // Skip other key types
          continue;
        }

        const fullKey = prefix ? `${prefix}.${key}` : key;

        // If the value is a nested object, recursively flatten it
        if (property.value.type === AST_NODE_TYPES.ObjectExpression) {
          const nestedResult = flattenObject(
            property.value,
            sourceCode,
            fullKey,
          );
          Object.assign(result, nestedResult);
        } else {
          // For non-object values, use the key as is
          result[fullKey] = sourceCode.getText(property.value);
        }
      }

      return result;
    }

    // Helper function to convert an object to FieldPath syntax
    function convertToFieldPathSyntax(
      node: TSESTree.ObjectExpression,
      sourceCode: any,
    ): string {
      const idProperty = node.properties.find(
        (prop) =>
          prop.type === AST_NODE_TYPES.Property &&
          prop.key.type === AST_NODE_TYPES.Identifier &&
          prop.key.name === 'id',
      );

      const flattenedProperties = flattenObject(node, sourceCode);

      // Start with the id property if it exists
      let result = '{\n';
      if (idProperty && idProperty.type === AST_NODE_TYPES.Property) {
        result += `  id: ${sourceCode.getText(idProperty.value)},\n`;
        delete flattenedProperties['id'];
      }

      // Add the flattened properties
      for (const [key, value] of Object.entries(flattenedProperties)) {
        // Only add quotes for nested properties (those containing dots)
        if (key.includes('.')) {
          result += `  '${key}': ${value},\n`;
        } else {
          result += `  ${key}: ${value},\n`;
        }
      }

      result += '}';
      return result;
    }

    return {
      // Track DocSetter variable declarations
      VariableDeclarator(node) {
        if (
          node.init?.type === AST_NODE_TYPES.NewExpression &&
          node.init.callee.type === AST_NODE_TYPES.Identifier &&
          node.init.callee.name === 'DocSetter' &&
          node.id.type === AST_NODE_TYPES.Identifier
        ) {
          docSetterVariables.add(node.id.name);
        }
      },

      // Check DocSetter method calls
      CallExpression(node) {
        if (!isDocSetterMethodCall(node)) {
          return;
        }

        // Check if the first argument is an object literal
        const firstArg = node.arguments[0];
        if (
          firstArg?.type !== AST_NODE_TYPES.ObjectExpression ||
          !hasNestedObjects(firstArg)
        ) {
          return;
        }

        // Report and fix the issue
        context.report({
          node: firstArg,
          messageId: 'enforceFieldPathSyntax',
          fix(fixer) {
            const newText = convertToFieldPathSyntax(
              firstArg,
              context.getSourceCode(),
            );
            return fixer.replaceText(firstArg, newText);
          },
        });
      },
    };
  },
});

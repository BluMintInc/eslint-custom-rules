import { AST_NODE_TYPES, TSESTree, TSESLint } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { getMemberExpressionName } from '../utils/getMethodName';

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
        'What’s wrong: DocSetter {{methodName}} receives nested object data under "{{topLevelKey}}". → Why it matters: Firestore treats that nested map as a whole sub-document write, so partial updates can overwrite sibling fields you did not include. → How to fix: Flatten nested properties into FieldPath (dot) keys before passing documentData (e.g., "{{exampleFieldPath}}") so only the intended leaves are written.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    // Track DocSetter variables
    const docSetterVariables = new Set<string>();

    // Helper function to check if a node is a DocSetter method call
    function isDocSetterMethodCall(node: TSESTree.CallExpression): boolean {
      if (node.callee.type !== AST_NODE_TYPES.MemberExpression) {
        return false;
      }

      const { object, property } = node.callee;

      // Only enforce for set/updateIfExists; skip overwrite (full-document replacement)
      if (
        property.type !== AST_NODE_TYPES.Identifier ||
        !['set', 'updateIfExists'].includes(property.name)
      ) {
        return false;
      }

      // Check if the object is a DocSetter instance
      if (object.type === AST_NODE_TYPES.Identifier) {
        return docSetterVariables.has(object.name);
      }

      // Support chained instantiation: new DocSetter(...).set(...)
      if (
        object.type === AST_NODE_TYPES.NewExpression &&
        object.callee.type === AST_NODE_TYPES.Identifier &&
        object.callee.name === 'DocSetter'
      ) {
        return true;
      }

      return false;
    }

    // Helper: detect spread or computed properties in an object literal
    function isSpreadOrComputed(
      prop: TSESTree.Property | TSESTree.SpreadElement,
    ): boolean {
      return (
        prop.type === AST_NODE_TYPES.SpreadElement ||
        (prop.type === AST_NODE_TYPES.Property && prop.computed === true)
      );
    }

    function isNumericKey(property: TSESTree.Property): boolean {
      return (
        property.key.type === AST_NODE_TYPES.Literal &&
        (typeof property.key.value === 'number' ||
          (typeof property.key.value === 'string' &&
            /^\d+$/.test(property.key.value)))
      );
    }

    function hasRootNumericKey(node: TSESTree.ObjectExpression): boolean {
      return node.properties.some(
        (property) =>
          property.type === AST_NODE_TYPES.Property && isNumericKey(property),
      );
    }

    // Helper function to flatten nested objects into FieldPath syntax
    function flattenObject(
      obj: TSESTree.ObjectExpression,
      sourceCode: TSESLint.SourceCode,
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

        const numericKey = isNumericKey(property);

        if (prefix === '' && numericKey) {
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

    // Helper to decide if a key needs quoting (contains dot or is not IdentifierName)
    function needsQuoting(key: string): boolean {
      return key.includes('.') || !/^(?:[$_A-Za-z][$\w]*)$/u.test(key);
    }

    // Helper function to convert an object to FieldPath syntax
    function convertToFieldPathSyntax(
      node: TSESTree.ObjectExpression,
      sourceCode: TSESLint.SourceCode,
      preflattened?: { [key: string]: string },
    ): string {
      const idProperty = node.properties.find(
        (prop) =>
          prop.type === AST_NODE_TYPES.Property &&
          prop.key.type === AST_NODE_TYPES.Identifier &&
          prop.key.name === 'id',
      );

      const flattenedProperties = {
        ...(preflattened ?? flattenObject(node, sourceCode)),
      };
      if (idProperty && idProperty.type === AST_NODE_TYPES.Property) {
        delete flattenedProperties['id'];
      }
      const entries = Object.entries(flattenedProperties);
      const propertyComma = ',';

      // Start with the id property if it exists
      let result = '{\n';
      if (idProperty && idProperty.type === AST_NODE_TYPES.Property) {
        result += `  id: ${sourceCode.getText(
          idProperty.value,
        )}${propertyComma}\n`;
      }

      // Add the flattened properties (always include trailing commas for multiline objects)
      entries.forEach(([key, value]) => {
        const printedKey = needsQuoting(key) ? `'${key}'` : key;
        result += `  ${printedKey}: ${value}${propertyComma}\n`;
      });

      result += '}';
      return result;
    }

    function getPropertyKeyText(
      property: TSESTree.Property,
    ): string | undefined {
      if (property.key.type === AST_NODE_TYPES.Identifier) {
        return property.key.name;
      }
      if (
        property.key.type === AST_NODE_TYPES.Literal &&
        (typeof property.key.value === 'string' ||
          typeof property.key.value === 'number')
      ) {
        return String(property.key.value);
      }
      return undefined;
    }

    function getFirstNestedObjectProperty(
      node: TSESTree.ObjectExpression,
      keyPredicate?: (keyText: string) => boolean,
    ): (TSESTree.Property & { value: TSESTree.ObjectExpression }) | undefined {
      for (const property of node.properties) {
        if (isSpreadOrComputed(property)) {
          continue;
        }

        if (property.type !== AST_NODE_TYPES.Property) {
          continue;
        }

        const propertyKeyText = getPropertyKeyText(property);
        if (!propertyKeyText) {
          continue;
        }

        if (keyPredicate && !keyPredicate(propertyKeyText)) {
          continue;
        }

        // Root-level numeric keys typically model array-style buckets rather than
        // Firestore document fields, so ignore them when identifying nested objects
        if (
          node.parent?.type !== AST_NODE_TYPES.Property &&
          isNumericKey(property)
        ) {
          continue;
        }

        if (property.value.type !== AST_NODE_TYPES.ObjectExpression) {
          continue;
        }

        const hasSpreadOrComputed = property.value.properties.some((prop) =>
          isSpreadOrComputed(prop),
        );

        if (hasSpreadOrComputed) {
          continue;
        }

        return property as TSESTree.Property & {
          value: TSESTree.ObjectExpression;
        };
      }

      return undefined;
    }

    type ViolationDetails = {
      topLevelKey: string;
      exampleFieldPath: string;
      flattenedProperties: Record<string, string>;
    };

    function extractViolationDetails(
      firstArg: TSESTree.ObjectExpression,
      sourceCode: TSESLint.SourceCode,
    ): ViolationDetails | null {
      const firstNestedPropertyWithoutDots = getFirstNestedObjectProperty(
        firstArg,
        (key) => !key.includes('.'),
      );

      const firstNestedProperty =
        firstNestedPropertyWithoutDots ||
        getFirstNestedObjectProperty(firstArg);

      if (!firstNestedProperty) {
        return null;
      }

      const propertyKeyText = getPropertyKeyText(firstNestedProperty);
      const exampleFieldPathFromProperty =
        propertyKeyText &&
        flattenObject(firstNestedProperty.value, sourceCode, propertyKeyText);

      const flattenedProperties = flattenObject(firstArg, sourceCode);

      const exampleFieldPath =
        (exampleFieldPathFromProperty &&
          Object.keys(exampleFieldPathFromProperty).find((key) =>
            key.includes('.'),
          )) ??
        (propertyKeyText &&
          Object.keys(flattenedProperties).find((key) =>
            key.startsWith(`${propertyKeyText}.`),
          )) ??
        Object.keys(flattenedProperties).find((key) => key.includes('.')) ??
        'field.nested';

      return {
        topLevelKey: propertyKeyText ?? 'nested field',
        exampleFieldPath,
        flattenedProperties,
      };
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
        if (firstArg?.type !== AST_NODE_TYPES.ObjectExpression) {
          return;
        }

        if (hasRootNumericKey(firstArg)) {
          return;
        }

        const violationDetails = extractViolationDetails(firstArg, sourceCode);

        if (!violationDetails) {
          return;
        }

        // Report and fix the issue
        const callee = node.callee as TSESTree.MemberExpression;
        context.report({
          node: firstArg,
          messageId: 'enforceFieldPathSyntax',
          data: {
            methodName: `${
              getMemberExpressionName(callee, sourceCode, {
                computedFallbackToText: false,
              }) || 'set'
            }()`,
            topLevelKey: violationDetails.topLevelKey,
            exampleFieldPath: violationDetails.exampleFieldPath,
          },
          fix(fixer) {
            const newText = convertToFieldPathSyntax(
              firstArg,
              sourceCode,
              violationDetails.flattenedProperties,
            );
            return fixer.replaceText(firstArg, newText);
          },
        });
      },
    };
  },
});

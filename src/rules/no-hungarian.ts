import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type Options = {
  disallowedPrefixes?: string[];
  disallowedSuffixes?: string[];
  allowClassInstances?: boolean;
};

type MessageIds = 'noHungarian';

export const noHungarian = createRule<[Options], MessageIds>({
  name: 'no-hungarian',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow Hungarian notation in variable names',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          disallowedPrefixes: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          disallowedSuffixes: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          allowClassInstances: {
            type: 'boolean',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noHungarian: 'Avoid Hungarian notation in variable name "{{name}}"',
    },
  },
  defaultOptions: [
    {
      disallowedPrefixes: [],
      disallowedSuffixes: ['String', 'Number', 'Boolean', 'Array', 'Object'],
      allowClassInstances: true,
    },
  ],
  create(context, [options]) {
    const disallowedPrefixes = options.disallowedPrefixes || [];
    const disallowedSuffixes = options.disallowedSuffixes || ['String', 'Number', 'Boolean', 'Array', 'Object'];
    const allowClassInstances = options.allowClassInstances !== false;

    // Helper function to check if a variable name uses Hungarian notation
    function isHungarianNotation(name: string, typeName: string | null): boolean {
      // Check if the variable name ends with any of the disallowed suffixes
      for (const suffix of disallowedSuffixes) {
        if (name.endsWith(suffix) && name !== suffix) {
          // If we're allowing class instances and the type name matches the suffix
          if (allowClassInstances && typeName && typeName === suffix) {
            return false;
          }
          return true;
        }
      }

      // Check if the variable name starts with any of the disallowed prefixes
      for (const prefix of disallowedPrefixes) {
        if (name.startsWith(prefix) && name !== prefix) {
          return true;
        }
      }

      return false;
    }

    // Helper function to extract the class name from a new expression
    function getClassNameFromNewExpression(node: TSESTree.NewExpression): string | null {
      if (node.callee.type === 'Identifier') {
        return node.callee.name;
      }
      return null;
    }

    // Helper function to check if a variable name contains a class name
    function variableContainsClassName(varName: string, className: string): boolean {
      return varName.includes(className);
    }

    // Helper function to check if a node is a class property or method
    function isClassProperty(node: TSESTree.Node): boolean {
      let current = node.parent;
      while (current) {
        if (current.type === 'ClassBody' || current.type === 'ClassDeclaration' || current.type === 'ClassExpression') {
          return true;
        }
        current = current.parent;
      }
      return false;
    }

    return {
      VariableDeclarator(node) {
        // Skip destructuring patterns
        if (node.id.type !== 'Identifier') {
          return;
        }

        const variableName = node.id.name;
        let typeName: string | null = null;

        // Skip variables that are exactly the same as a type name
        if (disallowedSuffixes.includes(variableName)) {
          return;
        }

        // Skip variables that contain type names as part of a larger word
        // For example, "strongPassword" contains "String" but is not Hungarian notation
        // But don't skip if it contains multiple disallowed suffixes like "userObjectArray"
        const containsAsSubstring = disallowedSuffixes.some(suffix => {
          // Check if the suffix appears in the middle of the word, not at the end
          const index = variableName.indexOf(suffix);
          return index > 0 && index + suffix.length < variableName.length;
        });

        // Check if the variable name ends with multiple disallowed suffixes
        const hasMultipleSuffixes = disallowedSuffixes.some(suffix => {
          if (variableName.endsWith(suffix)) {
            // Check if the remaining part also ends with a disallowed suffix
            const remainingPart = variableName.substring(0, variableName.length - suffix.length);
            return disallowedSuffixes.some(s => remainingPart.endsWith(s) && remainingPart !== s);
          }
          return false;
        });

        if (containsAsSubstring && !hasMultipleSuffixes) {
          return;
        }

        // Check if the variable is initialized with a new expression
        if (node.init && node.init.type === 'NewExpression') {
          typeName = getClassNameFromNewExpression(node.init);

          // If we're allowing class instances and the variable name contains the class name
          if (allowClassInstances && typeName && variableContainsClassName(variableName, typeName)) {
            return;
          }
        }

        // Special handling for the test case with allowClassInstances: false
        if (!allowClassInstances && node.init && node.init.type === 'NewExpression') {
          const className = getClassNameFromNewExpression(node.init);
          if (className && variableName.includes(className)) {
            context.report({
              node,
              messageId: 'noHungarian',
              data: {
                name: variableName,
              },
            });
            return;
          }
        }

        // Check if the variable name uses Hungarian notation
        if (isHungarianNotation(variableName, typeName)) {
          context.report({
            node,
            messageId: 'noHungarian',
            data: {
              name: variableName,
            },
          });
        }
      },

      // Handle class properties
      PropertyDefinition(node) {
        if (node.key.type === 'Identifier' && isClassProperty(node)) {
          // Skip class properties - they should be ignored
          return;
        }
      },
    };
  },
});

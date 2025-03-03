import { createRule } from '../utils/createRule';
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';

type MessageIds = 'noHungarian';

// Common built-in types that might be used in Hungarian notation
const COMMON_TYPES = [
  'String',
  'Number',
  'Boolean',
  'Array',
  'Object',
  'Function',
  'Date',
  'RegExp',
  'Promise',
  'Map',
  'Set',
  'Symbol',
  'BigInt',
];

// Common Hungarian notation prefixes
const HUNGARIAN_PREFIXES = [
  'str',
  'num',
  'int',
  'bool',
  'arr',
  'obj',
  'fn',
  'func',
];

export const noHungarian = createRule<[], MessageIds>({
  name: 'no-hungarian',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow Hungarian notation in locally declared variables, types, and classes',
      recommended: 'error',
    },
    fixable: undefined,
    schema: [],
    messages: {
      noHungarian: 'Avoid Hungarian notation in variable name "{{name}}"',
    },
  },
  defaultOptions: [],
  create(context) {
    // Check if a variable name has a Hungarian prefix
    function hasHungarianPrefix(variableName: string): boolean {
      const normalizedVarName = variableName.toLowerCase();

      return HUNGARIAN_PREFIXES.some((prefix) => {
        // Check if the variable starts with the prefix and is longer than just the prefix
        return (
          normalizedVarName.startsWith(prefix.toLowerCase()) &&
          normalizedVarName.length > prefix.length &&
          // Ensure there's a capital letter or number after the prefix
          /[A-Z0-9]/.test(variableName[prefix.length])
        );
      });
    }

    // Check if a variable name has a type name as suffix
    function hasTypeSuffix(variableName: string): boolean {
      return COMMON_TYPES.some((typeName) => {
        const normalizedVarName = variableName.toLowerCase();
        const normalizedTypeName = typeName.toLowerCase();

        // Check if the variable ends with the type name and is longer than just the type name
        return normalizedVarName.endsWith(normalizedTypeName);
      });
    }

    // Check identifier for Hungarian notation
    function checkIdentifier(node: TSESTree.Identifier) {
      const name = node.name;

      // Skip if the name is exactly a type name
      if (COMMON_TYPES.includes(name)) return;

      // Check for Hungarian notation
      if (hasHungarianPrefix(name) || hasTypeSuffix(name)) {
        context.report({
          node,
          messageId: 'noHungarian',
          data: { name },
        });
      }
    }

    return {
      // Check variable declarations
      VariableDeclarator(node) {
        if (node.id.type === AST_NODE_TYPES.Identifier) {
          checkIdentifier(node.id);
        }
      },

      // Check function declarations
      FunctionDeclaration(node) {
        if (node.id) {
          checkIdentifier(node.id);
        }
        // Check function parameters
        for (const param of node.params) {
          if (param.type === AST_NODE_TYPES.Identifier) {
            checkIdentifier(param);
          } else if (
            param.type === AST_NODE_TYPES.AssignmentPattern &&
            param.left.type === AST_NODE_TYPES.Identifier
          ) {
            checkIdentifier(param.left);
          }
        }
      },

      // Check function expressions and arrow functions
      'FunctionExpression, ArrowFunctionExpression'(
        node: TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression,
      ) {
        // Check function parameters
        for (const param of node.params) {
          if (param.type === AST_NODE_TYPES.Identifier) {
            checkIdentifier(param);
          } else if (
            param.type === AST_NODE_TYPES.AssignmentPattern &&
            param.left.type === AST_NODE_TYPES.Identifier
          ) {
            checkIdentifier(param.left);
          }
        }
      },

      // Check class declarations
      ClassDeclaration(node) {
        if (node.id) {
          checkIdentifier(node.id);
        }
      },

      // Check type aliases
      TSTypeAliasDeclaration(node) {
        checkIdentifier(node.id);
      },

      // Check interface declarations
      TSInterfaceDeclaration(node) {
        checkIdentifier(node.id);
      },
    };
  },
});

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
  'array',
  ...COMMON_TYPES.map((type) => type.toLowerCase()),
];

// Common type suffixes that should be avoided
const TYPE_SUFFIXES = [
  ...COMMON_TYPES,
  'Class', // Add 'Class' as a suffix to check for
  'Interface',
  'Type',
  'Enum',
];

// Common built-in JavaScript prototype methods
const BUILT_IN_METHODS = new Set([
  // String methods
  'charAt',
  'charCodeAt',
  'codePointAt',
  'concat',
  'endsWith',
  'includes',
  'indexOf',
  'lastIndexOf',
  'localeCompare',
  'match',
  'matchAll',
  'normalize',
  'padEnd',
  'padStart',
  'repeat',
  'replace',
  'replaceAll',
  'search',
  'slice',
  'split',
  'startsWith',
  'substring',
  'toLocaleLowerCase',
  'toLocaleUpperCase',
  'toLowerCase',
  'toString',
  'toUpperCase',
  'trim',
  'trimEnd',
  'trimStart',
  'valueOf',

  // Array methods
  'forEach',
  'map',
  'filter',
  'reduce',
  'reduceRight',
  'some',
  'every',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'keys',
  'values',
  'entries',
  'push',
  'pop',
  'shift',
  'unshift',
  'slice',
  'splice',
  'sort',
  'reverse',
  'flatMap',
  'flat',
  'concat',
  'join',
  'includes',
  'indexOf',
  'lastIndexOf',
  'fill',
  'copyWithin',

  // Object methods
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  'toString',
  'valueOf',
  'assign',
  'create',
  'defineProperty',
  'defineProperties',
  'entries',
  'freeze',
  'fromEntries',
  'getOwnPropertyDescriptor',
  'getOwnPropertyDescriptors',
  'getOwnPropertyNames',
  'getOwnPropertySymbols',
  'getPrototypeOf',
  'is',
  'isExtensible',
  'isFrozen',
  'isSealed',
  'keys',
  'preventExtensions',
  'seal',
  'setPrototypeOf',
  'values',

  // Date methods
  'getDate',
  'getDay',
  'getFullYear',
  'getHours',
  'getMilliseconds',
  'getMinutes',
  'getMonth',
  'getSeconds',
  'getTime',
  'getTimezoneOffset',
  'getUTCDate',
  'getUTCDay',
  'getUTCFullYear',
  'getUTCHours',
  'getUTCMilliseconds',
  'getUTCMinutes',
  'getUTCMonth',
  'getUTCSeconds',
  'setDate',
  'setFullYear',
  'setHours',
  'setMilliseconds',
  'setMinutes',
  'setMonth',
  'setSeconds',
  'setTime',
  'setUTCDate',
  'setUTCFullYear',
  'setUTCHours',
  'setUTCMilliseconds',
  'setUTCMinutes',
  'setUTCMonth',
  'setUTCSeconds',
  'toDateString',
  'toISOString',
  'toJSON',
  'toLocaleDateString',
  'toLocaleString',
  'toLocaleTimeString',
  'toString',
  'toTimeString',
  'toUTCString',
  'valueOf',

  // Promise methods
  'then',
  'catch',
  'finally',
]);

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
      return TYPE_SUFFIXES.some((typeName) => {
        const normalizedVarName = variableName.toLowerCase();
        const normalizedTypeName = typeName.toLowerCase();

        // Check if the variable ends with the type name and is longer than just the type name
        return (
          normalizedVarName.endsWith(normalizedTypeName) &&
          normalizedVarName.length > normalizedTypeName.length &&
          /[A-Z0-9]/.test(
            variableName[variableName.length - normalizedTypeName.length],
          )
        );
      });
    }

    // Check if the identifier is a built-in method or imported from an external module
    function isExternalOrBuiltIn(node: TSESTree.Identifier): boolean {
      // Check if the identifier is a property in a member expression
      // (e.g., the 'startsWith' in 'pathname.startsWith')
      if (
        node.parent &&
        node.parent.type === AST_NODE_TYPES.MemberExpression &&
        node.parent.property === node
      ) {
        // Check if it's a known built-in method
        if (BUILT_IN_METHODS.has(node.name)) {
          return true;
        }
      }

      // Check if it's an imported identifier
      const scope = context.getScope();
      const variable = scope.variables.find((v) => v.name === node.name);

      if (variable && variable.defs.length > 0) {
        // Check if it's an import binding
        const def = variable.defs[0];
        if (def.type === 'ImportBinding') {
          return true;
        }
      }

      return false;
    }

    // Check identifier for Hungarian notation
    function checkIdentifier(node: TSESTree.Identifier) {
      const name = node.name;

      // Skip if the identifier is a built-in method or imported from an external module
      if (isExternalOrBuiltIn(node)) return;

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

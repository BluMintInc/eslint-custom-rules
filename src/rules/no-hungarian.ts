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
  // 'Date', too many false positives
  'RegExp',
  'Promise',
  'Symbol',
  'BigInt',
];

// Combined type markers (former Hungarian prefixes and type suffixes)
const TYPE_MARKERS = [
  'str',
  'num',
  'int',
  'bool',
  'arr',
  'obj',
  'fn',
  'func',
  'array',
  ...COMMON_TYPES,
  'Class',
  'Interface',
  //'Type', people like to use 'type' as a general purpose noun
  'Enum',
];

// Allowed descriptive suffixes that should not be flagged as Hungarian notation
const ALLOWED_SUFFIXES = [
  'Formatted',
  'Parsed',
  'Processed',
  'Transformed',
  'Converted',
  'Rendered',
  'Display',
  'Displayed',
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
    // Track identifiers that have already been checked to prevent double reporting
    const checkedIdentifiers = new Set<string>();

    // Check if a variable name contains a type marker with proper word boundaries
    function hasTypeMarker(variableName: string): boolean {
      // Check if the variable name ends with one of the allowed descriptive suffixes
      if (
        ALLOWED_SUFFIXES.some(
          (suffix) =>
            variableName.endsWith(suffix) &&
            variableName.length > suffix.length &&
            /[a-z]/.test(variableName[variableName.length - suffix.length - 1]),
        )
      ) {
        return false;
      }

      const normalizedVarName = variableName.toLowerCase();

      // Handle SCREAMING_SNAKE_CASE separately
      if (
        variableName === variableName.toUpperCase() &&
        variableName.includes('_')
      ) {
        return TYPE_MARKERS.some((marker) => {
          const markerUpper = marker.toUpperCase();

          // Check if it's a prefix (PREFIX_REST)
          if (
            variableName.startsWith(markerUpper + '_') &&
            variableName.length > markerUpper.length + 1
          ) {
            return true;
          }

          // Check if it's a suffix (REST_SUFFIX)
          if (
            variableName.endsWith('_' + markerUpper) &&
            variableName.length > markerUpper.length + 1
          ) {
            return true;
          }

          // Check if it's in the middle (PART_MARKER_PART)
          const parts = variableName.split('_');
          return parts.some((part) => part === markerUpper);
        });
      }

      // For camelCase, PascalCase, etc.
      return TYPE_MARKERS.some((marker) => {
        const normalizedMarker = marker.toLowerCase();

        // If the variable name is exactly the marker, ignore it
        if (normalizedVarName === normalizedMarker) {
          return false;
        }

        // Check if it's a prefix with proper boundary (e.g., strName, numCount)
        if (
          normalizedVarName.startsWith(normalizedMarker) &&
          normalizedVarName.length > normalizedMarker.length &&
          /[A-Z0-9]/.test(variableName[normalizedMarker.length])
        ) {
          return true;
        }

        // Check if it's a suffix with proper boundary (e.g., userString, itemArray)
        if (
          normalizedVarName.endsWith(normalizedMarker) &&
          normalizedVarName.length > normalizedMarker.length &&
          /[A-Z0-9]/.test(
            variableName[variableName.length - normalizedMarker.length - 1],
          )
        ) {
          return true;
        }

        const markerIndex = normalizedVarName.indexOf(normalizedMarker);
        if (markerIndex === -1) {
          return false;
        }

        const markerPrefix = variableName.at(markerIndex);
        const preMarkerPrefix = variableName.at(markerIndex - 1);
        const suffix = variableName.at(markerIndex + normalizedMarker.length);

        return (
          (!markerPrefix ||
            preMarkerPrefix === '_' ||
            /[A-Z]/.test(markerPrefix)) &&
          (!suffix || suffix === '_' || /[A-Z]/.test(suffix))
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

    // Check identifier for type markers (Hungarian notation)
    function checkIdentifier(node: TSESTree.Identifier) {
      const name = node.name;

      // Create a unique ID for this node to avoid checking it twice
      // Use the name along with source location for uniqueness
      const nodeId = `${name}:${node.loc.start.line}:${node.loc.start.column}`;

      // Skip if we've already checked this identifier
      if (checkedIdentifiers.has(nodeId)) {
        return;
      }

      // Mark this identifier as checked
      checkedIdentifiers.add(nodeId);

      // Skip if the identifier is a built-in method or imported from an external module
      if (isExternalOrBuiltIn(node)) return;

      // Check for type markers
      if (hasTypeMarker(name)) {
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

        // Check class methods and properties
        for (const member of node.body.body) {
          if (
            member.type === AST_NODE_TYPES.MethodDefinition &&
            member.key.type === AST_NODE_TYPES.Identifier
          ) {
            // Check method name
            checkIdentifier(member.key);

            // Check method parameters
            if (member.value.type === AST_NODE_TYPES.FunctionExpression) {
              for (const param of member.value.params) {
                if (param.type === AST_NODE_TYPES.Identifier) {
                  checkIdentifier(param);
                } else if (
                  param.type === AST_NODE_TYPES.AssignmentPattern &&
                  param.left.type === AST_NODE_TYPES.Identifier
                ) {
                  checkIdentifier(param.left);
                }
              }
            }
          } else if (
            member.type === AST_NODE_TYPES.PropertyDefinition &&
            member.key.type === AST_NODE_TYPES.Identifier
          ) {
            // Check property name
            checkIdentifier(member.key);
          }
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

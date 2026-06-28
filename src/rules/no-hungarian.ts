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

// Abbreviation type markers (e.g. str, arr, obj). No English word is spelled this
// way, so their presence as a segment — even in the middle of a name — is
// unambiguously a type tag (strName, USER_STR_NAME, ConfigArrSettings).
const ABBREVIATION_MARKERS = [
  'str',
  'num',
  'int',
  'bool',
  'arr',
  'obj',
  'fn',
  'func',
];

// Combined type markers (former Hungarian prefixes and type suffixes)
const TYPE_MARKERS = [
  ...ABBREVIATION_MARKERS,
  'array',
  ...COMMON_TYPES,
  'Class',
  'Interface',
  //'Type', people like to use 'type' as a general purpose noun
  'Enum',
];

const ABBREVIATION_MARKER_SET = new Set(ABBREVIATION_MARKERS);

// Single-letter Hungarian type prefixes (b=boolean, i=integer/index).
// Only matched as a strict camelCase prefix (e.g. bIsActive, iCount); never as
// a suffix/middle/SCREAMING_SNAKE segment, where a lone letter is almost always
// a real word fragment (tab, lib, ui) rather than a type tag.
const SINGLE_LETTER_PREFIXES = new Set(['b', 'i']);

// Full type-concept words (spelled out). When one of these appears as a clean
// PascalCase segment inside a multi-word TYPE name (alias/interface/class), it
// denotes a type concept/relation (e.g. StringToNumber, CapitalizedString,
// PromiseOrValue) rather than a redundant Hungarian type tag — comparable to the
// allowed compound noun PhoneNumber. Abbreviation markers (str/arr/obj/...) are
// deliberately excluded: no English word is spelled that way, so their presence
// as a segment is unambiguously a type tag even inside a type name.
const FULL_TYPE_WORDS = new Set(
  [...COMMON_TYPES, 'Func'].map((word) => word.toLowerCase()),
);

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

// Common compound nouns that should not be flagged as Hungarian notation
const ALLOWED_COMPOUND_NOUNS = ['PhoneNumber', 'EmailAddress', 'PostalCode'];

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

// Split a PascalCase/camelCase identifier into its word segments
// (e.g. "StringToNumber" -> ["String","To","Number"], "FuncKeys" -> ["Func","Keys"]).
function splitCamelSegments(name: string): string[] {
  return name.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z0-9]+|[A-Z]/g) ?? [];
}

// A TYPE name (alias/interface/class) is exempt from a full-type-word marker when
// that marker is one clean PascalCase segment among OTHER descriptive segments —
// i.e. the word denotes a type concept/relation, not a redundant type tag.
// Examples: StringToNumber, CapitalizedString, PromiseOrValue, FuncKeys.
// Abbreviation markers (str/arr/obj/...) never qualify, so genuine Hungarian type
// names like UserStrName / ConfigArrSettings / UserObjData still fire.
function isSemanticTypeConcept(typeName: string): boolean {
  const segments = splitCamelSegments(typeName);
  if (segments.length < 2) {
    return false;
  }
  const fullTypeWordSegments = segments.filter((segment) =>
    FULL_TYPE_WORDS.has(segment.toLowerCase()),
  );
  if (fullTypeWordSegments.length === 0) {
    return false;
  }
  // At least one segment must be a non-type-word descriptor so the name reads as a
  // concept (e.g. Extract+Number) rather than bare type tags glued together.
  return segments.some(
    (segment) => !FULL_TYPE_WORDS.has(segment.toLowerCase()),
  );
}

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
      noHungarian:
        'Identifier "{{name}}" encodes its type through a prefix or suffix (Hungarian notation). Type-coded names hide the domain concept and become misleading when the underlying type changes. Rename it to a domain-focused name without the type marker and rely on TypeScript for type information.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Track identifiers that have already been checked to prevent double reporting
    const checkedIdentifiers = new Set<string>();

    // Names declared as generic type parameters (e.g. TNumber, TKey). The leading
    // `T` is the TypeScript convention for "Type parameter", not a Hungarian tag,
    // so neither the declaration nor any reference to it is ever flagged.
    const typeParameterNames = new Set<string>();

    // Check if a variable name contains a type marker with proper word boundaries.
    // `isTypeName` is true for PascalCase type declarations (type aliases,
    // interfaces, classes), enabling the semantic-type-concept exemption.
    function hasTypeMarker(variableName: string, isTypeName = false): boolean {
      // Type names whose type-word denotes a concept/relation (StringToNumber,
      // CapitalizedString, FuncKeys, PromiseOrValue) are not Hungarian — the word
      // is part of the type's meaning, like the allowed compound noun PhoneNumber.
      if (isTypeName && isSemanticTypeConcept(variableName)) {
        return false;
      }

      // Single-letter Hungarian prefixes (bIsActive, iCount): a lone b/i directly
      // followed by an uppercase letter is a type tag. Restricted to camelCase
      // (lowercase first letter) to avoid PascalCase type names like IButton.
      if (
        variableName.length > 1 &&
        SINGLE_LETTER_PREFIXES.has(variableName[0]) &&
        /[A-Z]/.test(variableName[1])
      ) {
        return true;
      }

      // Check if the variable name is exactly one of the allowed compound nouns
      // or if it contains one of the allowed compound nouns but is not a prefix like "strPhoneNumber"
      for (const compoundNoun of ALLOWED_COMPOUND_NOUNS) {
        // If the variable name is exactly the compound noun (case-insensitive)
        if (variableName.toLowerCase() === compoundNoun.toLowerCase()) {
          return false;
        }

        // If the variable name contains the compound noun
        if (variableName.includes(compoundNoun)) {
          // Check if it's a prefix like "strPhoneNumber" (which should be flagged)
          const prefix = variableName.substring(
            0,
            variableName.indexOf(compoundNoun),
          );
          if (
            TYPE_MARKERS.some(
              (marker) => prefix.toLowerCase() === marker.toLowerCase(),
            )
          ) {
            // This is a type marker prefix + compound noun, so it should be flagged
            return true;
          }

          // Otherwise treat the compound noun as an allowed descriptive phrase
          // (e.g., userPhoneNumber is acceptable even though it contains "Number")
          return false;
        }
      }

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
      if (variableName === variableName.toUpperCase()) {
        // Special case for all-caps variables without underscores (like BREAKPOINTS)
        // These should not be flagged as Hungarian notation
        if (!variableName.includes('_')) {
          return false;
        }
        const parts = variableName.split('_');
        const lastIndex = parts.length - 1;
        return TYPE_MARKERS.some((marker) => {
          const markerUpper = marker.toUpperCase();
          const normalizedMarker = marker.toLowerCase();
          const isAbbreviation = ABBREVIATION_MARKER_SET.has(normalizedMarker);

          return parts.some((part, index) => {
            if (part !== markerUpper) {
              return false;
            }
            // Abbreviation markers (STR/ARR/OBJ/...) are type tags in any
            // position — no English word is spelled that way.
            if (isAbbreviation) {
              return true;
            }
            // A FULL type word tags the entity's type only at the start (prefix),
            // the end (suffix), or directly before the final noun
            // (..._STRING_NAME). Buried deeper (EDITABLE_WRAPPER_NUMBER_PROPS_…)
            // it qualifies an intermediate segment — a descriptive variant, not a
            // type tag.
            return (
              index === 0 || index === lastIndex || index === lastIndex - 1
            );
          });
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
          (/[A-Z0-9]/.test(
            variableName[variableName.length - normalizedMarker.length - 1],
          ) ||
            /[A-Z]/.test(
              variableName[variableName.length - normalizedMarker.length],
            ))
        ) {
          return true;
        }

        // Check for word boundaries to avoid matching substrings
        // For example, avoid matching "int" in "points" or "str" in "stream"
        const markerIndex = normalizedVarName.indexOf(normalizedMarker);
        if (markerIndex === -1) {
          return false;
        }

        const preMarkerPrefix =
          markerIndex > 0 ? variableName[markerIndex - 1] : '';
        const suffix =
          variableName[markerIndex + normalizedMarker.length] ?? '';

        // Ensure we have proper word boundaries
        // A word boundary is defined by:
        // 1. Start of string OR underscore OR capital letter before the marker
        // 2. End of string OR underscore OR capital letter after the marker
        const hasStartBoundary =
          markerIndex === 0 ||
          preMarkerPrefix === '_' ||
          /[A-Z]/.test(preMarkerPrefix) ||
          /[A-Z]/.test(variableName[markerIndex]);
        const hasEndBoundary =
          markerIndex + normalizedMarker.length === normalizedVarName.length ||
          suffix === '_' ||
          /[A-Z]/.test(suffix);

        return hasStartBoundary && hasEndBoundary;
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

    // Determine whether an identifier is (or references) a generic type parameter.
    function isTypeParameter(node: TSESTree.Identifier): boolean {
      // The type-parameter declaration itself: <TNumber>
      if (
        node.parent &&
        node.parent.type === AST_NODE_TYPES.TSTypeParameter &&
        node.parent.name === node
      ) {
        return true;
      }
      // A reference to a declared type parameter (e.g. x: TNumber).
      return typeParameterNames.has(node.name);
    }

    // Check identifier for type markers (Hungarian notation).
    // `isTypeName` enables the semantic-type-concept exemption for type
    // declarations (aliases, interfaces, classes).
    function checkIdentifier(node: TSESTree.Identifier, isTypeName = false) {
      const name = node.name;

      // Generic type parameters (TNumber, TKey, ...) are a TypeScript naming
      // convention, never Hungarian — skip the declaration and all references.
      if (isTypeParameter(node)) {
        return;
      }

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
      if (hasTypeMarker(name, isTypeName)) {
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

      // Record generic type-parameter names so neither the declaration nor any
      // reference to them is flagged (the leading `T` is a TS convention).
      TSTypeParameter(node) {
        if (node.name.type === AST_NODE_TYPES.Identifier) {
          typeParameterNames.add(node.name.name);
        }
      },

      // Check class declarations
      ClassDeclaration(node) {
        if (node.id) {
          checkIdentifier(node.id, true);
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
        checkIdentifier(node.id, true);
      },

      // Check interface declarations
      TSInterfaceDeclaration(node) {
        checkIdentifier(node.id, true);
      },
    };
  },
});

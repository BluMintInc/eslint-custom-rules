import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'avoidNegativeNaming';

// Common negative prefixes and words to detect
const NEGATIVE_PREFIXES = ['not', 'no', 'non', 'un', 'in', 'dis'];
const NEGATIVE_WORDS = [
  'invalid',
  'disabled',
  'incomplete',
  'unpaid',
  'inactive',
  'disallowed',
  'unauthorized',
  'unverified',
  'prevent',
  'avoid',
  'block',
  'deny',
  'reject',
  'exclude',
  'fail',
  'missing',
  'forbidden',
  'impossible',
  'error',
  'broken',
  'banned',
  'restricted',
  'limitation',
  'blocked',
  'prohibited',
];

// Whitelist of acceptable negative terms (technical terms, common patterns)
const ALLOWED_NEGATIVE_TERMS = new Set([
  'isNaN',
  'isNull',
  'isUndefined',
  'isEmpty',
  'isOffline',
  'isMissing',
  'isOutOfStock',
  'isOutOfBounds',
  'isOffPeak',
  'isNoticeable',
  'hasNotification',
  'isNoteworthy',
  'isNone',
  'isNegative', // For numbers
  'isNeutral',
  'isNotification',
  'isNote',
  'hasNote',
]);

// Map of negative terms to suggested positive alternatives
const POSITIVE_ALTERNATIVES: Record<string, string[]> = {
  // Prefixes
  'isNot': ['is'],
  'isUn': ['is'],
  'isDis': ['is'],
  'isIn': ['is'],
  'isNon': ['is'],
  'hasNo': ['has'],
  'hasNot': ['has'],
  'canNot': ['can'],
  'shouldNot': ['should'],
  'willNot': ['will'],
  'doesNot': ['does'],
  // Words
  'isInvalid': ['isValid'],
  'isDisabled': ['isEnabled'],
  'isIncomplete': ['isComplete'],
  'isUnpaid': ['isPaid', 'hasPaid'],
  'isInactive': ['isActive'],
  'isDisallowed': ['isAllowed'],
  'isUnauthorized': ['isAuthorized'],
  'isUnverified': ['isVerified'],
  'isImpossible': ['isPossible'],
  'isError': ['isSuccess', 'isValid'],
  'isBroken': ['isWorking', 'isFunctional'],
  'isBanned': ['isAllowed', 'isPermitted'],
  'isRestricted': ['isAllowed', 'isAccessible'],
  'isBlocked': ['isAllowed', 'isAccessible'],
  'isProhibited': ['isAllowed', 'isPermitted'],
  'prevent': ['allow', 'enable'],
  'avoid': ['use', 'prefer'],
  'block': ['allow', 'permit'],
  'deny': ['allow', 'grant'],
  'reject': ['accept', 'approve'],
  'exclude': ['include'],
  'fail': ['succeed', 'pass'],
  'missing': ['present', 'available'],
  'forbidden': ['allowed', 'permitted'],
  'disabled': ['enabled'],
  'incomplete': ['complete'],
  'invalid': ['isValid'],
  'disallowed': ['allowed'],
  'unauthorized': ['authorized'],
  'unverified': ['verified'],
  'inactive': ['active'],
  'disabledFeatures': ['enabledFeatures'],
  'inactiveUsers': ['activeUsers'],
  'disableFeature': ['enableFeature'],
  'disableAccount': ['enableAccount'],
  'blockUser': ['allowUser'],
  'preventAccess': ['allowAccess', 'enableAccess'],
  'restrictAccess': ['allowAccess', 'grantAccess'],
  'limitations': ['capabilities', 'features'],
  'limitation': ['capability', 'feature'],
};

export const enforcePositiveNaming = createRule<[], MessageIds>({
  name: 'enforce-positive-naming',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce positive variable naming patterns and avoid negative naming',
      recommended: 'error',
    },
    schema: [],
    messages: {
      avoidNegativeNaming:
        'Avoid negative naming "{{name}}". Consider using a positive alternative like: {{alternatives}}',
    },
  },
  defaultOptions: [],
  create(context) {
    // Track imported identifiers to ignore them in the rule
    const importedIdentifiers = new Set<string>();
    const importedNamespaces = new Set<string>();

    /**
     * Track all imported identifiers to ignore them in the rule
     */
    function trackImportedIdentifiers(node: TSESTree.ImportDeclaration) {
      // Skip imports from relative paths (our own code)
      const importPath = node.source.value as string;
      if (importPath.startsWith('./') || importPath.startsWith('../') || importPath.startsWith('/')) {
        return;
      }

      // Process all imports from external modules
      for (const specifier of node.specifiers) {
        if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
          // Named imports like: import { ResponseError } from 'external-lib';
          importedIdentifiers.add(specifier.local.name);
        } else if (specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
          // Namespace imports like: import * as Errors from 'error-lib';
          importedIdentifiers.add(specifier.local.name);
          importedNamespaces.add(specifier.local.name);
        } else if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
          // Default imports like: import axios from 'axios';
          importedIdentifiers.add(specifier.local.name);
        }
      }
    }

    /**
     * Check if an identifier is from an external module
     */
    function isIdentifierFromExternalModule(name: string): boolean {
      return importedIdentifiers.has(name);
    }

    /**
     * Check if a name has negative connotations
     */
    function hasNegativeNaming(name: string): { isNegative: boolean; alternatives: string[] } {
      // Skip checking if the name is in the whitelist or is from an external module
      if (ALLOWED_NEGATIVE_TERMS.has(name) || isIdentifierFromExternalModule(name)) {
        return { isNegative: false, alternatives: [] };
      }

      // Check for exact matches in our alternatives map first
      if (POSITIVE_ALTERNATIVES[name]) {
        return { isNegative: true, alternatives: POSITIVE_ALTERNATIVES[name] };
      }

      // Check for negative prefixes
      for (const prefix of NEGATIVE_PREFIXES) {
        // Check for patterns like isNot, hasNo, canNot, etc.
        const prefixPatterns = [
          { pattern: new RegExp(`^is${prefix}`, 'i'), key: `is${prefix.charAt(0).toUpperCase() + prefix.slice(1)}` },
          { pattern: new RegExp(`^has${prefix}`, 'i'), key: `has${prefix.charAt(0).toUpperCase() + prefix.slice(1)}` },
          { pattern: new RegExp(`^can${prefix}`, 'i'), key: `can${prefix.charAt(0).toUpperCase() + prefix.slice(1)}` },
        ];

        for (const { pattern, key } of prefixPatterns) {
          if (pattern.test(name)) {
            const alternatives = POSITIVE_ALTERNATIVES[key] || [];
            if (alternatives.length > 0) {
              // Suggest the positive version with the rest of the name
              const restOfName = name.replace(pattern, '');
              const suggestedAlternatives = alternatives.map(alt =>
                `${alt}${restOfName.charAt(0).toUpperCase() + restOfName.slice(1)}`
              );
              return { isNegative: true, alternatives: suggestedAlternatives };
            }
            return { isNegative: true, alternatives: ['a positive alternative'] };
          }
        }
      }

      // Check for negative words
      for (const word of NEGATIVE_WORDS) {
        if (name.toLowerCase().includes(word.toLowerCase())) {
          const alternatives = POSITIVE_ALTERNATIVES[word] || [];
          return {
            isNegative: true,
            alternatives: alternatives.length ? alternatives : ['a positive alternative']
          };
        }
      }

      return { isNegative: false, alternatives: [] };
    }

    /**
     * Safely formats alternatives for display
     */
    function formatAlternatives(alternatives: string[] | string): string {
      if (Array.isArray(alternatives)) {
        return alternatives.join(', ');
      }
      return String(alternatives);
    }

    /**
     * Check variable declarations for negative naming
     */
    function checkVariableDeclaration(node: TSESTree.VariableDeclarator) {
      if (node.id.type !== AST_NODE_TYPES.Identifier) return;

      const variableName = node.id.name;

      // Skip checking if the variable name is from an external module
      if (isIdentifierFromExternalModule(variableName)) {
        return;
      }

      // Skip checking if the variable name contains "error" and is related to an imported type
      if (
        (variableName.toLowerCase().includes('error') ||
         variableName.toLowerCase().includes('invalid') ||
         variableName.toLowerCase().includes('handle'))
      ) {
        // Skip checking if the variable has a type annotation that uses an imported type
        if (node.id.typeAnnotation &&
            node.id.typeAnnotation.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
          const typeRef = node.id.typeAnnotation.typeAnnotation as TSESTree.TSTypeReference;
          if (typeRef.typeName.type === AST_NODE_TYPES.Identifier &&
              isIdentifierFromExternalModule(typeRef.typeName.name)) {
            return;
          }
        }

        // Skip checking if the variable is initialized with a type assertion to an imported type
        if (node.init &&
            node.init.type === AST_NODE_TYPES.TSAsExpression &&
            node.init.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
          const typeRef = node.init.typeAnnotation as TSESTree.TSTypeReference;
          if (typeRef.typeName.type === AST_NODE_TYPES.Identifier &&
              isIdentifierFromExternalModule(typeRef.typeName.name)) {
            return;
          }
        }

        // Skip checking if the variable is initialized with a function that has parameters with imported types
        if (node.init) {
          if (node.init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
              node.init.type === AST_NODE_TYPES.FunctionExpression) {
            if (node.init.params.length > 0) {
              const param = node.init.params[0];
              if (param.type === AST_NODE_TYPES.Identifier &&
                  param.typeAnnotation &&
                  param.typeAnnotation.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
                const typeRef = param.typeAnnotation.typeAnnotation as TSESTree.TSTypeReference;
                if (typeRef.typeName.type === AST_NODE_TYPES.Identifier &&
                    isIdentifierFromExternalModule(typeRef.typeName.name)) {
                  return;
                }
              }
            }
          }
        }
      }

      const { isNegative, alternatives } = hasNegativeNaming(variableName);

      if (isNegative) {
        context.report({
          node: node.id,
          messageId: 'avoidNegativeNaming',
          data: {
            name: variableName,
            alternatives: formatAlternatives(alternatives),
          },
        });
      }
    }

    return {
      // Track imported identifiers to ignore them in the rule
      ImportDeclaration: trackImportedIdentifiers,

      // Check variable declarations
      VariableDeclarator: checkVariableDeclaration,
    };
  },
});

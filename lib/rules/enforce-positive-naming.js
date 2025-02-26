"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforcePositiveNaming = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
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
    'isNegative',
    'isNeutral',
    'isNotification',
    'isNote',
    'hasNote',
]);
// Map of negative terms to suggested positive alternatives
const POSITIVE_ALTERNATIVES = {
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
    'invalid': ['valid'],
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
exports.enforcePositiveNaming = (0, createRule_1.createRule)({
    name: 'enforce-positive-naming',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce positive variable naming patterns and avoid negative naming',
            recommended: 'error',
        },
        schema: [],
        messages: {
            avoidNegativeNaming: 'Avoid negative naming "{{name}}". Consider using a positive alternative like: {{alternatives}}',
        },
    },
    defaultOptions: [],
    create(context) {
        /**
         * Check if a name has negative connotations
         */
        function hasNegativeNaming(name) {
            // Skip checking if the name is in the whitelist
            if (ALLOWED_NEGATIVE_TERMS.has(name)) {
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
                    { pattern: new RegExp(`^should${prefix}`, 'i'), key: `should${prefix.charAt(0).toUpperCase() + prefix.slice(1)}` },
                    { pattern: new RegExp(`^will${prefix}`, 'i'), key: `will${prefix.charAt(0).toUpperCase() + prefix.slice(1)}` },
                    { pattern: new RegExp(`^does${prefix}`, 'i'), key: `does${prefix.charAt(0).toUpperCase() + prefix.slice(1)}` },
                ];
                for (const { pattern, key } of prefixPatterns) {
                    if (pattern.test(name)) {
                        // If we have a direct match for this pattern (like isNotVerified -> isVerified)
                        const directMatch = POSITIVE_ALTERNATIVES[name];
                        if (directMatch) {
                            return { isNegative: true, alternatives: directMatch };
                        }
                        const alternatives = POSITIVE_ALTERNATIVES[key] || [];
                        if (alternatives.length > 0) {
                            // Suggest the positive version with the rest of the name
                            const restOfName = name.replace(pattern, '');
                            const suggestedAlternatives = alternatives.map(alt => `${alt}${restOfName.charAt(0).toUpperCase() + restOfName.slice(1)}`);
                            return { isNegative: true, alternatives: suggestedAlternatives };
                        }
                        return { isNegative: true, alternatives: ['a positive alternative'] };
                    }
                }
            }
            // Check for exact negative words
            for (const word of NEGATIVE_WORDS) {
                if (name.toLowerCase() === word.toLowerCase()) {
                    const alternatives = POSITIVE_ALTERNATIVES[word] || [];
                    return {
                        isNegative: true,
                        alternatives: alternatives.length ? alternatives : ['a positive alternative']
                    };
                }
            }
            // Check for negative words in camelCase/PascalCase
            for (const word of NEGATIVE_WORDS) {
                // Match the word at the beginning or after a capital letter
                const pattern = new RegExp(`(^|[A-Z])${word}($|[A-Z])`, 'i');
                if (pattern.test(name)) {
                    // For compound names like isInvalid, check if we have a specific suggestion
                    const exactMatch = `is${word.charAt(0).toUpperCase() + word.slice(1)}`;
                    if (POSITIVE_ALTERNATIVES[exactMatch]) {
                        return { isNegative: true, alternatives: POSITIVE_ALTERNATIVES[exactMatch] };
                    }
                    // Otherwise suggest general alternatives for the negative word
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
         * Check variable declarations for negative naming
         */
        function checkVariableDeclaration(node) {
            if (node.id.type !== utils_1.AST_NODE_TYPES.Identifier)
                return;
            const variableName = node.id.name;
            const { isNegative, alternatives } = hasNegativeNaming(variableName);
            if (isNegative) {
                context.report({
                    node: node.id,
                    messageId: 'avoidNegativeNaming',
                    data: {
                        name: variableName,
                        alternatives: alternatives.join(', '),
                    },
                });
            }
        }
        /**
         * Check function declarations for negative naming
         */
        function checkFunctionDeclaration(node) {
            // Skip anonymous functions
            if (!node.id && node.parent?.type !== utils_1.AST_NODE_TYPES.VariableDeclarator) {
                return;
            }
            // Get function name from either the function declaration or variable declarator
            let functionName = '';
            if (node.id) {
                functionName = node.id.name;
            }
            else if (node.parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                node.parent.id.type === utils_1.AST_NODE_TYPES.Identifier) {
                functionName = node.parent.id.name;
            }
            else if (node.parent?.type === utils_1.AST_NODE_TYPES.Property &&
                node.parent.key.type === utils_1.AST_NODE_TYPES.Identifier) {
                // Handle object method shorthand
                functionName = node.parent.key.name;
            }
            if (!functionName)
                return;
            const { isNegative, alternatives } = hasNegativeNaming(functionName);
            if (isNegative) {
                context.report({
                    node: node.id || node,
                    messageId: 'avoidNegativeNaming',
                    data: {
                        name: functionName,
                        alternatives: alternatives.join(', '),
                    },
                });
            }
        }
        /**
         * Check method definitions for negative naming
         */
        function checkMethodDefinition(node) {
            if (node.key.type !== utils_1.AST_NODE_TYPES.Identifier)
                return;
            const methodName = node.key.name;
            const { isNegative, alternatives } = hasNegativeNaming(methodName);
            if (isNegative) {
                context.report({
                    node: node.key,
                    messageId: 'avoidNegativeNaming',
                    data: {
                        name: methodName,
                        alternatives: alternatives.join(', '),
                    },
                });
            }
        }
        /**
         * Check property definitions for negative naming
         */
        function checkProperty(node) {
            if (node.key.type !== utils_1.AST_NODE_TYPES.Identifier)
                return;
            const propertyName = node.key.name;
            const { isNegative, alternatives } = hasNegativeNaming(propertyName);
            if (isNegative) {
                context.report({
                    node: node.key,
                    messageId: 'avoidNegativeNaming',
                    data: {
                        name: propertyName,
                        alternatives: alternatives.join(', '),
                    },
                });
            }
        }
        /**
         * Check TSPropertySignature for negative naming (in interfaces)
         */
        function checkPropertySignature(node) {
            if (node.key.type !== utils_1.AST_NODE_TYPES.Identifier)
                return;
            const propertyName = node.key.name;
            const { isNegative, alternatives } = hasNegativeNaming(propertyName);
            if (isNegative) {
                context.report({
                    node: node.key,
                    messageId: 'avoidNegativeNaming',
                    data: {
                        name: propertyName,
                        alternatives: alternatives.join(', '),
                    },
                });
            }
        }
        /**
         * Check parameter names for negative naming
         */
        function checkParameter(node) {
            if (node.type !== utils_1.AST_NODE_TYPES.Identifier)
                return;
            const paramName = node.name;
            const { isNegative, alternatives } = hasNegativeNaming(paramName);
            if (isNegative) {
                context.report({
                    node,
                    messageId: 'avoidNegativeNaming',
                    data: {
                        name: paramName,
                        alternatives: alternatives.join(', '),
                    },
                });
            }
        }
        return {
            VariableDeclarator: checkVariableDeclaration,
            FunctionDeclaration: checkFunctionDeclaration,
            // Only check function expressions when they're not part of a variable declaration
            // to avoid duplicate errors
            FunctionExpression(node) {
                if (node.parent?.type !== utils_1.AST_NODE_TYPES.VariableDeclarator) {
                    checkFunctionDeclaration(node);
                }
            },
            // Only check arrow function expressions when they're not part of a variable declaration
            // to avoid duplicate errors
            ArrowFunctionExpression(node) {
                if (node.parent?.type !== utils_1.AST_NODE_TYPES.VariableDeclarator) {
                    checkFunctionDeclaration(node);
                }
            },
            MethodDefinition: checkMethodDefinition,
            Property: checkProperty,
            TSPropertySignature: checkPropertySignature,
            Identifier(node) {
                // Check parameter names in function declarations
                if (node.parent &&
                    (node.parent.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
                        node.parent.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                        node.parent.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) &&
                    node.parent.params.includes(node)) {
                    checkParameter(node);
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-positive-naming.js.map
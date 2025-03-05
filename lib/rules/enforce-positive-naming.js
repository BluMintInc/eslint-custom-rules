"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforcePositiveNaming = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
// Common negative prefixes for boolean variables
const BOOLEAN_NEGATIVE_PREFIXES = ['not', 'no', 'non', 'un', 'in', 'dis'];
// Map of negative boolean terms to suggested positive alternatives
const BOOLEAN_POSITIVE_ALTERNATIVES = {
    // Boolean prefixes
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
};
exports.enforcePositiveNaming = (0, createRule_1.createRule)({
    name: 'enforce-positive-naming',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce positive naming for boolean variables and avoid negations',
            recommended: 'error',
        },
        schema: [],
        messages: {
            avoidNegativeNaming: 'Avoid negative naming "{{name}}". Consider using a positive alternative like: {{alternatives}}',
        },
    },
    defaultOptions: [],
    create(context) {
        // Get the filename from the context
        const filename = context.getFilename();
        // Skip checking for files that should be ignored
        // 1. Files that are not .ts or .tsx
        // 2. Files starting with .
        // 3. Files containing .config
        // 4. Files containing rc suffix
        if ((!filename.endsWith('.ts') && !filename.endsWith('.tsx')) ||
            filename.split('/').pop()?.startsWith('.') ||
            filename.includes('.config') ||
            filename.includes('rc.') ||
            filename.endsWith('rc')) {
            // Return empty object to skip all checks for this file
            return {};
        }
        /**
         * Check if a name has boolean negative naming
         */
        function hasBooleanNegativeNaming(name) {
            // Check for exact matches in our alternatives map first
            if (BOOLEAN_POSITIVE_ALTERNATIVES[name]) {
                return { isNegative: true, alternatives: BOOLEAN_POSITIVE_ALTERNATIVES[name] };
            }
            // Check for negative prefixes in boolean-like variables
            if (name.startsWith('is') || name.startsWith('has') || name.startsWith('can') ||
                name.startsWith('should') || name.startsWith('will') || name.startsWith('does')) {
                for (const prefix of BOOLEAN_NEGATIVE_PREFIXES) {
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
                            const directMatch = BOOLEAN_POSITIVE_ALTERNATIVES[name];
                            if (directMatch) {
                                return { isNegative: true, alternatives: directMatch };
                            }
                            const alternatives = BOOLEAN_POSITIVE_ALTERNATIVES[key] || [];
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
            }
            return { isNegative: false, alternatives: [] };
        }
        /**
         * Safely formats alternatives for display
         */
        function formatAlternatives(alternatives) {
            if (Array.isArray(alternatives)) {
                return alternatives.join(', ');
            }
            return String(alternatives);
        }
        /**
         * Check if a node is likely to be a boolean
         */
        function isBooleanLike(node) {
            // Check if the node has a boolean type annotation
            if (node.type === utils_1.AST_NODE_TYPES.TSTypeAnnotation &&
                node.typeAnnotation.type === utils_1.AST_NODE_TYPES.TSBooleanKeyword) {
                return true;
            }
            // Check if the node is initialized with a boolean literal
            if (node.parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                node.parent.init?.type === utils_1.AST_NODE_TYPES.Literal &&
                typeof node.parent.init.value === 'boolean') {
                return true;
            }
            // Check if the node has a name that suggests it's a boolean
            if (node.type === utils_1.AST_NODE_TYPES.Identifier &&
                (node.name.startsWith('is') || node.name.startsWith('has') ||
                    node.name.startsWith('can') || node.name.startsWith('should') ||
                    node.name.startsWith('will') || node.name.startsWith('does'))) {
                return true;
            }
            return false;
        }
        /**
         * Check variable declarations for negative naming
         */
        function checkVariableDeclaration(node) {
            if (node.id.type !== utils_1.AST_NODE_TYPES.Identifier)
                return;
            // Only check boolean-like variables
            if (!isBooleanLike(node.id) && !isBooleanLike(node))
                return;
            const variableName = node.id.name;
            const { isNegative, alternatives } = hasBooleanNegativeNaming(variableName);
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
            // Only check boolean-returning functions
            if (!isBooleanLike(node.id || node))
                return;
            const { isNegative, alternatives } = hasBooleanNegativeNaming(functionName);
            if (isNegative) {
                context.report({
                    node: node.id || node,
                    messageId: 'avoidNegativeNaming',
                    data: {
                        name: functionName,
                        alternatives: formatAlternatives(alternatives),
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
            // Only check boolean-returning methods
            if (!isBooleanLike(node.key))
                return;
            const methodName = node.key.name;
            const { isNegative, alternatives } = hasBooleanNegativeNaming(methodName);
            if (isNegative) {
                context.report({
                    node: node.key,
                    messageId: 'avoidNegativeNaming',
                    data: {
                        name: methodName,
                        alternatives: formatAlternatives(alternatives),
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
            // Only check boolean properties
            if (!isBooleanLike(node.key))
                return;
            const propertyName = node.key.name;
            const { isNegative, alternatives } = hasBooleanNegativeNaming(propertyName);
            if (isNegative) {
                context.report({
                    node: node.key,
                    messageId: 'avoidNegativeNaming',
                    data: {
                        name: propertyName,
                        alternatives: formatAlternatives(alternatives),
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
            // Only check boolean properties
            if (!isBooleanLike(node.key) &&
                !(node.typeAnnotation?.typeAnnotation.type === utils_1.AST_NODE_TYPES.TSBooleanKeyword))
                return;
            const propertyName = node.key.name;
            const { isNegative, alternatives } = hasBooleanNegativeNaming(propertyName);
            if (isNegative) {
                context.report({
                    node: node.key,
                    messageId: 'avoidNegativeNaming',
                    data: {
                        name: propertyName,
                        alternatives: formatAlternatives(alternatives),
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
            // Only check boolean parameters
            if (!isBooleanLike(node))
                return;
            const paramName = node.name;
            const { isNegative, alternatives } = hasBooleanNegativeNaming(paramName);
            if (isNegative) {
                context.report({
                    node,
                    messageId: 'avoidNegativeNaming',
                    data: {
                        name: paramName,
                        alternatives: formatAlternatives(alternatives),
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
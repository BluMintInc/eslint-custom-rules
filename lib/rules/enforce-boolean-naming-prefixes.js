"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceBooleanNamingPrefixes = void 0;
const utils_1 = require("@typescript-eslint/utils");
const pluralize_1 = __importDefault(require("pluralize"));
const createRule_1 = require("../utils/createRule");
// Default approved boolean prefixes. Some less common prefixes (e.g., 'are',
// 'includes') stay allowed for flexibility even though the user-facing message
// highlights only the most common ones. Underscore-prefixed names are also
// intentionally allowed for private/internal fields.
const DEFAULT_BOOLEAN_PREFIXES = [
    'is',
    'has',
    'does',
    'can',
    'should',
    'will',
    'was',
    'had',
    'did',
    'would',
    'must',
    'allows',
    'supports',
    'needs',
    'asserts',
    'includes',
    'are', // Adding 'are' as an approved prefix (plural form of 'is')
];
const DEFAULT_OPTIONS = {
    prefixes: DEFAULT_BOOLEAN_PREFIXES,
    ignoreOverriddenGetters: false,
};
exports.enforceBooleanNamingPrefixes = (0, createRule_1.createRule)({
    name: 'enforce-boolean-naming-prefixes',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce consistent naming conventions for boolean values by requiring approved prefixes',
            recommended: 'error',
        },
        schema: [
            {
                type: 'object',
                properties: {
                    prefixes: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                    },
                    ignoreOverriddenGetters: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            missingBooleanPrefix: 'Boolean {{type}} "{{name}}" is missing a common approved boolean prefix ({{prefixes}}). ' +
                'Prefixes immediately communicate that the value is a true/false predicate; without one, checks like `if ({{name}})` read as generic truthiness guards and hide the boolean intent. ' +
                'Rename by prepending any approved prefix so the name becomes `<prefix>{{capitalizedName}}`, making the boolean contract obvious at call sites and API boundaries.',
        },
    },
    defaultOptions: [DEFAULT_OPTIONS],
    create(context, [options]) {
        const approvedPrefixes = options.prefixes || DEFAULT_OPTIONS.prefixes;
        const ignoreOverriddenGetters = options.ignoreOverriddenGetters ?? DEFAULT_OPTIONS.ignoreOverriddenGetters;
        const importStatusCache = new Map();
        const externalApiUsageCache = new Map();
        const whileUsageCache = new Map();
        const treeTraversalCache = new Map();
        function findVariableInScopes(name) {
            let currentScope = context.getScope();
            while (currentScope) {
                const variable = currentScope.variables.find((v) => v.name === name);
                if (variable)
                    return variable;
                currentScope = currentScope.upper;
            }
            return undefined;
        }
        /**
         * Check if a name starts with any of the approved prefixes, their plural forms,
         * or if it starts with an underscore (which indicates a private/internal property)
         */
        function hasApprovedPrefix(name, options) {
            const treatLeadingUnderscoreAsApproved = options?.treatLeadingUnderscoreAsApproved ?? true;
            const normalizedName = name.startsWith('_') ? name.slice(1) : name;
            // Skip checking properties that start with an underscore (private/internal properties)
            if (treatLeadingUnderscoreAsApproved && name.startsWith('_')) {
                return true;
            }
            return approvedPrefixes.some((prefix) => {
                // Check for exact prefix match
                if (normalizedName.toLowerCase().startsWith(prefix.toLowerCase())) {
                    return true;
                }
                // Check for plural form of the prefix
                // Only apply pluralization to certain prefixes that have meaningful plural forms
                if (['is', 'has', 'does', 'was', 'had', 'did'].includes(prefix)) {
                    const pluralPrefix = pluralize_1.default.plural(prefix);
                    return normalizedName
                        .toLowerCase()
                        .startsWith(pluralPrefix.toLowerCase());
                }
                return false;
            });
        }
        function nameSuggestsBoolean(name) {
            const normalizedName = name.startsWith('_') ? name.slice(1) : name;
            const lowerName = normalizedName.toLowerCase();
            const suffixKeywords = [
                'active',
                'inactive',
                'enabled',
                'disabled',
                'visible',
                'ready',
                'valid',
                'verified',
                'authenticated',
                'authorized',
            ];
            return (hasApprovedPrefix(normalizedName, {
                treatLeadingUnderscoreAsApproved: false,
            }) ||
                suffixKeywords.some((keyword) => lowerName.endsWith(keyword)));
        }
        /**
         * Capitalize the first letter of a name for use in suggested alternatives
         */
        function capitalizeFirst(name) {
            if (!name)
                return '';
            return name.charAt(0).toUpperCase() + name.slice(1);
        }
        /**
         * Format the list of approved prefixes for error messages
         * Note: We exclude 'are' and 'includes' from the error message to maintain backward compatibility with tests
         */
        function formatPrefixes() {
            // Filter out 'are' and 'includes' from the displayed prefixes to maintain backward compatibility with tests
            const displayPrefixes = approvedPrefixes.filter((prefix) => prefix !== 'are' && prefix !== 'includes');
            return displayPrefixes.join(', ');
        }
        /**
         * Check if a node is a TypeScript type predicate
         */
        function isTypePredicate(node) {
            if (node.parent?.type === utils_1.AST_NODE_TYPES.TSTypeAnnotation &&
                node.parent.parent?.type === utils_1.AST_NODE_TYPES.Identifier &&
                node.parent.parent.parent?.type === utils_1.AST_NODE_TYPES.FunctionDeclaration) {
                const typeAnnotation = node.parent;
                return (typeAnnotation.typeAnnotation.type === utils_1.AST_NODE_TYPES.TSTypePredicate);
            }
            return false;
        }
        /**
         * Check if a node has a boolean type annotation
         */
        function hasBooleanTypeAnnotation(node) {
            if (node.type === utils_1.AST_NODE_TYPES.Identifier) {
                // Check for explicit boolean type annotation
                if (node.typeAnnotation?.typeAnnotation.type ===
                    utils_1.AST_NODE_TYPES.TSBooleanKeyword) {
                    return true;
                }
                // Check if it's a parameter in a function with a boolean type
                if (node.parent?.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
                    node.parent?.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                    node.parent?.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
                    if (node.typeAnnotation?.typeAnnotation &&
                        node.typeAnnotation.typeAnnotation.type ===
                            utils_1.AST_NODE_TYPES.TSBooleanKeyword) {
                        return true;
                    }
                }
            }
            // Check for property signature with boolean type
            if (node.type === utils_1.AST_NODE_TYPES.TSPropertySignature &&
                node.typeAnnotation?.typeAnnotation.type ===
                    utils_1.AST_NODE_TYPES.TSBooleanKeyword) {
                return true;
            }
            return false;
        }
        /**
         * Check if a node is initialized with a boolean value
         */
        function hasInitialBooleanValue(node) {
            if (node.type === utils_1.AST_NODE_TYPES.VariableDeclarator && node.init) {
                // Check for direct boolean literal initialization
                if (node.init.type === utils_1.AST_NODE_TYPES.Literal &&
                    typeof node.init.value === 'boolean') {
                    return true;
                }
                // Check for logical expressions that typically return boolean
                if (node.init.type === utils_1.AST_NODE_TYPES.BinaryExpression &&
                    ['===', '!==', '==', '!=', '>', '<', '>=', '<=', 'in', 'instanceof'].includes(node.init.operator)) {
                    return true;
                }
                // Check for logical expressions (&&)
                if (node.init.type === utils_1.AST_NODE_TYPES.LogicalExpression &&
                    node.init.operator === '&&') {
                    // Check if the right side is a method call that might return a non-boolean value
                    const rightSide = node.init.right;
                    if (rightSide.type === utils_1.AST_NODE_TYPES.CallExpression) {
                        // If right side is a simple identifier call
                        if (rightSide.callee.type === utils_1.AST_NODE_TYPES.Identifier) {
                            const calleeName = rightSide.callee.name;
                            const lowerCallee = calleeName.toLowerCase();
                            // For assert*-style utilities, only treat as boolean if we can confirm boolean return type
                            if (lowerCallee.startsWith('assert')) {
                                return identifierReturnsBoolean(calleeName);
                            }
                            // Otherwise, infer based on naming heuristics
                            const isBooleanCall = approvedPrefixes.some((prefix) => prefix !== 'asserts' &&
                                lowerCallee.startsWith(prefix.toLowerCase()));
                            if (isBooleanCall ||
                                lowerCallee.includes('boolean') ||
                                lowerCallee.includes('enabled') ||
                                lowerCallee.includes('auth') ||
                                lowerCallee.includes('valid') ||
                                lowerCallee.includes('check')) {
                                return true;
                            }
                            if (lowerCallee.startsWith('get') ||
                                lowerCallee.startsWith('fetch') ||
                                lowerCallee.startsWith('retrieve') ||
                                lowerCallee.startsWith('load') ||
                                lowerCallee.startsWith('read')) {
                                return false;
                            }
                        }
                        // If the method name doesn't suggest it returns a boolean, don't flag it
                        if (rightSide.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                            rightSide.callee.property.type === utils_1.AST_NODE_TYPES.Identifier) {
                            const methodName = rightSide.callee.property.name;
                            const lowerMethodName = methodName.toLowerCase();
                            // Ignore assert*-style methods which often return the input value
                            if (lowerMethodName.startsWith('assert')) {
                                return false;
                            }
                            // Check if the method name suggests it returns a boolean
                            const isBooleanMethod = approvedPrefixes.some((prefix) => prefix !== 'asserts' &&
                                lowerMethodName.startsWith(prefix.toLowerCase()));
                            // If the method name suggests it returns a boolean (starts with a boolean prefix or contains 'boolean' or 'enabled'),
                            // then the variable should be treated as a boolean
                            if (isBooleanMethod ||
                                lowerMethodName.includes('boolean') ||
                                lowerMethodName.includes('enabled') ||
                                lowerMethodName.includes('auth') ||
                                lowerMethodName.includes('valid') ||
                                lowerMethodName.includes('check')) {
                                return true;
                            }
                            // For methods like getVolume(), getData(), etc., assume they return non-boolean values
                            if (lowerMethodName.startsWith('get') ||
                                lowerMethodName.startsWith('fetch') ||
                                lowerMethodName.startsWith('retrieve') ||
                                lowerMethodName.startsWith('load') ||
                                lowerMethodName.startsWith('read')) {
                                return false;
                            }
                        }
                    }
                    // Check if the right side is a property access that might return a non-boolean value
                    if (rightSide.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                        rightSide.property.type === utils_1.AST_NODE_TYPES.Identifier) {
                        const propertyName = rightSide.property.name;
                        const lowerPropertyName = propertyName.toLowerCase();
                        // If the property name is 'parentElement', 'parentNode', etc., it's likely not a boolean
                        if (lowerPropertyName.includes('parent') ||
                            lowerPropertyName.includes('element') ||
                            lowerPropertyName.includes('node') ||
                            lowerPropertyName.includes('child') ||
                            lowerPropertyName.includes('sibling')) {
                            return false;
                        }
                        // Ignore assert*-style properties which often return the input value
                        if (lowerPropertyName.startsWith('assert')) {
                            return false;
                        }
                        // For property access like user.isAuthenticated, treat as boolean
                        const isBooleanProperty = approvedPrefixes.some((prefix) => prefix !== 'asserts' &&
                            lowerPropertyName.startsWith(prefix.toLowerCase()));
                        if (isBooleanProperty) {
                            return true;
                        }
                    }
                    // Default to true for other cases with && to avoid false negatives
                    return true;
                }
                // Special case for logical OR (||) - only consider it boolean if:
                // 1. It's used with boolean literals or
                // 2. It's not used with array/object literals as fallbacks
                if (node.init.type === utils_1.AST_NODE_TYPES.LogicalExpression &&
                    node.init.operator === '||') {
                    // Check if right side is a non-boolean literal (array, object, string, number)
                    const rightSide = node.init.right;
                    if (rightSide.type === utils_1.AST_NODE_TYPES.ArrayExpression ||
                        rightSide.type === utils_1.AST_NODE_TYPES.ObjectExpression ||
                        (rightSide.type === utils_1.AST_NODE_TYPES.Literal &&
                            typeof rightSide.value !== 'boolean')) {
                        return false;
                    }
                    // If right side is a boolean literal, it's likely a boolean variable
                    if (rightSide.type === utils_1.AST_NODE_TYPES.Literal &&
                        typeof rightSide.value === 'boolean') {
                        return true;
                    }
                    // For other cases, we need to be more careful
                    // If we can determine the left side is a boolean, then it's a boolean variable
                    const leftSide = node.init.left;
                    if ((leftSide.type === utils_1.AST_NODE_TYPES.Literal &&
                        typeof leftSide.value === 'boolean') ||
                        (leftSide.type === utils_1.AST_NODE_TYPES.UnaryExpression &&
                            leftSide.operator === '!')) {
                        return true;
                    }
                    // For function calls, check if the function name suggests it returns a boolean
                    if (leftSide.type === utils_1.AST_NODE_TYPES.CallExpression &&
                        leftSide.callee.type === utils_1.AST_NODE_TYPES.Identifier) {
                        const calleeName = leftSide.callee.name;
                        const lowerCallee = calleeName.toLowerCase();
                        // For assert*-style utilities, only treat as boolean if we can confirm boolean return type
                        if (lowerCallee.startsWith('assert')) {
                            return identifierReturnsBoolean(calleeName);
                        }
                        return approvedPrefixes.some((prefix) => prefix !== 'asserts' &&
                            lowerCallee.startsWith(prefix.toLowerCase()));
                    }
                    // Default to false for other cases with || to avoid false positives
                    return false;
                }
                // Check for unary expressions with ! operator
                if (node.init.type === utils_1.AST_NODE_TYPES.UnaryExpression &&
                    node.init.operator === '!') {
                    return true;
                }
                // Check for function calls that might return boolean
                if (node.init.type === utils_1.AST_NODE_TYPES.CallExpression &&
                    node.init.callee.type === utils_1.AST_NODE_TYPES.Identifier) {
                    const calleeName = node.init.callee.name;
                    const lowerCallee = calleeName.toLowerCase();
                    // For assert*-style utilities, only treat as boolean if we can confirm boolean return type
                    if (lowerCallee.startsWith('assert')) {
                        return identifierReturnsBoolean(calleeName);
                    }
                    // Check if the function name suggests it returns a boolean
                    return approvedPrefixes.some((prefix) => prefix !== 'asserts' &&
                        lowerCallee.startsWith(prefix.toLowerCase()));
                }
            }
            return false;
        }
        /**
         * Check if a function returns a boolean value
         */
        function returnsBooleanValue(node) {
            // Check for explicit boolean return type annotation
            if (node.returnType?.typeAnnotation &&
                node.returnType.typeAnnotation.type ===
                    utils_1.AST_NODE_TYPES.TSBooleanKeyword) {
                return true;
            }
            // For arrow functions with expression bodies, check if the expression is boolean-like
            if (node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression &&
                node.expression &&
                node.body) {
                if (node.body.type === utils_1.AST_NODE_TYPES.Literal &&
                    typeof node.body.value === 'boolean') {
                    return true;
                }
                if (node.body.type === utils_1.AST_NODE_TYPES.BinaryExpression &&
                    ['===', '!==', '==', '!=', '>', '<', '>=', '<=', 'in', 'instanceof'].includes(node.body.operator)) {
                    return true;
                }
                if (node.body.type === utils_1.AST_NODE_TYPES.UnaryExpression &&
                    node.body.operator === '!') {
                    return true;
                }
            }
            // Check for arrow function with boolean return type
            if (node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
                const variableDeclarator = node.parent;
                if (variableDeclarator?.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                    variableDeclarator.id.type === utils_1.AST_NODE_TYPES.Identifier) {
                    // Check if the arrow function has a boolean return type annotation
                    if (node.returnType?.typeAnnotation &&
                        node.returnType.typeAnnotation.type ===
                            utils_1.AST_NODE_TYPES.TSBooleanKeyword) {
                        return true;
                    }
                }
            }
            return false;
        }
        function identifierIsBoolean(identifier) {
            if (nameSuggestsBoolean(identifier.name)) {
                return true;
            }
            const variable = findVariableInScopes(identifier.name);
            if (!variable)
                return false;
            for (const def of variable.defs) {
                if (def.type === 'Variable' && def.node) {
                    const declarator = def.node;
                    if (declarator.id.type === utils_1.AST_NODE_TYPES.Identifier &&
                        (hasBooleanTypeAnnotation(declarator.id) ||
                            hasInitialBooleanValue(declarator))) {
                        return true;
                    }
                }
                if (def.type === 'Parameter' &&
                    def.name?.type === utils_1.AST_NODE_TYPES.Identifier &&
                    hasBooleanTypeAnnotation(def.name)) {
                    return true;
                }
                if (def.type === 'FunctionName' &&
                    def.node &&
                    returnsBooleanValue(def.node)) {
                    return true;
                }
            }
            return false;
        }
        function callExpressionLooksBoolean(callExpression) {
            if (callExpression.callee.type === utils_1.AST_NODE_TYPES.Identifier) {
                const calleeName = callExpression.callee.name;
                const lowerCallee = calleeName.toLowerCase();
                if (lowerCallee.startsWith('assert')) {
                    return identifierReturnsBoolean(calleeName)
                        ? 'boolean'
                        : 'unknown';
                }
                const matchesPrefix = approvedPrefixes.some((prefix) => prefix !== 'asserts' &&
                    lowerCallee.startsWith(prefix.toLowerCase()));
                if (matchesPrefix ||
                    lowerCallee.includes('boolean') ||
                    lowerCallee.includes('enabled') ||
                    lowerCallee.includes('auth') ||
                    lowerCallee.includes('valid') ||
                    lowerCallee.includes('check')) {
                    return 'boolean';
                }
                if (lowerCallee.startsWith('get') ||
                    lowerCallee.startsWith('fetch') ||
                    lowerCallee.startsWith('retrieve') ||
                    lowerCallee.startsWith('load') ||
                    lowerCallee.startsWith('read')) {
                    return 'unknown';
                }
            }
            if (callExpression.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                callExpression.callee.property.type === utils_1.AST_NODE_TYPES.Identifier) {
                const methodName = callExpression.callee.property.name;
                const lowerMethodName = methodName.toLowerCase();
                if (lowerMethodName.startsWith('assert')) {
                    return 'unknown';
                }
                const matchesPrefix = approvedPrefixes.some((prefix) => prefix !== 'asserts' &&
                    lowerMethodName.startsWith(prefix.toLowerCase()));
                if (matchesPrefix ||
                    lowerMethodName.includes('boolean') ||
                    lowerMethodName.includes('enabled') ||
                    lowerMethodName.includes('auth') ||
                    lowerMethodName.includes('valid') ||
                    lowerMethodName.includes('check')) {
                    return 'boolean';
                }
            }
            return 'unknown';
        }
        function evaluateBooleanishExpression(expression) {
            if (!expression)
                return 'nonBoolean';
            let currentExpression = expression;
            if (currentExpression.type === utils_1.AST_NODE_TYPES.TSAsExpression ||
                currentExpression.type === utils_1.AST_NODE_TYPES.TSTypeAssertion ||
                currentExpression.type === utils_1.AST_NODE_TYPES.TSSatisfiesExpression) {
                if (currentExpression.typeAnnotation?.type ===
                    utils_1.AST_NODE_TYPES.TSBooleanKeyword) {
                    return 'boolean';
                }
                currentExpression = currentExpression.expression;
            }
            if (currentExpression.type === utils_1.AST_NODE_TYPES.ChainExpression) {
                currentExpression = currentExpression.expression;
            }
            if (currentExpression.type ===
                'ParenthesizedExpression') {
                return evaluateBooleanishExpression(currentExpression.expression);
            }
            if (currentExpression.type === utils_1.AST_NODE_TYPES.TSNonNullExpression) {
                return evaluateBooleanishExpression(currentExpression.expression);
            }
            if (currentExpression.type === utils_1.AST_NODE_TYPES.Literal &&
                typeof currentExpression.value === 'boolean') {
                return 'boolean';
            }
            if (currentExpression.type === utils_1.AST_NODE_TYPES.Identifier) {
                return identifierIsBoolean(currentExpression) ? 'boolean' : 'unknown';
            }
            if (currentExpression.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                currentExpression.property.type === utils_1.AST_NODE_TYPES.Identifier) {
                return nameSuggestsBoolean(currentExpression.property.name)
                    ? 'boolean'
                    : 'unknown';
            }
            if (currentExpression.type === utils_1.AST_NODE_TYPES.CallExpression) {
                return callExpressionLooksBoolean(currentExpression);
            }
            if (currentExpression.type === utils_1.AST_NODE_TYPES.BinaryExpression) {
                if ([
                    '===',
                    '!==',
                    '==',
                    '!=',
                    '>',
                    '<',
                    '>=',
                    '<=',
                    'in',
                    'instanceof',
                ].includes(currentExpression.operator)) {
                    return 'boolean';
                }
            }
            if (currentExpression.type === utils_1.AST_NODE_TYPES.UnaryExpression &&
                currentExpression.operator === '!') {
                return 'boolean';
            }
            if (currentExpression.type === utils_1.AST_NODE_TYPES.LogicalExpression) {
                const left = evaluateBooleanishExpression(currentExpression.left);
                const right = evaluateBooleanishExpression(currentExpression.right);
                if (left === 'nonBoolean' || right === 'nonBoolean') {
                    return 'nonBoolean';
                }
                if (left === 'boolean' && right === 'boolean') {
                    return 'boolean';
                }
                return 'unknown';
            }
            if (currentExpression.type === utils_1.AST_NODE_TYPES.ConditionalExpression) {
                const consequent = evaluateBooleanishExpression(currentExpression.consequent);
                const alternate = evaluateBooleanishExpression(currentExpression.alternate);
                if (consequent === 'nonBoolean' || alternate === 'nonBoolean') {
                    return 'nonBoolean';
                }
                if (consequent === 'boolean' && alternate === 'boolean') {
                    return 'boolean';
                }
                return 'unknown';
            }
            return 'unknown';
        }
        /**
         * Attempt to resolve an identifier to a function declaration/expression and detect if it returns boolean
         */
        function identifierReturnsBoolean(name) {
            const variable = findVariableInScopes(name);
            if (!variable)
                return false;
            for (const def of variable.defs) {
                // Function declaration
                if (def.type === 'FunctionName' && def.node) {
                    const fn = def.node;
                    if (fn.returnType?.typeAnnotation &&
                        fn.returnType.typeAnnotation.type ===
                            utils_1.AST_NODE_TYPES.TSBooleanKeyword) {
                        return true;
                    }
                }
                // Variable with function expression or arrow function
                if (def.type === 'Variable' && def.node) {
                    const varDecl = def.node;
                    const init = (varDecl && varDecl.init);
                    if (!init)
                        continue;
                    if ((init.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                        init.type === utils_1.AST_NODE_TYPES.FunctionExpression) &&
                        init.returnType?.typeAnnotation &&
                        init.returnType.typeAnnotation.type ===
                            utils_1.AST_NODE_TYPES.TSBooleanKeyword) {
                        return true;
                    }
                }
            }
            return false;
        }
        /**
         * Check if a variable is used in a while loop condition and is likely a DOM element or tree node
         * This helps identify variables like 'parent', 'element', 'node', etc. that are used
         * in while loops for DOM/tree traversal and are not boolean values
         */
        function isLikelyDomElementInWhileLoop(node) {
            // Check if the variable name suggests it's a DOM element or tree node
            const isTraversalName = node.name.toLowerCase().includes('element') ||
                node.name.toLowerCase().includes('node') ||
                node.name.toLowerCase().includes('parent') ||
                node.name.toLowerCase().includes('child') ||
                node.name.toLowerCase().includes('sibling') ||
                node.name.toLowerCase().includes('ancestor') ||
                node.name.toLowerCase().includes('descendant');
            if (!isTraversalName) {
                return false;
            }
            // Must be used in a while loop to be considered for this exception
            if (!isUsedInWhileLoop(node)) {
                return false;
            }
            // Check if the variable is initialized with a traversal-related value
            const variableDeclarator = node.parent;
            if (variableDeclarator?.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                variableDeclarator.init) {
                const init = variableDeclarator.init;
                // Check for logical expressions with traversal-related properties on the right side
                if (init.type === utils_1.AST_NODE_TYPES.LogicalExpression &&
                    init.operator === '&&' &&
                    init.right.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    init.right.property.type === utils_1.AST_NODE_TYPES.Identifier) {
                    const propertyName = init.right.property
                        .name;
                    // DOM-specific properties - these are definitely DOM traversal
                    const isDomProperty = propertyName.toLowerCase().includes('element') ||
                        propertyName.toLowerCase().includes('node') ||
                        propertyName === 'parentElement' ||
                        propertyName === 'parentNode' ||
                        propertyName === 'firstChild' ||
                        propertyName === 'lastChild' ||
                        propertyName === 'nextSibling' ||
                        propertyName === 'previousSibling' ||
                        propertyName === 'firstElementChild' ||
                        propertyName === 'lastElementChild' ||
                        propertyName === 'nextElementSibling' ||
                        propertyName === 'previousElementSibling';
                    if (isDomProperty) {
                        return true;
                    }
                    // Tree-like properties - need additional confirmation
                    const isTreeProperty = propertyName === 'parent' ||
                        propertyName === 'child' ||
                        propertyName === 'root' ||
                        propertyName === 'left' ||
                        propertyName === 'right' ||
                        propertyName === 'next' ||
                        propertyName === 'prev' ||
                        propertyName === 'previous';
                    if (isTreeProperty) {
                        // For tree properties, check if there's a traversal pattern in the code
                        return hasTreeTraversalPattern(variableDeclarator);
                    }
                }
                // Check for direct member expressions (without logical operators)
                if (init.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    init.property.type === utils_1.AST_NODE_TYPES.Identifier) {
                    const propertyName = init.property.name;
                    // DOM-specific properties
                    const isDomProperty = propertyName === 'parentElement' ||
                        propertyName === 'parentNode' ||
                        propertyName === 'firstChild' ||
                        propertyName === 'lastChild' ||
                        propertyName === 'nextSibling' ||
                        propertyName === 'previousSibling';
                    if (isDomProperty) {
                        return true;
                    }
                }
                // Check for call expressions that return DOM elements
                if (init.type === utils_1.AST_NODE_TYPES.CallExpression &&
                    init.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    init.callee.property.type === utils_1.AST_NODE_TYPES.Identifier) {
                    const methodName = init.callee.property.name;
                    // DOM query methods
                    const isDomMethod = methodName === 'querySelector' ||
                        methodName === 'querySelectorAll' ||
                        methodName === 'getElementById' ||
                        methodName === 'getElementsByClassName' ||
                        methodName === 'getElementsByTagName';
                    if (isDomMethod) {
                        return true;
                    }
                }
            }
            return false;
        }
        /**
         * Traverses an AST depth-first, skipping metadata keys, and stops early when the
         * visitor returns true.
         */
        const isTraversalMetadataKey = (key) => key === 'parent' || key === 'range' || key === 'loc';
        function traverseAst(node, visitor) {
            if (visitor(node))
                return true;
            for (const key in node) {
                if (isTraversalMetadataKey(key))
                    continue;
                const value = node[key];
                if (Array.isArray(value)) {
                    for (const child of value) {
                        if (child &&
                            typeof child === 'object' &&
                            child.type) {
                            if (traverseAst(child, visitor)) {
                                return true;
                            }
                        }
                    }
                }
                else if (value &&
                    typeof value === 'object' &&
                    value.type) {
                    if (traverseAst(value, visitor)) {
                        return true;
                    }
                }
            }
            return false;
        }
        function collectReturnArguments(root) {
            const results = [];
            function walk(node) {
                if (node.type === utils_1.AST_NODE_TYPES.ReturnStatement) {
                    results.push(node.argument ?? null);
                    return;
                }
                if (node !== root &&
                    (node.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
                        node.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                        node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression)) {
                    return;
                }
                for (const key in node) {
                    if (isTraversalMetadataKey(key))
                        continue;
                    const value = node[key];
                    if (Array.isArray(value)) {
                        for (const child of value) {
                            if (child &&
                                typeof child === 'object' &&
                                child.type) {
                                walk(child);
                            }
                        }
                    }
                    else if (value &&
                        typeof value === 'object' &&
                        value.type) {
                        walk(value);
                    }
                }
            }
            walk(root);
            return results;
        }
        /**
         * Check if a variable is used in a while loop condition
         * This searches the scope for while loops that use the variable in their condition
         */
        function findEnclosingBlock(startNode) {
            let currentScope = startNode;
            while (currentScope &&
                currentScope.type !== utils_1.AST_NODE_TYPES.BlockStatement) {
                currentScope = currentScope.parent;
            }
            return (currentScope &&
                currentScope.type === utils_1.AST_NODE_TYPES.BlockStatement)
                ? currentScope
                : null;
        }
        const makeBlockCacheKey = (block, variableName) => {
            const range = block.range ?? [0, 0];
            return `${range[0]}:${range[1]}:${variableName}`;
        };
        function isUsedInWhileLoop(node) {
            const variableName = node.name;
            const currentScope = findEnclosingBlock(node.parent);
            if (!currentScope) {
                return false;
            }
            const cacheKey = makeBlockCacheKey(currentScope, variableName);
            const cached = whileUsageCache.get(cacheKey);
            if (cached !== undefined) {
                return cached;
            }
            const result = traverseAst(currentScope, (searchNode) => {
                return (searchNode.type === utils_1.AST_NODE_TYPES.WhileStatement &&
                    searchNode.test.type === utils_1.AST_NODE_TYPES.Identifier &&
                    searchNode.test.name === variableName);
            });
            whileUsageCache.set(cacheKey, result);
            return result;
        }
        /**
         * Check if a variable declarator has a tree traversal pattern
         * This looks for patterns like reassignment to .parent, .parentElement, etc.
         */
        function hasTreeTraversalPattern(declarator) {
            if (declarator.id.type !== utils_1.AST_NODE_TYPES.Identifier) {
                return false;
            }
            const variableName = declarator.id.name;
            const currentScope = findEnclosingBlock(declarator.parent);
            if (!currentScope) {
                return false;
            }
            const cacheKey = makeBlockCacheKey(currentScope, variableName);
            const cached = treeTraversalCache.get(cacheKey);
            if (cached !== undefined) {
                return cached;
            }
            const result = traverseAst(currentScope, (node) => {
                if (node.type === utils_1.AST_NODE_TYPES.AssignmentExpression &&
                    node.left.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.left.name === variableName &&
                    node.right.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    node.right.property.type === utils_1.AST_NODE_TYPES.Identifier) {
                    const propertyName = node.right.property
                        .name;
                    // Check for DOM traversal properties
                    if (propertyName === 'parentElement' ||
                        propertyName === 'parentNode' ||
                        propertyName === 'nextSibling' ||
                        propertyName === 'previousSibling' ||
                        propertyName === 'firstChild' ||
                        propertyName === 'lastChild') {
                        return true;
                    }
                    // Check for generic tree traversal properties
                    if (propertyName === 'parent' ||
                        propertyName === 'child' ||
                        propertyName === 'left' ||
                        propertyName === 'right' ||
                        propertyName === 'next' ||
                        propertyName === 'prev' ||
                        propertyName === 'previous') {
                        return true;
                    }
                }
                return false;
            });
            treeTraversalCache.set(cacheKey, result);
            return result;
        }
        /**
         * Check if a variable is used in a while loop condition and is likely a boolean
         * This helps identify variables that should be flagged as needing a boolean prefix
         */
        function isLikelyBooleanInWhileLoop(node) {
            // Check if the variable is initialized with a boolean-related value
            const variableDeclarator = node.parent;
            if (variableDeclarator?.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                variableDeclarator.init) {
                const init = variableDeclarator.init;
                // Check for direct boolean initialization
                if (init.type === utils_1.AST_NODE_TYPES.Literal &&
                    typeof init.value === 'boolean') {
                    return true;
                }
                // Check for property access with boolean-suggesting name
                if (init.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    init.property.type === utils_1.AST_NODE_TYPES.Identifier) {
                    const propertyName = init.property.name;
                    // If the property name suggests it's a boolean (starts with a boolean prefix)
                    const isBooleanProperty = approvedPrefixes.some((prefix) => propertyName.toLowerCase().startsWith(prefix.toLowerCase()));
                    if (isBooleanProperty) {
                        return true;
                    }
                }
            }
            return false;
        }
        function getterReturnsBoolean(node) {
            if (node.kind !== 'get') {
                return false;
            }
            const functionLike = node.value;
            const returnAnnotation = functionLike?.returnType?.typeAnnotation ||
                node.returnType
                    ?.typeAnnotation;
            if (returnAnnotation &&
                returnAnnotation.type === utils_1.AST_NODE_TYPES.TSBooleanKeyword) {
                return true;
            }
            if (!functionLike?.body ||
                functionLike.body.type !== utils_1.AST_NODE_TYPES.BlockStatement) {
                return false;
            }
            const returnArguments = collectReturnArguments(functionLike.body);
            if (returnArguments.length === 0) {
                return false;
            }
            for (const argument of returnArguments) {
                const evaluation = evaluateBooleanishExpression(argument);
                if (evaluation !== 'boolean') {
                    return false;
                }
            }
            return true;
        }
        /**
         * Check variable declarations for boolean naming
         */
        function checkVariableDeclaration(node) {
            if (node.id.type !== utils_1.AST_NODE_TYPES.Identifier)
                return;
            const variableName = node.id.name;
            // Skip checking if it's a type predicate
            if (isTypePredicate(node.id))
                return;
            // Skip checking if it's likely a DOM element used in a while loop
            if (isLikelyDomElementInWhileLoop(node.id))
                return;
            // Check if it's a boolean variable
            let isBooleanVar = hasBooleanTypeAnnotation(node.id) || hasInitialBooleanValue(node);
            // Check if it's a boolean variable used in a while loop
            if (!isBooleanVar && isLikelyBooleanInWhileLoop(node.id)) {
                isBooleanVar = true;
            }
            // Check if it's a function initializer with boolean return type
            if (node.init &&
                (node.init.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                    node.init.type === utils_1.AST_NODE_TYPES.FunctionExpression) &&
                node.init.returnType?.typeAnnotation &&
                node.init.returnType.typeAnnotation.type ===
                    utils_1.AST_NODE_TYPES.TSBooleanKeyword) {
                isBooleanVar = true;
            }
            if (isBooleanVar && !hasApprovedPrefix(variableName)) {
                context.report({
                    node: node.id,
                    messageId: 'missingBooleanPrefix',
                    data: {
                        type: 'variable',
                        name: variableName,
                        capitalizedName: capitalizeFirst(variableName),
                        prefixes: formatPrefixes(),
                    },
                });
            }
        }
        /**
         * Check function declarations for boolean return values
         */
        function checkFunctionDeclaration(node) {
            // Skip anonymous functions
            if (!node.id && node.parent?.type !== utils_1.AST_NODE_TYPES.VariableDeclarator) {
                return;
            }
            // Get function name
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
                functionName = node.parent.key.name;
            }
            else if (node.parent?.type === utils_1.AST_NODE_TYPES.MethodDefinition &&
                node.parent.key.type === utils_1.AST_NODE_TYPES.Identifier) {
                functionName = node.parent.key.name;
            }
            if (!functionName)
                return;
            // Skip checking if it's a type predicate (these are allowed to use 'is' prefix regardless)
            if (node.returnType?.typeAnnotation.type === utils_1.AST_NODE_TYPES.TSTypePredicate) {
                return;
            }
            // Check if it returns a boolean
            if (returnsBooleanValue(node) && !hasApprovedPrefix(functionName)) {
                context.report({
                    node: node.id || node,
                    messageId: 'missingBooleanPrefix',
                    data: {
                        type: 'function',
                        name: functionName,
                        capitalizedName: capitalizeFirst(functionName),
                        prefixes: formatPrefixes(),
                    },
                });
            }
        }
        /**
         * Check method definitions for boolean return values
         */
        function checkMethodDefinition(node) {
            if (node.key.type !== utils_1.AST_NODE_TYPES.Identifier)
                return;
            const methodName = node.key.name;
            const isGetter = node.kind === 'get';
            const returnAnnotation = node.value?.returnType?.typeAnnotation ||
                node.returnType
                    ?.typeAnnotation;
            if (ignoreOverriddenGetters &&
                isGetter &&
                (node.override ||
                    node.abstract ||
                    !node.value?.body ||
                    node.type === utils_1.AST_NODE_TYPES.TSAbstractMethodDefinition)) {
                return;
            }
            // Skip checking if it's a type predicate
            if (returnAnnotation &&
                returnAnnotation.type === utils_1.AST_NODE_TYPES.TSTypePredicate) {
                return;
            }
            const returnsBoolean = (returnAnnotation &&
                returnAnnotation.type === utils_1.AST_NODE_TYPES.TSBooleanKeyword) ||
                (isGetter && getterReturnsBoolean(node));
            if (returnsBoolean && !hasApprovedPrefix(methodName)) {
                context.report({
                    node: node.key,
                    messageId: 'missingBooleanPrefix',
                    data: {
                        type: isGetter ? 'getter' : 'method',
                        name: methodName,
                        capitalizedName: capitalizeFirst(methodName),
                        prefixes: formatPrefixes(),
                    },
                });
            }
        }
        /**
         * Check class property definitions for boolean values
         */
        function checkClassProperty(node) {
            if (node.key.type !== utils_1.AST_NODE_TYPES.Identifier)
                return;
            const propertyName = node.key.name;
            // Check if it's a boolean property
            let isBooleanProperty = false;
            // Check if it has a boolean type annotation
            if (node.typeAnnotation?.typeAnnotation &&
                node.typeAnnotation.typeAnnotation.type ===
                    utils_1.AST_NODE_TYPES.TSBooleanKeyword) {
                isBooleanProperty = true;
            }
            // Check if it's initialized with a boolean value
            if (node.value?.type === utils_1.AST_NODE_TYPES.Literal &&
                typeof node.value.value === 'boolean') {
                isBooleanProperty = true;
            }
            if (isBooleanProperty && !hasApprovedPrefix(propertyName)) {
                context.report({
                    node: node.key,
                    messageId: 'missingBooleanPrefix',
                    data: {
                        type: 'property',
                        name: propertyName,
                        capitalizedName: capitalizeFirst(propertyName),
                        prefixes: formatPrefixes(),
                    },
                });
            }
        }
        /**
         * Check class property declarations for boolean values
         */
        function checkClassPropertyDeclaration(node) {
            if (node.key.type !== utils_1.AST_NODE_TYPES.Identifier)
                return;
            const propertyName = node.key.name;
            // Check if it's a boolean property
            let isBooleanProperty = false;
            // Check if it has a boolean type annotation
            if (node.typeAnnotation?.typeAnnotation &&
                node.typeAnnotation.typeAnnotation.type ===
                    utils_1.AST_NODE_TYPES.TSBooleanKeyword) {
                isBooleanProperty = true;
            }
            // Check if it's initialized with a boolean value
            if (node.value?.type === utils_1.AST_NODE_TYPES.Literal &&
                typeof node.value.value === 'boolean') {
                isBooleanProperty = true;
            }
            if (isBooleanProperty && !hasApprovedPrefix(propertyName)) {
                context.report({
                    node: node.key,
                    messageId: 'missingBooleanPrefix',
                    data: {
                        type: 'property',
                        name: propertyName,
                        capitalizedName: capitalizeFirst(propertyName),
                        prefixes: formatPrefixes(),
                    },
                });
            }
        }
        /**
         * Check if an identifier is imported from an external module
         */
        function isImportedIdentifier(name) {
            if (importStatusCache.has(name)) {
                const cached = importStatusCache.get(name);
                if (cached !== undefined)
                    return cached;
            }
            const variable = findVariableInScopes(name);
            if (!variable) {
                importStatusCache.set(name, false);
                return false;
            }
            const isImport = variable.defs.some((def) => def.type === 'ImportBinding');
            importStatusCache.set(name, isImport);
            return isImport;
        }
        /**
         * Check if a variable is used with an external API
         */
        function isVariableUsedWithExternalApi(variableName) {
            if (externalApiUsageCache.has(variableName)) {
                const cached = externalApiUsageCache.get(variableName);
                if (cached !== undefined)
                    return cached;
            }
            const variable = findVariableInScopes(variableName);
            if (!variable) {
                externalApiUsageCache.set(variableName, false);
                return false;
            }
            for (const reference of variable.references) {
                if (reference.identifier === variable.identifiers[0])
                    continue;
                const id = reference.identifier;
                const markAndReturnTrue = () => {
                    externalApiUsageCache.set(variableName, true);
                    return true;
                };
                if (id.parent?.type === utils_1.AST_NODE_TYPES.Property &&
                    id.parent.parent?.type === utils_1.AST_NODE_TYPES.ObjectExpression &&
                    id.parent.parent.parent?.type === utils_1.AST_NODE_TYPES.CallExpression &&
                    id.parent.parent.parent.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                    isImportedIdentifier(id.parent.parent.parent.callee.name)) {
                    return markAndReturnTrue();
                }
                if (id.parent?.type === utils_1.AST_NODE_TYPES.CallExpression) {
                    if (id.parent.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                        isImportedIdentifier(id.parent.callee.name)) {
                        return markAndReturnTrue();
                    }
                    if (id.parent.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                        id.parent.callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                        isImportedIdentifier(id.parent.callee.object.name)) {
                        return markAndReturnTrue();
                    }
                }
                if (id.parent?.type === utils_1.AST_NODE_TYPES.JSXExpressionContainer &&
                    id.parent.parent?.type === utils_1.AST_NODE_TYPES.JSXAttribute &&
                    id.parent.parent.parent?.type === utils_1.AST_NODE_TYPES.JSXOpeningElement &&
                    id.parent.parent.parent.name.type === utils_1.AST_NODE_TYPES.JSXIdentifier &&
                    isImportedIdentifier(id.parent.parent.parent.name.name)) {
                    return markAndReturnTrue();
                }
                if (id.parent?.type === utils_1.AST_NODE_TYPES.JSXSpreadAttribute &&
                    id.parent.parent?.type === utils_1.AST_NODE_TYPES.JSXOpeningElement &&
                    id.parent.parent.name.type === utils_1.AST_NODE_TYPES.JSXIdentifier &&
                    isImportedIdentifier(id.parent.parent.name.name)) {
                    return markAndReturnTrue();
                }
            }
            externalApiUsageCache.set(variableName, false);
            return false;
        }
        const HOOK_NAMES = new Set(['useMemo', 'useCallback', 'useState']);
        function findVariableFromReactHook(objectExpr) {
            let current = objectExpr;
            while (current) {
                if (current.type === utils_1.AST_NODE_TYPES.TSAsExpression) {
                    current = current.parent;
                    continue;
                }
                if (current.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression &&
                    current.parent?.type === utils_1.AST_NODE_TYPES.CallExpression &&
                    current.parent.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                    HOOK_NAMES.has(current.parent.callee.name) &&
                    current.parent.parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                    current.parent.parent.id.type === utils_1.AST_NODE_TYPES.Identifier) {
                    return current.parent.parent.id.name;
                }
                current = current.parent;
            }
            return undefined;
        }
        /**
         * Check property definitions for boolean values
         */
        function checkProperty(node) {
            if (node.key.type !== utils_1.AST_NODE_TYPES.Identifier)
                return;
            const propertyName = node.key.name;
            // Check if it's a boolean property
            let isBooleanProperty = false;
            // Check if it's initialized with a boolean value
            if (node.value.type === utils_1.AST_NODE_TYPES.Literal &&
                typeof node.value.value === 'boolean') {
                isBooleanProperty = true;
            }
            // Check if it's a method that returns a boolean
            if ((node.value.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                node.value.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) &&
                node.value.returnType?.typeAnnotation.type ===
                    utils_1.AST_NODE_TYPES.TSBooleanKeyword) {
                isBooleanProperty = true;
            }
            // Skip checking if this property is part of an object literal passed to an external function
            if (isBooleanProperty && !hasApprovedPrefix(propertyName)) {
                // Special cases for common Node.js API boolean properties
                if ((propertyName === 'recursive' || propertyName === 'keepAlive') &&
                    node.parent?.type === utils_1.AST_NODE_TYPES.ObjectExpression &&
                    node.parent.parent?.type === utils_1.AST_NODE_TYPES.CallExpression) {
                    return; // Skip checking for these properties in object literals passed to functions
                }
                // Check if this property is in an object literal that's an argument to a function call
                let isExternalApiCall = false;
                // Navigate up to find if we're in an object expression that's an argument to a function call
                if (node.parent?.type === utils_1.AST_NODE_TYPES.ObjectExpression &&
                    node.parent.parent?.type === utils_1.AST_NODE_TYPES.CallExpression) {
                    const callExpression = node.parent.parent;
                    // Check if the function being called is an identifier (like mkdirSync, createServer, etc.)
                    if (callExpression.callee.type === utils_1.AST_NODE_TYPES.Identifier) {
                        const calleeName = callExpression.callee.name;
                        if (isImportedIdentifier(calleeName)) {
                            isExternalApiCall = true;
                        }
                    }
                    // Also check for member expressions like fs.mkdirSync
                    if (callExpression.callee.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                        // For member expressions, check if the object is imported
                        const objectNode = callExpression.callee.object;
                        if (objectNode.type === utils_1.AST_NODE_TYPES.Identifier) {
                            const objectName = objectNode.name;
                            if (isImportedIdentifier(objectName)) {
                                isExternalApiCall = true;
                            }
                        }
                    }
                }
                // Check if this property is in an object literal that's being assigned to a variable
                // This handles cases like const messageInputProps = { grow: true }
                if (node.parent?.type === utils_1.AST_NODE_TYPES.ObjectExpression &&
                    node.parent.parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                    node.parent.parent.id.type === utils_1.AST_NODE_TYPES.Identifier) {
                    const variableName = node.parent.parent.id.name;
                    if (isVariableUsedWithExternalApi(variableName)) {
                        isExternalApiCall = true;
                    }
                }
                // Special case for useMemo and other React hooks
                // This handles cases like:
                // 1. const messageInputProps = useMemo(() => ({ grow: true }), [])
                // 2. const messageInputProps = useMemo(() => { return { grow: true }; }, [])
                if (node.parent?.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                    const hookVariable = findVariableFromReactHook(node.parent);
                    if (hookVariable && isVariableUsedWithExternalApi(hookVariable)) {
                        isExternalApiCall = true;
                    }
                }
                // Check if this property is in an object literal that's directly passed to an imported function
                // This handles cases like ExternalComponent({ grow: true })
                if (node.parent?.type === utils_1.AST_NODE_TYPES.ObjectExpression &&
                    node.parent.parent?.type === utils_1.AST_NODE_TYPES.CallExpression &&
                    node.parent.parent.callee.type === utils_1.AST_NODE_TYPES.Identifier) {
                    const calleeName = node.parent.parent.callee.name;
                    if (isImportedIdentifier(calleeName)) {
                        isExternalApiCall = true;
                    }
                }
                // Check if this property is in an object literal that's directly passed as a JSX attribute
                // This handles cases like <ExternalComponent config={{ active: true }} />
                if (node.parent?.type === utils_1.AST_NODE_TYPES.ObjectExpression &&
                    node.parent.parent?.type === utils_1.AST_NODE_TYPES.JSXExpressionContainer &&
                    node.parent.parent.parent?.type === utils_1.AST_NODE_TYPES.JSXAttribute &&
                    node.parent.parent.parent.parent?.type ===
                        utils_1.AST_NODE_TYPES.JSXOpeningElement) {
                    const jsxOpeningElement = node.parent.parent.parent.parent;
                    if (jsxOpeningElement.name.type === utils_1.AST_NODE_TYPES.JSXIdentifier) {
                        const componentName = jsxOpeningElement.name.name;
                        if (isImportedIdentifier(componentName)) {
                            isExternalApiCall = true;
                        }
                    }
                }
                // Only report if it's not an external API call
                if (!isExternalApiCall) {
                    context.report({
                        node: node.key,
                        messageId: 'missingBooleanPrefix',
                        data: {
                            type: 'property',
                            name: propertyName,
                            capitalizedName: capitalizeFirst(propertyName),
                            prefixes: formatPrefixes(),
                        },
                    });
                }
            }
        }
        /**
         * Check property signatures in interfaces/types for boolean types
         */
        function checkPropertySignature(node) {
            if (node.key.type !== utils_1.AST_NODE_TYPES.Identifier)
                return;
            const propertyName = node.key.name;
            // Check if it has a boolean type
            if (node.typeAnnotation?.typeAnnotation &&
                node.typeAnnotation.typeAnnotation.type ===
                    utils_1.AST_NODE_TYPES.TSBooleanKeyword &&
                !hasApprovedPrefix(propertyName)) {
                // Skip if this property is part of a parameter's type annotation
                // Check if this property signature is inside a parameter's type annotation
                let isInParameterType = false;
                let parent = node.parent;
                while (parent) {
                    if (parent.type === utils_1.AST_NODE_TYPES.TSTypeLiteral) {
                        const grandParent = parent.parent;
                        if (grandParent?.type === utils_1.AST_NODE_TYPES.TSTypeAnnotation &&
                            grandParent.parent?.type === utils_1.AST_NODE_TYPES.Identifier &&
                            grandParent.parent.parent?.type ===
                                utils_1.AST_NODE_TYPES.FunctionDeclaration) {
                            isInParameterType = true;
                            break;
                        }
                    }
                    parent = parent.parent;
                }
                // Only report if not in a parameter type annotation
                if (!isInParameterType) {
                    context.report({
                        node: node.key,
                        messageId: 'missingBooleanPrefix',
                        data: {
                            type: 'property',
                            name: propertyName,
                            capitalizedName: capitalizeFirst(propertyName),
                            prefixes: formatPrefixes(),
                        },
                    });
                }
            }
        }
        /**
         * Check parameters for boolean types
         */
        function checkParameter(node) {
            if (node.type !== utils_1.AST_NODE_TYPES.Identifier)
                return;
            const paramName = node.name;
            // Check if it has a boolean type annotation
            if (node.typeAnnotation?.typeAnnotation &&
                node.typeAnnotation.typeAnnotation.type ===
                    utils_1.AST_NODE_TYPES.TSBooleanKeyword &&
                !hasApprovedPrefix(paramName)) {
                context.report({
                    node,
                    messageId: 'missingBooleanPrefix',
                    data: {
                        type: 'parameter',
                        name: paramName,
                        capitalizedName: capitalizeFirst(paramName),
                        prefixes: formatPrefixes(),
                    },
                });
            }
            // Check if the parameter has an object type with boolean properties
            if (node.typeAnnotation?.typeAnnotation &&
                node.typeAnnotation.typeAnnotation.type === utils_1.AST_NODE_TYPES.TSTypeLiteral) {
                const typeLiteral = node.typeAnnotation.typeAnnotation;
                // Check each member of the type literal
                for (const member of typeLiteral.members) {
                    if (member.type === utils_1.AST_NODE_TYPES.TSPropertySignature &&
                        member.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                        member.typeAnnotation?.typeAnnotation.type ===
                            utils_1.AST_NODE_TYPES.TSBooleanKeyword) {
                        const propertyName = member.key.name;
                        if (!hasApprovedPrefix(propertyName)) {
                            context.report({
                                node: member.key,
                                messageId: 'missingBooleanPrefix',
                                data: {
                                    type: 'property',
                                    name: propertyName,
                                    capitalizedName: capitalizeFirst(propertyName),
                                    prefixes: formatPrefixes(),
                                },
                            });
                        }
                    }
                }
            }
        }
        return {
            VariableDeclarator: checkVariableDeclaration,
            FunctionDeclaration: checkFunctionDeclaration,
            FunctionExpression(node) {
                if (node.parent?.type !== utils_1.AST_NODE_TYPES.VariableDeclarator) {
                    checkFunctionDeclaration(node);
                }
            },
            ArrowFunctionExpression(node) {
                if (node.parent?.type !== utils_1.AST_NODE_TYPES.VariableDeclarator) {
                    checkFunctionDeclaration(node);
                }
            },
            MethodDefinition: checkMethodDefinition,
            TSAbstractMethodDefinition: checkMethodDefinition,
            Property: checkProperty,
            ClassProperty: checkClassProperty,
            PropertyDefinition: checkClassPropertyDeclaration,
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
//# sourceMappingURL=enforce-boolean-naming-prefixes.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceBooleanNamingPrefixes = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
// Default approved boolean prefixes
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
];
exports.enforceBooleanNamingPrefixes = (0, createRule_1.createRule)({
    name: 'enforce-boolean-naming-prefixes',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce consistent naming conventions for boolean values by requiring approved prefixes',
            recommended: 'error',
        },
        fixable: 'code',
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
                },
                additionalProperties: false,
            },
        ],
        messages: {
            missingBooleanPrefix: 'Boolean {{type}} "{{name}}" should start with an approved prefix: {{prefixes}}',
        },
    },
    defaultOptions: [{ prefixes: DEFAULT_BOOLEAN_PREFIXES }],
    create(context, [options]) {
        const approvedPrefixes = options.prefixes || DEFAULT_BOOLEAN_PREFIXES;
        /**
         * Check if a name starts with any of the approved prefixes
         */
        function hasApprovedPrefix(name) {
            return approvedPrefixes.some((prefix) => name.toLowerCase().startsWith(prefix.toLowerCase()));
        }
        /**
         * Format the list of approved prefixes for error messages
         */
        function formatPrefixes() {
            return approvedPrefixes.join(', ');
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
                    ['===', '!==', '==', '!=', '>', '<', '>=', '<='].includes(node.init.operator)) {
                    return true;
                }
                // Check for logical expressions (&&, ||)
                if (node.init.type === utils_1.AST_NODE_TYPES.LogicalExpression &&
                    node.init.operator === '&&') {
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
                        return approvedPrefixes.some((prefix) => calleeName.toLowerCase().startsWith(prefix.toLowerCase()));
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
                    // Check if the function name suggests it returns a boolean
                    return approvedPrefixes.some((prefix) => calleeName.toLowerCase().startsWith(prefix.toLowerCase()));
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
                    ['===', '!==', '==', '!=', '>', '<', '>=', '<='].includes(node.body.operator)) {
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
            // Check if it's a boolean variable
            let isBooleanVar = hasBooleanTypeAnnotation(node.id) || hasInitialBooleanValue(node);
            // Check if it's an arrow function with boolean return type
            if (node.init?.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression &&
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
            // Skip checking if it's a type predicate
            if (node.value.returnType?.typeAnnotation &&
                node.value.returnType.typeAnnotation.type ===
                    utils_1.AST_NODE_TYPES.TSTypePredicate) {
                return;
            }
            // Check if it returns a boolean
            if (node.value.returnType?.typeAnnotation &&
                node.value.returnType.typeAnnotation.type ===
                    utils_1.AST_NODE_TYPES.TSBooleanKeyword &&
                !hasApprovedPrefix(methodName)) {
                context.report({
                    node: node.key,
                    messageId: 'missingBooleanPrefix',
                    data: {
                        type: 'method',
                        name: methodName,
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
                        prefixes: formatPrefixes(),
                    },
                });
            }
        }
        /**
         * Check if an identifier is imported from an external module
         */
        function isImportedIdentifier(name) {
            const scope = context.getScope();
            const variable = scope.variables.find((v) => v.name === name);
            if (!variable)
                return false;
            // Check if it's an import binding
            return variable.defs.some((def) => def.type === 'ImportBinding');
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
                // Only report if it's not an external API call
                if (!isExternalApiCall) {
                    context.report({
                        node: node.key,
                        messageId: 'missingBooleanPrefix',
                        data: {
                            type: 'property',
                            name: propertyName,
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
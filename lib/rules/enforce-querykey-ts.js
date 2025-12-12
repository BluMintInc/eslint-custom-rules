"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceQueryKeyTs = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
/**
 * Rule to enforce the use of centralized router state key constants imported from
 * `src/util/routing/queryKeys.ts` instead of arbitrary string literals when calling
 * router methods that accept key parameters.
 */
exports.enforceQueryKeyTs = (0, createRule_1.createRule)({
    name: 'enforce-querykey-ts',
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce using centralized router state key constants from queryKeys.ts for useRouterState key parameter',
            recommended: 'error',
        },
        schema: [],
        messages: {
            enforceQueryKeyImport: 'Router state key must come from queryKeys.ts (e.g., "@/util/routing/queryKeys", "src/util/routing/queryKeys", or a relative path ending in "/util/routing/queryKeys"). Use a QUERY_KEY_* constant instead of string literals.',
            enforceQueryKeyConstant: 'Router state key must use a QUERY_KEY_* constant from queryKeys.ts. Variable "{{variableName}}" is not imported from the correct source.',
        },
    },
    defaultOptions: [],
    create(context) {
        // Track imports from queryKeys.ts
        const queryKeyImports = new Map();
        const localUseRouterStateNames = new Set(['useRouterState']);
        const validQueryKeySources = new Set([
            '@/util/routing/queryKeys',
            'src/util/routing/queryKeys',
        ]);
        const allowedQueryKeyFactories = new Set(['makeQueryKey', 'getQueryKey']);
        /**
         * Check if a source path refers to queryKeys.ts
         */
        function isQueryKeysSource(source) {
            return (validQueryKeySources.has(source) ||
                source.endsWith('/util/routing/queryKeys'));
        }
        /**
         * Check if an identifier is a valid QUERY_KEY constant
         */
        function isValidQueryKeyConstant(name) {
            return name.startsWith('QUERY_KEY_');
        }
        /**
         * Track variable assignments to detect variables derived from query key constants
         */
        const variableAssignments = new Map();
        /**
         * Check if a node represents a valid query key usage
         */
        function isValidQueryKeyUsage(node, seen = new Set()) {
            if (node.type === utils_1.AST_NODE_TYPES.Identifier) {
                if (seen.has(node.name)) {
                    return false;
                }
                seen.add(node.name);
                const importInfo = queryKeyImports.get(node.name);
                if (importInfo && isQueryKeysSource(importInfo.source)) {
                    return isValidQueryKeyConstant(importInfo.imported);
                }
                // Check if it's a variable derived from a query key constant
                const assignment = variableAssignments.get(node.name);
                if (assignment) {
                    return isValidQueryKeyUsage(assignment, seen);
                }
            }
            // Allow member expressions accessing query key constants
            if (node.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                const member = node;
                if (member.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                    !member.computed &&
                    member.property.type === utils_1.AST_NODE_TYPES.Identifier) {
                    const importInfo = queryKeyImports.get(member.object.name);
                    if (importInfo && isQueryKeysSource(importInfo.source)) {
                        if (importInfo.imported === '*') {
                            return isValidQueryKeyConstant(member.property.name);
                        }
                        return isValidQueryKeyConstant(member.property.name);
                    }
                }
            }
            // Allow template literals only when they contain no static content and all expressions are valid
            if (node.type === utils_1.AST_NODE_TYPES.TemplateLiteral) {
                const hasSignificantStaticPart = node.quasis.some((quasi) => {
                    const content = quasi.value.raw.trim();
                    return content.length > 0 && !/^[-_:/.]+$/.test(content);
                });
                if (node.expressions.length === 0) {
                    // Pure static template acts like a string literal
                    return false;
                }
                if (hasSignificantStaticPart) {
                    return false;
                }
                return node.expressions.every((expr) => isValidQueryKeyUsage(expr, new Set(seen)));
            }
            if (node.type === utils_1.AST_NODE_TYPES.BinaryExpression &&
                node.operator === '+') {
                return (isValidQueryKeyUsage(node.left, new Set(seen)) &&
                    isValidQueryKeyUsage(node.right, new Set(seen)));
            }
            // Allow conditional expressions if both branches use valid query keys
            if (node.type === utils_1.AST_NODE_TYPES.ConditionalExpression) {
                return (isValidQueryKeyUsage(node.consequent) &&
                    isValidQueryKeyUsage(node.alternate));
            }
            // Allow function calls that might return query keys
            if (node.type === utils_1.AST_NODE_TYPES.CallExpression) {
                const callee = node.callee;
                if (callee.type === utils_1.AST_NODE_TYPES.Identifier) {
                    return allowedQueryKeyFactories.has(callee.name);
                }
                if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    !callee.computed &&
                    callee.property.type === utils_1.AST_NODE_TYPES.Identifier) {
                    return allowedQueryKeyFactories.has(callee.property.name);
                }
                return false;
            }
            return false;
        }
        /**
         * Check if a node contains string literals that should be reported
         */
        function containsInvalidStringLiteral(node) {
            // Direct string literal
            if (node.type === utils_1.AST_NODE_TYPES.Literal &&
                typeof node.value === 'string') {
                return true;
            }
            // String concatenation with + operator containing literals
            if (node.type === utils_1.AST_NODE_TYPES.BinaryExpression &&
                node.operator === '+') {
                return (containsInvalidStringLiteral(node.left) ||
                    containsInvalidStringLiteral(node.right));
            }
            // Conditional (ternary) expression with string literals
            if (node.type === utils_1.AST_NODE_TYPES.ConditionalExpression) {
                return (containsInvalidStringLiteral(node.consequent) ||
                    containsInvalidStringLiteral(node.alternate));
            }
            // Template literal handling
            if (node.type === utils_1.AST_NODE_TYPES.TemplateLiteral) {
                const hasSignificantStaticPart = node.quasis.some((quasi) => {
                    const content = quasi.value.raw.trim();
                    return content.length > 0 && !/^[-_:/.]+$/.test(content);
                });
                if (node.expressions.length === 0) {
                    // Pure static template behaves like a string literal
                    return hasSignificantStaticPart;
                }
                // Any meaningful static content makes this invalid regardless of expressions
                if (hasSignificantStaticPart) {
                    return true;
                }
                // Only dynamic parts remain; all expressions must be valid query key usages
                return !node.expressions.every((expr) => isValidQueryKeyUsage(expr));
            }
            return false;
        }
        return {
            // Track imports from queryKeys.ts
            ImportDeclaration(node) {
                if (node.source.type === utils_1.AST_NODE_TYPES.Literal &&
                    typeof node.source.value === 'string') {
                    const source = node.source.value;
                    if (isQueryKeysSource(source)) {
                        node.specifiers.forEach((spec) => {
                            if (spec.type === utils_1.AST_NODE_TYPES.ImportSpecifier) {
                                const imported = spec.imported.name;
                                const local = spec.local.name;
                                queryKeyImports.set(local, { source, imported });
                            }
                            else if (spec.type === utils_1.AST_NODE_TYPES.ImportNamespaceSpecifier) {
                                const local = spec.local.name;
                                queryKeyImports.set(local, { source, imported: '*' });
                            }
                        });
                    }
                    node.specifiers.forEach((spec) => {
                        if (spec.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                            spec.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
                            spec.imported.name === 'useRouterState') {
                            localUseRouterStateNames.add(spec.local.name);
                        }
                    });
                }
            },
            // Track variable declarations that might derive from query key constants
            VariableDeclarator(node) {
                if (node.id.type === utils_1.AST_NODE_TYPES.Identifier && node.init) {
                    variableAssignments.set(node.id.name, node.init);
                }
            },
            AssignmentExpression(node) {
                if (node.left.type === utils_1.AST_NODE_TYPES.Identifier && node.right) {
                    variableAssignments.set(node.left.name, node.right);
                }
            },
            // Check useRouterState calls
            CallExpression(node) {
                // Check if this is a call to useRouterState
                if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                    localUseRouterStateNames.has(node.callee.name)) {
                    // Check if there are arguments
                    if (node.arguments.length > 0) {
                        const firstArg = node.arguments[0];
                        // Check if the first argument is an object expression
                        if (firstArg.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                            // Find the key property in the object
                            const keyProperty = firstArg.properties.find((prop) => prop.type === utils_1.AST_NODE_TYPES.Property &&
                                prop.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                                prop.key.name === 'key');
                            // If key property exists, check its value
                            if (keyProperty && keyProperty.value) {
                                const keyValue = keyProperty.value;
                                // Check if it's a valid query key usage
                                if (!isValidQueryKeyUsage(keyValue)) {
                                    // Check if it contains invalid string literals
                                    if (containsInvalidStringLiteral(keyValue)) {
                                        context.report({
                                            node: keyValue,
                                            messageId: 'enforceQueryKeyImport',
                                        });
                                    }
                                    else if (keyValue.type === utils_1.AST_NODE_TYPES.Identifier) {
                                        // Report variables that aren't from the correct source
                                        context.report({
                                            node: keyValue,
                                            messageId: 'enforceQueryKeyConstant',
                                            data: {
                                                variableName: keyValue.name,
                                            },
                                        });
                                    }
                                    else {
                                        context.report({
                                            node: keyValue,
                                            messageId: 'enforceQueryKeyImport',
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-querykey-ts.js.map
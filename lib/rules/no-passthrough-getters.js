"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noPassthroughGetters = void 0;
const createRule_1 = require("../utils/createRule");
const utils_1 = require("@typescript-eslint/utils");
const COMPLEX_EXPRESSION_TYPES = new Set([
    utils_1.AST_NODE_TYPES.CallExpression,
    utils_1.AST_NODE_TYPES.TemplateLiteral,
    utils_1.AST_NODE_TYPES.NewExpression,
    utils_1.AST_NODE_TYPES.BinaryExpression,
    utils_1.AST_NODE_TYPES.ArrayExpression,
    utils_1.AST_NODE_TYPES.ObjectExpression,
]);
exports.noPassthroughGetters = (0, createRule_1.createRule)({
    create(context) {
        return {
            // Target getter methods in classes
            MethodDefinition(node) {
                // Only check getter methods
                if (node.kind !== 'get') {
                    return;
                }
                // Skip if the getter has decorators (like @Memoize)
                if (node.decorators && node.decorators.length > 0) {
                    return;
                }
                const methodBody = node.value.body;
                if (!methodBody) {
                    return;
                }
                // Check if the getter body is a simple return statement
                if (methodBody.body.length === 1 &&
                    methodBody.body[0].type === 'ReturnStatement') {
                    const returnStatement = methodBody
                        .body[0];
                    // Skip if there's no return argument
                    if (!returnStatement.argument) {
                        return;
                    }
                    // Skip if the return statement uses super
                    if (containsSuper(returnStatement.argument)) {
                        return;
                    }
                    // Skip if the return statement includes type assertions or casting
                    if (hasTypeAssertion(returnStatement.argument)) {
                        return;
                    }
                    // Skip if the return statement includes null/undefined handling
                    if (hasNullUndefinedHandling(returnStatement.argument)) {
                        return;
                    }
                    // Skip if the return statement includes computed property access or function calls
                    if (hasComputedPropertyOrFunctionCall(returnStatement.argument)) {
                        return;
                    }
                    // Check if the return statement is accessing a property from a constructor parameter
                    if (isConstructorParameterPropertyAccess(returnStatement.argument)) {
                        context.report({
                            node,
                            messageId: 'noPassthroughGetter',
                        });
                    }
                }
            },
        };
        /**
         * Check if the node is a simple property access from a constructor parameter
         * like this.settings.property or this.settings['property'] or this.settings.nested.deep.property
         */
        function isConstructorParameterPropertyAccess(node) {
            // Check for member expressions like this.settings.property
            if (node.type === 'MemberExpression') {
                return isConstructorParameterAccess(node);
            }
            return false;
        }
        /**
         * Check if the node is accessing a property from a constructor parameter
         * Patterns to match: this.constructorParam.property, this.constructorParam['property'], this.constructorParam.nested.deep.property
         * Patterns to NOT match: this.property, SomeClass.property, this.methodCall()
         */
        function isConstructorParameterAccess(node) {
            let current = node.object;
            let depth = 0;
            // Walk up member expressions until we reach a base
            while (current && current.type === 'MemberExpression') {
                depth += 1;
                current = current.object;
            }
            // Require at least one nesting and a base of `this`
            return depth >= 1 && current?.type === 'ThisExpression';
        }
        /**
         * Check if the node contains a reference to super
         */
        function containsSuper(node) {
            let current = node;
            while (current && current.type === 'MemberExpression') {
                if (current.object.type === 'Super') {
                    return true;
                }
                current = current.object;
            }
            return false;
        }
        /**
         * Check if the node has a type assertion or casting
         */
        function hasTypeAssertion(node) {
            if (node.type === 'TSAsExpression' || node.type === 'TSTypeAssertion') {
                return true;
            }
            if (node.type === 'MemberExpression') {
                return hasTypeAssertion(node.object);
            }
            return false;
        }
        /**
         * Check if the node handles null/undefined values
         */
        function hasNullUndefinedHandling(node) {
            // Check for logical expressions like this.settings.property || []
            if (node.type === 'LogicalExpression') {
                return true;
            }
            // Check for conditional expressions like this.settings.property ? this.settings.property : []
            if (node.type === 'ConditionalExpression') {
                return true;
            }
            // Check for optional chaining like this.settings?.property
            if (node.type === 'MemberExpression' && node.optional) {
                return true;
            }
            // The nullish coalescing check is already covered by the LogicalExpression check above
            return false;
        }
        /**
         * Check if the node includes computed property access or function calls
         */
        function hasComputedPropertyOrFunctionCall(node) {
            if (COMPLEX_EXPRESSION_TYPES.has(node.type)) {
                return true;
            }
            // Check for member expressions with computed properties like this.settings[key]
            if (node.type === 'MemberExpression') {
                // If the property is computed with a dynamic expression (not a literal), it's not a simple property access
                if (node.computed && node.property.type !== 'Literal') {
                    return true;
                }
                // Recursively check the object part
                return hasComputedPropertyOrFunctionCall(node.object);
            }
            return false;
        }
    },
    name: 'no-passthrough-getters',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Avoid unnecessary getter methods that simply return properties from constructor parameters',
            recommended: 'error',
        },
        schema: [],
        messages: {
            noPassthroughGetter: 'Avoid unnecessary getter methods that simply return properties from constructor parameters. Access the property directly instead.',
        },
    },
    defaultOptions: [],
});
//# sourceMappingURL=no-passthrough-getters.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noOverridableMethodCallsInConstructor = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const getMethodName_1 = require("../utils/getMethodName");
exports.noOverridableMethodCallsInConstructor = (0, createRule_1.createRule)({
    name: 'no-overridable-method-calls-in-constructor',
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow calling overridable methods in constructors to prevent unexpected behavior',
            recommended: 'error',
        },
        fixable: undefined,
        schema: [],
        messages: {
            noOverridableMethodCallsInConstructor: 'What\'s wrong: Constructor calls overridable or abstract {{target}} member "{{methodName}}". \u2192 Why it matters: This executes subclass overrides before the subclass constructor finishes initializing its fields, which can read undefined state or run side effects on a partially constructed instance. \u2192 How to fix: Move the call to a post-construction initializer, or make "{{methodName}}" private or static so construction never executes overridable code.',
        },
    },
    defaultOptions: [],
    create(context) {
        const sourceCode = context.getSourceCode();
        /**
         * Checks if a method is overridable (not private and not static)
         */
        function isOverridableMethod(node) {
            // Private methods are not overridable
            if (node.accessibility === 'private') {
                return false;
            }
            // ES private methods (#foo) are non-overridable
            if (node.key.type === utils_1.AST_NODE_TYPES.PrivateIdentifier) {
                return false;
            }
            // Static methods are not overridable in the same way as instance methods
            if (node.static) {
                return false;
            }
            return true;
        }
        /**
         * Checks if a method is abstract
         */
        function isAbstractMethod(node) {
            return node.abstract === true;
        }
        /**
         * Collects all method names from a class, categorized by whether they are overridable
         */
        function collectMethodNames(classNode) {
            const overridableMethods = new Set();
            const abstractMethods = new Set();
            for (const member of classNode.body.body) {
                if (member.type === utils_1.AST_NODE_TYPES.MethodDefinition) {
                    const methodName = getMethodNameFromDefinition(member);
                    if (methodName) {
                        if (isAbstractMethod(member)) {
                            abstractMethods.add(methodName);
                        }
                        else if (isOverridableMethod(member)) {
                            overridableMethods.add(methodName);
                        }
                    }
                }
                else if (member.type === utils_1.AST_NODE_TYPES.TSAbstractMethodDefinition) {
                    const methodName = getMethodNameFromDefinition(member);
                    if (methodName) {
                        abstractMethods.add(methodName);
                    }
                }
            }
            return { overridableMethods, abstractMethods };
        }
        /**
         * Gets the method name from a method definition
         */
        function getMethodNameFromDefinition(method) {
            const name = (0, getMethodName_1.getMethodName)(method, sourceCode, {
                computedFallbackToText: false,
            });
            return name || null; // Computed property names are not handled
        }
        /**
         * Checks if a call expression is calling a method on 'this' or 'super'
         */
        function isThisOrSuperMethodCall(node) {
            if (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                !node.callee.computed // Ignore computed properties like this[methodName]()
            ) {
                const object = node.callee.object;
                const property = node.callee.property;
                // Check if it's a call on 'this'
                if (object.type === utils_1.AST_NODE_TYPES.ThisExpression &&
                    property.type === utils_1.AST_NODE_TYPES.Identifier) {
                    return {
                        isMethodCall: true,
                        methodName: property.name,
                        isSuper: false,
                    };
                }
                // Check if it's a call on 'super'
                if (object.type === utils_1.AST_NODE_TYPES.Super &&
                    property.type === utils_1.AST_NODE_TYPES.Identifier) {
                    return {
                        isMethodCall: true,
                        methodName: property.name,
                        isSuper: true,
                    };
                }
                // Check for method chaining: this.method().anotherMethod()
                // In this case, object is a CallExpression
                if (object.type === utils_1.AST_NODE_TYPES.CallExpression) {
                    const nestedCall = isThisOrSuperMethodCall(object);
                    if (nestedCall.isMethodCall) {
                        return nestedCall; // Return the nested method call info
                    }
                }
            }
            return { isMethodCall: false, methodName: null, isSuper: false };
        }
        /**
         * Checks if a member expression is accessing a property on 'this' or 'super'
         */
        function isThisOrSuperPropertyAccess(node) {
            if (!node.computed) {
                // Ignore computed properties like this[propertyName]
                const object = node.object;
                const property = node.property;
                // Check if it's access on 'this'
                if (object.type === utils_1.AST_NODE_TYPES.ThisExpression &&
                    property.type === utils_1.AST_NODE_TYPES.Identifier) {
                    // Skip 'constructor' property as it's not an overridable method
                    if (property.name === 'constructor') {
                        return {
                            isPropertyAccess: false,
                            propertyName: null,
                            isSuper: false,
                        };
                    }
                    return {
                        isPropertyAccess: true,
                        propertyName: property.name,
                        isSuper: false,
                    };
                }
                // Check if it's access on 'super'
                if (object.type === utils_1.AST_NODE_TYPES.Super &&
                    property.type === utils_1.AST_NODE_TYPES.Identifier) {
                    return {
                        isPropertyAccess: true,
                        propertyName: property.name,
                        isSuper: true,
                    };
                }
            }
            return { isPropertyAccess: false, propertyName: null, isSuper: false };
        }
        return {
            // Process class declarations and expressions
            'ClassDeclaration, ClassExpression'(node) {
                const { overridableMethods, abstractMethods } = collectMethodNames(node);
                // Find the constructor method
                const ctorMethod = node.body.body.find((member) => member.type === utils_1.AST_NODE_TYPES.MethodDefinition &&
                    member.kind === 'constructor');
                if (!ctorMethod || !ctorMethod.value.body) {
                    return; // No constructor or constructor has no body
                }
                // Function to recursively check for method calls in the constructor
                function checkForMethodCalls(bodyNode) {
                    if (!bodyNode || typeof bodyNode !== 'object') {
                        return;
                    }
                    // Check for method calls
                    if (bodyNode.type === utils_1.AST_NODE_TYPES.CallExpression) {
                        const { isMethodCall, methodName, isSuper } = isThisOrSuperMethodCall(bodyNode);
                        if (isMethodCall && methodName) {
                            // Abstract methods are always a problem when called from constructor
                            // This includes super calls to abstract methods
                            if (abstractMethods.has(methodName)) {
                                context.report({
                                    node: bodyNode,
                                    messageId: 'noOverridableMethodCallsInConstructor',
                                    data: {
                                        methodName,
                                        target: isSuper ? 'super' : 'this',
                                    },
                                });
                            }
                            // Overridable methods are a problem when called on 'this'
                            else if (overridableMethods.has(methodName) && !isSuper) {
                                context.report({
                                    node: bodyNode,
                                    messageId: 'noOverridableMethodCallsInConstructor',
                                    data: {
                                        methodName,
                                        target: 'this',
                                    },
                                });
                            }
                        }
                    }
                    // Check for property access (getters/setters) - only if not part of a call expression
                    else if (bodyNode.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                        // Check if this MemberExpression is the callee of a CallExpression
                        // If so, skip it as it will be handled by the CallExpression check
                        const parent = bodyNode.parent;
                        if (parent &&
                            parent.type === utils_1.AST_NODE_TYPES.CallExpression &&
                            parent.callee === bodyNode) {
                            return; // Skip this MemberExpression as it's part of a method call
                        }
                        const { isPropertyAccess, propertyName, isSuper } = isThisOrSuperPropertyAccess(bodyNode);
                        if (isPropertyAccess && propertyName) {
                            // Abstract methods are always a problem when accessed from constructor
                            if (abstractMethods.has(propertyName)) {
                                context.report({
                                    node: bodyNode,
                                    messageId: 'noOverridableMethodCallsInConstructor',
                                    data: {
                                        methodName: propertyName,
                                        target: isSuper ? 'super' : 'this',
                                    },
                                });
                            }
                            // Overridable methods are a problem when accessed on 'this'
                            else if (overridableMethods.has(propertyName) && !isSuper) {
                                context.report({
                                    node: bodyNode,
                                    messageId: 'noOverridableMethodCallsInConstructor',
                                    data: {
                                        methodName: propertyName,
                                        target: 'this',
                                    },
                                });
                            }
                        }
                    }
                    // Avoid circular references by not checking 'parent' property
                    const keysToSkip = new Set(['parent', 'loc', 'range']);
                    // Don't traverse into function expressions or arrow functions as they create new scopes
                    if (bodyNode.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                        bodyNode.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                        bodyNode.type === utils_1.AST_NODE_TYPES.FunctionDeclaration) {
                        return;
                    }
                    // Recursively check all child nodes
                    for (const key in bodyNode) {
                        if (keysToSkip.has(key))
                            continue;
                        const child = bodyNode[key];
                        if (child && typeof child === 'object') {
                            if ('type' in child) {
                                checkForMethodCalls(child);
                            }
                            else if (Array.isArray(child)) {
                                child.forEach((item) => {
                                    if (item && typeof item === 'object' && 'type' in item) {
                                        checkForMethodCalls(item);
                                    }
                                });
                            }
                        }
                    }
                }
                // Start checking from the constructor body
                checkForMethodCalls(ctorMethod.value.body);
            },
        };
    },
});
//# sourceMappingURL=no-overridable-method-calls-in-constructor.js.map
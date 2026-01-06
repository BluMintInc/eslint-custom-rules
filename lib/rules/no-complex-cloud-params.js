"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noComplexCloudParams = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const PASCAL_CASE_RE = /^[A-Z][a-zA-Z0-9]*$/;
exports.noComplexCloudParams = (0, createRule_1.createRule)({
    name: 'no-complex-cloud-params',
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow passing complex objects to cloud functions',
            recommended: 'error',
        },
        schema: [],
        messages: {
            noComplexObjects: 'Cloud function "{{callee}}" receives a value that is not JSON-serializable. Cloud params must stay plain data; class instances, functions, RegExp/BigInt/TypedArray values, or nested complex properties are dropped or cause runtime errors during transport to Firebase. Send only primitives and plain objects/arrays, or serialize the value first (for example, convert a RegExp to a string or JSON.stringify the payload) before calling "{{callee}}".',
        },
    },
    defaultOptions: [],
    create(context) {
        // Track imported cloud functions
        const cloudFunctions = new Set();
        // Track objects to detect circular references
        const objectsInPath = new Set();
        // Track nodes that have already been reported
        const reportedNodes = new Set();
        function isFunction(node) {
            return [
                utils_1.AST_NODE_TYPES.FunctionExpression,
                utils_1.AST_NODE_TYPES.ArrowFunctionExpression,
                utils_1.AST_NODE_TYPES.MethodDefinition,
            ].includes(node.type);
        }
        function isMethod(node) {
            if (node.type === utils_1.AST_NODE_TYPES.MethodDefinition) {
                return true;
            }
            if (node.type === utils_1.AST_NODE_TYPES.Property) {
                // Check for methods, getters, setters
                if (node.method || node.kind === 'get' || node.kind === 'set') {
                    return true;
                }
                // Check if the value is a function
                if (node.value && isFunction(node.value)) {
                    return true;
                }
                // Check for bound functions
                if (node.value &&
                    node.value.type === utils_1.AST_NODE_TYPES.CallExpression &&
                    node.value.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    node.value.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.value.callee.property.name === 'bind') {
                    return true;
                }
                // Check for generator methods
                if (node.value &&
                    node.value.type === utils_1.AST_NODE_TYPES.FunctionExpression &&
                    node.value.generator) {
                    return true;
                }
                // Check for async methods
                if (node.value &&
                    node.value.type === utils_1.AST_NODE_TYPES.FunctionExpression &&
                    node.value.async) {
                    return true;
                }
            }
            return false;
        }
        function isClassInstance(node) {
            if (node.type === utils_1.AST_NODE_TYPES.NewExpression) {
                // Check for known non-serializable constructors
                if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier) {
                    const nonSerializableTypes = new Set([
                        'RegExp',
                        'BigInt',
                        'Int8Array',
                        'Uint8Array',
                        'Uint8ClampedArray',
                        'Int16Array',
                        'Uint16Array',
                        'Int32Array',
                        'Uint32Array',
                        'Float32Array',
                        'Float64Array',
                        'BigInt64Array',
                        'BigUint64Array',
                        'WeakMap',
                        'WeakSet',
                        'Promise',
                        'Error',
                        'Proxy',
                        'Map',
                        'Set',
                        'ArrayBuffer',
                        'SharedArrayBuffer',
                        'DataView',
                    ]);
                    if (nonSerializableTypes.has(node.callee.name)) {
                        return true;
                    }
                    // Allow Date objects as they are serializable
                    if (node.callee.name === 'Date') {
                        return false;
                    }
                }
                return true;
            }
            if (node.type === utils_1.AST_NODE_TYPES.Identifier) {
                // Try to find the variable declaration
                const scope = context.getScope();
                const variable = scope.variables.find((v) => v.name === node.name);
                if (variable && variable.defs.length > 0) {
                    const def = variable.defs[0];
                    if (def.node.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                        def.node.init) {
                        return isClassInstance(def.node.init);
                    }
                }
                // Only consider identifiers as potential class instances if they follow PascalCase naming
                // (not SCREAMING_SNAKE_CASE constants)
                if (node.name[0] === node.name[0].toUpperCase()) {
                    // Check if it's a constant (SCREAMING_SNAKE_CASE) - these are not class instances
                    if (node.name.includes('_') &&
                        node.name === node.name.toUpperCase()) {
                        return false;
                    }
                    // Check if it's PascalCase (potential class instance)
                    // PascalCase: starts with capital, has lowercase letters, no underscores
                    const isPascalCase = PASCAL_CASE_RE.test(node.name) && /[a-z]/.test(node.name);
                    return isPascalCase;
                }
                return false;
            }
            return false;
        }
        function isNonSerializableLiteral(node) {
            if (node.type === utils_1.AST_NODE_TYPES.Literal) {
                // Check for RegExp literal
                if ('regex' in node && node.regex) {
                    return true;
                }
                // Check for BigInt literal
                if ('bigint' in node && node.bigint) {
                    return true;
                }
                return false;
            }
            // Check for RegExp constructor or literal
            if ((node.type === utils_1.AST_NODE_TYPES.NewExpression ||
                node.type === utils_1.AST_NODE_TYPES.CallExpression) &&
                node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                node.callee.name === 'RegExp') {
                return true;
            }
            // Check for BigInt constructor or function
            if ((node.type === utils_1.AST_NODE_TYPES.CallExpression ||
                node.type === utils_1.AST_NODE_TYPES.NewExpression) &&
                node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                node.callee.name === 'BigInt') {
                return true;
            }
            return false;
        }
        function isComplexValue(node) {
            // Prevent infinite recursion with circular references
            if (objectsInPath.has(node)) {
                return true;
            }
            objectsInPath.add(node);
            try {
                // Check for function expressions
                if (isFunction(node)) {
                    return true;
                }
                // Check for class instances
                if (isClassInstance(node)) {
                    return true;
                }
                // Check for non-serializable literals
                if (isNonSerializableLiteral(node)) {
                    return true;
                }
                // Check for method calls that could create complex objects
                if (node.type === utils_1.AST_NODE_TYPES.CallExpression) {
                    // Allow JSON.stringify
                    if (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                        node.callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                        node.callee.object.name === 'JSON' &&
                        node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                        node.callee.property.name === 'stringify') {
                        return false;
                    }
                    // Allow Object.create(null)
                    if (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                        node.callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                        node.callee.object.name === 'Object' &&
                        node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                        node.callee.property.name === 'create') {
                        // Only allow Object.create(null), check if the prototype object is complex
                        if (node.arguments.length === 1) {
                            if (node.arguments[0].type === utils_1.AST_NODE_TYPES.Literal &&
                                node.arguments[0].value === null) {
                                return false;
                            }
                            return isComplexValue(node.arguments[0]);
                        }
                        return true;
                    }
                    // Check for function binding
                    if (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                        node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                        node.callee.property.name === 'bind') {
                        return true;
                    }
                    return isComplexValue(node.callee);
                }
                // Check for arrays
                if (node.type === utils_1.AST_NODE_TYPES.ArrayExpression) {
                    return node.elements.some((element) => element !== null && isComplexValue(element));
                }
                // Check for objects
                if (node.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                    return node.properties.some((prop) => {
                        if (prop.type === utils_1.AST_NODE_TYPES.Property) {
                            // Check for computed properties (including Symbols)
                            if (prop.computed) {
                                return true;
                            }
                            // Check for methods, getters, and setters
                            if (isMethod(prop)) {
                                return true;
                            }
                            // Check property value
                            return isComplexValue(prop.value);
                        }
                        // SpreadElement or other non-Property types are considered complex
                        return true;
                    });
                }
                // Check for member expressions that might be complex
                if (node.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                    // Check for prototype chain access
                    if (node.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                        (node.property.name === 'prototype' ||
                            node.property.name === '__proto__')) {
                        return true;
                    }
                    // Check for Symbol properties
                    if (node.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                        node.object.name === 'Symbol') {
                        return true;
                    }
                    // Check for WeakMap, WeakSet, Promise, Error constructors
                    if (node.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                        ['WeakMap', 'WeakSet', 'Promise', 'Error'].includes(node.object.name)) {
                        return true;
                    }
                    // For property access expressions, we only need to check if the object itself is complex
                    // We don't need to check the property, as accessing a property will result in a primitive value
                    // or another object that we'll check separately
                    return isComplexValue(node.object);
                }
                // Check for Symbols
                if (node.type === utils_1.AST_NODE_TYPES.Identifier && node.name === 'Symbol') {
                    return true;
                }
                // Check for object references that might be circular
                if (node.type === utils_1.AST_NODE_TYPES.Identifier) {
                    const scope = context.getScope();
                    const variable = scope.variables.find((v) => v.name === node.name);
                    if (variable && variable.references.length > 0) {
                        // Check if this identifier is used in a way that creates a circular reference
                        const isCircular = variable.references.some((ref) => {
                            const refParent = ref.identifier.parent;
                            if (refParent) {
                                // Check for direct assignment
                                if (refParent.type === utils_1.AST_NODE_TYPES.AssignmentExpression) {
                                    if (refParent.right === ref.identifier) {
                                        // The identifier is being assigned to a property of itself
                                        let current = refParent.parent;
                                        while (current) {
                                            if (current === node) {
                                                return true;
                                            }
                                            current = current.parent;
                                        }
                                    }
                                }
                                // Check for property assignment
                                if (refParent.type === utils_1.AST_NODE_TYPES.Property) {
                                    let current = refParent.parent;
                                    while (current) {
                                        if (current === node) {
                                            return true;
                                        }
                                        current = current.parent;
                                    }
                                }
                            }
                            return false;
                        });
                        if (isCircular) {
                            return true;
                        }
                        // Check the value the identifier refers to
                        if (variable.defs.length > 0) {
                            const def = variable.defs[0];
                            if (def.node.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                                def.node.init) {
                                return isComplexValue(def.node.init);
                            }
                        }
                    }
                }
                return false;
            }
            finally {
                objectsInPath.delete(node);
            }
        }
        function hasComplexProperties(node) {
            return isComplexValue(node);
        }
        function checkCloudFunctionCall(node) {
            const callee = node.callee;
            if (callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                cloudFunctions.has(callee.name)) {
                // Check each argument for complex objects
                node.arguments.forEach((arg) => {
                    if (hasComplexProperties(arg) && !reportedNodes.has(node)) {
                        reportedNodes.add(node);
                        context.report({
                            node,
                            messageId: 'noComplexObjects',
                            data: {
                                callee: callee.name,
                            },
                        });
                    }
                });
            }
        }
        return {
            // Track cloud function imports
            ImportExpression(node) {
                if (node.source.type === utils_1.AST_NODE_TYPES.Literal &&
                    typeof node.source.value === 'string' &&
                    node.source.value.includes('firebaseCloud')) {
                    // Find the variable declarator that contains this import
                    let parent = node.parent;
                    while (parent && parent.type !== utils_1.AST_NODE_TYPES.VariableDeclarator) {
                        parent = parent.parent;
                    }
                    if (parent && parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator) {
                        // Handle destructuring pattern
                        if (parent.id.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
                            parent.id.properties.forEach((prop) => {
                                if (prop.type === utils_1.AST_NODE_TYPES.Property &&
                                    prop.value.type === utils_1.AST_NODE_TYPES.Identifier) {
                                    cloudFunctions.add(prop.value.name);
                                }
                            });
                        }
                    }
                }
            },
            // Check for complex objects in cloud function calls
            CallExpression(node) {
                checkCloudFunctionCall(node);
            },
            // Check for await expressions with cloud function calls
            AwaitExpression(node) {
                if (node.argument.type === utils_1.AST_NODE_TYPES.CallExpression) {
                    checkCloudFunctionCall(node.argument);
                }
            },
        };
    },
});
//# sourceMappingURL=no-complex-cloud-params.js.map
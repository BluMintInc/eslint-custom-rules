"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferDocumentFlattening = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
function isIdentifier(node) {
    return node.type === utils_1.AST_NODE_TYPES.Identifier;
}
function isMemberExpression(node) {
    return node.type === utils_1.AST_NODE_TYPES.MemberExpression;
}
function isObjectExpression(node) {
    return node.type === utils_1.AST_NODE_TYPES.ObjectExpression;
}
function isProperty(node) {
    return node.type === utils_1.AST_NODE_TYPES.Property;
}
/**
 * Recursively checks if an object has deeply nested objects
 */
const hasDeepNestedObjects = (node) => {
    if (isObjectExpression(node)) {
        for (const property of node.properties) {
            if (!isProperty(property))
                continue;
            const value = property.value;
            // If the property value is an object, it's a nested object
            if (isObjectExpression(value)) {
                return true;
            }
            // Check arrays for nested objects
            if (value.type === utils_1.AST_NODE_TYPES.ArrayExpression) {
                for (const element of value.elements) {
                    if (element && hasDeepNestedObjects(element)) {
                        return true;
                    }
                }
            }
        }
    }
    // Check arrays for nested objects
    if (node.type === utils_1.AST_NODE_TYPES.ArrayExpression) {
        for (const element of node.elements) {
            if (element && hasDeepNestedObjects(element)) {
                return true;
            }
        }
    }
    return false;
};
exports.preferDocumentFlattening = (0, createRule_1.createRule)({
    name: 'prefer-document-flattening',
    meta: {
        type: 'suggestion',
        hasSuggestions: true,
        docs: {
            description: 'Enforce using the shouldFlatten option when setting deeply nested objects in Firestore documents',
            recommended: 'error',
        },
        schema: [],
        messages: {
            preferDocumentFlattening: '{{className}} instance "{{instanceName}}" sets nested Firestore data without enabling shouldFlatten. Nested object writes overwrite sibling fields and require read-modify-write cycles, which increases contention and hides field-level query paths. Add shouldFlatten: true in the {{className}} options or pass flattened field paths (for example, "profile.settings.theme") so nested updates stay atomic and queryable.',
            addShouldFlatten: 'Add shouldFlatten: true to the DocSetter options.',
        },
    },
    defaultOptions: [],
    create(context) {
        // Track DocSetter instances without shouldFlatten option
        const docSetterInstances = [];
        // Track which DocSetter instances are used to set nested objects
        const docSetterWithNestedObjects = new Set();
        const buildSuggestion = (instance) => {
            const newExpr = instance.node;
            const hasOptionsArg = newExpr.arguments.length >= 2;
            const optionsArg = hasOptionsArg ? newExpr.arguments[1] : undefined;
            if (optionsArg && isObjectExpression(optionsArg)) {
                const insertPos = (optionsArg.range?.[1] ?? optionsArg.parent?.range?.[1] ?? 0) - 1;
                const prefix = optionsArg.properties.length ? ', ' : '';
                return [
                    {
                        messageId: 'addShouldFlatten',
                        fix(fixer) {
                            return fixer.insertTextBeforeRange([insertPos, insertPos], `${prefix}shouldFlatten: true`);
                        },
                    },
                ];
            }
            const endPos = (newExpr.range?.[1] ?? newExpr.parent?.range?.[1] ?? 0) - 1;
            return [
                {
                    messageId: 'addShouldFlatten',
                    fix(fixer) {
                        return fixer.insertTextBeforeRange([endPos, endPos], `${hasOptionsArg ? '' : ','} { shouldFlatten: true }`);
                    },
                },
            ];
        };
        return {
            // Detect DocSetter and DocSetterTransaction instantiations
            NewExpression(node) {
                if (!isIdentifier(node.callee))
                    return;
                const className = node.callee.name;
                // Only check DocSetter and DocSetterTransaction classes
                if (className !== 'DocSetter' && className !== 'DocSetterTransaction')
                    return;
                // Check if shouldFlatten option is provided
                let hasShouldFlatten = false;
                // The options object is typically the second argument
                if (node.arguments.length >= 2) {
                    const optionsArg = node.arguments[1];
                    if (isObjectExpression(optionsArg)) {
                        for (const property of optionsArg.properties) {
                            if (!isProperty(property))
                                continue;
                            if (isIdentifier(property.key) &&
                                property.key.name === 'shouldFlatten' &&
                                property.value.type === utils_1.AST_NODE_TYPES.Literal &&
                                property.value.value === true) {
                                hasShouldFlatten = true;
                                break;
                            }
                        }
                    }
                }
                // Get variable name from parent node if it's a variable declaration
                let instanceName = '';
                if (node.parent &&
                    node.parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                    isIdentifier(node.parent.id)) {
                    instanceName = node.parent.id.name;
                }
                if (instanceName && !hasShouldFlatten) {
                    docSetterInstances.push({
                        className,
                        name: instanceName,
                        node,
                        hasShouldFlatten,
                    });
                }
            },
            // Check for set method calls on DocSetter instances
            CallExpression(node) {
                if (!isMemberExpression(node.callee))
                    return;
                const property = node.callee.property;
                if (!isIdentifier(property))
                    return;
                // Check if it's a set or setAll method
                if (property.name !== 'set' && property.name !== 'setAll')
                    return;
                const object = node.callee.object;
                let instance;
                if (isIdentifier(object)) {
                    instance = docSetterInstances.find((i) => i.name === object.name);
                }
                else if (object.type === utils_1.AST_NODE_TYPES.NewExpression &&
                    isIdentifier(object.callee)) {
                    const className = object.callee.name;
                    if (className === 'DocSetter' ||
                        className === 'DocSetterTransaction') {
                        let hasShouldFlatten = false;
                        if (object.arguments.length >= 2) {
                            const optionsArg = object.arguments[1];
                            if (isObjectExpression(optionsArg)) {
                                for (const property of optionsArg.properties) {
                                    if (!isProperty(property))
                                        continue;
                                    if (isIdentifier(property.key) &&
                                        property.key.name === 'shouldFlatten' &&
                                        property.value.type === utils_1.AST_NODE_TYPES.Literal &&
                                        property.value.value === true) {
                                        hasShouldFlatten = true;
                                        break;
                                    }
                                }
                            }
                        }
                        if (!hasShouldFlatten) {
                            instance = {
                                className,
                                name: `(inline-${docSetterInstances.length})`,
                                node: object,
                                hasShouldFlatten,
                            };
                            docSetterInstances.push(instance);
                        }
                    }
                }
                if (!instance)
                    return;
                // Check if we're setting a nested object
                if (node.arguments.length > 0) {
                    const dataArg = node.arguments[0];
                    // For set method
                    if (isObjectExpression(dataArg) && hasDeepNestedObjects(dataArg)) {
                        docSetterWithNestedObjects.add(instance.name);
                    }
                    // For setAll method with array argument
                    if (dataArg.type === utils_1.AST_NODE_TYPES.ArrayExpression &&
                        dataArg.elements.some((element) => {
                            if (!element || !isObjectExpression(element)) {
                                return false;
                            }
                            for (const prop of element.properties) {
                                if (!isProperty(prop) || !isIdentifier(prop.key))
                                    continue;
                                if (prop.key.name !== 'data')
                                    continue;
                                if (!isObjectExpression(prop.value))
                                    return false;
                                return hasDeepNestedObjects(prop.value);
                            }
                            return false;
                        })) {
                        docSetterWithNestedObjects.add(instance.name);
                    }
                }
            },
            // Report at the end of the program
            'Program:exit'() {
                for (const instance of docSetterInstances) {
                    if (docSetterWithNestedObjects.has(instance.name)) {
                        context.report({
                            node: instance.node,
                            messageId: 'preferDocumentFlattening',
                            data: {
                                className: instance.className,
                                instanceName: instance.name,
                            },
                            suggest: buildSuggestion(instance),
                        });
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=prefer-document-flattening.js.map
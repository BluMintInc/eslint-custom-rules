"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceFieldPathSyntaxInDocSetter = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
exports.enforceFieldPathSyntaxInDocSetter = (0, createRule_1.createRule)({
    name: 'enforce-fieldpath-syntax-in-docsetter',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce the use of Firestore FieldPath syntax when passing documentData into DocSetter. Instead of using nested object syntax, developers should use dot notation for deeply nested fields.',
            recommended: 'error',
            requiresTypeChecking: false,
            extendsBaseRule: false,
        },
        fixable: 'code',
        schema: [],
        messages: {
            enforceFieldPathSyntax: 'Use FieldPath syntax (dot notation) for nested fields in DocSetter. Instead of `{ roles: { contributor: value } }`, use `{ "roles.contributor": value }`.',
        },
    },
    defaultOptions: [],
    create(context) {
        // Track DocSetter variables
        const docSetterVariables = new Set();
        // Helper function to check if a node is a DocSetter method call
        function isDocSetterMethodCall(node) {
            if (node.callee.type !== utils_1.AST_NODE_TYPES.MemberExpression) {
                return false;
            }
            const { object, property } = node.callee;
            // Only enforce for set/updateIfExists; skip overwrite (full-document replacement)
            if (property.type !== utils_1.AST_NODE_TYPES.Identifier ||
                !['set', 'updateIfExists'].includes(property.name)) {
                return false;
            }
            // Check if the object is a DocSetter instance
            if (object.type === utils_1.AST_NODE_TYPES.Identifier) {
                return docSetterVariables.has(object.name);
            }
            // Support chained instantiation: new DocSetter(...).set(...)
            if (object.type === utils_1.AST_NODE_TYPES.NewExpression &&
                object.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                object.callee.name === 'DocSetter') {
                return true;
            }
            return false;
        }
        // Helper: detect spread or computed properties in an object literal
        function isSpreadOrComputed(prop) {
            return (prop.type === utils_1.AST_NODE_TYPES.SpreadElement ||
                (prop.type === utils_1.AST_NODE_TYPES.Property && prop.computed === true));
        }
        // Helper function to check if an object has nested objects (excluding arrays)
        function hasNestedObjects(node, prefix = '') {
            for (const property of node.properties) {
                // Skip spread elements
                if (property.type === utils_1.AST_NODE_TYPES.SpreadElement) {
                    continue;
                }
                if (property.type !== utils_1.AST_NODE_TYPES.Property) {
                    continue;
                }
                // Skip computed properties (dynamic keys)
                if (property.computed) {
                    continue;
                }
                const isNumericKey = property.key.type === utils_1.AST_NODE_TYPES.Literal &&
                    (typeof property.key.value === 'number' ||
                        (typeof property.key.value === 'string' &&
                            /^\d+$/.test(property.key.value)));
                // Allow top-level numeric keys (treated like array indexes)
                if (prefix === '' && isNumericKey) {
                    continue;
                }
                const value = property.value;
                // Skip if the property key is already using dot notation
                if (property.key.type === utils_1.AST_NODE_TYPES.Literal &&
                    typeof property.key.value === 'string' &&
                    property.key.value.includes('.')) {
                    continue;
                }
                // Check if the value is an object (but not an array)
                if (value.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                    // Skip nested objects that contain spread elements or computed properties
                    const hasSpreadOrComputed = value.properties.some((prop) => isSpreadOrComputed(prop));
                    if (!hasSpreadOrComputed) {
                        return true;
                    }
                }
            }
            return false;
        }
        // Helper function to flatten nested objects into FieldPath syntax
        function flattenObject(obj, sourceCode, prefix = '') {
            const result = {};
            for (const property of obj.properties) {
                // Skip spread elements
                if (property.type === utils_1.AST_NODE_TYPES.SpreadElement) {
                    continue;
                }
                if (property.type !== utils_1.AST_NODE_TYPES.Property) {
                    continue;
                }
                // Skip computed properties (dynamic keys)
                if (property.computed) {
                    continue;
                }
                let key;
                if (property.key.type === utils_1.AST_NODE_TYPES.Identifier) {
                    key = property.key.name;
                }
                else if (property.key.type === utils_1.AST_NODE_TYPES.Literal) {
                    // Handle both string and numeric literal keys
                    if (typeof property.key.value === 'string') {
                        key = property.key.value;
                    }
                    else if (typeof property.key.value === 'number') {
                        key = String(property.key.value);
                    }
                    else {
                        // Skip other literal types
                        continue;
                    }
                }
                else {
                    // Skip other key types
                    continue;
                }
                const isNumericKey = property.key.type === utils_1.AST_NODE_TYPES.Literal &&
                    (typeof property.key.value === 'number' ||
                        (typeof property.key.value === 'string' &&
                            /^\d+$/.test(property.key.value)));
                if (prefix === '' && isNumericKey) {
                    continue;
                }
                const fullKey = prefix ? `${prefix}.${key}` : key;
                // If the value is a nested object, recursively flatten it
                if (property.value.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                    const nestedResult = flattenObject(property.value, sourceCode, fullKey);
                    Object.assign(result, nestedResult);
                }
                else {
                    // For non-object values, use the key as is
                    result[fullKey] = sourceCode.getText(property.value);
                }
            }
            return result;
        }
        // Helper to decide if a key needs quoting (contains dot or is not IdentifierName)
        function needsQuoting(key) {
            return key.includes('.') || !/^(?:[$_A-Za-z][$\w]*)$/u.test(key);
        }
        // Helper function to convert an object to FieldPath syntax
        function convertToFieldPathSyntax(node, sourceCode) {
            const idProperty = node.properties.find((prop) => prop.type === utils_1.AST_NODE_TYPES.Property &&
                prop.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                prop.key.name === 'id');
            const flattenedProperties = flattenObject(node, sourceCode);
            if (idProperty && idProperty.type === utils_1.AST_NODE_TYPES.Property) {
                delete flattenedProperties['id'];
            }
            const entries = Object.entries(flattenedProperties);
            const propertyComma = ',';
            // Start with the id property if it exists
            let result = '{\n';
            if (idProperty && idProperty.type === utils_1.AST_NODE_TYPES.Property) {
                result += `  id: ${sourceCode.getText(idProperty.value)}${propertyComma}\n`;
            }
            // Add the flattened properties (always include trailing commas for multiline objects)
            entries.forEach(([key, value]) => {
                const printedKey = needsQuoting(key) ? `'${key}'` : key;
                result += `  ${printedKey}: ${value}${propertyComma}\n`;
            });
            result += '}';
            return result;
        }
        return {
            // Track DocSetter variable declarations
            VariableDeclarator(node) {
                if (node.init?.type === utils_1.AST_NODE_TYPES.NewExpression &&
                    node.init.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.init.callee.name === 'DocSetter' &&
                    node.id.type === utils_1.AST_NODE_TYPES.Identifier) {
                    docSetterVariables.add(node.id.name);
                }
            },
            // Check DocSetter method calls
            CallExpression(node) {
                if (!isDocSetterMethodCall(node)) {
                    return;
                }
                // Check if the first argument is an object literal
                const firstArg = node.arguments[0];
                if (firstArg?.type !== utils_1.AST_NODE_TYPES.ObjectExpression ||
                    !hasNestedObjects(firstArg)) {
                    return;
                }
                // Report and fix the issue
                context.report({
                    node: firstArg,
                    messageId: 'enforceFieldPathSyntax',
                    fix(fixer) {
                        const newText = convertToFieldPathSyntax(firstArg, context.getSourceCode());
                        return fixer.replaceText(firstArg, newText);
                    },
                });
            },
        };
    },
});
//# sourceMappingURL=enforce-fieldpath-syntax-in-docsetter.js.map
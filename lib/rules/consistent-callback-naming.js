"use strict";
const createRule_1 = require("../utils/createRule");
module.exports = (0, createRule_1.createRule)({
    name: 'consistent-callback-naming',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce consistent naming conventions for callback props and functions',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            callbackPropPrefix: 'Callback props (function type props) must be prefixed with "on" (e.g., onClick, onChange)',
            callbackFunctionPrefix: 'Callback functions should not use "handle" prefix, use descriptive verb phrases instead',
        },
    },
    defaultOptions: [],
    create(context) {
        const parserServices = context.parserServices;
        // Check if we have access to TypeScript services
        if (!parserServices?.program || !parserServices?.esTreeNodeToTSNodeMap) {
            throw new Error('You have to enable the `project` setting in parser options to use this rule');
        }
        const checker = parserServices.program.getTypeChecker();
        function isFunctionType(node) {
            const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node);
            const type = checker.getTypeAtLocation(tsNode);
            return type.getCallSignatures().length > 0;
        }
        return {
            // Check JSX attributes for callback props
            JSXAttribute(node) {
                if (node.value?.type === 'JSXExpressionContainer' &&
                    node.value.expression.type === 'Identifier') {
                    const propName = node.name.type === 'JSXIdentifier' ? node.name.name : undefined;
                    // Skip React's built-in event handlers
                    if (propName?.match(/^on[A-Z]/)) {
                        return;
                    }
                    // Check if the value is a function type
                    if (isFunctionType(node.value.expression) &&
                        propName &&
                        !propName.startsWith('on')) {
                        context.report({
                            node,
                            messageId: 'callbackPropPrefix',
                            fix(fixer) {
                                // Convert camelCase to PascalCase for the event name
                                const eventName = propName.charAt(0).toUpperCase() + propName.slice(1);
                                return fixer.replaceText(node.name, `on${eventName}`);
                            },
                        });
                    }
                }
            },
            // Check function declarations and variable declarations for callback functions
            'FunctionDeclaration, VariableDeclarator'(node) {
                const functionName = node.id?.type === 'Identifier' ? node.id.name : undefined;
                if (functionName && functionName.startsWith('handle') && node.id) {
                    context.report({
                        node,
                        messageId: 'callbackFunctionPrefix',
                        fix(fixer) {
                            // Remove 'handle' prefix and convert first character to lowercase
                            const newName = functionName.slice(6).charAt(0).toLowerCase() +
                                functionName.slice(7);
                            return fixer.replaceText(node.id, newName);
                        },
                    });
                }
            },
            // Check class methods and object methods
            'MethodDefinition, Property'(node) {
                if (node.key.type === 'Identifier' &&
                    node.key.name &&
                    node.key.name.startsWith('handle')) {
                    const name = node.key.name;
                    context.report({
                        node: node.key,
                        messageId: 'callbackFunctionPrefix',
                        fix(fixer) {
                            // Remove 'handle' prefix and convert first character to lowercase
                            const newName = name.slice(6).charAt(0).toLowerCase() + name.slice(7);
                            return fixer.replaceText(node.key, newName);
                        },
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=consistent-callback-naming.js.map
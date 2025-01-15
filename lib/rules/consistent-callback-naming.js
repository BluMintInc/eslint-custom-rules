"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
const createRule_1 = require("../utils/createRule");
const ts = __importStar(require("typescript"));
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
        function isReactComponentType(node) {
            const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node);
            const type = checker.getTypeAtLocation(tsNode);
            const symbol = type.getSymbol();
            if (!symbol)
                return false;
            // Check if type is a React component type
            const isComponent = symbol.declarations?.some((decl) => {
                const declaration = decl;
                if (ts.isClassDeclaration(declaration) ||
                    ts.isInterfaceDeclaration(declaration)) {
                    const name = declaration.name?.text ?? '';
                    return (
                    // Check for common React component patterns
                    name.includes('Component') ||
                        name.includes('Element') ||
                        name.includes('FC') ||
                        name.includes('FunctionComponent'));
                }
                return false;
            });
            return isComponent || false;
        }
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
                    // Check if the value is a function type and not a React component
                    if (isFunctionType(node.value.expression) &&
                        propName &&
                        !propName.startsWith('on') &&
                        !isReactComponentType(node.value.expression)) {
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
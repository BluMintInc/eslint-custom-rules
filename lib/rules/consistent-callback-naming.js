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
/* eslint-disable @typescript-eslint/no-non-null-assertion */
const createRule_1 = require("../utils/createRule");
const utils_1 = require("@typescript-eslint/utils");
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
            callbackPropPrefix: 'Callback prop "{{propName}}" is a function but lacks the "on" prefix. ' +
                'Consistent "on" prefixes signal event handlers to consumers and distinguish callbacks from data props. ' +
                'Rename to "on{{eventName}}".',
            callbackFunctionPrefix: 'Function "{{functionName}}" uses the "handle" prefix. ' +
                'The "handle" prefix is redundant and less descriptive than action-oriented verb phrases. ' +
                'Rename using a descriptive verb (e.g., click instead of handleClick).',
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
                // Check for JSX element types
                if (ts.isTypeAliasDeclaration(declaration)) {
                    const typeText = declaration.type.getText();
                    return (typeText.includes('JSX.Element') ||
                        typeText.includes('ReactElement'));
                }
                // Check for class/interface component patterns
                if (ts.isClassDeclaration(declaration) ||
                    ts.isInterfaceDeclaration(declaration)) {
                    const name = declaration.name?.text ?? '';
                    return (name.includes('Component') ||
                        name.includes('Element') ||
                        name.includes('FC') ||
                        name.includes('FunctionComponent'));
                }
                return false;
            });
            // Check if the type itself is a component or element type
            const typeString = checker.typeToString(type);
            const isComponentType = typeString.includes('JSX.Element') ||
                typeString.includes('ReactElement') ||
                typeString.includes('Component') ||
                typeString.includes('FC');
            return isComponent || isComponentType;
        }
        function isPascalCase(str) {
            return /^[A-Z][a-zA-Z0-9]*$/.test(str);
        }
        function isFunctionType(node) {
            const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node);
            const type = checker.getTypeAtLocation(tsNode);
            return type.getCallSignatures().length > 0;
        }
        function isRenderFunction(node) {
            const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node);
            const type = checker.getTypeAtLocation(tsNode);
            const signatures = type.getCallSignatures();
            if (signatures.length === 0)
                return false;
            const isReactType = (t) => {
                const typeStr = checker.typeToString(t);
                return (typeStr.includes('JSX.Element') ||
                    typeStr.includes('ReactElement') ||
                    typeStr.includes('ReactNode'));
            };
            return signatures.some((signature) => {
                const returnType = checker.getReturnTypeOfSignature(signature);
                if (isReactType(returnType))
                    return true;
                if (returnType.isUnion()) {
                    return returnType.types.some((t) => isReactType(t));
                }
                return false;
            });
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
                    // Skip PascalCase props as they typically represent components or component-related props
                    if (propName && isPascalCase(propName)) {
                        return;
                    }
                    // Skip common non-callback props
                    const commonNonCallbackProps = new Set([
                        'theme',
                        'style',
                        'className',
                        'ref',
                        'key',
                        'component',
                        'as',
                        'sx',
                        'css', // Emotion css prop
                    ]);
                    if (propName && commonNonCallbackProps.has(propName)) {
                        return;
                    }
                    // Skip props on components that commonly use function props that aren't callbacks
                    const parentName = node.parent?.name;
                    const componentName = parentName?.type === 'JSXIdentifier' ? parentName.name : undefined;
                    const componentsWithFunctionProps = new Set([
                        'ThemeProvider',
                        'Transition',
                        'CSSTransition',
                        'TransitionGroup',
                        'SwitchTransition', // React Transition Group
                    ]);
                    if (componentName && componentsWithFunctionProps.has(componentName)) {
                        return;
                    }
                    // Check if the value is a function type and not a React component
                    if (isFunctionType(node.value.expression) &&
                        propName &&
                        !propName.startsWith('on') &&
                        !propName.startsWith('render') &&
                        !isRenderFunction(node.value.expression) &&
                        !isReactComponentType(node.value.expression)) {
                        const eventName = propName.charAt(0).toUpperCase() + propName.slice(1);
                        context.report({
                            node,
                            messageId: 'callbackPropPrefix',
                            data: {
                                propName,
                                eventName,
                            },
                            fix(fixer) {
                                // Convert camelCase to PascalCase for the event name
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
                    // Skip autofixing for "handler" and "handlers"
                    if (functionName === 'handler' || functionName === 'handlers') {
                        context.report({
                            node,
                            messageId: 'callbackFunctionPrefix',
                            data: { functionName },
                        });
                        return;
                    }
                    // Skip autofixing for class parameters and getters
                    const parent = node.parent;
                    if (parent?.type === utils_1.AST_NODE_TYPES.PropertyDefinition ||
                        parent?.type === utils_1.AST_NODE_TYPES.MethodDefinition) {
                        context.report({
                            node,
                            messageId: 'callbackFunctionPrefix',
                            data: { functionName },
                        });
                        return;
                    }
                    // Get all references to this variable
                    const scope = context.getScope();
                    const variable = scope.variables.find((v) => v.name === functionName);
                    const references = new Set(variable?.references ?? []);
                    // Get references from all scopes
                    const allScopes = [scope];
                    let currentScope = scope;
                    while (currentScope.upper) {
                        currentScope = currentScope.upper;
                        allScopes.push(currentScope);
                    }
                    // Get references from all scopes and their children
                    for (const s of allScopes) {
                        // Get references from current scope
                        const currentVar = s.variables.find((v) => v.name === functionName);
                        if (currentVar) {
                            currentVar.references.forEach((ref) => references.add(ref));
                        }
                        // Get references from child scopes
                        const childScopes = s.childScopes;
                        for (const childScope of childScopes) {
                            const childVar = childScope.variables.find((v) => v.name === functionName);
                            if (childVar) {
                                childVar.references.forEach((ref) => references.add(ref));
                            }
                        }
                    }
                    // Get references from sibling scopes
                    const siblingScopes = scope.upper?.childScopes ?? [];
                    for (const siblingScope of siblingScopes) {
                        if (siblingScope !== scope) {
                            const siblingVar = siblingScope.variables.find((v) => v.name === functionName);
                            if (siblingVar) {
                                siblingVar.references.forEach((ref) => references.add(ref));
                            }
                        }
                    }
                    // Get references from global scope
                    const sourceCode = context.sourceCode;
                    if (sourceCode.scopeManager?.globalScope) {
                        const globalVar = sourceCode.scopeManager.globalScope.variables.find((v) => v.name === functionName);
                        if (globalVar) {
                            globalVar.references.forEach((ref) => references.add(ref));
                        }
                    }
                    context.report({
                        node,
                        messageId: 'callbackFunctionPrefix',
                        data: { functionName },
                        fix(fixer) {
                            // Remove 'handle' prefix and convert first character to lowercase
                            const newName = functionName.slice(6).charAt(0).toLowerCase() +
                                functionName.slice(7);
                            // Fix the declaration and all references
                            const fixes = [];
                            fixes.push(fixer.replaceText(node.id, newName));
                            for (const ref of references) {
                                if (ref.identifier !== node.id) {
                                    fixes.push(fixer.replaceText(ref.identifier, newName));
                                }
                            }
                            return fixes;
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
                    // Skip autofixing for "handler" and "handlers"
                    if (name === 'handler' || name === 'handlers') {
                        context.report({
                            node: node.key,
                            messageId: 'callbackFunctionPrefix',
                            data: { functionName: name },
                        });
                        return;
                    }
                    // Skip autofixing for class parameters and getters
                    if (node.type === 'MethodDefinition' && node.kind === 'get') {
                        context.report({
                            node: node.key,
                            messageId: 'callbackFunctionPrefix',
                            data: { functionName: name },
                        });
                        return;
                    }
                    context.report({
                        node: node.key,
                        messageId: 'callbackFunctionPrefix',
                        data: { functionName: name },
                        fix(fixer) {
                            // Remove 'handle' prefix and convert first character to lowercase
                            const newName = name.slice(6).charAt(0).toLowerCase() + name.slice(7);
                            return fixer.replaceText(node.key, newName);
                        },
                    });
                }
            },
            // Check constructor parameters
            TSParameterProperty(node) {
                if (node.parameter.type === 'Identifier' &&
                    node.parameter.name.startsWith('handle')) {
                    context.report({
                        node,
                        messageId: 'callbackFunctionPrefix',
                        data: { functionName: node.parameter.name },
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=consistent-callback-naming.js.map
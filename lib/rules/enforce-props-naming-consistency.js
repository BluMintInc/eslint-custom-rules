"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforcePropsNamingConsistency = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
exports.enforcePropsNamingConsistency = (0, createRule_1.createRule)({
    name: 'enforce-props-naming-consistency',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Prefer naming single "Props"-typed parameters as "props"; enforcement defers to enforce-props-argument-name for multi-Props cases',
            recommended: 'warn',
        },
        schema: [],
        messages: {
            usePropsName: 'Parameter with a type ending in "Props" should be named "props" instead of "{{ paramName }}"',
        },
    },
    defaultOptions: [],
    create(context) {
        // Extract type name from a type annotation
        function getTypeName(typeAnnotation) {
            if (typeAnnotation.type === utils_1.AST_NODE_TYPES.TSTypeReference) {
                const typeName = typeAnnotation.typeName;
                if (typeName.type === utils_1.AST_NODE_TYPES.Identifier) {
                    return typeName.name;
                }
            }
            return null;
        }
        // Check if a parameter should be named "props"
        function shouldBeNamedProps(param) {
            // Only check non-destructured parameters
            if (param.type !== utils_1.AST_NODE_TYPES.Identifier) {
                return false;
            }
            // Check if the parameter has a type annotation
            if (!param.typeAnnotation || !param.typeAnnotation.typeAnnotation) {
                return false;
            }
            // Get the type name
            const typeName = getTypeName(param.typeAnnotation.typeAnnotation);
            if (!typeName) {
                return false;
            }
            // Check if the type name ends with "Props"
            return typeName.endsWith('Props');
        }
        // Check if a parameter name is already prefixed with "props"
        function isPropsNameWithPrefix(paramName) {
            return paramName.endsWith('Props') || paramName === 'props';
        }
        // Check function parameters
        function checkFunctionParams(node) {
            // Skip functions with multiple parameters that have Props types
            const propsTypeParams = node.params.filter((param) => {
                if (param.type !== utils_1.AST_NODE_TYPES.Identifier)
                    return false;
                if (!param.typeAnnotation || !param.typeAnnotation.typeAnnotation)
                    return false;
                const typeName = getTypeName(param.typeAnnotation.typeAnnotation);
                return typeName && typeName.endsWith('Props');
            });
            if (propsTypeParams.length > 1) {
                return; // Skip functions with multiple Props parameters
            }
            for (const param of node.params) {
                if (shouldBeNamedProps(param) &&
                    param.type === utils_1.AST_NODE_TYPES.Identifier &&
                    !isPropsNameWithPrefix(param.name)) {
                    context.report({
                        node: param,
                        messageId: 'usePropsName',
                        data: { paramName: param.name },
                    });
                }
            }
        }
        // Check class constructor parameters
        function checkClassConstructor(node) {
            if (node.kind !== 'constructor') {
                return;
            }
            const constructorValue = node.value;
            // Skip constructors with multiple parameters that have Props types
            const propsTypeParams = constructorValue.params.filter((param) => {
                if (param.type === utils_1.AST_NODE_TYPES.Identifier) {
                    if (!param.typeAnnotation || !param.typeAnnotation.typeAnnotation)
                        return false;
                    const typeName = getTypeName(param.typeAnnotation.typeAnnotation);
                    return typeName && typeName.endsWith('Props');
                }
                else if (param.type === utils_1.AST_NODE_TYPES.TSParameterProperty &&
                    param.parameter.type === utils_1.AST_NODE_TYPES.Identifier) {
                    if (!param.parameter.typeAnnotation ||
                        !param.parameter.typeAnnotation.typeAnnotation)
                        return false;
                    const typeName = getTypeName(param.parameter.typeAnnotation.typeAnnotation);
                    return typeName && typeName.endsWith('Props');
                }
                return false;
            });
            if (propsTypeParams.length > 1) {
                return; // Skip constructors with multiple Props parameters
            }
            for (const param of constructorValue.params) {
                if (shouldBeNamedProps(param) &&
                    param.type === utils_1.AST_NODE_TYPES.Identifier &&
                    !isPropsNameWithPrefix(param.name)) {
                    context.report({
                        node: param,
                        messageId: 'usePropsName',
                        data: { paramName: param.name },
                    });
                }
                else if (param.type === utils_1.AST_NODE_TYPES.TSParameterProperty &&
                    param.parameter.type === utils_1.AST_NODE_TYPES.Identifier &&
                    shouldBeNamedProps(param.parameter) &&
                    !isPropsNameWithPrefix(param.parameter.name)) {
                    context.report({
                        node: param.parameter,
                        messageId: 'usePropsName',
                        data: { paramName: param.parameter.name },
                        // TSParameterProperty may also require renaming property usages; avoid auto-fixing.
                        fix: undefined,
                    });
                }
            }
        }
        return {
            FunctionDeclaration: checkFunctionParams,
            FunctionExpression: checkFunctionParams,
            ArrowFunctionExpression: checkFunctionParams,
            TSMethodSignature: checkFunctionParams,
            MethodDefinition: checkClassConstructor,
        };
    },
});
//# sourceMappingURL=enforce-props-naming-consistency.js.map
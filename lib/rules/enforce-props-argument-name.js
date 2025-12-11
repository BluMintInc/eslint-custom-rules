"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforcePropsArgumentName = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const defaultOptions = {
    enforceDestructuring: false,
    ignoreExternalInterfaces: true,
};
exports.enforcePropsArgumentName = (0, createRule_1.createRule)({
    name: 'enforce-props-argument-name',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce using "Props" suffix in type names for parameter objects',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [
            {
                type: 'object',
                properties: {
                    enforceDestructuring: {
                        type: 'boolean',
                    },
                    ignoreExternalInterfaces: {
                        type: 'boolean',
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            usePropsForType: 'Use "Props" suffix in type name instead of "{{ typeSuffix }}"',
        },
    },
    defaultOptions: [defaultOptions],
    create(context, [options]) {
        const finalOptions = { ...defaultOptions, ...options };
        // Check if a node is from an external library
        function isFromExternalLibrary(node) {
            if (!finalOptions.ignoreExternalInterfaces) {
                return false;
            }
            let current = node;
            while (current.parent) {
                if (current.type === utils_1.AST_NODE_TYPES.TSInterfaceDeclaration) {
                    // Check if the interface extends something from an external library
                    const interfaceDecl = current;
                    if (interfaceDecl.extends && interfaceDecl.extends.length > 0) {
                        // Check if any of the extended interfaces are from external libraries
                        // This is a simplified check - a more robust implementation would trace imports
                        return true;
                    }
                }
                current = current.parent;
            }
            return false;
        }
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
        // Check if a type name has a non-"Props" suffix
        function hasNonPropsSuffix(typeName) {
            if (typeName.endsWith('Props')) {
                return null;
            }
            const suffixes = [
                'Config',
                'Settings',
                'Options',
                'Params',
                'Parameters',
                'Args',
                'Arguments',
            ];
            for (const suffix of suffixes) {
                if (typeName.endsWith(suffix)) {
                    return suffix;
                }
            }
            return null;
        }
        // Fix type name
        function fixTypeName(fixer, node, oldName, suffix) {
            if (node.type === utils_1.AST_NODE_TYPES.TSTypeReference &&
                node.typeName.type === utils_1.AST_NODE_TYPES.Identifier) {
                const baseName = oldName.slice(0, -suffix.length);
                return fixer.replaceText(node.typeName, `${baseName}Props`);
            }
            return null;
        }
        // Check function parameters
        function checkFunctionParams(node) {
            if (node.params.length !== 1) {
                return; // Only check functions with a single parameter
            }
            const param = node.params[0];
            // Skip primitive parameters
            if (param.type === utils_1.AST_NODE_TYPES.Identifier &&
                param.typeAnnotation &&
                (param.typeAnnotation.typeAnnotation.type ===
                    utils_1.AST_NODE_TYPES.TSStringKeyword ||
                    param.typeAnnotation.typeAnnotation.type ===
                        utils_1.AST_NODE_TYPES.TSNumberKeyword ||
                    param.typeAnnotation.typeAnnotation.type ===
                        utils_1.AST_NODE_TYPES.TSBooleanKeyword)) {
                return;
            }
            // Check if the parameter has a type annotation
            if (param.type === utils_1.AST_NODE_TYPES.Identifier &&
                param.typeAnnotation &&
                param.typeAnnotation.typeAnnotation) {
                const typeName = getTypeName(param.typeAnnotation.typeAnnotation);
                if (typeName) {
                    const nonPropsSuffix = hasNonPropsSuffix(typeName);
                    if (nonPropsSuffix) {
                        context.report({
                            node: param.typeAnnotation.typeAnnotation,
                            messageId: 'usePropsForType',
                            data: { typeSuffix: nonPropsSuffix },
                            fix: (fixer) => fixTypeName(fixer, param.typeAnnotation.typeAnnotation, typeName, nonPropsSuffix),
                        });
                    }
                }
            }
        }
        // Check class constructor parameters
        function checkClassConstructor(node) {
            if (node.kind !== 'constructor') {
                return;
            }
            const constructor = node.value;
            if (constructor.params.length !== 1) {
                return; // Only check constructors with a single parameter
            }
            const param = constructor.params[0];
            // Skip primitive parameters
            if (param.type === utils_1.AST_NODE_TYPES.Identifier &&
                param.typeAnnotation &&
                (param.typeAnnotation.typeAnnotation.type ===
                    utils_1.AST_NODE_TYPES.TSStringKeyword ||
                    param.typeAnnotation.typeAnnotation.type ===
                        utils_1.AST_NODE_TYPES.TSNumberKeyword ||
                    param.typeAnnotation.typeAnnotation.type ===
                        utils_1.AST_NODE_TYPES.TSBooleanKeyword)) {
                return;
            }
            // Check if the parameter has a type annotation
            if (param.type === utils_1.AST_NODE_TYPES.Identifier &&
                param.typeAnnotation &&
                param.typeAnnotation.typeAnnotation) {
                const typeName = getTypeName(param.typeAnnotation.typeAnnotation);
                if (typeName) {
                    const nonPropsSuffix = hasNonPropsSuffix(typeName);
                    if (nonPropsSuffix) {
                        context.report({
                            node: param.typeAnnotation.typeAnnotation,
                            messageId: 'usePropsForType',
                            data: { typeSuffix: nonPropsSuffix },
                            fix: (fixer) => fixTypeName(fixer, param.typeAnnotation.typeAnnotation, typeName, nonPropsSuffix),
                        });
                    }
                }
            }
        }
        // Check type definitions
        function checkTypeDefinition(node) {
            if (!node.id || !node.id.name) {
                return;
            }
            const typeName = node.id.name;
            const nonPropsSuffix = hasNonPropsSuffix(typeName);
            if (nonPropsSuffix && !isFromExternalLibrary(node)) {
                const baseName = typeName.slice(0, -nonPropsSuffix.length);
                const newTypeName = `${baseName}Props`;
                context.report({
                    node: node.id,
                    messageId: 'usePropsForType',
                    data: { typeSuffix: nonPropsSuffix },
                    fix: (fixer) => {
                        return fixer.replaceText(node.id, newTypeName);
                    },
                });
            }
        }
        return {
            FunctionDeclaration: checkFunctionParams,
            FunctionExpression: checkFunctionParams,
            ArrowFunctionExpression: checkFunctionParams,
            TSMethodSignature: checkFunctionParams,
            MethodDefinition: checkClassConstructor,
            TSTypeAliasDeclaration: checkTypeDefinition,
        };
    },
});
//# sourceMappingURL=enforce-props-argument-name.js.map
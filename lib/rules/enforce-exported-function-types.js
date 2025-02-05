"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceExportedFunctionTypes = void 0;
/* eslint-disable @typescript-eslint/no-empty-function */
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
exports.enforceExportedFunctionTypes = (0, createRule_1.createRule)({
    name: 'enforce-exported-function-types',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce exporting types for function props and return values',
            recommended: 'error',
        },
        schema: [],
        messages: {
            missingExportedType: 'Type {{typeName}} should be exported since it is used in an exported function. Add `export` before the type definition: `export type {{typeName}} = ...`',
            missingExportedReturnType: 'Return type {{typeName}} should be exported since it is used in an exported function. Add `export` before the type definition: `export type {{typeName}} = ...`',
            missingExportedPropsType: 'Props type {{typeName}} should be exported since it is used in an exported React component. Add `export` before the type definition: `export type {{typeName}} = ...`',
        },
    },
    defaultOptions: [],
    create(context) {
        const reportedTypes = new Set();
        function isExported(node) {
            if (!node)
                return false;
            if (node.type === utils_1.AST_NODE_TYPES.ExportNamedDeclaration ||
                node.type === utils_1.AST_NODE_TYPES.ExportDefaultDeclaration) {
                return true;
            }
            const parent = node.parent;
            if (!parent)
                return false;
            if (parent.type === utils_1.AST_NODE_TYPES.ExportNamedDeclaration ||
                parent.type === utils_1.AST_NODE_TYPES.ExportDefaultDeclaration ||
                (parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                    isExported(parent.parent))) {
                return true;
            }
            return false;
        }
        function findTypeParameters(node) {
            // Find all type parameters in scope
            const typeParams = new Set();
            let current = node;
            while (current) {
                // Handle type parameters in function declarations, arrow functions, and variable declarations
                if (current.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                    current.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
                    current.type === utils_1.AST_NODE_TYPES.VariableDeclarator) {
                    if ('typeParameters' in current && current.typeParameters) {
                        current.typeParameters.params.forEach((param) => {
                            if (param.type === utils_1.AST_NODE_TYPES.TSTypeParameter) {
                                typeParams.add(param.name.name);
                            }
                        });
                    }
                }
                current = current.parent;
            }
            return typeParams;
        }
        function getTypeNames(node, typeParams) {
            if (!node)
                return [];
            // Initialize type parameters if not provided
            if (!typeParams) {
                typeParams = findTypeParameters(node);
            }
            switch (node.type) {
                case utils_1.AST_NODE_TYPES.TSTypeReference:
                    if (node.typeName.type === utils_1.AST_NODE_TYPES.Identifier) {
                        // Skip checking generic type parameters (e.g., T in <T extends DocumentData>)
                        if (typeParams.has(node.typeName.name))
                            return [];
                        const names = [node.typeName.name];
                        // For generic types like AuthenticatedRequest<Params>, check type arguments
                        if ('typeParameters' in node && node.typeParameters) {
                            node.typeParameters.params.forEach((param) => {
                                names.push(...getTypeNames(param, typeParams));
                            });
                        }
                        return names;
                    }
                    break;
                case utils_1.AST_NODE_TYPES.TSTypeLiteral:
                    return ['AnonymousType'];
            }
            return [];
        }
        function isBuiltInType(typeName) {
            const builtInTypes = new Set([
                'string',
                'number',
                'boolean',
                'null',
                'undefined',
                'void',
                'any',
                'never',
                'unknown',
                'object',
                'Date',
                'RegExp',
                'Error',
                'Promise',
                'Array',
                'Function',
                'Symbol',
                'BigInt',
                'Map',
                'Set',
                'WeakMap',
                'WeakSet',
            ]);
            return builtInTypes.has(typeName);
        }
        function checkAndReportType(node, parentNode, messageId) {
            const typeNames = getTypeNames(node);
            for (const typeName of typeNames) {
                if (typeName !== 'AnonymousType' &&
                    !isBuiltInType(typeName) &&
                    !isTypeExported(typeName)) {
                    // Check if we've already reported this type
                    const key = `${typeName}-${parentNode.loc?.start.line}-${parentNode.loc?.start.column}`;
                    if (!reportedTypes.has(key)) {
                        reportedTypes.add(key);
                        context.report({
                            node: parentNode,
                            messageId,
                            data: { typeName },
                        });
                    }
                }
            }
        }
        function isTypeExported(typeName) {
            const sourceCode = context.getSourceCode();
            const program = sourceCode.ast;
            // Check for imported types first - if found, return true immediately
            // since imported types are already available to consumers
            const hasImportedType = program.body.some((node) => {
                if (node.type === utils_1.AST_NODE_TYPES.ImportDeclaration) {
                    return node.specifiers.some((specifier) => specifier.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                        specifier.local.name === typeName);
                }
                return false;
            });
            if (hasImportedType) {
                return true;
            }
            // Check for exported type declarations
            const exportedTypes = program.body.filter((node) => {
                if (node.type === utils_1.AST_NODE_TYPES.ExportNamedDeclaration) {
                    if (node.declaration?.type === utils_1.AST_NODE_TYPES.TSTypeAliasDeclaration) {
                        return node.declaration.id.name === typeName;
                    }
                    if (node.declaration?.type === utils_1.AST_NODE_TYPES.TSInterfaceDeclaration) {
                        return node.declaration.id.name === typeName;
                    }
                }
                return false;
            });
            if (exportedTypes.length > 0) {
                return true;
            }
            // Check for type aliases in the current scope
            const scope = context.getScope();
            const variable = scope.variables.find((v) => v.name === typeName);
            if (!variable)
                return false;
            const def = variable.defs[0];
            if (!def)
                return false;
            // Check if the type is directly exported
            if (isExported(def.node))
                return true;
            // Check if the type is part of an export declaration
            const parent = def.node.parent;
            if (!parent)
                return false;
            // Handle type aliases in export declarations
            if (parent.type === utils_1.AST_NODE_TYPES.ExportNamedDeclaration) {
                return true;
            }
            // Handle type aliases in variable declarations
            if (parent.type === utils_1.AST_NODE_TYPES.TSTypeAliasDeclaration) {
                if (parent.parent?.type === utils_1.AST_NODE_TYPES.ExportNamedDeclaration) {
                    return true;
                }
            }
            // Handle type aliases in interface declarations
            if (parent.type === utils_1.AST_NODE_TYPES.TSInterfaceDeclaration) {
                if (parent.parent?.type === utils_1.AST_NODE_TYPES.ExportNamedDeclaration) {
                    return true;
                }
            }
            return false;
        }
        return {
            FunctionDeclaration(node) {
                if (!isExported(node))
                    return;
                // Skip React components
                if (node.id?.name && /^[A-Z]/.test(node.id.name))
                    return;
                // Check return type
                if (node.returnType?.typeAnnotation) {
                    checkAndReportType(node.returnType.typeAnnotation, node.returnType, 'missingExportedReturnType');
                }
                // Check parameter types
                node.params.forEach((param) => {
                    if (param.type === utils_1.AST_NODE_TYPES.Identifier &&
                        param.typeAnnotation) {
                        checkAndReportType(param.typeAnnotation.typeAnnotation, param.typeAnnotation, 'missingExportedType');
                    }
                });
            },
            'VariableDeclarator > ArrowFunctionExpression'(node) {
                if (!node.parent?.parent || !isExported(node.parent.parent))
                    return;
                // Skip React components
                if (node.parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                    node.parent.id.type === utils_1.AST_NODE_TYPES.Identifier &&
                    /^[A-Z]/.test(node.parent.id.name))
                    return;
                // Check return type
                if (node.returnType?.typeAnnotation) {
                    checkAndReportType(node.returnType.typeAnnotation, node.returnType, 'missingExportedReturnType');
                }
                // Check parameter types
                node.params.forEach((param) => {
                    if (param.type === utils_1.AST_NODE_TYPES.Identifier &&
                        param.typeAnnotation) {
                        checkAndReportType(param.typeAnnotation.typeAnnotation, param.typeAnnotation, 'missingExportedType');
                    }
                });
            },
            // Handle React components
            'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation]'(node) {
                if (!isExported(node.parent))
                    return;
                // Check props parameter
                if (node.typeAnnotation) {
                    checkAndReportType(node.typeAnnotation.typeAnnotation, node.typeAnnotation, 'missingExportedPropsType');
                }
            },
            // Skip type checking for React components since we handle them separately
            'FunctionDeclaration[id.name=/^[A-Z]/] > TSTypeAnnotation'() { },
            'FunctionDeclaration[id.name=/^[A-Z]/] > TSTypeAnnotation > TSTypeReference'() { },
            'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > TSTypeAnnotation'() { },
            'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > TSTypeAnnotation > TSTypeReference'() { },
            'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation'() { },
            'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation'() { },
            'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference'() { },
            'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference'() { },
            'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > Identifier'() { },
            'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > Identifier'() { },
            'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName'() { },
            'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName'() { },
            'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > Identifier'() { },
            'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > Identifier'() { },
            'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName'() { },
            'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName'() { },
            'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > Identifier'() { },
            'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > Identifier'() { },
            'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName'() { },
            'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName'() { },
            'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > Identifier'() { },
            'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > Identifier'() { },
            'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName'() { },
            'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName'() { },
            'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName > Identifier'() { },
            'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName > Identifier'() { },
            'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName'() { },
            'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName'() { },
        };
    },
});
//# sourceMappingURL=enforce-exported-function-types.js.map
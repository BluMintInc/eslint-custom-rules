"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceCallableTypes = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
exports.enforceCallableTypes = (0, createRule_1.createRule)({
    name: 'enforce-callable-types',
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce Params and Response type exports in callable functions',
            recommended: 'error',
        },
        schema: [],
        messages: {
            missingParamsType: 'Missing Params type export in callable function file',
            missingResponseType: 'Missing Response type export in callable function file',
            unusedParamsType: 'Params type is exported but not used in the callable function',
            unusedResponseType: 'Response type is exported but not used in the callable function',
        },
    },
    defaultOptions: [],
    create(context) {
        const filename = context.getFilename();
        // Only apply to .f.ts files in the callable directory
        if (!filename.endsWith('.f.ts') || !filename.includes('/callable/')) {
            return {};
        }
        let hasParamsExport = false;
        let hasResponseExport = false;
        let hasCallableFunction = false;
        let paramsTypeUsed = false;
        let responseTypeUsed = false;
        return {
            // Check for type exports
            ExportNamedDeclaration(node) {
                if (node.declaration?.type === utils_1.AST_NODE_TYPES.TSTypeAliasDeclaration) {
                    const typeName = node.declaration.id.name;
                    if (typeName === 'Params') {
                        hasParamsExport = true;
                    }
                    else if (typeName === 'Response') {
                        hasResponseExport = true;
                    }
                }
            },
            // Check for onCall usage
            CallExpression(node) {
                if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.callee.name === 'onCall') {
                    hasCallableFunction = true;
                }
            },
            // Check for type usage in function parameters and return types
            TSTypeReference(node) {
                if (node.typeName.type === utils_1.AST_NODE_TYPES.Identifier) {
                    if (node.typeName.name === 'Params') {
                        paramsTypeUsed = true;
                    }
                    else if (node.typeName.name === 'Response') {
                        responseTypeUsed = true;
                    }
                }
            },
            'Program:exit'() {
                if (!hasCallableFunction) {
                    return;
                }
                if (!hasParamsExport) {
                    context.report({
                        loc: { line: 1, column: 0 },
                        messageId: 'missingParamsType',
                    });
                }
                else if (!paramsTypeUsed) {
                    context.report({
                        loc: { line: 1, column: 0 },
                        messageId: 'unusedParamsType',
                    });
                }
                if (!hasResponseExport) {
                    context.report({
                        loc: { line: 1, column: 0 },
                        messageId: 'missingResponseType',
                    });
                }
                else if (!responseTypeUsed) {
                    context.report({
                        loc: { line: 1, column: 0 },
                        messageId: 'unusedResponseType',
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-callable-types.js.map
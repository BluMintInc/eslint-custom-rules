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
            description: 'Enforce Props/Params and Response type exports in callable functions',
            recommended: 'error',
        },
        schema: [],
        messages: {
            missingParamsPropsType: 'Missing Props or Params type export in callable function file',
            missingResponseType: 'Missing Response type export in callable function file',
            unusedParamsPropsType: 'Props or Params type is exported but not used in the callable function',
            unusedResponseType: 'Response type is exported but not used in the callable function',
        },
    },
    defaultOptions: [],
    create(context) {
        const filename = context.getFilename();
        // Only apply to .f.ts files in the callable directory, but ignore scripts directory
        if (!filename.endsWith('.f.ts') ||
            !filename.includes('/callable/') ||
            filename.includes('/callable/scripts/')) {
            return {};
        }
        let hasParamsOrPropsExport = false;
        let hasResponseExport = false;
        let hasCallableFunction = false;
        let paramsOrPropsTypeUsed = false;
        let responseTypeUsed = false;
        return {
            // Check for type exports
            ExportNamedDeclaration(node) {
                if (node.declaration?.type === utils_1.AST_NODE_TYPES.TSTypeAliasDeclaration) {
                    const typeName = node.declaration.id.name;
                    if (typeName === 'Params' || typeName === 'Props') {
                        hasParamsOrPropsExport = true;
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
                    if (node.typeName.name === 'Params' || node.typeName.name === 'Props') {
                        paramsOrPropsTypeUsed = true;
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
                if (!hasParamsOrPropsExport) {
                    context.report({
                        loc: { line: 1, column: 0 },
                        messageId: 'missingParamsPropsType',
                    });
                }
                else if (!paramsOrPropsTypeUsed) {
                    context.report({
                        loc: { line: 1, column: 0 },
                        messageId: 'unusedParamsPropsType',
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

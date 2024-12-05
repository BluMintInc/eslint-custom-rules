"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractGlobalConstants = void 0;
const ASTHelpers_1 = require("../utils/ASTHelpers");
const createRule_1 = require("../utils/createRule");
exports.extractGlobalConstants = (0, createRule_1.createRule)({
    create(context) {
        return {
            VariableDeclaration(node) {
                if (node.kind !== 'const') {
                    return;
                }
                const scope = context.getScope();
                const hasDependencies = node.declarations.some((declaration) => declaration.init &&
                    ASTHelpers_1.ASTHelpers.declarationIncludesIdentifier(declaration.init));
                if (!hasDependencies &&
                    (scope.type === 'function' || scope.type === 'block')) {
                    const constName = node.declarations[0].id.name;
                    context.report({
                        node,
                        messageId: 'extractGlobalConstants',
                        data: {
                            declarationName: constName,
                        },
                    });
                }
            },
            FunctionDeclaration(node) {
                if (node.parent &&
                    (node.parent.type === 'FunctionDeclaration' ||
                        node.parent.type === 'FunctionExpression' ||
                        node.parent.type === 'ArrowFunctionExpression')) {
                    const scope = context.getScope();
                    const hasDependencies = ASTHelpers_1.ASTHelpers.blockIncludesIdentifier(node.body);
                    if (!hasDependencies && scope.type === 'function') {
                        const funcName = node.id.name;
                        context.report({
                            node,
                            messageId: 'extractGlobalConstants',
                            data: {
                                declarationName: funcName,
                            },
                        });
                    }
                }
            },
        };
    },
    name: 'extract-global-constants',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Extract constants/functions to the global scope when possible',
            recommended: 'error',
        },
        schema: [],
        messages: {
            extractGlobalConstants: 'Move this declaration {{ declarationName }} to the global scope and rename it to UPPER_SNAKE_CASE if necessary.',
        },
    },
    defaultOptions: [],
});
//# sourceMappingURL=extract-global-constants.js.map
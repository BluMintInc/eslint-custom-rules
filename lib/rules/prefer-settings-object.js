"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferSettingsObject = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const defaultOptions = {
    minimumParameters: 3,
    checkSameTypeParameters: true,
    ignoreBoundMethods: true,
    ignoreVariadicFunctions: true,
};
exports.preferSettingsObject = (0, createRule_1.createRule)({
    name: 'prefer-settings-object',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce using a settings object for functions with multiple parameters',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [
            {
                type: 'object',
                properties: {
                    minimumParameters: {
                        type: 'number',
                        minimum: 2,
                    },
                    checkSameTypeParameters: {
                        type: 'boolean',
                    },
                    ignoreBoundMethods: {
                        type: 'boolean',
                    },
                    ignoreVariadicFunctions: {
                        type: 'boolean',
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            tooManyParams: 'Function has too many parameters ({{count}}). Use a settings object instead.',
            sameTypeParams: 'Function has multiple parameters of the same type. Use a settings object instead.',
        },
    },
    defaultOptions: [defaultOptions],
    create(context, [options]) {
        const finalOptions = { ...defaultOptions, ...options };
        function getParameterType(param) {
            if (param.type === utils_1.AST_NODE_TYPES.Identifier && param.typeAnnotation) {
                const typeNode = param.typeAnnotation.typeAnnotation;
                if (typeNode.type === utils_1.AST_NODE_TYPES.TSTypeReference) {
                    return typeNode.typeName.type === utils_1.AST_NODE_TYPES.Identifier
                        ? typeNode.typeName.name
                        : 'unknown';
                }
                return typeNode.type;
            }
            return 'unknown';
        }
        function hasSameTypeParameters(params) {
            const typeMap = new Map();
            for (const param of params) {
                const type = getParameterType(param);
                typeMap.set(type, (typeMap.get(type) || 0) + 1);
                if (typeMap.get(type) > 1) {
                    return true;
                }
            }
            return false;
        }
        function shouldIgnoreNode(node) {
            // Ignore variadic functions if configured
            if (finalOptions.ignoreVariadicFunctions) {
                const hasRestParam = node.type === utils_1.AST_NODE_TYPES.FunctionDeclaration &&
                    node.params.some(param => param.type === utils_1.AST_NODE_TYPES.RestElement);
                if (hasRestParam)
                    return true;
            }
            // Ignore bound methods if configured
            if (finalOptions.ignoreBoundMethods) {
                let parent = node.parent;
                while (parent) {
                    if (parent.type === utils_1.AST_NODE_TYPES.CallExpression ||
                        parent.type === utils_1.AST_NODE_TYPES.TSCallSignatureDeclaration) {
                        return true;
                    }
                    parent = parent.parent;
                }
            }
            return false;
        }
        function checkFunction(node) {
            if (shouldIgnoreNode(node))
                return;
            const params = node.params;
            // Check for too many parameters
            const minParams = finalOptions.minimumParameters !== undefined
                ? finalOptions.minimumParameters
                : defaultOptions.minimumParameters;
            if (params.length >= minParams) {
                context.report({
                    node,
                    messageId: 'tooManyParams',
                    data: { count: params.length },
                });
                return;
            }
            // Check for same type parameters if enabled
            if (finalOptions.checkSameTypeParameters && params.length >= 2) {
                if (hasSameTypeParameters(params)) {
                    context.report({
                        node,
                        messageId: 'sameTypeParams',
                    });
                }
            }
        }
        return {
            FunctionDeclaration: checkFunction,
            FunctionExpression: checkFunction,
            ArrowFunctionExpression: checkFunction,
            TSMethodSignature: checkFunction,
            TSFunctionType: checkFunction,
        };
    },
});
//# sourceMappingURL=prefer-settings-object.js.map
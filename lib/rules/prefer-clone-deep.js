"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferCloneDeep = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
exports.preferCloneDeep = (0, createRule_1.createRule)({
    name: 'prefer-clone-deep',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Prefer using cloneDeep over nested spread copying',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            preferCloneDeep: 'Use cloneDeep from functions/src/util/cloneDeep.ts instead of nested spread operators for deep object copying',
        },
    },
    defaultOptions: [],
    create(context) {
        function hasNestedSpread(node) {
            let spreadCount = 0;
            let hasFunction = false;
            let hasSymbol = false;
            function visit(node) {
                if (node.type === utils_1.AST_NODE_TYPES.SpreadElement) {
                    spreadCount++;
                }
                else if (node.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                    node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
                    hasFunction = true;
                }
                else if (node.type === utils_1.AST_NODE_TYPES.Property &&
                    node.computed &&
                    node.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.key.name === 'Symbol') {
                    hasSymbol = true;
                }
                for (const key in node) {
                    const value = node[key];
                    if (value && typeof value === 'object') {
                        visit(value);
                    }
                }
            }
            visit(node);
            return spreadCount > 1 && !hasFunction && !hasSymbol;
        }
        function getSourceText(node) {
            return context.getSourceCode().getText(node);
        }
        function generateCloneDeepFix(node) {
            const sourceText = getSourceText(node);
            return `cloneDeep(${sourceText.replace(/\.\.\./g, '')}, {} as const)`;
        }
        return {
            ObjectExpression(node) {
                if (hasNestedSpread(node)) {
                    context.report({
                        node,
                        messageId: 'preferCloneDeep',
                        fix(fixer) {
                            return fixer.replaceText(node, generateCloneDeepFix(node));
                        },
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=prefer-clone-deep.js.map
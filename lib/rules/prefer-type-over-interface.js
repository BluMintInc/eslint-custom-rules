"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferTypeOverInterface = void 0;
const createRule_1 = require("../utils/createRule");
exports.preferTypeOverInterface = (0, createRule_1.createRule)({
    name: 'prefer-type-over-interface',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Prefer using type alias over interface',
            recommended: 'warn',
        },
        schema: [],
        messages: {
            preferType: 'Prefer using type alias over interface.',
        },
        fixable: 'code',
    },
    defaultOptions: [],
    create(context) {
        return {
            TSInterfaceDeclaration(node) {
                context.report({
                    node,
                    messageId: 'preferType',
                    fix(fixer) {
                        const sourceCode = context.getSourceCode();
                        const openingBrace = sourceCode.getTokenAfter(node.id, {
                            filter: (token) => token.value === '{',
                        });
                        const fixes = [
                            fixer.replaceTextRange([node.range[0], node.id.range[1]], `type ${node.id.name} =`),
                        ];
                        if (node.extends && node.extends.length > 0 && openingBrace) {
                            const extendsKeyword = sourceCode.getFirstTokenBetween(node.id, openingBrace, { filter: (token) => token.value === 'extends' });
                            fixes.push(fixer.remove(extendsKeyword), fixer.insertTextBefore(openingBrace, '& '));
                        }
                        return fixes;
                    },
                });
            },
        };
    },
});
//# sourceMappingURL=prefer-type-over-interface.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noUselessFragment = void 0;
exports.noUselessFragment = {
    create(context) {
        return {
            JSXFragment(node) {
                if (node.children.length === 1) {
                    context.report({
                        node,
                        messageId: 'noUselessFragment',
                        fix(fixer) {
                            const sourceCode = context.getSourceCode();
                            const openingFragment = sourceCode.getFirstToken(node);
                            const closingFragment = sourceCode.getLastToken(node);
                            return [
                                fixer.removeRange([
                                    openingFragment.range[0],
                                    openingFragment.range[0] + 2,
                                ]),
                                fixer.removeRange([
                                    closingFragment.range[0] - 3,
                                    closingFragment.range[0],
                                ]),
                            ];
                        },
                    });
                }
            },
        };
    },
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Prevent unnecessary use of React fragments',
            recommended: 'warn',
        },
        messages: {
            noUselessFragment: 'React fragment is unnecessary when wrapping a single child',
        },
        schema: [],
        fixable: 'code',
    },
    defaultOptions: [],
};
//# sourceMappingURL=no-useless-fragment.js.map
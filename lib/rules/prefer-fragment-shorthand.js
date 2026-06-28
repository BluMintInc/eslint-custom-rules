"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferFragmentShorthand = void 0;
exports.preferFragmentShorthand = {
    create(context) {
        return {
            JSXElement(node) {
                const openingElement = node.openingElement;
                if (openingElement.name.type === 'JSXMemberExpression' &&
                    openingElement.name.object.type === 'JSXIdentifier' &&
                    openingElement.name.object.name === 'React' &&
                    openingElement.name.property.type === 'JSXIdentifier' &&
                    openingElement.name.property.name === 'Fragment') {
                    context.report({
                        node,
                        messageId: 'preferShorthand',
                        data: { fragmentName: 'React.Fragment' },
                        fix: (fixer) => [
                            fixer.replaceTextRange(openingElement.range, '<>'),
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            fixer.replaceTextRange(node.closingElement.range, '</>'),
                        ],
                    });
                }
            },
        };
    },
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Prefer <> shorthand for <React.Fragment>',
            recommended: 'error',
        },
        messages: {
            preferShorthand: 'Fragment "{{fragmentName}}" is written with the long <React.Fragment> syntax. That form adds React namespace noise and is only necessary when you need a key or other attributes on the fragment. Prefer the <>...</> shorthand to keep JSX concise, and keep the long form only when fragment attributes are required.',
        },
        schema: [],
        fixable: 'code',
    },
    defaultOptions: [],
};
//# sourceMappingURL=prefer-fragment-shorthand.js.map
"use strict";
const createRule_1 = require("../utils/createRule");
module.exports = (0, createRule_1.createRule)({
    name: 'require-image-optimized',
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce using ImageOptimized component instead of next/image or img tags',
            recommended: 'error',
            requiresTypeChecking: false,
        },
        fixable: 'code',
        schema: [
            {
                type: 'object',
                properties: {
                    componentPath: {
                        type: 'string',
                        description: 'The import path for the ImageOptimized component',
                        default: 'src/components/image/ImageOptimized',
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            useImageOptimized: 'Use ImageOptimized from {{ componentPath }} instead of {{ component }}. The shared wrapper handles responsive sizing, lazy loading, and blur placeholders so images stay optimized and do not hurt Core Web Vitals. Replace this usage with ImageOptimized to send the asset through the optimization pipeline.',
        },
    },
    defaultOptions: [{ componentPath: 'src/components/image/ImageOptimized' }],
    create(context) {
        const options = context.options[0] || {
            componentPath: 'src/components/image/ImageOptimized',
        };
        const sourceCode = context.getSourceCode();
        return {
            // Handle JSX img elements
            JSXElement(node) {
                if (node.openingElement.name.name === 'img') {
                    context.report({
                        node,
                        messageId: 'useImageOptimized',
                        data: {
                            componentPath: options.componentPath,
                            component: 'img tag',
                        },
                        fix(fixer) {
                            const attributes = node.openingElement.attributes
                                .map((attr) => sourceCode.getText(attr))
                                .join(' ');
                            return fixer.replaceText(node, `<ImageOptimized ${attributes} />`);
                        },
                    });
                }
            },
            // Handle next/image imports and usage
            ImportDeclaration(node) {
                if (node.source.value === 'next/image' && node.specifiers.length > 0) {
                    const imageSpecifier = node.specifiers.find((spec) => (spec.type === 'ImportDefaultSpecifier' ||
                        spec.type === 'ImportSpecifier') &&
                        (spec.local.name === 'Image' || spec.imported?.name === 'Image'));
                    if (imageSpecifier) {
                        const localName = imageSpecifier.local.name;
                        // Report the import
                        context.report({
                            node,
                            messageId: 'useImageOptimized',
                            data: {
                                componentPath: options.componentPath,
                                component: 'next/image',
                            },
                            fix(fixer) {
                                return fixer.replaceText(node, `import ${localName} from '${options.componentPath}';`);
                            },
                        });
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=require-image-optimized.js.map
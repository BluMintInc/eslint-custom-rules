"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noUnpinnedDependencies = void 0;
const createRule_1 = require("../utils/createRule");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
exports.noUnpinnedDependencies = (0, createRule_1.createRule)({
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforces pinned dependencies',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            unexpected: "Dependency '{{ propertyName }}' should be pinned to a specific version, but '{{ version }}' was found.",
        },
    },
    defaultOptions: [],
    name: 'no-unpinned-dependencies',
    create(context) {
        return {
            JSONLiteral(node) {
                const property = node?.parent;
                // const property = node.parent;
                const configSection = node?.parent?.parent?.parent;
                if (!property || !configSection) {
                    return;
                }
                const configKey = configSection?.key;
                if (!configKey) {
                    return;
                }
                // Check if we're in the "dependencies" or "devDependencies" section of package.json
                if (node.type === 'JSONLiteral' &&
                    property?.type === 'JSONProperty' &&
                    (configKey.name === 'devDependencies' ||
                        configKey.value === 'devDependencies' ||
                        configKey.name === 'dependencies' ||
                        configKey.value === 'dependencies')) {
                    // Get the version string
                    const version = node.value;
                    const propertyName = property.key.name ||
                        property.key.value;
                    // Check if the version string starts with a caret (^) or tilde (~), indicating a non-pinned version
                    if (typeof version === 'string' &&
                        (version.includes('^') || version.includes('~'))) {
                        context.report({
                            node: node,
                            messageId: 'unexpected',
                            data: {
                                propertyName,
                                version,
                            },
                            fix: function (fixer) {
                                const fixed = version.replace('^', '').replace('~', '');
                                return fixer.replaceTextRange(node.range, `"${fixed}"`);
                            },
                        });
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=no-unpinned-dependencies.js.map
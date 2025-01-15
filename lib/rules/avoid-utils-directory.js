"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.avoidUtilsDirectory = void 0;
const createRule_1 = require("../utils/createRule");
exports.avoidUtilsDirectory = (0, createRule_1.createRule)({
    name: 'avoid-utils-directory',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce using util/ instead of utils/ directory',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            avoidUtils: 'Use "util/" directory instead of "utils/"',
        },
    },
    defaultOptions: [],
    create(context) {
        return {
            Program(node) {
                const filename = context.getFilename();
                // Skip files in node_modules
                if (filename.includes('node_modules')) {
                    return;
                }
                // Match /utils/ directory (case insensitive) but not as part of another word
                const utilsPattern = /(?:^|\/)utils\/(?!.*\/)/i;
                if (utilsPattern.test(filename)) {
                    context.report({
                        node,
                        messageId: 'avoidUtils',
                        fix() {
                            // We can't provide an auto-fix since directory renaming is beyond ESLint's scope
                            return null;
                        },
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=avoid-utils-directory.js.map
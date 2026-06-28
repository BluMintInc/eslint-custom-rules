"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.avoidUtilsDirectory = void 0;
const path_1 = __importDefault(require("path"));
const createRule_1 = require("../utils/createRule");
exports.avoidUtilsDirectory = (0, createRule_1.createRule)({
    name: 'avoid-utils-directory',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce using util/ instead of utils/ directory',
            recommended: 'error',
        },
        schema: [],
        messages: {
            avoidUtils: 'Path "{{path}}" lives under a "utils/" directory. Generic "utils" folders become grab bags where unrelated helpers accumulate, which makes imports unpredictable and hides ownership. Move this file into a focused "util/" folder (e.g., "util/date" or "util/string") so callers know where to find it and understand its responsibility.',
        },
    },
    defaultOptions: [],
    create(context) {
        return {
            Program(node) {
                const filename = context.getFilename();
                const relativePath = path_1.default.isAbsolute(filename)
                    ? path_1.default.relative(process.cwd(), filename) || filename
                    : filename;
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
                        data: {
                            path: relativePath,
                        },
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=avoid-utils-directory.js.map
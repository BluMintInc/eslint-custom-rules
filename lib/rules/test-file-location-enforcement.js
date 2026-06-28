"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testFileLocationEnforcement = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const createRule_1 = require("../utils/createRule");
const TEST_FILE_PATTERN = /\.test\.tsx?$/i;
const SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
exports.testFileLocationEnforcement = (0, createRule_1.createRule)({
    name: 'test-file-location-enforcement',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce colocating *.test.ts or *.test.tsx files with the code they cover.',
            recommended: 'error',
        },
        schema: [],
        messages: {
            misplacedTestFile: 'Test file "{{testFile}}" is not colocated with its subject. Keep tests in the same directory as {{expectedNames}} so refactors move code and coverage together and engineers can find the implementation without searching separate test folders.',
        },
    },
    defaultOptions: [],
    create(context) {
        return {
            Program(node) {
                const filename = context.getFilename();
                if (filename === '<input>' ||
                    filename === '<text>' ||
                    filename.includes('node_modules') ||
                    !TEST_FILE_PATTERN.test(filename)) {
                    return;
                }
                const directory = path_1.default.dirname(filename);
                const testFileName = path_1.default.basename(filename);
                const baseName = testFileName.replace(TEST_FILE_PATTERN, '');
                const candidates = SUPPORTED_EXTENSIONS.map((extension) => path_1.default.join(directory, `${baseName}${extension}`));
                const hasSibling = candidates.some((candidate) => fs_1.default.existsSync(candidate));
                if (hasSibling) {
                    return;
                }
                const relativePath = path_1.default.isAbsolute(filename)
                    ? path_1.default.relative(process.cwd(), filename) || filename
                    : filename;
                const expectedNames = SUPPORTED_EXTENSIONS.map((extension) => `"${baseName}${extension}"`).join(' or ');
                context.report({
                    node,
                    messageId: 'misplacedTestFile',
                    data: { testFile: relativePath, expectedNames },
                });
            },
        };
    },
});
//# sourceMappingURL=test-file-location-enforcement.js.map
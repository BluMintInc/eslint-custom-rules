"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noMockFirebaseAdmin = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const FIREBASE_ADMIN_PATHS = [
    'firebaseAdmin',
    'config/firebaseAdmin',
    'src/config/firebaseAdmin',
    'functions/src/config/firebaseAdmin',
];
exports.noMockFirebaseAdmin = (0, createRule_1.createRule)({
    name: 'no-mock-firebase-admin',
    meta: {
        type: 'problem',
        docs: {
            description: 'Prevent mocking of functions/src/config/firebaseAdmin',
            recommended: 'error',
        },
        schema: [],
        messages: {
            noMockFirebaseAdmin: 'Do not mock firebaseAdmin directly. Use mockFirestore from __test-utils__/mockFirestore instead.',
        },
    },
    defaultOptions: [],
    create(context) {
        // Check if the current file is a test file
        const filename = context.getFilename();
        const isTestFile = /\.test\.[jt]sx?$/.test(filename) || /\.spec\.[jt]sx?$/.test(filename);
        // If it's not a test file, don't apply the rule
        if (!isTestFile) {
            return {};
        }
        return {
            CallExpression(node) {
                if (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    node.callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.callee.object.name === 'jest' &&
                    node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.callee.property.name === 'mock' &&
                    node.arguments.length > 0 &&
                    (node.arguments[0].type === utils_1.AST_NODE_TYPES.Literal ||
                        node.arguments[0].type === utils_1.AST_NODE_TYPES.TemplateLiteral)) {
                    let mockPath = '';
                    if (node.arguments[0].type === utils_1.AST_NODE_TYPES.TemplateLiteral) {
                        mockPath = node.arguments[0].quasis[0].value.raw;
                    }
                    else if (node.arguments[0].type === utils_1.AST_NODE_TYPES.Literal) {
                        mockPath = String(node.arguments[0].value);
                    }
                    const isFirebaseAdminMock = FIREBASE_ADMIN_PATHS.some(path => mockPath.endsWith(path) && !mockPath.endsWith('Helper') && !mockPath.endsWith('utils') && !mockPath.endsWith('test') && !mockPath.endsWith('mock') && !mockPath.endsWith('jest-mock'));
                    if (isFirebaseAdminMock) {
                        context.report({
                            node,
                            messageId: 'noMockFirebaseAdmin',
                        });
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=no-mock-firebase-admin.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceFirestoreMock = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const FIRESTORE_PATHS = [
    'functions/src/config/firebaseAdmin',
    'firebase-admin',
    'firebase-admin/firestore',
];
exports.enforceFirestoreMock = (0, createRule_1.createRule)({
    name: 'enforce-mock-firestore',
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce using the standardized mockFirestore utility instead of manual Firestore mocking or third-party mocks. This ensures consistent test behavior across the codebase, reduces boilerplate, and provides type-safe mocking of Firestore operations.',
            recommended: 'error',
        },
        schema: [],
        messages: {
            noManualFirestoreMock: 'Use mockFirestore from __test-utils__/mockFirestore instead of manually mocking Firestore. Replace `jest.mock("firebase-admin", () => ({ firestore: () => ({ /* mock */ }) }))` with `import { mockFirestore } from "__test-utils__/mockFirestore"; jest.mock("firebase-admin", () => mockFirestore)`.',
            noMockFirebase: 'Use mockFirestore from __test-utils__/mockFirestore instead of mockFirebase. Replace `import { mockFirebase } from "firestore-jest-mock"` with `import { mockFirestore } from "__test-utils__/mockFirestore"`.',
        },
    },
    defaultOptions: [],
    create(context) {
        return {
            // Detect jest.mock() calls for firebaseAdmin
            CallExpression(node) {
                const moduleArg = node.arguments[0];
                if (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    node.callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.callee.object.name === 'jest' &&
                    node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.callee.property.name === 'mock' &&
                    node.arguments.length > 0 &&
                    moduleArg?.type === utils_1.AST_NODE_TYPES.Literal &&
                    typeof moduleArg.value === 'string' &&
                    FIRESTORE_PATHS.some((path) => typeof moduleArg.value === 'string' &&
                        (moduleArg.value === path || moduleArg.value.endsWith(`/${path}`)))) {
                    // Check if the mock includes Firestore-related properties
                    const mockFn = node.arguments[1];
                    if (mockFn &&
                        (mockFn.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                            mockFn.type === utils_1.AST_NODE_TYPES.FunctionExpression)) {
                        const returnStmt = mockFn.body.type === utils_1.AST_NODE_TYPES.ObjectExpression
                            ? mockFn.body
                            : mockFn.body.type === utils_1.AST_NODE_TYPES.BlockStatement
                                ? (mockFn.body.body.find((statement) => statement.type === utils_1.AST_NODE_TYPES.ReturnStatement && !!statement.argument)?.argument ?? null)
                                : null;
                        if (returnStmt &&
                            returnStmt.type === utils_1.AST_NODE_TYPES.ObjectExpression &&
                            returnStmt.properties.some((prop) => prop.type === utils_1.AST_NODE_TYPES.Property &&
                                prop.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                                (prop.key.name === 'db' ||
                                    prop.key.name === 'firestore' ||
                                    prop.key.name === 'getFirestore'))) {
                            context.report({
                                node,
                                messageId: 'noManualFirestoreMock',
                            });
                        }
                    }
                }
            },
            // Detect imports of mockFirebase
            ImportDeclaration(node) {
                if (node.source.type === utils_1.AST_NODE_TYPES.Literal &&
                    node.source.value === 'firestore-jest-mock' &&
                    node.specifiers.some((specifier) => specifier.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                        specifier.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
                        specifier.imported.name === 'mockFirebase')) {
                    context.report({
                        node,
                        messageId: 'noMockFirebase',
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-mock-firestore.js.map
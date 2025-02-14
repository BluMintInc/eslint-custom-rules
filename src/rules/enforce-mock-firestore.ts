import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noManualFirestoreMock' | 'noMockFirebase';

const FIRESTORE_PATHS = [
  'functions/src/config/firebaseAdmin',
  'firebase-admin',
  'firebase-admin/firestore',
];

export const enforceFirestoreMock = createRule<[], MessageIds>({
  name: 'enforce-mock-firestore',
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce using the standardized mockFirestore utility instead of manual Firestore mocking or third-party mocks. This ensures consistent test behavior across the codebase, reduces boilerplate, and provides type-safe mocking of Firestore operations.',
      recommended: 'error',
    },
    schema: [],
    messages: {
      noManualFirestoreMock:
        'Use mockFirestore from __test-utils__/mockFirestore instead of manually mocking Firestore. Replace `jest.mock("firebase-admin", () => ({ firestore: () => ({ /* mock */ }) }))` with `import { mockFirestore } from "__test-utils__/mockFirestore"; jest.mock("firebase-admin", () => mockFirestore)`.',
      noMockFirebase:
        'Use mockFirestore from __test-utils__/mockFirestore instead of mockFirebase. Replace `import { mockFirebase } from "firestore-jest-mock"` with `import { mockFirestore } from "__test-utils__/mockFirestore"`.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      // Detect jest.mock() calls for firebaseAdmin
      CallExpression(node) {
        if (
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.object.type === AST_NODE_TYPES.Identifier &&
          node.callee.object.name === 'jest' &&
          node.callee.property.type === AST_NODE_TYPES.Identifier &&
          node.callee.property.name === 'mock' &&
          node.arguments.length > 0 &&
          node.arguments[0].type === AST_NODE_TYPES.Literal &&
          typeof node.arguments[0].value === 'string' &&
          FIRESTORE_PATHS.some(
            (path) =>
              node.arguments[0].type === AST_NODE_TYPES.Literal &&
              typeof node.arguments[0].value === 'string' &&
              node.arguments[0].value?.includes(path),
          )
        ) {
          // Check if the mock includes Firestore-related properties
          const mockFn = node.arguments[1];
          if (
            mockFn &&
            mockFn.type === AST_NODE_TYPES.ArrowFunctionExpression
          ) {
            const returnStmt = mockFn.body;
            if (
              returnStmt.type === AST_NODE_TYPES.ObjectExpression &&
              returnStmt.properties.some(
                (prop) =>
                  prop.type === AST_NODE_TYPES.Property &&
                  prop.key.type === AST_NODE_TYPES.Identifier &&
                  (prop.key.name === 'db' ||
                    prop.key.name === 'firestore' ||
                    prop.key.name === 'getFirestore'),
              )
            ) {
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
        if (
          node.source.type === AST_NODE_TYPES.Literal &&
          node.source.value === 'firestore-jest-mock' &&
          node.specifiers.some(
            (specifier) =>
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.imported.type === AST_NODE_TYPES.Identifier &&
              specifier.imported.name === 'mockFirebase',
          )
        ) {
          context.report({
            node,
            messageId: 'noMockFirebase',
          });
        }
      },
    };
  },
});

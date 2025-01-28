import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noManualFirestoreMock' | 'noMockFirebase';

const FIRESTORE_ADMIN_PATH = 'functions/src/config/firebaseAdmin';

export const enforceFirestoreMock = createRule<[], MessageIds>({
  name: 'enforce-mock-firestore',
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce using mockFirestore over manual Firestore mocking',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      noManualFirestoreMock: 'Use mockFirestore from __mocks__/functions/src/config/mockFirestore instead of manually mocking Firestore',
      noMockFirebase: 'Use mockFirestore from __mocks__/functions/src/config/mockFirestore instead of mockFirebase',
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
          node.arguments[0].value.includes(FIRESTORE_ADMIN_PATH)
        ) {
          // Check if the mock includes Firestore-related properties
          const mockFn = node.arguments[1];
          if (mockFn && mockFn.type === AST_NODE_TYPES.ArrowFunctionExpression) {
            const returnStmt = mockFn.body;
            if (
              returnStmt.type === AST_NODE_TYPES.ObjectExpression &&
              returnStmt.properties.some(
                (prop) =>
                  prop.type === AST_NODE_TYPES.Property &&
                  prop.key.type === AST_NODE_TYPES.Identifier &&
                  (prop.key.name === 'db' || prop.key.name === 'firestore')
              )
            ) {
              context.report({
                node,
                messageId: 'noManualFirestoreMock',
                fix(fixer) {
                  return fixer.replaceText(
                    node,
                    'mockFirestore({\n          // TODO: Add your mock data here\n        })'
                  );
                },
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
              specifier.imported.name === 'mockFirebase'
          )
        ) {
          context.report({
            node,
            messageId: 'noMockFirebase',
            fix(fixer) {
              return fixer.replaceText(
                node,
                'import { mockFirestore } from \'__mocks__/functions/src/config/mockFirestore\';'
              );
            },
          });
        }
      },
    };
  },
});

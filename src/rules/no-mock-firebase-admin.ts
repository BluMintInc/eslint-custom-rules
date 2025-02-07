import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noMockFirebaseAdmin';

const FIREBASE_ADMIN_PATHS = [
  '../../config/firebaseAdmin',
  '../config/firebaseAdmin',
  './config/firebaseAdmin',
  'functions/src/config/firebaseAdmin',
];

export const noMockFirebaseAdmin = createRule<[], MessageIds>({
  name: 'no-mock-firebase-admin',
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent mocking of functions/src/config/firebaseAdmin',
      recommended: 'error',
    },
    schema: [],
    messages: {
      noMockFirebaseAdmin:
        'Do not mock firebaseAdmin directly. Use mockFirestore from __mocks__/functions/src/config/mockFirestore instead.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.object.type === AST_NODE_TYPES.Identifier &&
          node.callee.object.name === 'jest' &&
          node.callee.property.type === AST_NODE_TYPES.Identifier &&
          node.callee.property.name === 'mock' &&
          node.arguments.length > 0 &&
          node.arguments[0].type === AST_NODE_TYPES.Literal &&
          typeof node.arguments[0].value === 'string'
        ) {
          const mockPath = node.arguments[0].value;
          const isFirebaseAdminMock = FIREBASE_ADMIN_PATHS.some(path =>
            mockPath.endsWith(path) || mockPath.includes('firebaseAdmin')
          );

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

import path from 'path';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noMockFirebaseAdmin';

const FIREBASE_ADMIN_MODULE = 'firebaseAdmin';
const MODULE_EXTENSION = /\.(?:tsx?|jsx?|mjs|cjs)$/;

/**
 * Backend tier: `jest.setup.node.js` auto-mocks this module repo-wide, so a
 * local `jest.mock()` bypasses the shared stub the rule exists to protect.
 */
const BACKEND_FIREBASE_ADMIN = 'functions/src/config/firebaseAdmin';

/**
 * Frontend tier: a distinct module with no shared mock (no `__mocks__` entry,
 * no `jest.setup.node.js` registration), so nothing is bypassed by mocking it.
 */
const FRONTEND_FIREBASE_ADMIN = 'src/config/firebaseAdmin';

const toPosix = (value: string) => value.replace(/\\/g, '/');

const targetsFirebaseAdmin = (mockPath: string) => {
  const basename = toPosix(mockPath).split('/').pop() ?? '';
  return basename.replace(MODULE_EXTENSION, '') === FIREBASE_ADMIN_MODULE;
};

const comparisonPathOf = (mockPath: string, filename: string) => {
  // Bare and aliased specifiers (`src/config/firebaseAdmin`,
  // `@project/functions/src/config/firebaseAdmin`) are resolved by the module
  // resolver against roots/aliases rather than the importing file, so joining
  // them onto the file's directory would fabricate a path that never exists.
  if (!mockPath.startsWith('.')) {
    return toPosix(mockPath);
  }
  return toPosix(path.resolve(path.dirname(filename), mockPath));
};

const bypassesSharedMock = (comparisonPath: string) => {
  // Backend is tested first because the backend path *contains* the frontend
  // path as a substring; checking frontend first would exempt every backend
  // mock and silently disable the rule.
  if (comparisonPath.includes(BACKEND_FIREBASE_ADMIN)) {
    return true;
  }
  if (comparisonPath.includes(FRONTEND_FIREBASE_ADMIN)) {
    return false;
  }
  // A specifier attributable to neither tier keeps the rule's protection:
  // prefer reporting over silently allowing an unknown layout to shadow a
  // shared mock.
  return true;
};

export const noMockFirebaseAdmin = createRule<[], MessageIds>({
  name: 'no-mock-firebase-admin',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent direct mocking of firebaseAdmin; use shared test helpers instead',
      recommended: 'error',
    },
    schema: [],
    messages: {
      noMockFirebaseAdmin:
        'Do not mock firebaseAdmin module "{{modulePath}}". The project already ships a stable mock in jest.setup.node.js; overriding it creates divergent Firestore/Auth state and brittle test fixtures. Keep the shared mock and use __test-utils__/mockFirestore to seed data instead of replacing the module.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Check if the current file is a test file
    const filename = context.getFilename();
    const isTestFile =
      /\.test\.[jt]sx?$/.test(filename) || /\.spec\.[jt]sx?$/.test(filename);

    // If it's not a test file, don't apply the rule
    if (!isTestFile) {
      return {};
    }

    return {
      CallExpression(node) {
        if (
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.object.type === AST_NODE_TYPES.Identifier &&
          node.callee.object.name === 'jest' &&
          node.callee.property.type === AST_NODE_TYPES.Identifier &&
          node.callee.property.name === 'mock' &&
          node.arguments.length > 0 &&
          (node.arguments[0].type === AST_NODE_TYPES.Literal ||
            node.arguments[0].type === AST_NODE_TYPES.TemplateLiteral)
        ) {
          let mockPath = '';
          if (node.arguments[0].type === AST_NODE_TYPES.TemplateLiteral) {
            // An interpolated specifier names a module only known at runtime:
            // `../../config/firebaseAdmin${env}` targets firebaseAdminStaging,
            // not firebaseAdmin. Reading the leading quasi alone would attribute
            // it to whichever module the static prefix happens to spell.
            if (node.arguments[0].expressions.length > 0) {
              return;
            }
            mockPath = node.arguments[0].quasis[0].value.raw;
          } else if (node.arguments[0].type === AST_NODE_TYPES.Literal) {
            mockPath = String(node.arguments[0].value);
          }

          if (!targetsFirebaseAdmin(mockPath)) {
            return;
          }

          if (!bypassesSharedMock(comparisonPathOf(mockPath, filename))) {
            return;
          }

          context.report({
            node,
            messageId: 'noMockFirebaseAdmin',
            data: {
              modulePath: mockPath,
            },
          });
        }
      },
    };
  },
});

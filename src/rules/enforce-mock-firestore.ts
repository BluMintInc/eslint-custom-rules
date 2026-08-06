import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noManualFirestoreMock' | 'noMockFirebase';

const FIRESTORE_PATHS = [
  'functions/src/config/firebaseAdmin',
  'firebase-admin',
  'firebase-admin/firestore',
];

/**
 * A `jest.mock` factory produces the same module shape whether it is written as
 * a concise arrow, a block-bodied arrow, or a `function` expression. Matching
 * the factory argument itself would only ever see the concise arrow, letting an
 * identical mock evade the rule on a body-form choice alone. Resolving to the
 * produced object keeps every spelling on one matching path.
 *
 * A body with more than a lone `return` is deliberately unresolved: the object
 * reaching the caller can no longer be read off a single expression.
 */
const resolveFactoryReturn = (
  factory: TSESTree.Node | undefined,
): TSESTree.Node | undefined => {
  if (
    !factory ||
    (factory.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
      factory.type !== AST_NODE_TYPES.FunctionExpression)
  ) {
    return undefined;
  }

  // A concise arrow body is the produced expression itself. Parentheses around
  // an object body are not part of the AST, so the node is matched directly.
  if (factory.body.type !== AST_NODE_TYPES.BlockStatement) {
    return factory.body;
  }

  const statements = factory.body.body;
  if (statements.length !== 1) {
    return undefined;
  }

  const [statement] = statements;
  return statement.type === AST_NODE_TYPES.ReturnStatement
    ? statement.argument ?? undefined
    : undefined;
};

export const enforceFirestoreMock = createRule<[], MessageIds>({
  name: 'enforce-mock-firestore',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce using the standardized mockFirestore utility instead of manual Firestore mocking or third-party mocks. This ensures consistent test behavior across the codebase, reduces boilerplate, and provides type-safe mocking of Firestore operations.',
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
          const mockedModule = resolveFactoryReturn(node.arguments[1]);
          if (
            mockedModule &&
            mockedModule.type === AST_NODE_TYPES.ObjectExpression &&
            mockedModule.properties.some(
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

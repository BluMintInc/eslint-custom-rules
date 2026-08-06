import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noManualFirestoreMock' | 'noMockFirebase';

const FIRESTORE_PATHS = [
  'functions/src/config/firebaseAdmin',
  'firebase-admin',
  'firebase-admin/firestore',
];

/**
 * `x as T`, `<T>x`, `x satisfies T` and `x!` assert a type without contributing
 * a value of their own, so a check that classifies the *shape* of an expression
 * must look through all four alike.
 *
 * This matters beyond hand-written code: sibling rules' autofixes append
 * ` as const` to the very objects this rule inspects
 * (`enforce-object-literal-as-const` rewrites
 * `jest.mock(path, () => { return ({ db }); })` into
 * `jest.mock(path, () => { return ({ db } as const); })`). A bare
 * `node.type === ObjectExpression` test taken on the wrapper therefore goes
 * silent on code `eslint --fix` had just reported (Issue #1806).
 */
const ASSERTION_EXPRESSION_TYPES = new Set([
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSTypeAssertion,
]);

type AssertionExpression =
  | TSESTree.TSAsExpression
  | TSESTree.TSSatisfiesExpression
  | TSESTree.TSNonNullExpression
  | TSESTree.TSTypeAssertion;

const isAssertionExpression = (
  node: TSESTree.Node,
): node is AssertionExpression => ASSERTION_EXPRESSION_TYPES.has(node.type);

/**
 * Peels every assertion wrapper off an expression, so `{ db } as const`,
 * `<const>{ db }` and chains such as `{ db } as const satisfies Module` all
 * classify as the object literal they wrap.
 */
const unwrapAssertions = (node: TSESTree.Node): TSESTree.Node => {
  let target: TSESTree.Node = node;
  while (isAssertionExpression(target)) {
    target = target.expression;
  }
  return target;
};

/**
 * A `jest.mock` factory produces the same module shape whether it is written as
 * a concise arrow, a block-bodied arrow, or a `function` expression. Matching
 * the factory argument itself would only ever see the concise arrow, letting an
 * identical mock evade the rule on a body-form choice alone. Resolving to the
 * produced object keeps every spelling on one matching path.
 *
 * Assertions are peeled at both ends — off the factory and off the expression
 * it produces — so every body form is covered by one unwrap rather than only
 * the spelling a bug report happened to quote.
 *
 * A body with more than a lone `return` is deliberately unresolved: the object
 * reaching the caller can no longer be read off a single expression.
 */
const resolveFactoryReturn = (
  factory: TSESTree.Node | undefined,
): TSESTree.Node | undefined => {
  if (!factory) {
    return undefined;
  }

  const callable = unwrapAssertions(factory);
  if (
    callable.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
    callable.type !== AST_NODE_TYPES.FunctionExpression
  ) {
    return undefined;
  }

  // A concise arrow body is the produced expression itself. Parentheses around
  // an object body are not part of the AST, so the node is matched directly.
  if (callable.body.type !== AST_NODE_TYPES.BlockStatement) {
    return unwrapAssertions(callable.body);
  }

  const statements = callable.body.body;
  if (statements.length !== 1) {
    return undefined;
  }

  const [statement] = statements;
  if (
    statement.type !== AST_NODE_TYPES.ReturnStatement ||
    !statement.argument
  ) {
    return undefined;
  }
  return unwrapAssertions(statement.argument);
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
        // `(jest.mock as any)(...)` and `jest!.mock(...)` call the same
        // function, so the callee and its object are read through assertions
        // too. The property name cannot carry one: an assertion there requires
        // computed access, a spelling this rule does not resolve at all.
        const callee = unwrapAssertions(node.callee);
        if (callee.type !== AST_NODE_TYPES.MemberExpression) {
          return;
        }

        const calleeObject = unwrapAssertions(callee.object);
        if (
          calleeObject.type !== AST_NODE_TYPES.Identifier ||
          calleeObject.name !== 'jest' ||
          callee.property.type !== AST_NODE_TYPES.Identifier ||
          callee.property.name !== 'mock' ||
          node.arguments.length === 0
        ) {
          return;
        }

        const modulePath = unwrapAssertions(node.arguments[0]);
        if (modulePath.type !== AST_NODE_TYPES.Literal) {
          return;
        }

        const mockedPath = modulePath.value;
        if (
          typeof mockedPath !== 'string' ||
          !FIRESTORE_PATHS.some((path) => mockedPath.includes(path))
        ) {
          return;
        }

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
      },
      // Detect imports of mockFirebase.
      //
      // No unwrapping applies here: the grammar admits only a bare string
      // literal as an import source and only a bare identifier as an imported
      // name, so neither position can carry an assertion for a fixer to add.
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

import { Linter, Rule } from 'eslint';
import { ruleTesterTs } from '../utils/ruleTester';
import { enforceFirestoreMock } from '../rules/enforce-mock-firestore';
import { enforceObjectLiteralAsConst } from '../rules/enforce-object-literal-as-const';
import globalConstStyle from '../rules/global-const-style';
import { preferUnionFromConstArray } from '../rules/prefer-union-from-const-array';

ruleTesterTs.run('enforce-mock-firestore', enforceFirestoreMock, {
  valid: [
    // Valid use of mockFirestore
    {
      code: `
        import { mockFirestore } from '__test-utils__/mockFirestore';

        mockFirestore({
          users: [{ id: '123', name: 'John Doe' }],
        });
      `,
    },
    // Valid use of mockSet and mockBatchSet
    {
      code: `
        import { mockSet, mockBatchSet } from 'firestore-jest-mock';

        mockSet.mockReturnValue(true);
      `,
    },
    // Valid mock of non-Firestore Firebase features
    {
      code: `
        jest.mock('../../../../functions/src/config/firebaseAdmin', () => ({
          auth: jest.fn(),
        }));
      `,
    },
    // Valid use of mockFirestore with multiple collections
    {
      code: `
        import { mockFirestore } from '__test-utils__/mockFirestore';

        mockFirestore({
          users: [{ id: '123', name: 'John' }],
          posts: [{ id: 'post1', title: 'Hello' }],
        });
      `,
    },
    // Valid use of mockFirestore with nested collections
    {
      code: `
        import { mockFirestore } from '__test-utils__/mockFirestore';

        mockFirestore({
          users: [{
            id: '123',
            name: 'John',
            posts: [{ id: 'post1', title: 'Hello' }],
          }],
        });
      `,
    },
    // Valid use of mockFirestore with empty collections
    {
      code: `
        import { mockFirestore } from '__test-utils__/mockFirestore';

        mockFirestore({
          users: [],
          posts: [],
        });
      `,
    },
    // Valid use of mockSet with complex mocking
    {
      code: `
        import { mockSet } from 'firestore-jest-mock';

        mockSet.mockImplementation((data) => {
          return Promise.resolve({ id: 'new-doc', ...data });
        });
      `,
    },
    // Valid use of mockBatchSet with complex mocking
    {
      code: `
        import { mockBatchSet } from 'firestore-jest-mock';

        mockBatchSet.mockImplementation((operations) => {
          return Promise.resolve(operations.map(op => ({ ...op, success: true })));
        });
      `,
    },
    // Valid mock of firebase-admin without Firestore
    {
      code: `
        jest.mock('firebase-admin', () => ({
          messaging: jest.fn(),
          storage: jest.fn(),
        }));
      `,
    },
    // Firestore-shaped object returned for an unrelated module
    {
      code: `
        jest.mock('../../../../functions/src/config/analytics', () => {
          return { db: { collection: jest.fn() } };
        });
      `,
    },
    // Function expression factory for an unrelated module
    {
      code: `
        jest.mock('./localCache', function () {
          return { firestore: () => ({ collection: jest.fn() }) };
        });
      `,
    },
    // Block-bodied factory whose returned object holds no Firestore keys
    {
      code: `
        jest.mock('firebase-admin', () => {
          return { messaging: jest.fn(), storage: jest.fn() };
        });
      `,
    },
    // Multi-statement factory: the produced object is out of reach
    {
      code: `
        jest.mock('firebase-admin', () => {
          const db = { collection: jest.fn() };
          return { db };
        });
      `,
    },
    // Multi-statement function expression factory
    {
      code: `
        jest.mock('../../../../functions/src/config/firebaseAdmin', function () {
          jest.requireActual('../../../../functions/src/config/firebaseAdmin');
          return { firestore: () => ({ collection: jest.fn() }) };
        });
      `,
    },
    // Factory returning a non-object expression
    {
      code: `
        import { mockFirestore } from '__test-utils__/mockFirestore';

        jest.mock('firebase-admin', () => mockFirestore);
      `,
    },
    // Block-bodied factory returning a non-object expression
    {
      code: `
        import { mockFirestore } from '__test-utils__/mockFirestore';

        jest.mock('firebase-admin', () => {
          return mockFirestore;
        });
      `,
    },
    // Block-bodied factory with a bare return
    {
      code: `
        jest.mock('firebase-admin', () => {
          return;
        });
      `,
    },
    // Empty factory body
    {
      code: `
        jest.mock('firebase-admin', () => {});
      `,
    },
    // jest.mock with no factory at all
    {
      code: `
        jest.mock('firebase-admin');
      `,
    },
    // Factory that is neither an arrow nor a function expression
    {
      code: `
        jest.mock('firebase-admin', firestoreFactory);
      `,
    },
    // An assertion wrapper must not widen WHAT counts as a manual mock: a
    // wrapped object holding no Firestore key is still clean.
    {
      code: `
        jest.mock('firebase-admin', () => ({ messaging: jest.fn() } as const));
      `,
    },
    {
      code: `
        jest.mock('firebase-admin', () => {
          return { auth: jest.fn() } satisfies Record<string, unknown>;
        });
      `,
    },
    // Nor must it widen WHICH module counts: the path is still matched.
    {
      code: `
        jest.mock('./localCache' as const, () => ({ db: { collection: jest.fn() } } as const));
      `,
    },
    // A wrapped non-object return resolves to an identifier, not a mock shape.
    {
      code: `
        import { mockFirestore } from '__test-utils__/mockFirestore';

        jest.mock('firebase-admin', () => mockFirestore as any);
      `,
    },
    // A wrapped multi-statement factory stays out of reach.
    {
      code: `
        jest.mock('firebase-admin', (() => {
          const db = { collection: jest.fn() };
          return { db } as const;
        }) as jest.ModuleFactory);
      `,
    },
  ],
  invalid: [
    // Invalid use of mockFirebase
    {
      code: `
        import { mockFirebase } from 'firestore-jest-mock';

        mockFirebase({
          database: {
            users: [{ id: '123', name: 'John' }],
          },
        });
      `,
      errors: [{ messageId: 'noMockFirebase' }],
    },
    // Invalid manual mock of Firestore
    {
      code: `
        jest.mock('../../../../functions/src/config/firebaseAdmin', () => ({
          db: {
            collection: jest.fn(),
          },
        }));
      `,
      errors: [{ messageId: 'noManualFirestoreMock' }],
    },
    // Invalid manual mock via a block-bodied arrow returning a parenthesized object
    {
      code: `
        jest.mock('../../../../functions/src/config/firebaseAdmin', () => { return ({ db: { collection: jest.fn() } }); });
      `,
      errors: [{ messageId: 'noManualFirestoreMock' }],
    },
    // Invalid manual mock via a block-bodied arrow returning a bare object
    {
      code: `
        jest.mock('../../../../functions/src/config/firebaseAdmin', () => { return { db: { collection: jest.fn() } }; });
      `,
      errors: [{ messageId: 'noManualFirestoreMock' }],
    },
    // Invalid manual mock via a function expression factory
    {
      code: `
        jest.mock('../../../../functions/src/config/firebaseAdmin', function () { return { db: { collection: jest.fn() } }; });
      `,
      errors: [{ messageId: 'noManualFirestoreMock' }],
    },
    // Invalid manual mock of Firestore with firestore property
    {
      code: `
        jest.mock('../../../../functions/src/config/firebaseAdmin', () => ({
          firestore: () => ({
            collection: jest.fn(),
          }),
        }));
      `,
      errors: [{ messageId: 'noManualFirestoreMock' }],
    },
    // Invalid direct mock of firebase-admin with Firestore
    {
      code: `
        jest.mock('firebase-admin', () => ({
          firestore: () => ({
            collection: jest.fn(),
            doc: jest.fn(),
          }),
        }));
      `,
      errors: [{ messageId: 'noManualFirestoreMock' }],
    },
    // Invalid mock of firebase-admin/firestore
    {
      code: `
        jest.mock('firebase-admin/firestore', () => ({
          getFirestore: () => ({
            collection: jest.fn(),
            doc: jest.fn(),
          }),
        }));
      `,
      errors: [{ messageId: 'noManualFirestoreMock' }],
    },
    // Invalid use of mockFirebase with complex setup
    {
      code: `
        import { mockFirebase } from 'firestore-jest-mock';

        mockFirebase({
          database: {
            users: [
              { id: '123', name: 'John', posts: [{ id: 'p1', title: 'Hello' }] },
              { id: '456', name: 'Jane', posts: [{ id: 'p2', title: 'World' }] }
            ],
          },
        });
      `,
      errors: [{ messageId: 'noMockFirebase' }],
    },
    // Invalid manual mock with both db and firestore
    {
      code: `
        jest.mock('../../../../functions/src/config/firebaseAdmin', () => ({
          db: {
            collection: jest.fn(),
          },
          firestore: () => ({
            collection: jest.fn(),
          }),
        }));
      `,
      errors: [{ messageId: 'noManualFirestoreMock' }],
    },
    // Invalid manual mock with Firestore methods
    {
      code: `
        jest.mock('../../../../functions/src/config/firebaseAdmin', () => ({
          firestore: () => ({
            collection: jest.fn(),
            doc: jest.fn(),
            batch: jest.fn(),
            runTransaction: jest.fn(),
          }),
        }));
      `,
      errors: [{ messageId: 'noManualFirestoreMock' }],
    },
    // Every case below repeats a body form the suite already covers, with an
    // assertion wrapper added. `as const`, `satisfies T`, `!` and `<T>` assert a
    // type and contribute no value, so the mock the factory produces is the same
    // manual Firestore mock and the report must be identical. The wrapper is not
    // a hypothetical spelling: `enforce-object-literal-as-const` appends
    // ` as const` to exactly these returned objects by --fix, so a rule blind to
    // it goes silent on code `eslint --fix` had just reported (Issue #1806).

    // The issue's repro: block-bodied arrow returning a parenthesized object.
    {
      code: `
        jest.mock('../../../../functions/src/config/firebaseAdmin', () => { return ({ db: { collection: jest.fn() } } as const); });
      `,
      errors: [{ messageId: 'noManualFirestoreMock' }],
    },
    // Concise arrow body.
    {
      code: `
        jest.mock('../../../../functions/src/config/firebaseAdmin', () => ({
          db: {
            collection: jest.fn(),
          },
        } as const));
      `,
      errors: [{ messageId: 'noManualFirestoreMock' }],
    },
    // Block-bodied arrow returning a bare object.
    {
      code: `
        jest.mock('../../../../functions/src/config/firebaseAdmin', () => { return { db: { collection: jest.fn() } } as const; });
      `,
      errors: [{ messageId: 'noManualFirestoreMock' }],
    },
    // Function expression factory.
    {
      code: `
        jest.mock('../../../../functions/src/config/firebaseAdmin', function () { return { db: { collection: jest.fn() } } as const; });
      `,
      errors: [{ messageId: 'noManualFirestoreMock' }],
    },
    // `satisfies` on a concise body.
    {
      code: `
        jest.mock('firebase-admin', () => ({
          firestore: () => ({ collection: jest.fn() }),
        } satisfies Record<string, unknown>));
      `,
      errors: [{ messageId: 'noManualFirestoreMock' }],
    },
    // `satisfies` on a returned object.
    {
      code: `
        jest.mock('firebase-admin/firestore', function () {
          return { getFirestore: () => ({ collection: jest.fn() }) } satisfies Record<string, unknown>;
        });
      `,
      errors: [{ messageId: 'noManualFirestoreMock' }],
    },
    // Non-null assertion.
    {
      code: `
        jest.mock('firebase-admin', () => ({ firestore: jest.fn() })!);
      `,
      errors: [{ messageId: 'noManualFirestoreMock' }],
    },
    // Angle-bracket assertion.
    {
      code: `
        jest.mock('firebase-admin', () => {
          return <const>{ db: { collection: jest.fn() } };
        });
      `,
      errors: [{ messageId: 'noManualFirestoreMock' }],
    },
    // Chained assertions peel all the way down, not one layer.
    {
      code: `
        jest.mock('../../../../functions/src/config/firebaseAdmin', () => {
          return ({ db: { collection: jest.fn() } } as const satisfies Record<string, unknown>);
        });
      `,
      errors: [{ messageId: 'noManualFirestoreMock' }],
    },
    // The factory itself wrapped: the body form underneath is still resolved.
    {
      code: `
        jest.mock('../../../../functions/src/config/firebaseAdmin', (() => ({ db: { collection: jest.fn() } })) as jest.ModuleFactory);
      `,
      errors: [{ messageId: 'noManualFirestoreMock' }],
    },
    // A wrapped factory AND a wrapped return, together.
    {
      code: `
        jest.mock('firebase-admin', (function () {
          return { firestore: () => ({ collection: jest.fn() }) } as const;
        })!);
      `,
      errors: [{ messageId: 'noManualFirestoreMock' }],
    },
    // The module path carrying an assertion.
    {
      code: `
        jest.mock('firebase-admin' as const, () => ({ db: { collection: jest.fn() } } as const));
      `,
      errors: [{ messageId: 'noManualFirestoreMock' }],
    },
    // `jest` itself asserted at the call site.
    {
      code: `
        (jest as any).mock('firebase-admin', () => ({ db: { collection: jest.fn() } } as const));
      `,
      errors: [{ messageId: 'noManualFirestoreMock' }],
    },
    // The whole `jest.mock` callee asserted.
    {
      code: `
        (jest.mock as any)('firebase-admin', () => ({ db: { collection: jest.fn() } }));
      `,
      errors: [{ messageId: 'noManualFirestoreMock' }],
    },
  ],
});

/**
 * The reachability half of Issue #1806: the wrapper is not hand-written, it is
 * what the plugin's OWN `--fix` leaves behind. A rule blind to it stops
 * reporting a violation `eslint --fix` had just reported, on code the fixer
 * itself produced.
 *
 * The shipped fix-closure guard counts reports a fixer INTRODUCES, so it is
 * structurally blind to one a fixer removes; this pins the deletion direction
 * for the pair.
 */
describe('enforce-mock-firestore composed with the as-const-appending fixers', () => {
  const MOCK_FIRESTORE_ID = '@blumintinc/blumint/enforce-mock-firestore';
  const CULPRITS = {
    '@blumintinc/blumint/enforce-object-literal-as-const':
      enforceObjectLiteralAsConst,
    '@blumintinc/blumint/global-const-style': globalConstStyle,
    '@blumintinc/blumint/prefer-union-from-const-array':
      preferUnionFromConstArray,
  } as const;
  const FILENAME = 'src/util/firestore.test.ts';

  const makeLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      MOCK_FIRESTORE_ID,
      enforceFirestoreMock as unknown as Rule.RuleModule,
    );
    Object.entries(CULPRITS).forEach(([id, culprit]) => {
      linter.defineRule(id, culprit as unknown as Rule.RuleModule);
    });
    return linter;
  };

  const configFor = (rules: Linter.RulesRecord): Linter.Config => ({
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules,
  });

  const CULPRIT_RULES = Object.fromEntries(
    Object.keys(CULPRITS).map((id) => [id, 'error']),
  ) as Linter.RulesRecord;

  const SOURCE = [
    `jest.mock('../../../../functions/src/config/firebaseAdmin', () => {`,
    `  return ({ db: { collection: jest.fn() } });`,
    `});`,
    ``,
  ].join('\n');

  it('still reports the manual mock after the sibling fixers rewrite the source', () => {
    const linter = makeLinter();
    const mockReports = (code: string) =>
      linter
        .verify(code, configFor({ [MOCK_FIRESTORE_ID]: 'error' }), FILENAME)
        .map((message) => message.messageId);

    expect(mockReports(SOURCE)).toEqual(['noManualFirestoreMock']);

    const fixed = linter.verifyAndFix(
      SOURCE,
      configFor(CULPRIT_RULES),
      FILENAME,
    );

    // Without these the case passes vacuously the moment a culprit stops
    // firing: the point is that the wrapper IS present in the linted input.
    expect(fixed.fixed).toBe(true);
    expect(fixed.output).toContain('as const');
    expect(fixed.output).toContain('db: { collection: jest.fn() }');

    expect(mockReports(fixed.output)).toEqual(['noManualFirestoreMock']);

    // Causal isolation: the only textual difference between these two inputs is
    // the assertion, so a verdict that differs between them is the wrapper's
    // doing rather than any rename the fixers also performed.
    const withoutAssertion = fixed.output.replace(' as const', '');
    expect(withoutAssertion).not.toContain('as const');
    expect(withoutAssertion).not.toBe(fixed.output);
    expect(mockReports(withoutAssertion)).toEqual(['noManualFirestoreMock']);
  });

  it('converges: re-linting the fixed output changes nothing further', () => {
    const linter = makeLinter();
    const fixed = linter.verifyAndFix(
      SOURCE,
      configFor(CULPRIT_RULES),
      FILENAME,
    );
    const refixed = linter.verifyAndFix(
      fixed.output,
      configFor(CULPRIT_RULES),
      FILENAME,
    );

    expect(refixed.output).toBe(fixed.output);
  });
});

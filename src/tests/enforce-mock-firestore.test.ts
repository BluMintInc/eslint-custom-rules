import { ruleTesterTs } from '../utils/ruleTester';
import { enforceFirestoreMock } from '../rules/enforce-mock-firestore';

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
  ],
});

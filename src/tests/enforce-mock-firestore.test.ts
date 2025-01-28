import { ruleTesterTs } from '../utils/ruleTester';
import { enforceFirestoreMock } from '../rules/enforce-mock-firestore';

ruleTesterTs.run('enforce-mock-firestore', enforceFirestoreMock, {
  valid: [
    // Valid use of mockFirestore
    {
      code: `
        import { mockFirestore } from '__mocks__/functions/src/config/mockFirestore';

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
      output: `
        import { mockFirestore } from '__mocks__/functions/src/config/mockFirestore';

        mockFirebase({
          database: {
            users: [{ id: '123', name: 'John' }],
          },
        });
      `,
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
      output: `
        mockFirestore({
          // TODO: Add your mock data here
        });
      `,
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
      output: `
        mockFirestore({
          // TODO: Add your mock data here
        });
      `,
    },
  ],
});

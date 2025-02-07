import { ruleTesterTs } from '../utils/ruleTester';
import { noMockFirebaseAdmin } from '../../src/rules/no-mock-firebase-admin';

ruleTesterTs.run('no-mock-firebase-admin', noMockFirebaseAdmin, {
  valid: [
    {
      code: `import { mockFirestore } from '../../../../../__mocks__/functions/src/config/mockFirestore';

      beforeEach(() => {
        mockFirestore({
          'some/path': [{ id: 'test' }],
        });
      });`,
      filename: 'src/test.test.ts',
    },
    {
      code: `jest.mock('some-other-module');`,
      filename: 'src/test.test.ts',
    },
  ],
  invalid: [
    {
      code: `jest.mock('../../config/firebaseAdmin', () => ({
        db: mockFirestore()
      }));`,
      filename: 'src/test.test.ts',
      errors: [{ messageId: 'noMockFirebaseAdmin' }],
    },
    {
      code: `jest.mock('../config/firebaseAdmin');`,
      filename: 'src/test.test.ts',
      errors: [{ messageId: 'noMockFirebaseAdmin' }],
    },
    {
      code: `jest.mock('functions/src/config/firebaseAdmin', () => ({
        db: mockFirestore(),
        auth: jest.fn()
      }));`,
      filename: 'src/test.test.ts',
      errors: [{ messageId: 'noMockFirebaseAdmin' }],
    },
    {
      code: `jest.mock('../../config/firebaseAdmin', () => ({
        db: jest.requireActual('../../config/firebaseAdmin').db,
      }));`,
      filename: 'src/test.test.ts',
      errors: [{ messageId: 'noMockFirebaseAdmin' }],
    },
    {
      code: `jest.resetModules();
      jest.mock('../../config/firebaseAdmin');`,
      filename: 'src/test.test.ts',
      errors: [{ messageId: 'noMockFirebaseAdmin' }],
    },
  ],
});

import { ruleTesterTs } from '../utils/ruleTester';
import { noMockFirebaseAdmin } from '../../src/rules/no-mock-firebase-admin';

ruleTesterTs.run('no-mock-firebase-admin', noMockFirebaseAdmin, {
  valid: [
    // Valid usage of mockFirestore
    {
      code: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';

      beforeEach(() => {
        mockFirestore({
          'some/path': [{ id: 'test' }],
        });
      });`,
      filename: 'src/test.test.ts',
    },
    // Other module mocks
    {
      code: `jest.mock('some-other-module');`,
      filename: 'src/test.test.ts',
    },
    // Similar but different paths
    {
      code: `jest.mock('../../config/firebaseAdminHelper');`,
      filename: 'src/test.test.ts',
    },
    {
      code: `jest.mock('../../config/firebase-admin-utils');`,
      filename: 'src/test.test.ts',
    },
    // Non-test files should be ignored
    {
      code: `jest.mock('../../config/firebaseAdmin');`,
      filename: 'src/component.tsx',
    },
    {
      code: `jest.mock('../../config/firebaseAdmin');`,
      filename: 'src/utils.ts',
    },
    // Comments and whitespace variations
    {
      code: `// This is a valid mock
      jest.mock('some-other-module'); // End of line comment`,
      filename: 'src/test.test.ts',
    },
    // Dynamic imports (not jest.mock)
    {
      code: `import('../../config/firebaseAdmin');`,
      filename: 'src/test.test.ts',
    },
    // Regular require statements
    {
      code: `const firebaseAdmin = require('../../config/firebaseAdmin');`,
      filename: 'src/test.test.ts',
    },
    // Complex but valid scenarios
    {
      code: `
        const mockPath = '../../config/firebaseAdmin';
        const str = 'jest.mock("../../config/firebaseAdmin")';
        const obj = {
          path: '../../config/firebaseAdmin',
          mock: jest.fn()
        };`,
      filename: 'src/test.test.ts',
    },
  ],
  invalid: [
    // Basic mock with factory
    {
      code: `jest.mock('../../config/firebaseAdmin', () => ({
        db: mockFirestore()
      }));`,
      filename: 'src/test.test.ts',
      errors: [{ messageId: 'noMockFirebaseAdmin' }],
    },
    // Simple mock without factory
    {
      code: `jest.mock('../config/firebaseAdmin');`,
      filename: 'src/test.test.ts',
      errors: [{ messageId: 'noMockFirebaseAdmin' }],
    },
    // Mock with additional properties
    {
      code: `jest.mock('functions/src/config/firebaseAdmin', () => ({
        db: mockFirestore(),
        auth: jest.fn(),
        storage: jest.fn()
      }));`,
      filename: 'src/test.test.ts',
      errors: [{ messageId: 'noMockFirebaseAdmin' }],
    },
    // Mock with requireActual
    {
      code: `jest.mock('../../config/firebaseAdmin', () => ({
        db: jest.requireActual('../../config/firebaseAdmin').db,
      }));`,
      filename: 'src/test.test.ts',
      errors: [{ messageId: 'noMockFirebaseAdmin' }],
    },
    // Mock with resetModules
    {
      code: `jest.resetModules();
      jest.mock('../../config/firebaseAdmin');`,
      filename: 'src/test.test.ts',
      errors: [{ messageId: 'noMockFirebaseAdmin' }],
    },
    // Multi-line variations
    {
      code: `
        jest
          .mock(
            '../../config/firebaseAdmin'
          );`,
      filename: 'src/test.test.ts',
      errors: [{ messageId: 'noMockFirebaseAdmin' }],
    },
    // With comments
    {
      code: `// Mock firebase admin
      jest.mock(
        // Path to mock
        '../../config/firebaseAdmin'
        // Factory function
      );`,
      filename: 'src/test.test.ts',
      errors: [{ messageId: 'noMockFirebaseAdmin' }],
    },
    // Different path variations
    {
      code: `jest.mock('./config/firebaseAdmin');`,
      filename: 'src/test.test.ts',
      errors: [{ messageId: 'noMockFirebaseAdmin' }],
    },
    {
      code: `jest.mock('@project/functions/src/config/firebaseAdmin');`,
      filename: 'src/test.test.ts',
      errors: [{ messageId: 'noMockFirebaseAdmin' }],
    },
    // Template literal path
    {
      code: "jest.mock(`../../config/firebaseAdmin`);",
      filename: 'src/test.test.ts',
      errors: [{ messageId: 'noMockFirebaseAdmin' }],
    },
    // Multiple mocks in one file
    {
      code: `
        jest.mock('../../config/firebaseAdmin');
        jest.mock('../other/module');
        jest.mock('./config/firebaseAdmin', () => ({}));`,
      filename: 'src/test.test.ts',
      errors: [
        { messageId: 'noMockFirebaseAdmin' },
        { messageId: 'noMockFirebaseAdmin' },
      ],
    },
    // Mock with complex factory
    {
      code: `
        jest.mock('../../config/firebaseAdmin', () => {
          const originalModule = jest.requireActual('../../config/firebaseAdmin');
          return {
            ...originalModule,
            db: mockFirestore(),
            auth: () => ({
              verifyIdToken: jest.fn(),
              createCustomToken: jest.fn(),
            }),
          };
        });`,
      filename: 'src/test.test.ts',
      errors: [{ messageId: 'noMockFirebaseAdmin' }],
    },
  ],
});

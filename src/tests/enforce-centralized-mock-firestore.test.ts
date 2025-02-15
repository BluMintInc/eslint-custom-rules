import { ruleTesterTs } from '../utils/ruleTester';
import { enforceCentralizedMockFirestore } from '../rules/enforce-centralized-mock-firestore';

ruleTesterTs.run(
  'enforce-centralized-mock-firestore',
  enforceCentralizedMockFirestore,
  {
    valid: [
      // Valid case: Using the centralized mockFirestore
      {
        code: `
        import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';

        beforeEach(() => {
          mockFirestore({
            'some/path': [{ id: 'test' }],
          });
        });
      `,
      },
      // Valid case: No mockFirestore usage
      {
        code: `
        import { someOtherMock } from './mocks';

        beforeEach(() => {
          someOtherMock();
        });
      `,
      },
      // Valid case: Using renamed import
      {
        code: `
        import { mockFirestore as centralMockFirestore } from '../../../../../__test-utils__/mockFirestore';

        beforeEach(() => {
          centralMockFirestore({
            'some/path': [{ id: 'test' }],
          });
        });
      `,
      },
      // Valid case: Using destructured import with comments
      {
        code: `
        // Import the centralized mockFirestore
        import {
          // This is the mock we need
          mockFirestore,
          // Other imports
          otherMock,
        } from '../../../../../__test-utils__/mockFirestore';

        beforeEach(() => {
          mockFirestore({
            'some/path': [{ id: 'test' }],
          });
        });
      `,
      },
      // Valid case: Using in async test
      {
        code: `
        import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';

        it('should work with async', async () => {
          mockFirestore({
            'some/path': [{ id: 'test' }],
          });
          await someAsyncOperation();
        });
      `,
      },
      // Valid case: Using with multiple test blocks
      {
        code: `
        import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';

        describe('test suite', () => {
          beforeAll(() => {
            mockFirestore({
              'global/path': [{ id: 'global' }],
            });
          });

          beforeEach(() => {
            mockFirestore({
              'some/path': [{ id: 'test' }],
            });
          });

          afterEach(() => {
            mockFirestore({});
          });
        });
      `,
      },
    ],
    invalid: [
      // Invalid case: Local mockFirestore declaration
      {
        code: `
        const mockFirestore = jest.fn();

        beforeEach(() => {
          mockFirestore({
            'some/path': [{ id: 'test' }],
          });
        });
      `,
        errors: [{ messageId: 'useCentralizedMockFirestore' }],
        output: `
        import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';


        beforeEach(() => {
          mockFirestore({
            'some/path': [{ id: 'test' }],
          });
        });
      `,
      },
      // Invalid case: Conditional mockFirestore declaration
      {
        code: `
        const mockFirestore = process.env.TEST_ENV === 'ci' ? jest.fn() : require('mockModule');

        beforeEach(() => {
          mockFirestore({
            'some/path': [{ id: 'test' }],
          });
        });
      `,
        errors: [{ messageId: 'useCentralizedMockFirestore' }],
        output: `
        import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';


        beforeEach(() => {
          mockFirestore({
            'some/path': [{ id: 'test' }],
          });
        });
      `,
      },
      // Invalid case: Different name but same functionality
      {
        code: `
        const myMockFirestore = jest.fn();
        const mockFirestore = myMockFirestore;

        beforeEach(() => {
          mockFirestore({
            'some/path': [{ id: 'test' }],
          });
        });
      `,
        errors: [{ messageId: 'useCentralizedMockFirestore' }],
        output: `
        import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';

        const myMockFirestore = jest.fn();


        beforeEach(() => {
          mockFirestore({
            'some/path': [{ id: 'test' }],
          });
        });
      `,
      },
      // Invalid case: Using require syntax
      {
        code: `
        const { mockFirestore } = require('./localMocks');

        beforeEach(() => {
          mockFirestore({
            'some/path': [{ id: 'test' }],
          });
        });
      `,
        errors: [{ messageId: 'useCentralizedMockFirestore' }],
        output: `
        import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';


        beforeEach(() => {
          mockFirestore({
            'some/path': [{ id: 'test' }],
          });
        });
      `,
      },
      // Invalid case: Using with class property
      {
        code: `
        class TestClass {
          private mockFirestore = jest.fn();

          beforeEach() {
            this.mockFirestore({
              'some/path': [{ id: 'test' }],
            });
          }
        }
      `,
        errors: [{ messageId: 'useCentralizedMockFirestore' }],
        output: `
        import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';

        class TestClass {

          beforeEach() {
            mockFirestore({
              'some/path': [{ id: 'test' }],
            });
          }
        }
      `,
      },
      // Invalid case: Using with destructuring and renaming
      {
        code: `
        const { mockFirestore: customMockFirestore } = require('./customMocks');

        describe('test suite', () => {
          beforeEach(() => {
            customMockFirestore({
              'some/path': [{ id: 'test' }],
            });
          });
        });
      `,
        errors: [{ messageId: 'useCentralizedMockFirestore' }],
        output: `
        import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';


        describe('test suite', () => {
          beforeEach(() => {
            mockFirestore({
              'some/path': [{ id: 'test' }],
            });
          });
        });
      `,
      },
      // Invalid case: Using with dynamic import
      {
        code: `
        async function setupTests() {
          const { mockFirestore } = await import('./localMocks');

          beforeEach(() => {
            mockFirestore({
              'some/path': [{ id: 'test' }],
            });
          });
        }
      `,
        errors: [{ messageId: 'useCentralizedMockFirestore' }],
        output: `
        import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';

        async function setupTests() {

          beforeEach(() => {
            mockFirestore({
              'some/path': [{ id: 'test' }],
            });
          });
        }
      `,
      },
      // Invalid case: Using with multiple declarations
      {
        code: `
        const mockFirestore1 = jest.fn();
        const mockFirestore2 = jest.fn();
        const mockFirestore = process.env.CI ? mockFirestore1 : mockFirestore2;

        describe('test suite', () => {
          beforeEach(() => {
            mockFirestore({
              'some/path': [{ id: 'test' }],
            });
          });
        });
      `,
        errors: [{ messageId: 'useCentralizedMockFirestore' }],
        output: `
        import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';



        describe('test suite', () => {
          beforeEach(() => {
            mockFirestore({
              'some/path': [{ id: 'test' }],
            });
          });
        });
      `,
      },
      // Invalid case: Using with complex object destructuring
      {
        code: `
        const {
          mocks: {
            firestore: {
              mockFirestore
            }
          }
        } = require('./complexMocks');

        describe('test suite', () => {
          beforeEach(() => {
            mockFirestore({
              'some/path': [{ id: 'test' }],
            });
          });
        });
      `,
        errors: [{ messageId: 'useCentralizedMockFirestore' }],
        output: `
        import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';



        describe('test suite', () => {
          beforeEach(() => {
            mockFirestore({
              'some/path': [{ id: 'test' }],
            });
          });
        });
      `,
      },
    ],
  },
);

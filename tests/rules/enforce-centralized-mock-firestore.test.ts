import { ruleTesterTs } from '../utils/ruleTester';
import { enforceCentralizedMockFirestore } from '../../src/rules/enforce-centralized-mock-firestore';

ruleTesterTs.run('enforce-centralized-mock-firestore', enforceCentralizedMockFirestore, {
  valid: [
    // Valid case: Using the centralized mockFirestore
    {
      code: `
        import { mockFirestore } from '../../../../../__mocks__/functions/src/config/mockFirestore';

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
        import { mockFirestore } from '../../../../../__mocks__/functions/src/config/mockFirestore';



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
        import { mockFirestore } from '../../../../../__mocks__/functions/src/config/mockFirestore';



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
        import { mockFirestore } from '../../../../../__mocks__/functions/src/config/mockFirestore';

        const myMockFirestore = jest.fn();


        beforeEach(() => {
          mockFirestore({
            'some/path': [{ id: 'test' }],
          });
        });
      `,
    },
  ],
});

import { ruleTesterTs } from '../utils/ruleTester';
import { noFirestoreJestMock } from '../../src/rules/no-firestore-jest-mock';

ruleTesterTs.run('no-firestore-jest-mock', noFirestoreJestMock, {
    valid: [
        // Valid: Non-test file importing firestore-jest-mock
        {
            code: `import { mockFirebase } from 'firestore-jest-mock';`,
            filename: 'src/utils/test-helper.ts',
        },
        // Valid: Test file using mockFirestore
        {
            code: `import { mockFirestore } from '../../../../../__mocks__/functions/src/config/mockFirestore';`,
            filename: 'src/components/test.test.ts',
        },
        // Valid: Test file with no Firestore mocks
        {
            code: `import { render } from '@testing-library/react';`,
            filename: 'src/components/test.test.ts',
        },
    ],
    invalid: [
        // Invalid: Direct import in test file
        {
            code: `import { mockFirebase } from 'firestore-jest-mock';`,
            filename: 'src/components/test.test.ts',
            errors: [{ messageId: 'noFirestoreJestMock' }],
            output: `import { mockFirestore } from '../../../../../__mocks__/functions/src/config/mockFirestore';`,
        },
        // Invalid: Multiple imports with aliases
        {
            code: `import { mockFirebase as myMock, mockSet as mySet } from 'firestore-jest-mock';`,
            filename: 'src/components/test.test.ts',
            errors: [{ messageId: 'noFirestoreJestMock' }],
            output: `import { mockFirestore } from '../../../../../__mocks__/functions/src/config/mockFirestore';`,
        },
        // Invalid: jest.mock usage
        {
            code: `jest.mock('firestore-jest-mock');`,
            filename: 'src/components/test.test.ts',
            errors: [{ messageId: 'noFirestoreJestMock' }],
        },
    ],
});

import { ruleTesterTs } from '../utils/ruleTester';
import { noFirestoreJestMock } from '../rules/no-firestore-jest-mock';

const errorData = {
  moduleName: 'firestore-jest-mock',
  replacementPath: '../../__test-utils__/mockFirestore',
} as const;
const expectedError = { messageId: 'noFirestoreJestMock', data: errorData } as const;

ruleTesterTs.run('no-firestore-jest-mock', noFirestoreJestMock, {
  valid: [
    // Valid: Non-test file importing firestore-jest-mock
    {
      code: `import { mockFirebase } from 'firestore-jest-mock';`,
      filename: 'src/utils/test-helper.ts',
    },
    // Valid: Test file using mockFirestore
    {
      code: `import { mockFirestore } from '../../__test-utils__/mockFirestore';`,
      filename: 'src/components/test.test.ts',
    },
    // Valid: Test file with no Firestore mocks
    {
      code: `import { render } from '@testing-library/react';`,
      filename: 'src/components/test.test.ts',
    },
    // Valid: Test file importing from a different package with similar name
    {
      code: `import { mockFirestore } from '@firebase/firestore-jest-mock';`,
      filename: 'src/components/test.test.ts',
    },
    // Valid: Test file with string literal containing package name
    {
      code: `const packageName = 'firestore-jest-mock';
            console.log('Not importing from', packageName);`,
      filename: 'src/components/test.test.ts',
    },
    // Valid: Test file with commented out import
    {
      code: `// import { mockFirebase } from 'firestore-jest-mock';
            // const mock = require('firestore-jest-mock');`,
      filename: 'src/components/test.test.ts',
    },
    // Valid: Test file with similar package name
    {
      code: `import { mock } from '@company/firestore-jest-mock-utils';`,
      filename: 'src/components/test.test.ts',
    },
    // Valid: Test file with dynamic import of allowed package
    {
      code: `const mockFn = async () => {
                const { mockFirestore } = await import('../../__test-utils__/mockFirestore');
            };`,
      filename: 'src/components/test.test.ts',
    },
    // Valid: Test file with type import from mockFirestore
    {
      code: `import type { MockFirestoreTypes } from '../../__test-utils__/mockFirestore';`,
      filename: 'src/components/test.test.ts',
    },
    // Valid: Test file with type import from firestore-jest-mock
    {
      code: `import type { MockTypes } from 'firestore-jest-mock';`,
      filename: 'src/components/test.test.ts',
    },
  ],
  invalid: [
    // Invalid: Direct import in test file
    {
      code: `import { mockFirebase } from 'firestore-jest-mock';`,
      filename: 'src/components/test.test.ts',
      errors: [expectedError],
      output: `import { mockFirestore } from '../../__test-utils__/mockFirestore';`,
    },
    // Invalid: Direct import in deeper nested test file
    {
      code: `import { mockFirebase } from 'firestore-jest-mock';`,
      filename: 'packages/app/src/features/foo/__tests__/component.test.ts',
      errors: [
        {
          messageId: 'noFirestoreJestMock',
          data: {
            moduleName: 'firestore-jest-mock',
            replacementPath: '../../../../../../__test-utils__/mockFirestore',
          },
        },
      ],
      output: `import { mockFirestore } from '../../../../../../__test-utils__/mockFirestore';`,
    },
    // Invalid: Multiple imports with aliases
    {
      code: `import { mockFirebase as myMock, mockSet as mySet } from 'firestore-jest-mock';`,
      filename: 'src/components/test.test.ts',
      errors: [expectedError],
      output: `import { mockFirestore } from '../../__test-utils__/mockFirestore';`,
    },
    // Invalid: jest.mock usage
    {
      code: `jest.mock('firestore-jest-mock');`,
      filename: 'src/components/test.test.ts',
      errors: [expectedError],
    },
    // Invalid: Dynamic import in test file
    {
      code: `const mockFn = async () => {
                const { mockFirebase } = await import('firestore-jest-mock');
            };`,
      filename: 'src/components/test.test.ts',
      errors: [expectedError],
      output: `const mockFn = async () => {
                const { mockFirebase } = await import('../../__test-utils__/mockFirestore');
            };`,
    },
    // Invalid: Require statement in test file
    {
      code: `const { mockFirebase } = require('firestore-jest-mock');`,
      filename: 'src/components/test.test.ts',
      errors: [expectedError],
    },

    // Invalid: Multiple imports mixed with other imports
    {
      code: `import { render } from '@testing-library/react';
            import { mockFirebase, mockSet } from 'firestore-jest-mock';
            import { useState } from 'react';`,
      filename: 'src/components/test.test.ts',
      errors: [expectedError],
      output: `import { render } from '@testing-library/react';
            import { mockFirestore } from '../../__test-utils__/mockFirestore';
            import { useState } from 'react';`,
    },
    // Invalid: Import with line breaks and comments
    {
      code: `import {
                // Firebase mock
                mockFirebase,
                // Set mock
                mockSet
            } from 'firestore-jest-mock';`,
      filename: 'src/components/test.test.ts',
      errors: [expectedError],
      output: `import { mockFirestore } from '../../__test-utils__/mockFirestore';`,
    },
    // Invalid: jest.mock with other configurations
    {
      code: `jest.mock('firestore-jest-mock', () => ({
                mockFirebase: jest.fn(),
                mockSet: jest.fn()
            }));`,
      filename: 'src/components/test.test.ts',
      errors: [expectedError],
    },
  ],
});

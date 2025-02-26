import { ruleTesterTs } from '../utils/ruleTester';
import { testFileLocationEnforcement } from '../rules/test-file-location-enforcement';
import * as path from 'path';

// Mock fs module
jest.mock('fs', () => ({
  existsSync: (filePath: string) => {
    // Mock that source files exist in specific directories
    const validPaths = [
      // Source files in src directories
      path.join('/project/functions/src/util', 'X.ts'),
      path.join('/project/src/components', 'Button.ts'),
      // Source files in the same directory as their test files
      path.join('/project/functions/src/util/helpers', 'Y.ts'),
      path.join('/project/src/services', 'Service.ts'),
      // Source file in src when test is in lib
      path.join('/project/src/utils', 'Format.ts'),
    ];

    return validPaths.includes(filePath);
  },
}));

ruleTesterTs.run(
  'test-file-location-enforcement',
  testFileLocationEnforcement,
  {
    valid: [
      {
        // Test file in the same directory as source file
        code: 'const x = 1;',
        filename: '/project/functions/src/util/X.test.ts',
      },
      {
        // Test file in the same directory as source file (nested)
        code: 'const x = 1;',
        filename: '/project/functions/src/util/helpers/Y.test.ts',
      },
      {
        // Test file in the same directory as source file (services)
        code: 'const x = 1;',
        filename: '/project/src/services/Service.test.ts',
      },
      {
        // Not a test file
        code: 'const x = 1;',
        filename: '/project/functions/src/util/helper.ts',
      },
      {
        // File in node_modules should be ignored
        code: 'const x = 1;',
        filename: '/project/node_modules/package/tests/helper.test.ts',
      },
    ],
    invalid: [
      {
        // Test file in a separate tests directory
        code: 'const x = 1;',
        filename: '/project/functions/tests/X.test.ts',
        errors: [
          {
            messageId: 'incorrectTestLocation',
            data: {
              expectedPath: path.join(
                '/project/functions/src/util',
                'X.test.ts',
              ),
            },
          },
        ],
      },
      {
        // Test file in a nested tests directory
        code: 'const x = 1;',
        filename: '/project/tests/components/Button.test.ts',
        errors: [
          {
            messageId: 'incorrectTestLocation',
            data: {
              expectedPath: path.join(
                '/project/src/components',
                'Button.test.ts',
              ),
            },
          },
        ],
      },
      {
        // Test file in lib directory when source is in src
        code: 'const x = 1;',
        filename: '/project/lib/utils/Format.test.ts',
        errors: [
          {
            messageId: 'incorrectTestLocation',
            data: {
              expectedPath: path.join('/project/src/utils', 'Format.test.ts'),
            },
          },
        ],
      },
    ],
  },
);

import { ruleTesterTs } from '../utils/ruleTester';
import { testFileLocationEnforcement } from '../rules/test-file-location-enforcement';
import * as path from 'path';

// Mock fs module
jest.mock('fs', () => ({
  existsSync: (filePath: string) => {
    // Mock that source files exist in src directory
    if (
      filePath === path.join('/project/functions/src/util', 'X.ts') ||
      filePath === path.join('/project/src/components', 'Button.ts')
    ) {
      return true;
    }
    return false;
  }
}));

ruleTesterTs.run('test-file-location-enforcement', testFileLocationEnforcement, {
  valid: [
    {
      // Test file in the same directory as source file
      code: 'const x = 1;',
      filename: '/project/functions/src/util/X.test.ts',
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
        },
      ],
    },
  ],
});

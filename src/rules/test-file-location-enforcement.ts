import { createRule } from '../utils/createRule';
import * as path from 'path';
import * as fs from 'fs';

type MessageIds = 'incorrectTestLocation';

export const testFileLocationEnforcement = createRule<[], MessageIds>({
  name: 'test-file-location-enforcement',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce test files to be in the same directory as the file they are testing',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      incorrectTestLocation:
        'Test file should be in the same directory as the file it tests ({{ expectedPath }})',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      Program(node) {
        const filename = context.getFilename();

        // Skip files in node_modules
        if (filename.includes('node_modules')) {
          return;
        }

        // Only process test files
        if (!filename.endsWith('.test.ts') && !filename.endsWith('.test.tsx')) {
          return;
        }

        // Extract the base name of the file being tested
        const basename = path.basename(filename);
        const sourceFilename = basename.replace(/\.test\.(ts|tsx)$/, '.$1');

        // Get the directory of the test file
        const testDir = path.dirname(filename);
        // check if the source file exists in the same directory
        const sourceFilePath = path.join(testDir, sourceFilename);

        try {
          // If the source file doesn't exist in the same directory, report an error
          if (!fs.existsSync(sourceFilePath)) {
            // If found in src directory, suggest moving the test file there
            context.report({
              node,
              messageId: 'incorrectTestLocation',
              data: {
                expectedPath: path.join(testDir, sourceFilename),
              },
            });
          }
        } catch (err) {
          // Ignore file system errors
        }
      },
    };
  },
});

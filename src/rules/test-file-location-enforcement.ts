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

        // Check if the test file is in a dedicated test directory
        const isInTestDir =
          /\/tests?\/?$/.test(testDir) ||
          testDir.includes('/tests/') ||
          testDir.includes('/test/');

        if (isInTestDir) {
          // If in a test directory, we need to find the corresponding source file
          const possibleSourceDirs: string[] = [];

          // Replace 'test' or 'tests' with 'src' in the path
          const srcDir = testDir
            .replace(/\/tests?\/?$/, '/src')
            .replace(/\/tests\//, '/src/');
          possibleSourceDirs.push(srcDir);

          // Also try one level up (for cases like functions/tests -> functions/src)
          const parentDir = path.dirname(testDir);
          const srcDirFromParent = path.join(parentDir, 'src');
          possibleSourceDirs.push(srcDirFromParent);

          // Try to find the source file in possible directories
          let sourceFileFound = false;
          let expectedPath = '';

          for (const dir of possibleSourceDirs) {
            const possibleSourcePath = path.join(dir, sourceFilename);

            try {
              if (fs.existsSync(possibleSourcePath)) {
                sourceFileFound = true;
                // The expected test file location would be in the same directory as the source
                expectedPath = path.join(dir, basename);
                break;
              }
            } catch (err) {
              // Ignore file system errors
            }
          }

          if (sourceFileFound) {
            context.report({
              node,
              messageId: 'incorrectTestLocation',
              data: {
                expectedPath,
              },
            });
          }
        } else {
          // If not in a dedicated test directory, check if the source file exists in the same directory
          const sourceFilePath = path.join(testDir, sourceFilename);

          try {
            // If the source file doesn't exist in the same directory, report an error
            if (!fs.existsSync(sourceFilePath)) {
              // Try to find the source file in a src directory
              const possibleSrcDir = testDir
                .replace(/\/lib\//, '/src/')
                .replace(/\/dist\//, '/src/');
              const possibleSrcPath = path.join(possibleSrcDir, sourceFilename);

              if (
                possibleSrcDir !== testDir &&
                fs.existsSync(possibleSrcPath)
              ) {
                // If found in src directory, suggest moving the test file there
                context.report({
                  node,
                  messageId: 'incorrectTestLocation',
                  data: {
                    expectedPath: path.join(possibleSrcDir, basename),
                  },
                });
              }
            }
          } catch (err) {
            // Ignore file system errors
          }
        }
      },
    };
  },
});

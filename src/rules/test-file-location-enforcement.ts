import fs from 'fs';
import path from 'path';
import type { TSESTree } from '@typescript-eslint/utils';

import { createRule } from '../utils/createRule';

type MessageIds = 'misplacedTestFile';

const TEST_FILE_PATTERN = /\.test\.tsx?$/i;
const SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

export const testFileLocationEnforcement = createRule<[], MessageIds>({
  name: 'test-file-location-enforcement',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce colocating *.test.ts(x) files with the code they cover.',
      recommended: 'error',
    },
    schema: [],
    messages: {
      misplacedTestFile:
        'Test file "{{testFile}}" is not colocated with its subject. Keep tests in the same directory as {{expectedNames}} so refactors move code and coverage together and engineers can find the implementation without searching separate test folders.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      Program(node: TSESTree.Program) {
        const filename = context.getFilename();

        if (
          filename === '<input>' ||
          filename === '<text>' ||
          filename.includes('node_modules') ||
          !TEST_FILE_PATTERN.test(filename)
        ) {
          return;
        }

        const directory = path.dirname(filename);
        const testFileName = path.basename(filename);
        const baseName = testFileName.replace(TEST_FILE_PATTERN, '');
        const candidates = SUPPORTED_EXTENSIONS.map((extension) =>
          path.join(directory, `${baseName}${extension}`),
        );

        const hasSibling = candidates.some((candidate) =>
          fs.existsSync(candidate),
        );

        if (hasSibling) {
          return;
        }

        const relativePath = path.isAbsolute(filename)
          ? path.relative(process.cwd(), filename) || filename
          : filename;

        const expectedNames = SUPPORTED_EXTENSIONS.map(
          (extension) => `"${baseName}${extension}"`,
        ).join(' or ');

        context.report({
          node,
          messageId: 'misplacedTestFile',
          data: { testFile: relativePath, expectedNames },
        });
      },
    };
  },
});

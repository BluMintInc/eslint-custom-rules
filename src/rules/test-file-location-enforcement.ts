import fs from 'fs';
import path from 'path';
import type { TSESTree } from '@typescript-eslint/utils';

import { createRule } from '../utils/createRule';

type Options = [
  {
    additionalSubjectExtensions?: string[];
  }?,
];

type MessageIds = 'misplacedTestFile';

const TEST_FILE_PATTERN = /\.test\.tsx?$/i;
const SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

const DEFAULT_OPTIONS: NonNullable<Options[0]> = {
  additionalSubjectExtensions: [],
};

const normalizeExtension = (extension: string): string =>
  extension.startsWith('.') ? extension : `.${extension}`;

export const testFileLocationEnforcement = createRule<Options, MessageIds>({
  name: 'test-file-location-enforcement',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce colocating *.test.ts or *.test.tsx files with the code they cover.',
      recommended: 'error',
    },
    schema: [
      {
        type: 'object',
        properties: {
          additionalSubjectExtensions: {
            type: 'array',
            items: { type: 'string' },
            default: [],
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      misplacedTestFile:
        'Test file "{{testFile}}" is not colocated with its subject. Keep tests in the same directory as {{expectedNames}} so refactors move code and coverage together and engineers can find the implementation without searching separate test folders.',
    },
  },
  defaultOptions: [DEFAULT_OPTIONS],
  create(context, [options]) {
    const resolvedOptions = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
    const additionalExtensions = (
      resolvedOptions.additionalSubjectExtensions ?? []
    ).map(normalizeExtension);

    const subjectExtensions = [
      ...SUPPORTED_EXTENSIONS,
      ...additionalExtensions.filter(
        (extension) => !SUPPORTED_EXTENSIONS.includes(extension),
      ),
    ];

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
        const candidates = subjectExtensions.map((extension) =>
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

        const expectedNames = subjectExtensions
          .map((extension) => `"${baseName}${extension}"`)
          .join(' or ');

        context.report({
          node,
          messageId: 'misplacedTestFile',
          data: { testFile: relativePath, expectedNames },
        });
      },
    };
  },
});

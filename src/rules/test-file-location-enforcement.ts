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

/**
 * A suite may be split by concern into `Subject.<qualifier>.test.tsx` files that
 * sit beside `Subject.tsx`. Progressively dropping trailing dot-segments lets
 * such a test resolve to its subject at any qualifier depth, while never
 * crossing a directory boundary — a genuinely misplaced test still reports.
 * Empty prefixes are dropped so a dotfile stem cannot match a bare `.ts`.
 */
const subjectBaseNamesFor = (stem: string): string[] => {
  const segments = stem.split('.');
  const baseNames: string[] = [];

  for (let depth = segments.length; depth > 0; depth--) {
    const baseName = segments.slice(0, depth).join('.');
    if (baseName) {
      baseNames.push(baseName);
    }
  }

  // An extensionless stem (a file named exactly ".test.ts") leaves nothing to
  // probe; keep it so the report still names what was looked for.
  return baseNames.length > 0 ? baseNames : [stem];
};

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

    // Anchor the reported path at the directory ESLint was configured with, not
    // the node process cwd. The two differ under the VS Code ESLint extension,
    // in monorepos, and for any programmatic `new ESLint({ cwd })`, where
    // reading the process cwd names the misplaced test by a path the reader
    // cannot locate (issue #1476). The `typeof` guard keeps the rule working
    // under harnesses that predate `getCwd`.
    const cwd =
      typeof context.getCwd === 'function' ? context.getCwd() : process.cwd();

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
        const stem = testFileName.replace(TEST_FILE_PATTERN, '');
        const baseNames = subjectBaseNamesFor(stem);

        const hasSibling = baseNames.some((baseName) =>
          subjectExtensions.some((extension) =>
            fs.existsSync(path.join(directory, `${baseName}${extension}`)),
          ),
        );

        if (hasSibling) {
          return;
        }

        const relativePath = path.isAbsolute(filename)
          ? path.relative(cwd, filename) || filename
          : filename;

        // Naming the shortest prefix alongside the full stem keeps the guidance
        // honest: either subject name satisfies the rule.
        const reportedBaseNames =
          baseNames.length > 1
            ? [baseNames[0], baseNames[baseNames.length - 1]]
            : baseNames;

        const expectedNames = reportedBaseNames
          .flatMap((baseName) =>
            subjectExtensions.map((extension) => `"${baseName}${extension}"`),
          )
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

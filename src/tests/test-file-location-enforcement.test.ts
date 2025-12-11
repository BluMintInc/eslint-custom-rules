import fs from 'fs';
import os from 'os';
import path from 'path';

import { ruleTesterTs } from '../utils/ruleTester';
import { testFileLocationEnforcement } from '../rules/test-file-location-enforcement';

const tempDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'test-file-location-enforcement-'),
);

const workspaceTempDir = path.join(
  process.cwd(),
  '.cursor/tmp/test-file-location-enforcement',
);
const relativeTestDir = path.join(workspaceTempDir, 'relative');
fs.mkdirSync(relativeTestDir, { recursive: true });
const relativeTestFilePath = path.join(relativeTestDir, 'relative-file.test.ts');
fs.writeFileSync(relativeTestFilePath, '// relative test');
fs.writeFileSync(
  path.join(relativeTestDir, 'relative-file.ts'),
  '// relative implementation',
);
const relativeTestFilename = path.relative(process.cwd(), relativeTestFilePath);

const createFile = (relativePath: string, contents = '// fixture') => {
  const fullPath = path.join(tempDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, contents);
  return fullPath;
};

const createTestFileWithSources = (
  testRelativePath: string,
  sourceExtensions: string[],
) => {
  const testFilePath = createFile(testRelativePath);
  const baseName = path.basename(testRelativePath).replace(/\.test\.tsx?$/i, '');
  const directory = path.dirname(testRelativePath);

  for (const extension of sourceExtensions) {
    const siblingRelativePath = path.join(directory, `${baseName}${extension}`);
    createFile(siblingRelativePath);
  }

  return testFilePath;
};

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.rmSync(workspaceTempDir, { recursive: true, force: true });
});

ruleTesterTs.run(
  'test-file-location-enforcement',
  testFileLocationEnforcement,
  {
    valid: [
      {
        code: 'describe("foo", () => {});',
        filename: createTestFileWithSources(
          'functions/src/util/foo.test.ts',
          ['.ts'],
        ),
      },
      {
        code: 'it("handles components", () => {});',
        filename: createTestFileWithSources(
          'web/components/Button.test.tsx',
          ['.tsx'],
        ),
      },
      {
        code: 'test("js helper", () => {});',
        filename: createTestFileWithSources(
          'functions/src/helpers/js-helper.test.ts',
          ['.js'],
        ),
      },
      {
        code: 'test("jsx helper", () => {});',
        filename: createTestFileWithSources(
          'functions/src/helpers/jsx-helper.test.tsx',
          ['.jsx'],
        ),
      },
      {
        code: 'describe("index module", () => {});',
        filename: createTestFileWithSources(
          'functions/src/index.test.ts',
          ['.ts'],
        ),
      },
      {
        code: 'const notATest = true;',
        filename: createFile('functions/src/regular.ts'),
      },
      {
        code: 'it("ignores node_modules", () => {});',
        filename: createFile('node_modules/pkg/foo.test.ts'),
      },
      {
        code: 'it("allows multiple siblings", () => {});',
        filename: createTestFileWithSources('pkg/dual.test.ts', [
          '.ts',
          '.tsx',
        ]),
      },
      {
        code: 'it("supports uppercase extensions", () => {});',
        filename: createTestFileWithSources('pkg/Widget.TEST.TS', ['.ts']),
      },
      {
        code: 'test("spec files are outside rule scope", () => {});',
        filename: createFile('functions/src/foo.spec.ts'),
      },
      {
        code: 'it("handles test next to jsx sibling", () => {});',
        filename: createTestFileWithSources(
          'shared/components/Card.test.tsx',
          ['.jsx', '.tsx'],
        ),
      },
      {
        code: 'test("relative path fixtures", () => {});',
        filename: relativeTestFilename,
      },
    ],
    invalid: [
      {
        code: 'describe("misplaced test", () => {});',
        filename: createFile('functions/tests/foo.test.ts'),
        errors: [{ messageId: 'misplacedTestFile' }],
      },
      {
        code: 'describe("no sibling exists", () => {});',
        filename: createFile('functions/src/util/bar.test.ts'),
        errors: [{ messageId: 'misplacedTestFile' }],
      },
      {
        code: 'describe("d.ts sibling ignored", () => {});',
        filename: (() => {
          const testPath = createFile('functions/src/types/baz.test.ts');
          createFile('functions/src/types/baz.d.ts');
          return testPath;
        })(),
        errors: [{ messageId: 'misplacedTestFile' }],
      },
      {
        code: 'test("source lives elsewhere", () => {});',
        filename: (() => {
          createFile('functions/src/util/qux.ts');
          return createFile('functions/tests/qux.test.ts');
        })(),
        errors: [{ messageId: 'misplacedTestFile' }],
      },
      {
        code: 'describe("tsx test missing sibling", () => {});',
        filename: createFile('components/Button.test.tsx'),
        errors: [{ messageId: 'misplacedTestFile' }],
      },
      {
        code: 'describe("nested test directory", () => {});',
        filename: createFile('tests/deep/nested/value.test.ts'),
        errors: [{ messageId: 'misplacedTestFile' }],
      },
      {
        code: 'describe("json sibling is not allowed", () => {});',
        filename: (() => {
          const testPath = createFile('shared/feature/value.test.ts');
          createFile('shared/feature/value.json');
          return testPath;
        })(),
        errors: [{ messageId: 'misplacedTestFile' }],
      },
      {
        code: 'describe("only compiled output present", () => {});',
        filename: (() => {
          const testPath = createFile('dist/output/generated.test.ts');
          createFile('dist/output/generated.js.map');
          return testPath;
        })(),
        errors: [{ messageId: 'misplacedTestFile' }],
      },
      {
        code: 'describe("alternate directory sibling", () => {});',
        filename: (() => {
          createFile('functions/src/widget/index.ts');
          return createFile('functions/tests/widget/index.test.ts');
        })(),
        errors: [{ messageId: 'misplacedTestFile' }],
      },
      {
        code: 'describe("uppercase name missing sibling", () => {});',
        filename: createFile('pkg/UPPER.test.ts'),
        errors: [{ messageId: 'misplacedTestFile' }],
      },
      {
        code: 'describe("tsx base missing", () => {});',
        filename: createFile('pkg/mixed.test.tsx'),
        errors: [{ messageId: 'misplacedTestFile' }],
      },
      {
        code: 'describe("sibling only in parent", () => {});',
        filename: (() => {
          createFile('pkg/a/b/subject.ts');
          return createFile('pkg/a/tests/subject.test.ts');
        })(),
        errors: [{ messageId: 'misplacedTestFile' }],
      },
    ],
  },
);

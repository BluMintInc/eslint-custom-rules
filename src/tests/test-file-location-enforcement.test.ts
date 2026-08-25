import fs from 'fs';
import path from 'path';

import { Linter, Rule } from 'eslint';
import { ruleTesterTs } from '../utils/ruleTester';
import { testFileLocationEnforcement } from '../rules/test-file-location-enforcement';
import { createTempFixtureDir } from '../utils/tempFixtureDir';

const tempDir = createTempFixtureDir('test-file-location-enforcement-');

const workspaceTempDir = path.join(
  process.cwd(),
  '.cursor/tmp/test-file-location-enforcement',
);
const relativeTestDir = path.join(workspaceTempDir, 'relative');
fs.mkdirSync(relativeTestDir, { recursive: true });
const relativeTestFilePath = path.join(
  relativeTestDir,
  'relative-file.test.ts',
);
fs.writeFileSync(relativeTestFilePath, '// relative test');
fs.writeFileSync(
  path.join(relativeTestDir, 'relative-file.ts'),
  '// relative implementation',
);
const relativeTestFilename = path.relative(process.cwd(), relativeTestFilePath);

// Reported messages embed a cwd-relative path, so message assertions need a
// fixture inside the workspace rather than the OS temp dir.
const orphanTestDir = path.join(workspaceTempDir, 'orphan');
fs.mkdirSync(orphanTestDir, { recursive: true });

const createOrphanFixture = (fileName: string) => {
  const fullPath = path.join(orphanTestDir, fileName);
  fs.writeFileSync(fullPath, '// orphan test');
  return path.relative(process.cwd(), fullPath);
};

const orphanQualifierFilename = createOrphanFixture(
  'Orphan.qualifier.test.tsx',
);
const orphanPlainFilename = createOrphanFixture('Plain.test.ts');

const expectedMessageFor = (testFile: string, names: string[]) =>
  `Test file "${testFile}" is not colocated with its subject. Keep tests in the same directory as ${names
    .map((name) => `"${name}"`)
    .join(
      ' or ',
    )} so refactors move code and coverage together and engineers can find the implementation without searching separate test folders.`;

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
  const baseName = path
    .basename(testRelativePath)
    .replace(/\.test\.tsx?$/i, '');
  const directory = path.dirname(testRelativePath);

  for (const extension of sourceExtensions) {
    const siblingRelativePath = path.join(directory, `${baseName}${extension}`);
    createFile(siblingRelativePath);
  }

  return testFilePath;
};

const createTestFileWithNamedSources = (
  testRelativePath: string,
  sourceRelativeNames: string[],
) => {
  const testFilePath = createFile(testRelativePath);
  const directory = path.dirname(testRelativePath);

  for (const sourceName of sourceRelativeNames) {
    createFile(path.join(directory, sourceName));
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
        filename: createTestFileWithSources('functions/src/util/foo.test.ts', [
          '.ts',
        ]),
      },
      {
        code: 'it("handles components", () => {});',
        filename: createTestFileWithSources('web/components/Button.test.tsx', [
          '.tsx',
        ]),
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
        filename: createTestFileWithSources('functions/src/index.test.ts', [
          '.ts',
        ]),
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
        filename: createTestFileWithSources('shared/components/Card.test.tsx', [
          '.jsx',
          '.tsx',
        ]),
      },
      {
        code: 'test("relative path fixtures", () => {});',
        filename: relativeTestFilename,
      },
      {
        code: 'describe("jq sibling with option", () => {});',
        filename: createTestFileWithSources(
          'scripts/pr-check-comments.test.ts',
          ['.jq'],
        ),
        options: [{ additionalSubjectExtensions: ['.jq'] }],
      },
      {
        code: 'describe("jq sibling without leading dot", () => {});',
        filename: createTestFileWithSources(
          'scripts/normalize-comments.test.ts',
          ['.jq'],
        ),
        options: [{ additionalSubjectExtensions: ['jq'] }],
      },
      {
        code: 'describe("shell sibling with option", () => {});',
        filename: createTestFileWithSources('scripts/deploy.test.ts', ['.sh']),
        options: [{ additionalSubjectExtensions: ['.sh'] }],
      },
      {
        code: 'describe("yaml fixture sibling with option", () => {});',
        filename: createTestFileWithSources('config/pipeline.test.ts', [
          '.yaml',
        ]),
        options: [{ additionalSubjectExtensions: ['.yaml', '.yml'] }],
      },
      {
        code: 'describe("yml fixture sibling with option", () => {});',
        filename: createTestFileWithSources('config/build.test.ts', ['.yml']),
        options: [{ additionalSubjectExtensions: ['.yaml', '.yml'] }],
      },
      {
        code: 'describe("defaults still work alongside additions", () => {});',
        filename: createTestFileWithSources('functions/src/service.test.ts', [
          '.ts',
        ]),
        options: [{ additionalSubjectExtensions: ['.jq'] }],
      },
      {
        code: 'describe("suite qualifier resolves to leading segment", () => {});',
        filename: createTestFileWithNamedSources(
          'web/components/Foo.bar.test.tsx',
          ['Foo.tsx'],
        ),
      },
      {
        code: 'describe("qualifier on a hook suite", () => {});',
        filename: createTestFileWithNamedSources(
          'web/hooks/useGuardFlow.onClose.test.tsx',
          ['useGuardFlow.ts'],
        ),
      },
      {
        code: 'describe("qualifier containing a dash", () => {});',
        filename: createTestFileWithNamedSources(
          'web/hooks/useSnapshot.recoverable-errors.test.tsx',
          ['useSnapshot.ts'],
        ),
      },
      {
        code: 'describe("multi segment qualifier resolves to leading segment", () => {});',
        filename: createTestFileWithNamedSources(
          'web/components/Widget.alpha.beta.test.tsx',
          ['Widget.tsx'],
        ),
      },
      {
        code: 'describe("multi segment qualifier resolves to intermediate prefix", () => {});',
        filename: createTestFileWithNamedSources(
          'web/components/Panel.alpha.beta.test.tsx',
          ['Panel.alpha.tsx'],
        ),
      },
      {
        code: 'describe("full stem still preferred when it exists", () => {});',
        filename: createTestFileWithNamedSources(
          'web/components/Chart.legend.test.tsx',
          ['Chart.legend.tsx'],
        ),
      },
      {
        code: 'describe("qualifier subject may use a different extension", () => {});',
        filename: createTestFileWithNamedSources(
          'web/legacy/Table.sorting.test.tsx',
          ['Table.js'],
        ),
      },
      {
        code: 'describe("qualifier on a lowercase module", () => {});',
        filename: createTestFileWithNamedSources(
          'web/styles/theme.drawer.test.ts',
          ['theme.ts'],
        ),
      },
      {
        code: 'describe("qualifier resolves through an additional extension", () => {});',
        filename: createTestFileWithNamedSources(
          'scripts/deploy.smoke.test.ts',
          ['deploy.sh'],
        ),
        options: [{ additionalSubjectExtensions: ['.sh'] }],
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
      {
        code: 'describe("jq sibling without option is opt-out", () => {});',
        filename: createTestFileWithSources('scripts/unregistered.test.ts', [
          '.jq',
        ]),
        errors: [{ messageId: 'misplacedTestFile' }],
      },
      {
        code: 'describe("option registers jq but sibling is sh", () => {});',
        filename: createTestFileWithSources('scripts/mismatch.test.ts', [
          '.sh',
        ]),
        options: [{ additionalSubjectExtensions: ['.jq'] }],
        errors: [{ messageId: 'misplacedTestFile' }],
      },
      {
        code: 'describe("qualifier with no subject at any prefix depth", () => {});',
        filename: createFile('web/components/Orphan.qualifier.test.tsx'),
        errors: [{ messageId: 'misplacedTestFile' }],
      },
      {
        code: 'describe("qualifier subject lives in another directory", () => {});',
        filename: (() => {
          createFile('web/src/Detached.tsx');
          return createFile('web/tests/Detached.qualifier.test.tsx');
        })(),
        errors: [{ messageId: 'misplacedTestFile' }],
      },
      {
        code: 'describe("qualifier subject only in parent directory", () => {});',
        filename: (() => {
          createFile('web/nested/Ancestor.tsx');
          return createFile('web/nested/inner/Ancestor.qualifier.test.tsx');
        })(),
        errors: [{ messageId: 'misplacedTestFile' }],
      },
      {
        code: 'describe("qualifier prefix resolves only to a declaration file", () => {});',
        filename: (() => {
          createFile('web/types/Declared.d.ts');
          return createFile('web/types/Declared.qualifier.test.ts');
        })(),
        errors: [{ messageId: 'misplacedTestFile' }],
      },
      {
        code: 'describe("qualifier prefix resolves only to a json file", () => {});',
        filename: (() => {
          createFile('web/data/Payload.json');
          return createFile('web/data/Payload.qualifier.test.ts');
        })(),
        errors: [{ messageId: 'misplacedTestFile' }],
      },
      {
        code: 'describe("qualifier prefix needs an unregistered extension", () => {});',
        filename: (() => {
          createFile('scripts/pipeline.sh');
          return createFile('scripts/pipeline.smoke.test.ts');
        })(),
        errors: [{ messageId: 'misplacedTestFile' }],
      },
      {
        code: 'describe("dotfile stem does not match a bare extension sibling", () => {});',
        filename: (() => {
          createFile('web/dotfiles/.ts');
          return createFile('web/dotfiles/.hidden.test.ts');
        })(),
        errors: [{ messageId: 'misplacedTestFile' }],
      },
      {
        code: 'describe("report names both the full stem and the leading segment", () => {});',
        filename: orphanQualifierFilename,
        errors: [
          {
            message: expectedMessageFor(orphanQualifierFilename, [
              'Orphan.qualifier.ts',
              'Orphan.qualifier.tsx',
              'Orphan.qualifier.js',
              'Orphan.qualifier.jsx',
              'Orphan.ts',
              'Orphan.tsx',
              'Orphan.js',
              'Orphan.jsx',
            ]),
          },
        ],
      },
      {
        code: 'describe("report for a dotless stem names it once", () => {});',
        filename: orphanPlainFilename,
        errors: [
          {
            message: expectedMessageFor(orphanPlainFilename, [
              'Plain.ts',
              'Plain.tsx',
              'Plain.js',
              'Plain.jsx',
            ]),
          },
        ],
      },
      {
        code: 'describe("extensionless stem has no subject to probe", () => {});',
        filename: createFile('web/bare/.test.ts'),
        errors: [{ messageId: 'misplacedTestFile' }],
      },
      {
        code: 'describe("suffix match is not a prefix match", () => {});',
        filename: (() => {
          createFile('web/suffix/bar.tsx');
          return createFile('web/suffix/Foo.bar.test.tsx');
        })(),
        errors: [{ messageId: 'misplacedTestFile' }],
      },
    ],
  },
);

// Issue #1476: the reported path must be anchored at the directory ESLint was
// configured with, not the node process cwd. RuleTester cannot express this —
// its Linter's cwd defaults to the process cwd, making the two reads
// indistinguishable — so the rule is driven through a Linter with an explicit,
// deliberately different cwd.
describe('test-file-location-enforcement: reported path anchors at the configured cwd', () => {
  const lintOrphanWithCwd = (cwd: string, filename: string) => {
    const linter = new Linter({ cwd });
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      'test/test-file-location-enforcement',
      testFileLocationEnforcement as unknown as Rule.RuleModule,
    );
    return linter.verify(
      'describe("orphan", () => {});',
      {
        parser: '@typescript-eslint/parser',
        parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
        rules: { 'test/test-file-location-enforcement': 'error' },
      },
      filename,
    );
  };

  it('names the file relative to the configured cwd, not the process cwd', () => {
    // The orphan lives inside the OS temp dir, which is never the jest process
    // cwd — reading the process cwd would emit a path full of `../` segments
    // that no reader can locate from the configured project root.
    const configuredCwd = tempDir;
    const orphan = createFile('cwd-anchor/Unpaired.test.ts');

    const messages = lintOrphanWithCwd(configuredCwd, orphan);

    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain(
      `Test file "${path.join('cwd-anchor', 'Unpaired.test.ts')}"`,
    );
    expect(messages[0].message).not.toContain('..');
  });

  it('leaves a non-absolute filename untouched regardless of the configured cwd', () => {
    const messages = lintOrphanWithCwd(tempDir, 'nested/Unresolved.test.ts');

    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain(
      'Test file "nested/Unresolved.test.ts"',
    );
  });
});

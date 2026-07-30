import path from 'path';
import { ESLint } from 'eslint';
import { ruleTesterTs } from '../utils/ruleTester';
import { avoidUtilsDirectory } from '../rules/avoid-utils-directory';

const formatError = (filePath: string) => ({
  messageId: 'avoidUtils' as const,
  data: { path: filePath },
});

ruleTesterTs.run('avoid-utils-directory', avoidUtilsDirectory, {
  valid: [
    {
      code: 'const x = 1;',
      filename: 'src/util/helper.ts',
    },
    {
      code: 'const x = 1;',
      filename: 'src/components/util/helper.ts',
    },
    {
      code: 'const x = 1;',
      filename: 'src/myutils/helper.ts', // Should not flag when utils is part of another word
    },
    {
      code: 'const x = 1;',
      filename: 'node_modules/package/utils/helper.ts', // Should not flag node_modules
    },
    {
      code: 'const x = 1;',
      // Issue #1270: a Windows backslash path NOT in a utils dir stays exempt.
      filename: 'C:\\repo\\src\\util\\helper.ts',
    },
  ],
  invalid: [
    {
      code: 'const x = 1;',
      filename: 'src/utils/helper.ts',
      errors: [formatError('src/utils/helper.ts')],
    },
    {
      code: 'const x = 1;',
      filename: 'src/components/utils/helper.ts',
      errors: [formatError('src/components/utils/helper.ts')],
    },
    {
      code: 'const x = 1;',
      filename: 'src/Utils/helper.ts', // Case insensitive check
      errors: [formatError('src/Utils/helper.ts')],
    },
    {
      code: 'const x = 1;',
      // Issue #1270: a Windows backslash utils path must be flagged. Before
      // separator normalization the forward-slash regex never matched, so the
      // rule silently no-op'd on Windows. The reported path is normalized.
      filename: 'C:\\repo\\src\\utils\\helper.ts',
      errors: [formatError('C:/repo/src/utils/helper.ts')],
    },
  ],
});

// Issue #1475: the reported path is anchored at the cwd ESLint was configured
// with, not the node process cwd. The two differ under the VS Code ESLint
// extension, in monorepos, and for any programmatic `new ESLint({ cwd })`, and
// anchoring at the process cwd names a file the reader cannot locate.
//
// RuleTester cannot express this: its Linter's cwd defaults to process.cwd(),
// which makes the correct and the incorrect read indistinguishable. These cases
// therefore drive the ESLint class with a cwd deliberately unrelated to the
// process cwd.
describe('avoid-utils-directory: the ESLint cwd anchors the reported path (issue #1475)', () => {
  const RULE_ID = '@blumintinc/blumint/avoid-utils-directory';
  // Absolute and non-existent: lintText never reads the disk, and a root that
  // shares no prefix with the process cwd makes a process-cwd read visibly wrong
  // rather than accidentally close.
  const PROJECT_ROOT = '/eslint-cwd-1475';

  const plugin = {
    rules: {
      'avoid-utils-directory': avoidUtilsDirectory,
    },
  };

  const lintAt = async (relativePath: string) => {
    const eslint = new ESLint({
      cwd: PROJECT_ROOT,
      useEslintrc: false,
      plugins: { '@blumintinc/blumint': plugin as never },
      overrideConfig: {
        parser: require.resolve('@typescript-eslint/parser'),
        parserOptions: {
          ecmaVersion: 2022 as const,
          sourceType: 'module' as const,
        },
        plugins: ['@blumintinc/blumint'],
        rules: { [RULE_ID]: 'error' as const },
      },
    });
    const [result] = await eslint.lintText('export const x = 1;\n', {
      filePath: path.posix.join(PROJECT_ROOT, relativePath),
    });
    return result.messages.filter((message) => message.ruleId === RULE_ID);
  };

  const reportedPathsOf = (messages: { message: string }[]) =>
    messages.map((message) => /^Path "([^"]*)"/.exec(message.message)?.[1]);

  it('runs with an ESLint cwd that is not the process cwd', () => {
    expect(PROJECT_ROOT).not.toBe(process.cwd());
    expect(process.cwd().startsWith(`${PROJECT_ROOT}/`)).toBe(false);
  });

  it('reports a path relative to the ESLint cwd, not the process cwd', async () => {
    const messages = await lintAt('src/utils/helpers.ts');

    expect(reportedPathsOf(messages)).toEqual(['src/utils/helpers.ts']);
  });

  it('reports a nested utils path relative to the ESLint cwd', async () => {
    const messages = await lintAt('packages/app/src/components/utils/date.ts');

    expect(reportedPathsOf(messages)).toEqual([
      'packages/app/src/components/utils/date.ts',
    ]);
  });

  it('leaves a util/ file unreported regardless of the cwd', async () => {
    expect(await lintAt('src/util/helpers.ts')).toEqual([]);
  });
});

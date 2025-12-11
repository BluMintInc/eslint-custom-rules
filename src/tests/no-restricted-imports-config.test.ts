import { ESLint, Linter } from 'eslint';
// Using require to avoid test build-time ESM interop issues; the test runner
// only needs the config object shape, not types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as { configs?: Record<string, unknown> };

type ConfigWithOverrides = Linter.Config & {
  overrides?: Linter.ConfigOverride[];
};

const recommendedConfig = (plugin.configs?.recommended ??
  {}) as ConfigWithOverrides;

const restrictedImportsOverrides =
  recommendedConfig.overrides?.filter((override) => {
    const ruleConfig = override.rules?.['no-restricted-imports'];
    return Boolean(ruleConfig);
  }) ?? [];

const eslint = new ESLint({
  useEslintrc: false,
  baseConfig: {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    overrides: restrictedImportsOverrides,
  },
});

async function lint(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages;
}

describe('recommended no-restricted-imports override for frontend/backend boundaries', () => {
  it('includes overrides for both functions/src and functions/*.f.ts files', () => {
    expect(restrictedImportsOverrides).toHaveLength(2);
  });

  it('allows frontend files importing from functions/src (backend)', async () => {
    const messages = await lint(
      "import { RequestMessageDatum } from '../../../functions/src/util/moralis/config';",
      'src/util/moralis/auth.ts',
    );

    expect(messages).toHaveLength(0);
  });

  it('flags Cloud Function .f.ts files importing from frontend src/**', async () => {
    const messages = await lint(
      "import { AuthClient } from '../../src/util/auth/client';",
      'functions/src/handle-login.f.ts',
    );

    expect(messages).toEqual([
      expect.objectContaining({
        ruleId: 'no-restricted-imports',
        message: expect.stringContaining('Cloud Functions'),
      }),
    ]);
  });

  it('allows Cloud Function .f.ts files importing functions/src backend modules', async () => {
    const messages = await lint(
      "import { AuthClient } from '../util/auth/client';",
      'functions/src/auth/handle-login.f.ts',
    );

    expect(messages).toHaveLength(0);
  });

  it('allows Cloud Function .f.ts files importing other backend modules', async () => {
    const messages = await lint(
      "import { queueJob } from './jobs';",
      'functions/src/auth/handle-login.f.ts',
    );

    expect(messages).toHaveLength(0);
  });

  it('flags Cloud Function entrypoints outside functions/src importing frontend src/**', async () => {
    const messages = await lint(
      "import { AuthClient } from '../src/util/auth/client';",
      'functions/index.f.ts',
    );

    expect(messages).toEqual([
      expect.objectContaining({
        ruleId: 'no-restricted-imports',
        message: expect.stringContaining('Cloud Functions'),
      }),
    ]);
  });

  it('allows Cloud Function entrypoints outside functions/src importing backend helpers', async () => {
    const messages = await lint(
      "import { register } from './src/deploy';",
      'functions/index.f.ts',
    );

    expect(messages).toHaveLength(0);
  });

  it('flags deeply nested Cloud Function entrypoints outside functions/src importing frontend src/**', async () => {
    const messages = await lint(
      "import { AuthClient } from '../../../../../../src/util/auth/client';",
      'functions/a/b/c/d/e/handle.f.ts',
    );

    expect(messages).toEqual([
      expect.objectContaining({
        ruleId: 'no-restricted-imports',
        message: expect.stringContaining('Cloud Functions'),
      }),
    ]);
  });
});

import { ESLint, Linter } from 'eslint';
import plugin = require('..');

type ConfigWithOverrides = Linter.Config & {
  overrides?: Linter.ConfigOverride[];
};

const recommendedConfig = (
  (plugin as { configs?: Record<string, unknown> }).configs?.recommended ??
  {}
) as ConfigWithOverrides;

const restrictedImportsOverride = recommendedConfig.overrides?.find((override) => {
  const ruleConfig = override.rules?.['no-restricted-imports'];
  return Boolean(ruleConfig);
});

if (!restrictedImportsOverride) {
  throw new Error(
    'Expected a no-restricted-imports override in the recommended config.',
  );
}

const eslint = new ESLint({
  useEslintrc: false,
  baseConfig: {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    overrides: [restrictedImportsOverride],
  },
});

async function lint(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages;
}

describe('recommended no-restricted-imports override for frontend/backend boundaries', () => {
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
      'functions/src/auth/handle-login.f.ts',
    );

    expect(messages).toEqual([
      expect.objectContaining({
        ruleId: 'no-restricted-imports',
        message: expect.stringContaining('Cloud Functions'),
      }),
    ]);
  });

  it('allows Cloud Function .f.ts files importing other backend modules', async () => {
    const messages = await lint(
      "import { queueJob } from './jobs';",
      'functions/src/auth/handle-login.f.ts',
    );

    expect(messages).toHaveLength(0);
  });
});

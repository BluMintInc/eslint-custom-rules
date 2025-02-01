import { ESLintUtils } from '@typescript-eslint/utils';
import { RuleTester } from 'eslint';

export const ruleTesterTs = new ESLintUtils.RuleTester({
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
  },
});

export const ruleTesterJsx = new ESLintUtils.RuleTester({
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
  },
});

export const ruleTesterJson = new RuleTester({
  parser: require.resolve('jsonc-eslint-parser'),
  parserOptions: {
    ecmaVersion: 2020,
  },
});

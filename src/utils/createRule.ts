import { ESLintUtils } from '@typescript-eslint/utils';

export const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `https://github.com/BluMintInc/eslint-custom-rules/docs/rules/${name}.md`,
);

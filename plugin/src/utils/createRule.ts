import { ESLintUtils } from '@typescript-eslint/utils';

export const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `https://github.com/BluMintInc/custom-eslint-rules/plugin/docs/rules/${name}.md`,
);

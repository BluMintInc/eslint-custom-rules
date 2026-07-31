import { ESLintUtils } from '@typescript-eslint/utils';

// A repo-relative path needs GitHub's `/blob/<branch>/` segment to resolve;
// without it every rule's `meta.docs.url` 404s, breaking the doc link the IDE
// renders on hover. Pinned to `main` because that is the released branch.
export const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `https://github.com/BluMintInc/eslint-custom-rules/blob/main/docs/rules/${name}.md`,
);

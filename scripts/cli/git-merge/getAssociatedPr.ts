import { runCommand } from '../git-utils';
import { normalizeBranchName } from './normalizeBranchName';

/**
 * Detects if MERGE_HEAD has an associated open PR by querying GitHub.
 * Returns the PR number if found, or null if the merge is from a
 * local branch without a PR.
 */
export function fetchAssociatedPr() {
  try {
    const mergeHeadBranch = runCommand(
      'git name-rev --name-only MERGE_HEAD',
      true,
    );

    const cleanBranchName = normalizeBranchName(mergeHeadBranch);

    if (!cleanBranchName) {
      return null;
    }

    const result = runCommand(
      `gh pr list --head ${JSON.stringify(
        cleanBranchName,
      )} --state open --json number --jq '.[0].number'`,
      true,
    );

    if (!result || result === 'null') {
      return null;
    }

    const prNumber = Number.parseInt(result, 10);
    return Number.isFinite(prNumber) ? prNumber : null;
  } catch {
    return null;
  }
}

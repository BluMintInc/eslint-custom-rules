import { runCommand } from '../git-utils';

/**
 * Check if the repository is currently in a merge conflict state
 * by verifying that MERGE_HEAD exists.
 */
export function isInMergeConflictState() {
  try {
    runCommand('git rev-parse -q --verify MERGE_HEAD', true);
    return true;
  } catch {
    return false;
  }
}

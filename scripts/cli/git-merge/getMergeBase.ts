import { runCommand } from '../git-utils';

/**
 * Returns the merge-base commit SHA between HEAD and MERGE_HEAD.
 * This is the common ancestor from which both branches diverged.
 */
export function retrieveMergeBase() {
  return runCommand('git merge-base HEAD MERGE_HEAD', true);
}

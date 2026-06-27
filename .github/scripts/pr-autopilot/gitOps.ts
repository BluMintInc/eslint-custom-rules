import { execFileSync, execSync } from 'node:child_process';
import { runCommand } from '../../../scripts/cli/git-utils';
import { logWithTimestamp } from './logWithTimestamp';
import { extractErrorMessage } from './types';

/**
 * git operations for the autopilot loop. The loop runs in the repo root, so
 * `runCommand` (which executes against `process.cwd()`) and the explicit-`cwd`
 * execSync calls target the same working tree.
 */

const currentBranch = (cwd: string): string => {
  return execSync('git rev-parse --abbrev-ref HEAD', {
    encoding: 'utf8',
    cwd,
    stdio: 'pipe',
  }).trim();
};

/** True when the working tree has staged or unstaged changes. */
export const hasChanges = (cwd: string): boolean => {
  const status = execSync('git status --porcelain', {
    encoding: 'utf8',
    cwd,
    stdio: 'pipe',
  }).trim();
  return status.length > 0;
};

/**
 * Stages everything and commits with a `chore:`-scoped message (tooling work is
 * not a rule change, so a `fix`/`feat` scope would trip the commit-scope gate).
 * Returns true when a commit was created, false when the tree was clean.
 */
export const commitAll = (cwd: string, subject: string): boolean => {
  execSync('git add -A', { cwd, stdio: 'pipe' });
  let staged: boolean;
  try {
    execSync('git diff --cached --quiet', { cwd, stdio: 'pipe' });
    staged = false;
  } catch (error: unknown) {
    /** Exit 1 = staged diffs exist; anything else is a real git error. */
    if ((error as { status?: number }).status === 1) {
      staged = true;
    } else {
      throw error;
    }
  }
  if (!staged) {
    return false;
  }
  /**
   * Pass the message as an argv element via execFileSync (no shell): `subject`
   * carries attacker-influenced data (e.g. a CI check name), so a shell here
   * would let `$(…)`/backticks in it execute arbitrary commands — quote-escaping
   * alone does not close that hole.
   */
  execFileSync('git', ['commit', '-m', `chore(repo): ${subject}`], {
    cwd,
    stdio: 'pipe',
  });
  return true;
};

/**
 * Pushes the current branch, retrying once after a `pull --rebase` when the
 * remote has advanced. Returns true if the push ultimately succeeded.
 */
export const pushWithRebaseRetry = (cwd: string): boolean => {
  const branch = currentBranch(cwd);
  try {
    runCommand(`git push origin ${branch}`, true);
    return true;
  } catch (pushError) {
    logWithTimestamp(
      `Push failed, attempting pull --rebase and retry: ${extractErrorMessage(
        pushError,
      )}`,
    );
    try {
      runCommand(`git pull --rebase origin ${branch}`, true);
      runCommand(`git push origin ${branch}`, true);
      return true;
    } catch (retryError) {
      logWithTimestamp(`Push retry failed: ${extractErrorMessage(retryError)}`);
      return false;
    }
  }
};

/**
 * Merges `origin/<baseBranch>` into the current branch to keep the PR current.
 * Returns the merge outcome; `conflict` leaves the merge in progress for the
 * caller to resolve.
 */
export const mergeBaseBranch = (
  baseBranch: string,
): 'up-to-date' | 'merged' | 'conflict' => {
  runCommand(`git fetch origin ${baseBranch}`, true);
  try {
    const output = runCommand(`git merge --no-edit origin/${baseBranch}`, true);
    if (/Already up[- ]to[- ]date/.test(output)) {
      return 'up-to-date';
    }
    return 'merged';
  } catch (error: unknown) {
    const conflicted = runCommand(
      'git diff --name-only --diff-filter=U',
      true,
    );
    if (conflicted.trim().length > 0) {
      return 'conflict';
    }
    throw new Error(
      `git merge origin/${baseBranch} failed for a non-conflict reason: ${extractErrorMessage(
        error,
      )}`,
    );
  }
};

/** Aborts an in-progress merge; no-op when none is in progress. */
export const abortMerge = (cwd: string): void => {
  try {
    execSync('git merge --abort', { cwd, stdio: 'pipe' });
  } catch {
    /** No merge in progress. */
  }
};

/**
 * Resets the working tree to HEAD, dropping any partial edits and untracked
 * files. Used when a spawned agent is killed mid-task (timeout): its work never
 * passed the validation stop hook, so committing it is unsafe and leaving it
 * dirty would break the next cycle's base merge. The loop is the sole writer of
 * its own branch during a run, so discarding to HEAD is safe here.
 */
export const discardChanges = (cwd: string): void => {
  execSync('git reset --hard HEAD', { cwd, stdio: 'pipe' });
  execSync('git clean -fd', { cwd, stdio: 'pipe' });
};

import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { isInMergeConflictState } from '../../../scripts/cli/git-merge/isInMergeConflictState';
import { runCommand } from '../../../scripts/cli/git-utils';
import { logWithTimestamp } from './logWithTimestamp';
import { extractErrorMessage } from './types';
import { spawnClaude, DEFAULT_SPAWN_TIMEOUT_MS } from './spawnClaude';
import { detectRateLimit, waitForRateLimit } from './detectRateLimit';

const MAX_ATTEMPTS = 3;

/**
 * Resolves an in-progress merge by generating a conflict prompt via
 * `address-merge-conflicts.ts`, then spawning Claude to resolve. Finalizes with
 * `git commit --no-edit` once no conflicted files remain. Returns true on a
 * committed resolution, false if it could not converge.
 */
export const resolveConflicts = async (
  cwd: string,
  timeoutMs: number = DEFAULT_SPAWN_TIMEOUT_MS,
): Promise<boolean> => {
  const repoRoot = runCommand('git rev-parse --show-toplevel', true);
  const scriptPath = path.join(
    repoRoot,
    '.github',
    'scripts',
    'address-merge-conflicts.ts',
  );
  const promptPath = path.join(
    repoRoot,
    '.claude',
    'tmp',
    'merge-conflict-prompt.md',
  );

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    logWithTimestamp(`Conflict resolution attempt ${attempt}/${MAX_ATTEMPTS}...`);

    try {
      execSync(`npx tsx "${scriptPath}"`, {
        encoding: 'utf8',
        cwd,
        stdio: 'pipe',
        timeout: 300_000,
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (error: unknown) {
      logWithTimestamp(
        `address-merge-conflicts failed: ${extractErrorMessage(error)}`,
      );
      return false;
    }

    const result = await spawnClaude(promptPath, cwd, timeoutMs);
    const rateLimit = detectRateLimit(result);
    if (rateLimit.isRateLimited) {
      await waitForRateLimit(rateLimit, logWithTimestamp);
      continue;
    }
    if (result.timedOut) {
      logWithTimestamp(
        'Claude timed out resolving conflicts; aborting this attempt.',
      );
      return false;
    }

    if (!isInMergeConflictState()) {
      logWithTimestamp('Merge conflicts resolved (merge already committed).');
      return true;
    }

    const conflicted = runCommand(
      'git diff --name-only --diff-filter=U',
      true,
    ).trim();
    if (conflicted.length > 0) {
      const count = conflicted.split('\n').filter((line) => line.length > 0)
        .length;
      logWithTimestamp(
        `${count} conflicted file(s) remain after attempt ${attempt}.`,
      );
      continue;
    }

    try {
      runCommand('git commit --no-edit', true);
      logWithTimestamp('Merge conflicts resolved and committed.');
      return true;
    } catch (error: unknown) {
      logWithTimestamp(`Merge commit failed: ${extractErrorMessage(error)}`);
    }
  }

  return false;
};

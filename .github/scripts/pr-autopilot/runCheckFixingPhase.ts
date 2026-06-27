import * as fs from 'node:fs';
import * as path from 'node:path';
import { logWithTimestamp } from './logWithTimestamp';
import { extractErrorMessage, MAX_CHECK_FIX_ATTEMPTS } from './types';
import { getFailingChecks } from './fetchPrState';
import { fetchCheckLogs } from './fetchCheckLogs';
import { buildCheckFixPrompt } from './buildPrompt';
import { spawnClaude, DEFAULT_SPAWN_TIMEOUT_MS } from './spawnClaude';
import { detectRateLimit, waitForRateLimit } from './detectRateLimit';
import {
  commitAll,
  discardChanges,
  hasChanges,
  pushWithRebaseRetry,
} from './gitOps';

const writePrompt = (cwd: string, content: string): string => {
  const promptDir = path.resolve(cwd, '.claude', 'tmp');
  fs.mkdirSync(promptDir, { recursive: true });
  const promptPath = path.resolve(promptDir, 'check-fix-prompt.md');
  fs.writeFileSync(promptPath, content, 'utf8');
  return promptPath;
};

/**
 * Attempts to fix failing CI checks one at a time. Returns true once a fix has
 * been committed and pushed (the caller re-evaluates next cycle), false when no
 * fix was pushed (no failures, all exhausted, or the agent made no change).
 *
 * A per-check attempt counter (shared across cycles) acts as a circuit breaker
 * so a perpetually-failing check cannot loop forever.
 */
export const runCheckFixingPhase = async (
  pr: number,
  cwd: string,
  attemptCounts: Map<string, number>,
  timeoutMs: number = DEFAULT_SPAWN_TIMEOUT_MS,
): Promise<boolean> => {
  const failingChecks = getFailingChecks(pr, cwd);
  if (failingChecks.length === 0) {
    logWithTimestamp('No failing checks.');
    return false;
  }

  logWithTimestamp(
    `Found ${failingChecks.length} failing check(s): ${failingChecks
      .map((check) => check.name)
      .join(', ')}`,
  );

  for (const check of failingChecks) {
    /** Distinct jobs can share a display name (e.g. matrix legs), so key the
     * retry budget by workflow+name; otherwise one exhausted job suppresses a
     * different failure that has never been tried. */
    const checkKey = `${check.workflow}:${check.name}`;
    const attempts = attemptCounts.get(checkKey) ?? 0;
    if (attempts >= MAX_CHECK_FIX_ATTEMPTS) {
      logWithTimestamp(
        `Skipping '${check.name}' — exceeded max fix attempts (${MAX_CHECK_FIX_ATTEMPTS}). Manual intervention required.`,
      );
      continue;
    }

    let promptPath: string;
    try {
      const context = fetchCheckLogs(check, cwd);
      promptPath = writePrompt(
        cwd,
        buildCheckFixPrompt(
          context.checkName,
          context.workflowUrl,
          context.logExcerpt,
        ),
      );
    } catch (error) {
      logWithTimestamp(
        `Failed to build context for '${check.name}': ${extractErrorMessage(
          error,
        )}. Skipping.`,
      );
      attemptCounts.set(checkKey, attempts + 1);
      continue;
    }

    logWithTimestamp(`Spawning Claude to fix '${check.name}'...`);
    const result = await spawnClaude(promptPath, cwd, timeoutMs);

    const rateLimit = detectRateLimit(result);
    if (rateLimit.isRateLimited) {
      await waitForRateLimit(rateLimit, logWithTimestamp);
      return false;
    }

    if (result.timedOut) {
      logWithTimestamp(
        `Claude timed out fixing '${check.name}'; discarding partial changes.`,
      );
      discardChanges(cwd);
      attemptCounts.set(checkKey, attempts + 1);
      continue;
    }

    if (result.exitCode !== 0) {
      logWithTimestamp(
        `Claude exited with code ${result.exitCode} for '${check.name}'. Checking for partial changes...`,
      );
    }

    if (!hasChanges(cwd)) {
      logWithTimestamp(
        `Claude made no changes for '${check.name}'. Incrementing attempt counter.`,
      );
      attemptCounts.set(checkKey, attempts + 1);
      continue;
    }

    commitAll(cwd, `fix failing ${check.name} CI check`);
    const pushed = pushWithRebaseRetry(cwd);
    if (pushed) {
      /** Consume the attempt only once the fix is pushed. A failed push leaves a
       * local commit the next cycle re-pushes, so burning the budget here could
       * exhaust the check without the already-made fix ever being retried. */
      attemptCounts.set(checkKey, attempts + 1);
    }
    return pushed;
  }

  logWithTimestamp('All failing checks either exhausted or skipped.');
  return false;
};

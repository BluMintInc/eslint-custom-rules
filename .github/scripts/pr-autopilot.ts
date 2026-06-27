#!/usr/bin/env tsx

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ensureDependency,
  inferPrFromBranch,
  retrieveCurrentBranch,
} from '../../scripts/cli/git-utils';
import { logWithTimestamp } from './pr-autopilot/logWithTimestamp';
import { extractErrorMessage } from './pr-autopilot/types';
import {
  parseAutopilotArgs,
  type AutopilotOption,
} from './pr-autopilot/parseAutopilotArgs';
import {
  fetchBaseBranch,
  fetchUnresolvedComments,
  getPrCiStatus,
  type PrCiStatus,
} from './pr-autopilot/fetchPrState';
import { buildCommentPrompt } from './pr-autopilot/buildPrompt';
import { spawnClaude } from './pr-autopilot/spawnClaude';
import {
  detectRateLimit,
  waitForRateLimit,
} from './pr-autopilot/detectRateLimit';
import { runCheckFixingPhase } from './pr-autopilot/runCheckFixingPhase';
import { resolveConflicts } from './pr-autopilot/resolveConflicts';
import {
  abortMerge,
  commitAll,
  hasChanges,
  mergeBaseBranch,
  pushWithRebaseRetry,
} from './pr-autopilot/gitOps';

let isShuttingDown = false;

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
};

const writeCommentPrompt = (cwd: string, content: string): string => {
  const promptDir = path.resolve(cwd, '.claude', 'tmp');
  fs.mkdirSync(promptDir, { recursive: true });
  const promptPath = path.resolve(promptDir, 'pr-autopilot-comment-prompt.md');
  fs.writeFileSync(promptPath, content, 'utf8');
  return promptPath;
};

const resolvePr = (options: AutopilotOption): number => {
  if (options.pr !== undefined) {
    return options.pr;
  }
  const branch = retrieveCurrentBranch();
  const inferred = inferPrFromBranch(branch);
  if (inferred === undefined) {
    console.error(
      `Error: no open PR found for branch '${branch}'. Pass --pr=<number>.`,
    );
    process.exit(1);
  }
  return inferred;
};

const main = async (): Promise<void> => {
  let options: AutopilotOption;
  try {
    options = parseAutopilotArgs();
  } catch (error) {
    console.error(extractErrorMessage(error));
    console.error(
      'Usage: npm run pr-autopilot -- [--pr=<number>] [--poll-interval=<seconds>] [--max-idle-cycles=<n>] [--max-runtime=<seconds>]',
    );
    process.exit(1);
  }

  ensureDependency('gh');
  ensureDependency('git');
  ensureDependency('claude');

  const cwd = process.cwd();
  const pr = resolvePr(options);
  const baseBranch = fetchBaseBranch(pr, cwd);

  logWithTimestamp(
    `Watching PR #${pr} (base '${baseBranch}'). Poll interval: ${options.pollIntervalSeconds}s.`,
  );

  const shutdown = () => {
    isShuttingDown = true;
    logWithTimestamp('Shutting down...');
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  /** Per-check attempt counts (circuit breaker), shared across cycles. */
  const checkFixAttemptCounts = new Map<string, number>();
  /**
   * Comment URLs already handed to the agent this run. GraphQL threads cannot be
   * cheaply resolved here, so we avoid re-addressing the same comment within one
   * run; CodeRabbit re-reviews the new commit and emits fresh comment IDs.
   */
  const handledCommentUrls = new Set<string>();

  const loopStartMs = Date.now();
  let consecutiveIdleCycles = 0;

  const remainingRuntimeMs = (): number | undefined => {
    if (options.maxRuntimeSeconds === undefined) {
      return undefined;
    }
    return Math.max(
      0,
      options.maxRuntimeSeconds * 1000 - (Date.now() - loopStartMs),
    );
  };

  const sleepUntilNextCycle = async (): Promise<void> => {
    const remaining = remainingRuntimeMs();
    if (remaining === 0) {
      return;
    }
    const pollMs = options.pollIntervalSeconds * 1000;
    await sleep(remaining === undefined ? pollMs : Math.min(pollMs, remaining));
  };

  while (!isShuttingDown) {
    if (
      options.maxRuntimeSeconds !== undefined &&
      (Date.now() - loopStartMs) / 1000 >= options.maxRuntimeSeconds
    ) {
      logWithTimestamp(
        `Max runtime (${options.maxRuntimeSeconds}s) reached. Exiting.`,
      );
      break;
    }

    try {
      await runCycle({
        pr,
        cwd,
        baseBranch,
        options,
        checkFixAttemptCounts,
        handledCommentUrls,
        onProgress: () => {
          consecutiveIdleCycles = 0;
        },
        onIdle: (ciStatus) => {
          if (ciStatus === 'pending') {
            consecutiveIdleCycles = 0;
            return false;
          }
          consecutiveIdleCycles += 1;
          if (
            options.maxIdleCycles !== undefined &&
            consecutiveIdleCycles >= options.maxIdleCycles
          ) {
            const reason =
              ciStatus === 'green'
                ? 'no comments, CI green'
                : 'no comments, CI failing (fixes exhausted)';
            logWithTimestamp(
              `PR converged: ${consecutiveIdleCycles} consecutive idle cycle(s) (${reason}). Exiting.`,
            );
            return true;
          }
          return false;
        },
      }).then((shouldExit) => {
        if (shouldExit) {
          isShuttingDown = true;
        }
      });
    } catch (error) {
      logWithTimestamp(`Unexpected error: ${extractErrorMessage(error)}`);
    }

    if (isShuttingDown) {
      break;
    }
    await sleepUntilNextCycle();
  }

  logWithTimestamp('Autopilot stopped.');
};

type CycleArg = {
  pr: number;
  cwd: string;
  baseBranch: string;
  options: AutopilotOption;
  checkFixAttemptCounts: Map<string, number>;
  handledCommentUrls: Set<string>;
  onProgress: () => void;
  /** Returns true when the converged-exit condition is met. */
  onIdle: (ciStatus: PrCiStatus) => boolean;
};

/** Runs one autopilot cycle. Returns true when the loop should exit. */
const runCycle = async (arg: CycleArg): Promise<boolean> => {
  const {
    pr,
    cwd,
    baseBranch,
    checkFixAttemptCounts,
    handledCommentUrls,
    onProgress,
    onIdle,
  } = arg;

  logWithTimestamp(`Merging '${baseBranch}' to keep PR current...`);
  const mergeResult = mergeBaseBranch(baseBranch);
  if (mergeResult === 'conflict') {
    logWithTimestamp('Merge conflicts detected. Resolving...');
    const resolved = await resolveConflicts(cwd).catch((error) => {
      logWithTimestamp(`resolveConflicts threw: ${extractErrorMessage(error)}`);
      return false;
    });
    if (!resolved) {
      logWithTimestamp('Could not resolve conflicts. Aborting merge; retrying next cycle.');
      abortMerge(cwd);
      return false;
    }
    pushWithRebaseRetry(cwd);
  } else if (mergeResult === 'merged') {
    logWithTimestamp('Base merged cleanly.');
    pushWithRebaseRetry(cwd);
  }

  const allComments = fetchUnresolvedComments(pr, cwd);
  const newComments = allComments.filter(
    (comment) => !handledCommentUrls.has(comment.url),
  );

  if (newComments.length === 0) {
    logWithTimestamp('No new unresolved comments. Checking CI status...');
    const pushedFix = await runCheckFixingPhase(
      pr,
      cwd,
      checkFixAttemptCounts,
    ).catch((error) => {
      logWithTimestamp(`Check-fixing error: ${extractErrorMessage(error)}`);
      return false;
    });

    if (pushedFix) {
      /** A pushed fix changes the tree — reset breakers and treat as progress. */
      checkFixAttemptCounts.clear();
      onProgress();
      return false;
    }

    let ciStatus: PrCiStatus;
    try {
      ciStatus = getPrCiStatus(pr, cwd);
    } catch (error) {
      logWithTimestamp(
        `Could not determine CI status: ${extractErrorMessage(
          error,
        )}. Treating cycle as non-idle.`,
      );
      ciStatus = 'pending';
    }
    return onIdle(ciStatus);
  }

  onProgress();
  logWithTimestamp(
    `${newComments.length} new unresolved comment(s). Spawning Claude...`,
  );
  for (const comment of newComments) {
    handledCommentUrls.add(comment.url);
  }

  const promptPath = writeCommentPrompt(cwd, buildCommentPrompt(newComments));
  const result = await spawnClaude(promptPath, cwd);

  const rateLimit = detectRateLimit(result);
  if (rateLimit.isRateLimited) {
    await waitForRateLimit(rateLimit, logWithTimestamp);
    return false;
  }
  if (result.exitCode !== 0) {
    logWithTimestamp(
      `Claude exited with code ${result.exitCode}. Committing any changes...`,
    );
  }

  if (!hasChanges(cwd)) {
    logWithTimestamp('Agent produced no changes this cycle.');
    return false;
  }

  commitAll(cwd, `address PR #${pr} review comments`);
  if (pushWithRebaseRetry(cwd)) {
    /** New commit can trigger fresh CI — give exhausted checks another chance. */
    checkFixAttemptCounts.clear();
  }
  logWithTimestamp('Cycle complete.');
  return false;
};

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

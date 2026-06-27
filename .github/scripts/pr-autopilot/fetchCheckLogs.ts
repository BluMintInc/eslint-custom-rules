import { execSync } from 'node:child_process';
import { type CheckStatus, type CheckFixContext, MAX_LOG_LINES } from './types';

/** PURE: keeps the trailing window of log lines so prompts stay bounded. */
export const truncateLog = (logs: string): string => {
  const lines = logs.split('\n');
  if (lines.length <= MAX_LOG_LINES) {
    return logs;
  }
  return lines.slice(-MAX_LOG_LINES).join('\n');
};

/**
 * Fetches the failed-step logs for a check's workflow run via
 * `gh run view <runId> --log-failed`. Falls back to a generic message when the
 * check link carries no parseable Actions run ID (e.g. an external check).
 */
export const fetchCheckLogs = (
  check: CheckStatus,
  cwd: string,
): CheckFixContext => {
  const runIdMatch = /\/actions\/runs\/(\d+)/.exec(check.link);
  if (!runIdMatch) {
    return {
      checkName: check.name,
      workflowUrl: check.link,
      logExcerpt: `(No Actions run ID in check link: ${check.link}. Inspect the check manually.)`,
    };
  }
  const runId = runIdMatch[1];

  let logs: string;
  try {
    logs = execSync(`gh run view ${runId} --log-failed`, {
      encoding: 'utf8',
      cwd,
      stdio: 'pipe',
      maxBuffer: 50 * 1024 * 1024,
      /** Bound a stalled `gh` so a single hung call can't freeze the
       * check-fixing loop; a timeout throws into the fallback below. */
      timeout: 120_000,
    });
  } catch (error: unknown) {
    const stdout = (error as { stdout?: string }).stdout;
    logs =
      typeof stdout === 'string' && stdout.trim().length > 0
        ? stdout
        : `(Could not fetch logs for run ${runId}.)`;
  }

  return {
    checkName: check.name,
    workflowUrl: check.link,
    logExcerpt: truncateLog(logs.trim()),
  };
};

/** Default poll interval (seconds) between autopilot cycles. */
export const DEFAULT_POLL_INTERVAL = 60;

const MAX_POLL_INTERVAL_SECONDS = Math.floor(2_147_483_647 / 1000);

export type AutopilotOption = {
  /** PR number to drive; inferred from the current branch when omitted. */
  pr?: number;
  /** Seconds between cycles. */
  pollIntervalSeconds: number;
  /**
   * Exit after this many CONSECUTIVE idle cycles (no unresolved comments AND CI
   * green) — i.e. the PR has converged to review-clean + CI-green. Bounds
   * standby polling so convergence waits terminate on their own.
   */
  maxIdleCycles?: number;
  /** Hard wall-clock cap (seconds); the loop exits after this long regardless. */
  maxRuntimeSeconds?: number;
};

const parsePositiveInt = (raw: string, flag: string): number => {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed) || Number(trimmed) <= 0) {
    throw new Error(`Invalid ${flag} value: ${raw}`);
  }
  return Number(trimmed);
};

export const parseAutopilotArgs = (
  args: string[] = process.argv.slice(2),
): AutopilotOption => {
  const options: AutopilotOption = {
    pollIntervalSeconds: DEFAULT_POLL_INTERVAL,
  };

  for (const arg of args) {
    if (arg.startsWith('--pr=')) {
      options.pr = parsePositiveInt(arg.slice('--pr='.length), '--pr');
    } else if (arg.startsWith('--poll-interval=')) {
      const val = parsePositiveInt(
        arg.slice('--poll-interval='.length),
        '--poll-interval',
      );
      if (val > MAX_POLL_INTERVAL_SECONDS) {
        throw new Error(`Invalid --poll-interval value: ${arg}`);
      }
      options.pollIntervalSeconds = val;
    } else if (arg.startsWith('--max-idle-cycles=')) {
      options.maxIdleCycles = parsePositiveInt(
        arg.slice('--max-idle-cycles='.length),
        '--max-idle-cycles',
      );
    } else if (arg.startsWith('--max-runtime=')) {
      options.maxRuntimeSeconds = parsePositiveInt(
        arg.slice('--max-runtime='.length),
        '--max-runtime',
      );
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
};

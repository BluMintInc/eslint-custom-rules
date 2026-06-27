import type { SpawnResult } from './types';

const ONE_MINUTE_MS = 60_000;
const DEFAULT_BACKOFF_MS = 5 * ONE_MINUTE_MS;

/** Anthropic API error signals: rate_limit_error (429), overloaded_error (529). */
const RATE_LIMIT_PATTERNS = [
  /rate.?limit/i,
  /\b429\b/,
  /\b529\b/,
  /overloaded/i,
  /too many requests/i,
];

const RETRY_AFTER_PATTERN = /retry.?after[\s:]+(\d+)/i;

export type RateLimitInfo =
  | { isRateLimited: false }
  | { isRateLimited: true; retryAfterMs?: number };

export const detectRateLimit = (result: SpawnResult): RateLimitInfo => {
  const isRateLimited = RATE_LIMIT_PATTERNS.some((pattern) => {
    return pattern.test(result.stderr);
  });

  if (!isRateLimited) {
    return { isRateLimited: false };
  }

  const retryMatch = RETRY_AFTER_PATTERN.exec(result.stderr);
  const retryAfterMs = retryMatch
    ? Number.parseInt(retryMatch[1], 10) * 1000
    : undefined;

  return { isRateLimited: true, retryAfterMs };
};

export const waitForRateLimit = async (
  info: RateLimitInfo,
  log: (...args: unknown[]) => void,
): Promise<void> => {
  if (!info.isRateLimited) {
    return;
  }
  const waitMs = info.retryAfterMs ?? DEFAULT_BACKOFF_MS;
  const waitMinutes = Math.ceil(waitMs / ONE_MINUTE_MS);
  log(`Rate limited. Waiting ${waitMinutes} minute(s) before retrying...`);
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, waitMs);
    timer.unref?.();
  });
  log('Rate limit wait complete. Resuming...');
};

/**
 * Shared types + small helpers for pr-autopilot.
 *
 * Kept dependency-free so the pure parsers (parseAutopilotArgs, buildPrompt,
 * parsePrChecks, parseUnresolvedComments) stay trivially unit-testable.
 */

/** Result of a spawned `claude` subprocess. */
export type SpawnResult = {
  exitCode: number;
  stderr: string;
  /** True when the session was killed for exceeding its timeout. */
  timedOut: boolean;
};

/** One row from `gh pr checks --json name,bucket,state,workflow,link`. */
export type CheckStatus = {
  name: string;
  bucket: 'pass' | 'fail' | 'pending' | 'skipping' | 'cancel';
  state: string;
  workflow: string;
  link: string;
};

/**
 * One unresolved inline review comment, flattened from a GraphQL review thread.
 * Covers both CodeRabbit/bot and human reviewers — bot-ness is derived from the
 * author type so the prompt can hint the agent that ~half of bot comments are
 * false positives.
 */
export type ReviewComment = {
  url: string;
  path: string;
  line: number | null;
  author: string;
  isBot: boolean;
  body: string;
  diff: string;
};

/** Context assembled for a single failing CI check before prompting the agent. */
export type CheckFixContext = {
  checkName: string;
  workflowUrl: string;
  logExcerpt: string;
};

/**
 * Bot review checks post PR comments rather than actionable CI output, so they
 * are excluded from both failure detection and CI-green determination. Matching
 * is case-insensitive startsWith to tolerate name variations.
 */
export const SKIPPED_CHECK_NAMES = [
  'CodeRabbit',
  'Graphite',
  'Cursor Bugbot',
  'Vercel Agent Review',
] as const;

/** Circuit-breaker cap so a perpetually-failing check cannot loop forever. */
export const MAX_CHECK_FIX_ATTEMPTS = 3;

/** Trailing log lines kept from a failing job's output. */
export const MAX_LOG_LINES = 200;

/** Known bot author logins, used to flag bot-authored review comments. */
const BOT_LOGIN_PATTERN = /(coderabbit|graphite|cursor|bugbot)/i;

export const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

export const isBotAuthor = (login: string, typename?: string): boolean => {
  return typename === 'Bot' || BOT_LOGIN_PATTERN.test(login);
};

export const isSkippedBotCheck = (check: CheckStatus): boolean => {
  const nameLower = check.name.toLowerCase();
  return SKIPPED_CHECK_NAMES.some((skipped) => {
    return nameLower.startsWith(skipped.toLowerCase());
  });
};

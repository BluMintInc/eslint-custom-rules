import { execSync } from 'node:child_process';
import {
  type CheckStatus,
  type ReviewComment,
  isBotAuthor,
  isSkippedBotCheck,
} from './types';

const REPO = 'BluMintInc/eslint-custom-rules';

/**
 * - `failing`: at least one non-bot check is in the `fail` bucket.
 * - `pending`: no failures, but at least one non-bot check is still in-flight.
 * - `green`: every non-bot check has settled without failure.
 *
 * `failing` takes precedence over `pending` so a known failure is never masked
 * by other checks still running.
 */
export type PrCiStatus = 'green' | 'failing' | 'pending';

/** Raw shape of a single GraphQL review thread node. */
type ReviewThreadNode = {
  isResolved: boolean;
  comments: {
    nodes: {
      url?: string;
      path?: string;
      line?: number | null;
      bodyText?: string;
      diffHunk?: string;
      author?: { login?: string; __typename?: string };
    }[];
  };
};

type ReviewThreadResponse = {
  data?: {
    repository?: {
      pullRequest?: {
        reviewThreads?: { nodes?: ReviewThreadNode[] };
      };
    };
  };
};

/**
 * PURE: flattens a GraphQL reviewThreads response into unresolved inline
 * comments. Resolved threads and comments explicitly addressed to humans
 * (prefixed `human:`) are dropped — the latter cannot be auto-addressed.
 */
export const parseUnresolvedComments = (json: string): ReviewComment[] => {
  const parsed = JSON.parse(json) as ReviewThreadResponse;
  const threads =
    parsed.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];

  const comments: ReviewComment[] = [];
  for (const thread of threads) {
    if (thread.isResolved) {
      continue;
    }
    for (const comment of thread.comments.nodes) {
      const login = comment.author?.login;
      if (!login) {
        continue;
      }
      const body = comment.bodyText ?? '';
      if (/^\s*human:/i.test(body)) {
        continue;
      }
      comments.push({
        url: comment.url ?? 'No URL',
        path: comment.path ?? 'Unknown file',
        line: comment.line ?? null,
        author: login,
        isBot: isBotAuthor(login, comment.author?.__typename),
        body,
        diff: comment.diffHunk ?? '',
      });
    }
  }
  return comments;
};

/** PURE: parses `gh pr checks --json ...` output into a typed check list. */
export const parsePrChecks = (raw: string): CheckStatus[] => {
  return JSON.parse(raw) as CheckStatus[];
};

/** PURE: classifies overall CI status from a check list, ignoring bot checks. */
export const derivePrCiStatus = (checks: CheckStatus[]): PrCiStatus => {
  const actionable = checks.filter((check) => !isSkippedBotCheck(check));
  if (actionable.some((check) => check.bucket === 'fail')) {
    return 'failing';
  }
  if (actionable.some((check) => check.bucket === 'pending')) {
    return 'pending';
  }
  return 'green';
};

/** PURE: actionable (non-bot) failing checks. */
export const deriveFailingChecks = (checks: CheckStatus[]): CheckStatus[] => {
  return checks.filter((check) => {
    return check.bucket === 'fail' && !isSkippedBotCheck(check);
  });
};

const REVIEW_THREADS_QUERY = `
query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          isResolved
          comments(first: 100) {
            nodes {
              url
              path
              line
              bodyText
              diffHunk
              author { login __typename }
            }
          }
        }
      }
    }
  }
}`;

/**
 * Fetches every unresolved inline review comment on a PR (CodeRabbit + human),
 * paginating through all review threads. IO-thin: each page is handed to the
 * pure `parseUnresolvedComments`.
 */
export const fetchUnresolvedComments = (
  pr: number,
  cwd: string,
): ReviewComment[] => {
  const [owner, name] = REPO.split('/');
  const all: ReviewComment[] = [];
  let after: string | undefined;

  for (;;) {
    const afterArg = after ? ` -f after="${after}"` : '';
    const raw = execSync(
      `gh api graphql -f owner="${owner}" -f name="${name}" -F number=${pr} -f query='${REVIEW_THREADS_QUERY}'${afterArg}`,
      { encoding: 'utf8', cwd, stdio: 'pipe', maxBuffer: 50 * 1024 * 1024 },
    );
    all.push(...parseUnresolvedComments(raw));

    const pageInfo = (JSON.parse(raw) as {
      data?: {
        repository?: {
          pullRequest?: {
            reviewThreads?: {
              pageInfo?: { hasNextPage?: boolean; endCursor?: string };
            };
          };
        };
      };
    }).data?.repository?.pullRequest?.reviewThreads?.pageInfo;

    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) {
      break;
    }
    after = pageInfo.endCursor;
  }
  return all;
};

/**
 * Fetches the full check list for a PR via `gh pr checks`.
 *
 * `gh pr checks` exits non-zero when any check has failed (code 1) or is pending
 * (code 8), yet still emits valid JSON on stdout — we recover stdout from the
 * thrown error so those statuses parse like a clean exit.
 */
export const fetchPrChecks = (pr: number, cwd: string): CheckStatus[] => {
  let raw: string;
  try {
    raw = execSync(
      `gh pr checks ${pr} --repo ${REPO} --json name,bucket,state,workflow,link`,
      { encoding: 'utf8', cwd, stdio: 'pipe' },
    ).trim();
  } catch (error: unknown) {
    const stdout = (error as { stdout?: string }).stdout;
    if (typeof stdout === 'string' && stdout.trim().length > 0) {
      raw = stdout.trim();
    } else {
      throw error;
    }
  }
  return parsePrChecks(raw);
};

export const getPrCiStatus = (pr: number, cwd: string): PrCiStatus => {
  return derivePrCiStatus(fetchPrChecks(pr, cwd));
};

export const getFailingChecks = (pr: number, cwd: string): CheckStatus[] => {
  return deriveFailingChecks(fetchPrChecks(pr, cwd));
};

/** The PR's base branch (e.g. `develop`); merged into the head each cycle. */
export const fetchBaseBranch = (pr: number, cwd: string): string => {
  return execSync(
    `gh pr view ${pr} --repo ${REPO} --json baseRefName --jq ".baseRefName"`,
    { encoding: 'utf8', cwd, stdio: 'pipe' },
  ).trim();
};

/* eslint-disable max-lines-per-function */
/* eslint-disable complexity */
/* eslint-disable import/no-unused-modules */
/* eslint-disable max-lines */
/**
 * Adds the rule-request and cursor-research labels to all open enhancement
 * issues. Processes issues in batches to avoid rate limits and supports a
 * dry-run mode for verification.
 */
import { setTimeout as delay } from 'node:timers/promises';

type IssueLabel = { name?: string } | string;
type IssueSearchItem = {
  number: number;
  labels?: IssueLabel[];
};

const DEFAULT_BATCH_SIZE = 20 as const;
const BATCH_DELAY_MS = 10 * 60 * 1000; // 10 minutes between batches
const TARGET_LABELS = ['rule-request', 'cursor-research'] as const;
const DRY_RUN = process.argv.includes('--dry-run');

const [defaultOwner, defaultRepo] = (
  process.env.GITHUB_REPOSITORY ?? 'BluMintInc/eslint-custom-rules'
).split('/');
const OWNER = process.env.GITHUB_OWNER ?? defaultOwner;
const REPO = process.env.GITHUB_REPO ?? defaultRepo;

function parseNumericArg(options: { flag: string; alias?: string }) {
  const index = process.argv.findIndex((arg) => {
    const isFlagMatch = arg === `--${options.flag}`;
    const isAliasMatch = options.alias ? arg === `-${options.alias}` : false;
    return isFlagMatch || isAliasMatch;
  });
  if (index !== -1) {
    const rawValue = process.argv[index + 1];
    const value = Number(rawValue);
    if (!Number.isNaN(value)) {
      return value;
    }
  }
}

function requireToken() {
  const token =
    process.env.GITHUB_BLUBOT_PAT ??
    process.env.GITHUB_TOKEN ??
    process.env.GH_TOKEN;
  if (!token) {
    console.error(
      'Set GITHUB_BLUBOT_PAT (preferred) or GITHUB_TOKEN / GH_TOKEN to authenticate.',
    );
    process.exit(1);
  }
  return token;
}

function labelNames(issue: IssueSearchItem) {
  return (issue.labels ?? [])
    .map((label) => {
      return typeof label === 'string' ? label : label.name;
    })
    .filter((label): label is string => {
      return typeof label === 'string' && label.length > 0;
    });
}

async function githubFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const token = requireToken();
  const url = `https://api.github.com${
    path.startsWith('/') ? path : `/${path}`
  }`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'eslint-custom-rules-labeler',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub ${init?.method ?? 'GET'} ${path} failed: ${response.status} ${
        response.statusText
      } - ${body}`,
    );
  }

  return response;
}

async function searchIssues(
  query: string,
  page: number,
  perPage: number,
): Promise<IssueSearchItem[]> {
  const url = new URL('https://api.github.com/search/issues');
  url.searchParams.set('q', query);
  url.searchParams.set('sort', 'created');
  url.searchParams.set('order', 'desc');
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('page', String(page));

  const response = await githubFetch(
    url.toString().replace('https://api.github.com', ''),
    {
      method: 'GET',
    },
  );
  const data = (await response.json()) as { items?: IssueSearchItem[] };
  return data.items ?? [];
}

async function resolveStartIssue(query: string) {
  const [first] = await searchIssues(query, 1, 1);
  if (!first) {
    console.log('No matching open enhancement issues found.');
    process.exit(0);
  }
  return first.number;
}

async function fetchEligibleIssues(query: string, startIssue: number) {
  const issues: IssueSearchItem[] = [];
  const perPage = 100;
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const pageItems = await searchIssues(query, page, perPage);
    if (pageItems.length === 0) {
      hasMore = false;
      continue;
    }

    const eligible = pageItems.filter((issue) => {
      return issue.number <= startIssue;
    });
    issues.push(...eligible);

    hasMore = pageItems.length === perPage;
    page += 1;
  }

  return issues;
}

async function addLabels(issue: IssueSearchItem) {
  const existing = new Set(labelNames(issue));
  const missing = TARGET_LABELS.filter((label) => !existing.has(label));
  if (missing.length === 0) {
    console.log(`Issue #${issue.number} already has target labels; skipping.`);
    return;
  }

  if (DRY_RUN) {
    console.log(
      `[dry-run] Would add labels ${missing.join(', ')} to issue #${
        issue.number
      }`,
    );
    return;
  }

  const mergedLabels = Array.from(new Set([...existing, ...TARGET_LABELS]));

  await githubFetch(`/repos/${OWNER}/${REPO}/issues/${issue.number}/labels`, {
    method: 'POST',
    body: JSON.stringify({ labels: mergedLabels }),
  });

  console.log(
    `Added ${missing.join(', ')} to issue #${issue.number} (total labels: ${
      mergedLabels.length
    }).`,
  );
}

async function main() {
  const batchSize =
    parseNumericArg({ flag: 'batch', alias: 'b' }) ?? DEFAULT_BATCH_SIZE;
  const startInput = parseNumericArg({ flag: 'start', alias: 's' });

  console.log(
    `Targeting ${OWNER}/${REPO} enhancement issues with batch size ${batchSize}${
      DRY_RUN ? ' (dry-run)' : ''
    }.`,
  );

  const query = `repo:${OWNER}/${REPO} is:issue is:open label:enhancement`;
  const initialCursor = startInput ?? (await resolveStartIssue(query));
  const issues = await fetchEligibleIssues(query, initialCursor);

  if (issues.length === 0) {
    console.log(
      `No open enhancement issues at or below #${initialCursor} to process.`,
    );
    return;
  }

  console.log(
    `Queued ${issues.length} issues starting from #${initialCursor}.`,
  );

  let index = 0;
  let batchIndex = 0;

  while (index < issues.length) {
    const batch = issues.slice(index, index + batchSize);
    batchIndex += 1;
    console.log(`Starting batch ${batchIndex} (${batch.length} issues)...`);

    await Promise.all(
      batch.map(async (issue) => {
        await addLabels(issue);
      }),
    );

    index += batch.length;
    const remaining = issues.length - index;
    if (remaining === 0) {
      console.log('Processed final batch.');
      return;
    }

    console.log(
      `Waiting ${
        BATCH_DELAY_MS / (60 * 1000)
      } minutes before next batch... (${remaining} remaining)`,
    );
    await delay(BATCH_DELAY_MS);
  }
}

if (require.main === module) {
  void main();
}

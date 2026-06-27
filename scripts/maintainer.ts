#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Deterministic toolkit for the autonomous `eslint-custom-rules` maintainer.
 *
 * The maintainer itself is a /goal-driven /loop Claude session (see
 * .claude/commands/maintainer.md) that drains the open-issue queue to zero and
 * cuts a release. The LLM-driven part (actually fixing/implementing a rule) is
 * delegated to the `fix-bug` / `implement-rule` subagents via the Task tool.
 * This module owns the parts that must be deterministic and unit-testable:
 *   - which issue to work next (bugs before features, oldest first)
 *   - which subagent + branch name an issue maps to
 *   - the pre-merge validation gate (build + changed-file lint + test, matching
 *     the repo stop hook — NOT whole-repo lint, which trips on unrelated debt)
 *   - on an empty queue, back-merge origin/main into develop (absorb the prior
 *     async release commit), then promote develop→main (cure drift)
 *   - notify agora of the published release
 *
 * Side-effecting subcommands accept `--dry-run` to print intended git/gh actions
 * without performing them.
 *
 * Subcommands:
 *   next                          → JSON of the next issue {number,title,kind,agent,branch} or null
 *   count                         → JSON {open, empty}
 *   validate                      → run the stop-hook gate (build + changed-file lint + test); exit 1 on failure
 *   merge --issue=N --branch=B    → merge a fix branch into develop (closes #N) [--dry-run]
 *   release                       → if queue empty, sync develop from origin/main then promote develop→main [--dry-run]
 *   dispatch --version=V          → notify agora of a published release
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { dispatch } = require('./dispatch-agora-release');

const REPO = 'BluMintInc/eslint-custom-rules';
const DEVELOP = 'develop';
const MAIN = 'main';

export type IssueKind = 'bug' | 'rule-request' | 'other';

export type Issue = {
  readonly number: number;
  readonly title: string;
  readonly labels: readonly string[];
  readonly createdAt: string;
};

export type NextIssue = {
  readonly number: number;
  readonly title: string;
  readonly kind: IssueKind;
  readonly agent: 'fix-bug' | 'implement-rule';
  readonly branch: string;
};

/** Classify by label: a `bug` label wins; else `rule-request`; else `other`. */
export function classifyIssue(issue: Issue): IssueKind {
  if (issue.labels.includes('bug')) {
    return 'bug';
  }
  if (issue.labels.includes('rule-request')) {
    return 'rule-request';
  }
  return 'other';
}

/** rule-request → implement-rule; everything else → fix-bug (bug-shaped default). */
export function chooseAgent(kind: IssueKind): NextIssue['agent'] {
  return kind === 'rule-request' ? 'implement-rule' : 'fix-bug';
}

/** Branch convention link-pr-to-source-issue.yml understands: `develop-<agent>-<n>`. */
export function branchNameFor(agent: NextIssue['agent'], issueNumber: number) {
  return `${DEVELOP}-${agent}-${issueNumber}`;
}

/** Priority bucket: bugs (0) before features/other (1). */
function priorityOf(kind: IssueKind) {
  return kind === 'bug' ? 0 : 1;
}

/** Order: bugs before features; within a bucket, oldest first, then lowest number. */
export function sortIssues(issues: readonly Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    const byPriority =
      priorityOf(classifyIssue(a)) - priorityOf(classifyIssue(b));
    if (byPriority !== 0) {
      return byPriority;
    }
    const byAge = a.createdAt.localeCompare(b.createdAt);
    if (byAge !== 0) {
      return byAge;
    }
    return a.number - b.number;
  });
}

/** The next issue to work, or null when the queue is empty. */
export function selectNextIssue(issues: readonly Issue[]): NextIssue | null {
  const sorted = sortIssues(issues);
  const issue = sorted[0];
  if (!issue) {
    return null;
  }
  const kind = classifyIssue(issue);
  const agent = chooseAgent(kind);
  return {
    number: issue.number,
    title: issue.title,
    kind,
    agent,
    branch: branchNameFor(agent, issue.number),
  };
}

export function isQueueEmpty(issues: readonly Issue[]) {
  return issues.length === 0;
}

type GhLabel = { readonly name: string };
type GhIssue = {
  readonly number: number;
  readonly title: string;
  readonly labels?: readonly GhLabel[];
  readonly createdAt: string;
};

/** Normalize `gh issue list --json` output into the internal Issue shape. */
export function normalizeIssues(raw: readonly GhIssue[]): Issue[] {
  return raw.map((item) => ({
    number: item.number,
    title: item.title,
    labels: (item.labels ?? []).map((label) => label.name),
    createdAt: item.createdAt,
  }));
}

export function fetchOpenIssues(
  exec: typeof execFileSync = execFileSync,
): Issue[] {
  const out = exec(
    'gh',
    [
      'issue',
      'list',
      '--repo',
      REPO,
      '--state',
      'open',
      '--json',
      'number,title,labels,createdAt',
      '--limit',
      '500',
    ],
    { encoding: 'utf8' },
  ) as string;
  return normalizeIssues(JSON.parse(out));
}

type Runner = (cmd: string, args: string[]) => void;

const defaultRunner: Runner = (cmd, args) => {
  execFileSync(cmd, args, { stdio: 'inherit' });
};

/**
 * Whether a path is one the repo's lint gate would lint: a source
 * `.ts/.tsx/.js/.jsx` file, excluding tests, `.github/`, `node_modules`, and
 * `.claude/tmp/`. Mirrors the filter in `scripts/claude-hooks/lint-diff.ts`
 * (the `node_modules` match is path-segment-aware so a source file whose name
 * merely contains the substring isn't skipped).
 */
export function isLintablePath(file: string): boolean {
  return (
    /\.(ts|tsx|js|jsx)$/.test(file) &&
    !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file) &&
    !file.startsWith('.github/') &&
    !/(^|\/)node_modules(\/|$)/.test(file) &&
    !file.includes('.claude/tmp/')
  );
}

/**
 * Source files changed ON THIS BRANCH that the lint gate would lint. Diffs from
 * the merge-base with develop (not the develop tip) so develop commits landed
 * after this branch diverged don't drag unrelated debt into the gate; the
 * two-dot diff against that base still includes UNCOMMITTED edits, which matters
 * because validate runs before the maintainer commits the fix.
 */
function changedLintableFiles(): string[] {
  let base = DEVELOP;
  try {
    base =
      execFileSync('git', ['merge-base', DEVELOP, 'HEAD'], {
        encoding: 'utf8',
      }).trim() || DEVELOP;
  } catch {
    /* fall back to the develop ref */
  }
  let out = '';
  try {
    out = execFileSync('git', ['diff', '--name-only', base], {
      encoding: 'utf8',
    });
  } catch {
    return [];
  }
  return out
    .split('\n')
    .map((file) => file.trim())
    .filter(Boolean)
    .filter((file) => isLintablePath(file) && existsSync(resolve(file)));
}

/**
 * Run the gate the repo stop hook ACTUALLY enforces: build, then ESLint on the
 * source files changed vs develop, then the test suite. Returns true only if
 * all succeed.
 *
 * The lint step deliberately lints only changed files (mirroring
 * agent-check.ts → lint-diff.ts) rather than a whole-repo `npm run lint`. A
 * whole-repo lint trips on pre-existing debt in files the fix never touched
 * (e.g. unrelated `lint:js` errors, or `lint:eslint-docs` drift), which would
 * make the gate permanently red and force the maintainer to "reason past" a
 * failure that isn't about its change.
 */
export function validateViaStopHooks(
  run: Runner = defaultRunner,
  getChangedFiles: () => string[] = changedLintableFiles,
): boolean {
  const files = getChangedFiles();
  const steps: Array<[string, string[]]> = [['npm', ['run', 'build']]];
  if (files.length > 0) {
    steps.push(['npx', ['eslint', ...files]]);
  }
  steps.push(['npm', ['test']]);
  for (const [cmd, args] of steps) {
    try {
      run(cmd, args);
    } catch {
      console.error(
        `maintainer: validation failed at \`${cmd} ${args.join(' ')}\``,
      );
      return false;
    }
  }
  return true;
}

/** Merge a completed fix/implement branch into develop (commit closes #issue). */
export function mergeAndClose(
  options: { issue: number; branch: string; dryRun?: boolean },
  run: Runner = defaultRunner,
) {
  const { issue, branch, dryRun } = options;
  const message = `chore(repo): merge ${branch} (closes #${issue})`;
  const actions: Array<[string, string[]]> = [
    ['git', ['checkout', DEVELOP]],
    ['git', ['merge', '--no-ff', branch, '-m', message]],
    ['git', ['push', 'origin', DEVELOP]],
  ];
  runActions(actions, dryRun, run);
}

/**
 * If the queue is empty, promote develop→main (fires the release workflow). No-op
 * when issues remain.
 *
 * `@semantic-release/git` pushes a `chore(release): … [skip ci]` commit back to
 * origin/main asynchronously, after CI runs — so by the next promotion origin/main
 * is one commit ahead of develop. Syncing develop from the (pre-release) local
 * main would miss it, and the next `merge --ff-only develop` into main could stop
 * fast-forwarding. To cure the drift, this fetches origin/main and back-merges it
 * into develop FIRST (fast-forwards when nothing diverged, else creates a back-
 * merge commit absorbing the prior release), so develop ⊇ origin/main and the
 * subsequent promotion is always a fast-forward.
 */
export function releaseIfEmpty(
  issues: readonly Issue[],
  options: { dryRun?: boolean } = {},
  run: Runner = defaultRunner,
): boolean {
  if (!isQueueEmpty(issues)) {
    console.log(
      `maintainer: ${issues.length} open issue(s) remain — not releasing.`,
    );
    return false;
  }
  const actions: Array<[string, string[]]> = [
    ['git', ['fetch', 'origin', MAIN]],
    ['git', ['checkout', DEVELOP]],
    ['git', ['merge', '--no-edit', `origin/${MAIN}`]],
    ['git', ['push', 'origin', DEVELOP]],
    ['git', ['checkout', MAIN]],
    ['git', ['merge', '--ff-only', `origin/${MAIN}`]],
    ['git', ['merge', '--ff-only', DEVELOP]],
    ['git', ['push', 'origin', MAIN]],
  ];
  runActions(actions, options.dryRun, run);
  return true;
}

function runActions(
  actions: ReadonlyArray<[string, string[]]>,
  dryRun: boolean | undefined,
  run: Runner,
) {
  for (const [cmd, args] of actions) {
    if (dryRun) {
      console.log(`[dry-run] ${cmd} ${args.join(' ')}`);
    } else {
      run(cmd, args);
    }
  }
}

/** Notify agora of a published release (fallback to the release workflow's successCmd). */
export function dispatchToAgora(version: string) {
  return dispatch({ version, token: process.env.AGORA_DISPATCH_TOKEN });
}

function parseArgs(argv: readonly string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (const token of argv) {
    const match = /^--([\w-]+)(?:=(.*))?$/.exec(token);
    if (match) {
      args[match[1]] = match[2] ?? true;
    }
  }
  return args;
}

type ParsedArgs = Record<string, string | boolean>;

/**
 * Validate the `merge` subcommand's flags. Returns null (CLI errors out) for a
 * bare or missing flag: `parseArgs` stores a value-less `--issue`/`--branch` as
 * boolean `true`, and `Number(true)===1` / `String(true)==='true'` would
 * otherwise sneak past a naive truthiness check and operate on a bogus target.
 */
export function parseMergeArgs(
  args: ParsedArgs,
): { issue: number; branch: string } | null {
  const issue = typeof args.issue === 'string' ? Number(args.issue) : NaN;
  const branch = typeof args.branch === 'string' ? args.branch : '';
  if (!Number.isInteger(issue) || issue <= 0 || !branch) {
    return null;
  }
  return { issue, branch };
}

/** Validate the `dispatch` subcommand's `--version`; null for bare/missing. */
export function parseVersionArg(args: ParsedArgs): string | null {
  return typeof args.version === 'string' && args.version.length > 0
    ? args.version
    : null;
}

function main() {
  const [subcommand, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  switch (subcommand) {
    case 'next': {
      const next = selectNextIssue(fetchOpenIssues());
      console.log(JSON.stringify(next));
      return;
    }
    case 'count': {
      const issues = fetchOpenIssues();
      console.log(
        JSON.stringify({ open: issues.length, empty: isQueueEmpty(issues) }),
      );
      return;
    }
    case 'validate': {
      process.exit(validateViaStopHooks() ? 0 : 1);
      return;
    }
    case 'merge': {
      const merge = parseMergeArgs(args);
      if (!merge) {
        console.error('maintainer merge: --issue and --branch are required');
        process.exit(1);
      }
      mergeAndClose({ ...merge, dryRun: Boolean(args['dry-run']) });
      return;
    }
    case 'release': {
      releaseIfEmpty(fetchOpenIssues(), { dryRun: Boolean(args['dry-run']) });
      return;
    }
    case 'dispatch': {
      const version = parseVersionArg(args);
      if (!version) {
        console.error('maintainer dispatch: --version is required');
        process.exit(1);
      }
      dispatchToAgora(version);
      return;
    }
    default:
      console.error(
        `maintainer: unknown subcommand "${
          subcommand ?? ''
        }". Use one of: next, count, validate, merge, release, dispatch.`,
      );
      process.exit(1);
  }
}

if (process.env.JEST_WORKER_ID === undefined && require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  resolve(__dirname); // anchor cwd-independent resolution if extended later
  main();
}

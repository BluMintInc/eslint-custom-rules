#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * CI guard that keeps `release-manifest.json` trustworthy.
 *
 * Every `fix`/`feat` commit MUST carry a conventional scope equal to a real
 * rule name (the convention: one rule per fix/feat commit). The release-manifest
 * generator keys re-enable signals off that scope, and agora re-enables OFF
 * rules by exact rule name — so a typo'd or missing scope would silently drop a
 * fixed rule from the manifest (rule never comes back ON) or invent one (a still
 * broken rule re-enabled). This validator fails the build before that can land.
 *
 * Non-`fix`/`feat` commits are unconstrained here (commitlint's type-enum and
 * the cross-cutting allowlist below cover the rest).
 *
 * Usage (CI, on a PR): validates the commits the PR adds over its base branch.
 *   npx tsx scripts/validate-commit-scopes.ts --base=origin/develop
 *   npx tsx scripts/validate-commit-scopes.ts --range=origin/main..HEAD
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { loadRuleNames } from './load-rule-names';
import { ALLOWED_NON_RULE_SCOPES } from './allowed-non-rule-scopes';

/** Conventional types that bump a release and therefore feed the manifest. */
const RELEASE_TYPES = new Set(['fix', 'feat']);
/** `type(scope)!: summary` — scope + breaking marker optional. */
const COMMIT_HEADER = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;

export { ALLOWED_NON_RULE_SCOPES };

export type CommitRecord = {
  readonly hash: string;
  readonly subject: string;
  readonly body?: string;
};

export type ScopeViolation = {
  readonly hash: string;
  readonly subject: string;
  readonly reason: string;
};

/** Find fix/feat commits whose scope is missing or not a real rule name. */
export function findInvalidScopeCommits(
  commits: readonly CommitRecord[],
  ruleNames: readonly string[],
  allowed: readonly string[] = ALLOWED_NON_RULE_SCOPES,
): ScopeViolation[] {
  const valid = new Set([...ruleNames, ...allowed]);
  const violations: ScopeViolation[] = [];
  for (const commit of commits) {
    const match = COMMIT_HEADER.exec(commit.subject.trim());
    if (!match) {
      continue;
    }
    const [, type, scope] = match;
    if (!RELEASE_TYPES.has(type)) {
      continue;
    }
    if (!scope) {
      violations.push({
        hash: commit.hash,
        subject: commit.subject,
        reason: `${type} commit must declare a scope equal to the rule name it changes`,
      });
      continue;
    }
    if (!valid.has(scope)) {
      violations.push({
        hash: commit.hash,
        subject: commit.subject,
        reason: `${type} scope '${scope}' is not a known rule name`,
      });
    }
  }
  return violations;
}

/** Resolve the git revision range from CLI flags / CI env. */
export function buildRange(
  args: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (args.range) {
    return args.range;
  }
  const base = args.base || env.GITHUB_BASE_REF || 'origin/develop';
  return `${base}..HEAD`;
}

export function parseArgs(argv: readonly string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (const token of argv) {
    const match = /^--([\w-]+)(?:=(.*))?$/.exec(token);
    if (match) {
      args[match[1]] = match[2] ?? '';
    }
  }
  return args;
}

export function gitCommits(
  range: string,
  exec: typeof execFileSync = execFileSync,
): CommitRecord[] {
  const out = exec(
    'git',
    ['log', range, '--no-merges', '--format=%H%x1f%s%x1f%b%x1e'],
    { encoding: 'utf8' },
  ) as string;
  return out
    .split('\x1e')
    .map((record) => record.trim())
    .filter((record) => record.length > 0)
    .map((record) => {
      const [hash, subject, body] = record.split('\x1f');
      return { hash, subject: subject ?? '', body: body ?? '' };
    });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const range = buildRange(args);
  const repoRoot = resolve(__dirname, '..');
  const ruleNames = loadRuleNames(repoRoot);
  const commits = gitCommits(range);
  const violations = findInvalidScopeCommits(commits, ruleNames);

  if (violations.length === 0) {
    console.log(
      `✅ commit-scope check: all fix/feat commits in ${range} scope to a known rule (${commits.length} commit(s) scanned).`,
    );
    return;
  }

  console.error(
    `❌ commit-scope check: ${violations.length} fix/feat commit(s) have an invalid scope.\n` +
      `The manifest re-enable contract requires scope = rule name. Fix the commit message(s):\n`,
  );
  for (const violation of violations) {
    console.error(
      `  - ${violation.hash.slice(0, 8)} "${violation.subject}"\n      → ${
        violation.reason
      }`,
    );
  }
  process.exit(1);
}

if (process.env.JEST_WORKER_ID === undefined && require.main === module) {
  main();
}

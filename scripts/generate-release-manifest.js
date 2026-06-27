/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Emit a strict, machine-readable `release-manifest.json` mapping each release
 * version to the set of rules it changed — the contract that lets the agora
 * `sync-eslint-rules` job re-enable OFF rules by exact rule name, never by
 * fuzzy-parsing the prose CHANGELOG.
 *
 * Invoked as a semantic-release `@semantic-release/exec` prepareCmd (after
 * `@semantic-release/npm` bumps the version, before `@semantic-release/git`
 * commits the assets):
 *   node scripts/generate-release-manifest.js --version=${nextRelease.version} \
 *        --git-tag=${nextRelease.gitTag} --prev-tag=${lastRelease.gitTag}
 *
 * Manifest shape (newest entry first):
 *   [ { version, date, rules: [ { name, changeType, issues, summary } ] } ]
 *
 * Only `fix`/`feat` commits whose conventional scope is a real rule name (the
 * commitlint scope contract guarantees this) become rule entries — that is
 * exactly the population agora may re-enable. Idempotent: re-running for the
 * same version replaces that version's entry rather than duplicating it.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { loadRuleNames } = require('./load-rule-names');

const MANIFEST_FILENAME = 'release-manifest.json';
/** Conventional-commit types that produce a re-enable-relevant rule change. */
const RELEASE_TYPES = new Set(['fix', 'feat']);
/** `type(scope)!: summary` — scope optional, `!` (breaking) optional. */
const COMMIT_HEADER = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;
const CLOSING_ISSUE = /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;
const BARE_ISSUE = /#(\d+)/g;

/** Issue numbers a commit addresses: closing-keyword refs preferred, else any #N. */
function extractIssues(text) {
  const closing = new Set();
  let match;
  CLOSING_ISSUE.lastIndex = 0;
  while ((match = CLOSING_ISSUE.exec(text)) !== null) {
    closing.add(Number(match[1]));
  }
  if (closing.size > 0) {
    return [...closing].sort((a, b) => a - b);
  }
  const bare = new Set();
  BARE_ISSUE.lastIndex = 0;
  while ((match = BARE_ISSUE.exec(text)) !== null) {
    bare.add(Number(match[1]));
  }
  return [...bare].sort((a, b) => a - b);
}

/** Parse a conventional commit into {type, scope, summary, issues} or null. */
function parseCommit(subject, body = '') {
  const match = COMMIT_HEADER.exec((subject || '').trim());
  if (!match) {
    return null;
  }
  const [, type, scope, , summary] = match;
  return {
    type,
    scope: scope || null,
    summary,
    issues: extractIssues(`${subject}\n${body}`),
  };
}

/** Collapse a release's commits into one rule entry per touched rule. */
function buildRuleEntries(commits, ruleNames) {
  const ruleSet = new Set(ruleNames);
  const byRule = new Map();
  for (const commit of commits) {
    const parsed = parseCommit(commit.subject, commit.body);
    if (!parsed || !RELEASE_TYPES.has(parsed.type) || !parsed.scope) {
      continue;
    }
    /** Non-rule scope ⇒ not a re-enable signal; skip (CI scope validator bars it anyway). */
    if (!ruleSet.has(parsed.scope)) {
      continue;
    }
    const entry = byRule.get(parsed.scope) ?? {
      name: parsed.scope,
      changeType: parsed.type,
      issues: new Set(),
      summaries: [],
    };
    /** `feat` dominates `fix` when a rule both gains a feature and a fix in one release. */
    if (parsed.type === 'feat') {
      entry.changeType = 'feat';
    }
    parsed.issues.forEach((issue) => entry.issues.add(issue));
    entry.summaries.push(parsed.summary);
    byRule.set(parsed.scope, entry);
  }
  return [...byRule.values()]
    .map((entry) => ({
      name: entry.name,
      changeType: entry.changeType,
      issues: [...entry.issues].sort((a, b) => a - b),
      summary: entry.summaries.join('; '),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Build the manifest entry for one release. Pure (no fs/git). */
function buildManifestEntry({ version, date, commits, ruleNames }) {
  return { version, date, rules: buildRuleEntries(commits, ruleNames) };
}

/** Insert `entry` newest-first, replacing any existing entry for its version. */
function mergeManifest(existing, entry) {
  const list = Array.isArray(existing) ? existing : [];
  return [entry, ...list.filter((item) => item.version !== entry.version)];
}

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    const match = /^--([\w-]+)(?:=(.*))?$/.exec(token);
    if (match) {
      args[match[1]] = match[2] ?? '';
    }
  }
  return {
    version: args.version || '',
    gitTag: args['git-tag'] || '',
    prevTag: args['prev-tag'] || '',
  };
}

/** Read the commits in `prevTag..HEAD` (or all history when prevTag is empty). */
function gitCommits(prevTag, exec = execFileSync) {
  const range = prevTag ? `${prevTag}..HEAD` : 'HEAD';
  const out = exec(
    'git',
    ['log', range, '--no-merges', '--format=%H%x1f%s%x1f%b%x1e'],
    { encoding: 'utf8' },
  );
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
  const { version, prevTag } = parseArgs(process.argv.slice(2));
  if (!version) {
    console.error('generate-release-manifest: --version is required');
    process.exit(1);
  }
  const repoRoot = path.resolve(__dirname, '..');
  const ruleNames = loadRuleNames(repoRoot);
  const commits = gitCommits(prevTag);
  const entry = buildManifestEntry({
    version,
    date: new Date().toISOString(),
    commits,
    ruleNames,
  });
  const manifestPath = path.join(repoRoot, MANIFEST_FILENAME);
  let existing = [];
  try {
    existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    existing = [];
  }
  const merged = mergeManifest(existing, entry);
  fs.writeFileSync(manifestPath, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(
    `release-manifest.json: recorded ${entry.rules.length} rule change(s) for v${version}`,
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  MANIFEST_FILENAME,
  extractIssues,
  parseCommit,
  buildRuleEntries,
  buildManifestEntry,
  mergeManifest,
  parseArgs,
  gitCommits,
};

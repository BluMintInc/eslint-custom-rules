/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Single source of truth for the plugin's rule-name set.
 *
 * Parses the hand-maintained `rules:` map in src/index.ts — the canonical
 * registry (167 rules). `src/rules/` filenames over-count by an unregistered
 * orphan, so filenames are NOT used. Build-free (plain regex over source) so the
 * commitlint commit-msg hook, the CI scope validator, and the release-manifest
 * generator all share ONE loader without first running `tsc`. CommonJS so plain
 * `node` (commitlint's commit-msg hook, semantic-release exec) can require it.
 */
const fs = require('node:fs');
const path = require('node:path');

/** Opener of the TOP-LEVEL `rules:` map (exactly 2-space indent). The deeper
 * `configs.recommended.rules` map sits at 6-space indent and is excluded. */
const RULES_MAP_OPENER = /^ {2}rules: \{$/m;
/** A rule key line: indentation + a single-quoted kebab-case key + colon. */
const RULE_KEY = /^[ \t]+'([a-z0-9-]+)':/gm;

/**
 * Extract the kebab-case rule names from the `rules:` map of an index.ts source
 * string. Pure (no fs) for unit testing. Returns a de-duped, sorted array.
 */
function parseRuleNamesFromIndexSource(source) {
  RULES_MAP_OPENER.lastIndex = 0;
  const opener = RULES_MAP_OPENER.exec(source);
  if (!opener) {
    return [];
  }
  const mapBody = source.slice(opener.index + opener[0].length);
  const names = new Set();
  RULE_KEY.lastIndex = 0;
  let match = RULE_KEY.exec(mapBody);
  while (match !== null) {
    names.add(match[1]);
    match = RULE_KEY.exec(mapBody);
  }
  return [...names].sort();
}

/**
 * Load the canonical rule-name set for the repo at `repoRoot` (defaults to the
 * repository root relative to this file).
 */
function loadRuleNames(repoRoot = path.resolve(__dirname, '..')) {
  const indexPath = path.join(repoRoot, 'src', 'index.ts');
  try {
    return parseRuleNamesFromIndexSource(fs.readFileSync(indexPath, 'utf8'));
  } catch {
    /** src/index.ts unreadable (never on a healthy checkout) → empty set. */
    return [];
  }
}

module.exports = { loadRuleNames, parseRuleNamesFromIndexSource };

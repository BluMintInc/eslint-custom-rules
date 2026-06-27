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
/** Closer of that map: the first line at the same 2-space indent that begins
 * with `}`. Map entries are nested deeper, so this is the matching brace. */
const RULES_MAP_CLOSER = /^ {2}\}/m;
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
  const afterOpener = source.slice(opener.index + opener[0].length);
  /** Bound the scan to the matching closing brace so kebab-case keys in any
   * later map (e.g. a future single-quoted config block) are NOT mistaken for
   * rule names — the canonical set must not depend on `rules` being last. */
  RULES_MAP_CLOSER.lastIndex = 0;
  const closer = RULES_MAP_CLOSER.exec(afterOpener);
  const mapBody = closer ? afterOpener.slice(0, closer.index) : afterOpener;
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
  /**
   * Read errors propagate by design: an unreadable src/index.ts is a broken
   * checkout, not "zero rules". A silent empty set would make commitlint reject
   * every fix/feat scope and let the release manifest generate from a phantom
   * registry — failing fast surfaces the real cause instead.
   */
  return parseRuleNamesFromIndexSource(fs.readFileSync(indexPath, 'utf8'));
}

module.exports = { loadRuleNames, parseRuleNamesFromIndexSource };

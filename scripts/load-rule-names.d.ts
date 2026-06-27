/** Extract kebab-case rule names from an index.ts source string (de-duped, sorted). */
export function parseRuleNamesFromIndexSource(source: string): string[];
/** Load the canonical rule-name set for the repo at `repoRoot` (defaults to repo root). */
export function loadRuleNames(repoRoot?: string): string[];

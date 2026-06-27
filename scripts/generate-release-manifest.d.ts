export interface Commit {
  hash?: string;
  subject: string;
  body?: string;
}
export interface ParsedCommit {
  type: string;
  scope: string | null;
  summary: string;
  issues: number[];
}
export interface RuleEntry {
  name: string;
  changeType: string;
  issues: number[];
  summary: string;
}
export interface ManifestEntry {
  version: string;
  date: string;
  rules: RuleEntry[];
}
export const MANIFEST_FILENAME: string;
export function extractIssues(text: string): number[];
export function parseCommit(
  subject: string,
  body?: string,
): ParsedCommit | null;
export function buildRuleEntries(
  commits: Commit[],
  ruleNames: string[],
): RuleEntry[];
export function buildManifestEntry(args: {
  version: string;
  date: string;
  commits: Commit[];
  ruleNames: string[];
}): ManifestEntry;
export function mergeManifest(
  existing: ManifestEntry[] | unknown,
  entry: ManifestEntry,
): ManifestEntry[];
export function parseArgs(argv: string[]): {
  version: string;
  gitTag: string;
  prevTag: string;
};
export function gitCommits(
  prevTag: string,
  exec?: (cmd: string, args: string[], opts: unknown) => string,
): Commit[];
export function readExistingManifest(
  manifestPath: string,
  readFile?: (path: string, encoding: 'utf8') => string,
): ManifestEntry[] | unknown;

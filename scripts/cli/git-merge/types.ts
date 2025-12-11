/** Squashed diff for a branch's changes to a specific file since merge-base */
export type BranchDiff = {
  readonly branchName: string;
  readonly lastCommitDate: string | null; // ISO 8601 timestamp of most recent commit
  readonly diffFromMergeBase: string | null; // git diff output for this file only
};

/** Full context for a single conflicted file */
export type ConflictedFileContext = {
  readonly path: string;
  readonly contentWithMarkers: string; // File content including <<<<<<< ======= >>>>>>> markers
  readonly oursDiff: BranchDiff; // Squashed diff: merge-base → HEAD for this file
  readonly theirsDiff: BranchDiff; // Squashed diff: merge-base → MERGE_HEAD for this file
};

/** PR metadata for additional context (does NOT include diff) */
export type PrMetadata = {
  readonly number: number;
  readonly title: string;
  readonly description: string | null;
  readonly url: string;
  readonly codeRabbitSummary: string | null; // Truncated summary from CodeRabbit bot if present
};

/** Overall merge context for prompt generation */
export type MergeContext = {
  readonly ourBranchName: string;
  readonly theirBranchName: string;
  readonly mergeBaseSha: string;
  readonly conflictedFiles: readonly ConflictedFileContext[];
  readonly associatedPr: PrMetadata | null; // PR metadata if merge has an associated PR
};

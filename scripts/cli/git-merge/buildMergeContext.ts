import { readFileSync } from 'node:fs';
import { runCommand } from '../git-utils';
import type { MergeContext, ConflictedFileContext, BranchDiff } from './types';
import { isInMergeConflictState } from './isInMergeConflictState';
import { retrieveConflictedFiles } from './getConflictedFiles';
import { retrieveMergeBase } from './getMergeBase';
import { retrieveSquashedDiff } from './getSquashedDiff';
import { retrieveBranchLastCommitDate } from './getBranchLastCommitDate';
import { fetchAssociatedPr } from './getAssociatedPr';
import { fetchPrMetadata } from './fetchPrMetadata';

const MAX_CONTENT_SIZE = 100_000 as const; // 100KB limit for file content
const MAX_DIFF_SIZE = 10_000 as const; // 10KB limit for squashed diffs

function truncateWithMarker(params: {
  readonly content: string | null;
  readonly maxSize: number;
  readonly marker: string;
}) {
  const { content, maxSize, marker } = params;

  if (!content) {
    return null;
  }

  if (content.length <= maxSize) {
    return content;
  }

  return content.slice(0, maxSize) + `\n\n${marker}`;
}

function buildBranchDiff(params: {
  readonly file: string;
  readonly mergeBase: string;
  readonly ref: 'HEAD' | 'MERGE_HEAD';
  readonly branchName: string;
}) {
  const { file, mergeBase, ref, branchName } = params;

  const diffFromMergeBase = truncateWithMarker({
    content: retrieveSquashedDiff({ file, fromRef: mergeBase, toRef: ref }),
    maxSize: MAX_DIFF_SIZE,
    marker: '... [diff truncated for size]',
  });

  const lastCommitDate = retrieveBranchLastCommitDate({ ref, file });

  return {
    branchName,
    lastCommitDate,
    diffFromMergeBase,
  } as const satisfies BranchDiff;
}

function buildConflictedFileContext(params: {
  readonly file: string;
  readonly mergeBase: string;
  readonly ourBranchName: string;
  readonly theirBranchName: string;
}) {
  const { file, mergeBase, ourBranchName, theirBranchName } = params;

  let contentWithMarkers: string;
  try {
    const rawContent = readFileSync(file, 'utf-8');
    contentWithMarkers =
      truncateWithMarker({
        content: rawContent,
        maxSize: MAX_CONTENT_SIZE,
        marker: '... [file content truncated for size]',
      }) ?? rawContent;
  } catch {
    throw new Error(`Failed to read conflicted file: ${file}`);
  }

  const oursDiff = buildBranchDiff({
    file,
    mergeBase,
    ref: 'HEAD',
    branchName: ourBranchName,
  });

  const theirsDiff = buildBranchDiff({
    file,
    mergeBase,
    ref: 'MERGE_HEAD',
    branchName: theirBranchName,
  });

  return {
    path: file,
    contentWithMarkers,
    oursDiff,
    theirsDiff,
  } as const satisfies ConflictedFileContext;
}

/**
 * Main orchestrator that builds complete merge context for all conflicted files.
 */
export function buildMergeContext() {
  if (!isInMergeConflictState()) {
    throw new Error(
      'Error: No merge conflict detected. Run this command after "git merge" produces conflicts.',
    );
  }

  const conflictedFiles = retrieveConflictedFiles();
  if (conflictedFiles.length === 0) {
    throw new Error(
      'Error: In merge state but no conflicted files found. All conflicts may already be resolved.',
    );
  }

  const mergeBaseSha = retrieveMergeBase();

  const ourBranchName = runCommand('git rev-parse --abbrev-ref HEAD', true);
  let theirBranchName = runCommand('git name-rev --name-only MERGE_HEAD', true);
  theirBranchName = theirBranchName
    .replace(/^remotes\/origin\//, '')
    .replace(/~\d+$/, '')
    .replace(/\^.*$/, '');

  const conflictedFileContexts = conflictedFiles.map((file) => {
    return buildConflictedFileContext({
      file,
      mergeBase: mergeBaseSha,
      ourBranchName,
      theirBranchName,
    });
  });

  const linkedPullRequest = fetchAssociatedPr();
  const associatedPr = linkedPullRequest
    ? fetchPrMetadata(linkedPullRequest)
    : null;

  return {
    ourBranchName,
    theirBranchName,
    mergeBaseSha,
    conflictedFiles: conflictedFileContexts,
    associatedPr,
  } as const satisfies MergeContext;
}

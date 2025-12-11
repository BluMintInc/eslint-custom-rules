import { readFileSync } from 'node:fs';
import { runCommand } from '../git-utils';
import { buildMergeContext } from './buildMergeContext';
import { isInMergeConflictState } from './isInMergeConflictState';
import { retrieveConflictedFiles } from './getConflictedFiles';
import { retrieveMergeBase } from './getMergeBase';
import { retrieveSquashedDiff } from './getSquashedDiff';
import { retrieveBranchLastCommitDate } from './getBranchLastCommitDate';
import { fetchAssociatedPr } from './getAssociatedPr';
import { fetchPrMetadata } from './fetchPrMetadata';

jest.mock('node:fs');
jest.mock('../git-utils');
jest.mock('./isInMergeConflictState');
jest.mock('./getConflictedFiles');
jest.mock('./getMergeBase');
jest.mock('./getSquashedDiff');
jest.mock('./getBranchLastCommitDate');
jest.mock('./getAssociatedPr');
jest.mock('./fetchPrMetadata');

const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;
const mockRunCommand = runCommand as jest.MockedFunction<typeof runCommand>;
const mockIsInMergeConflictState = isInMergeConflictState as jest.MockedFunction<
  typeof isInMergeConflictState
>;
const mockRetrieveConflictedFiles =
  retrieveConflictedFiles as jest.MockedFunction<typeof retrieveConflictedFiles>;
const mockRetrieveMergeBase = retrieveMergeBase as jest.MockedFunction<
  typeof retrieveMergeBase
>;
const mockRetrieveSquashedDiff = retrieveSquashedDiff as jest.MockedFunction<
  typeof retrieveSquashedDiff
>;
const mockRetrieveBranchLastCommitDate =
  retrieveBranchLastCommitDate as jest.MockedFunction<
    typeof retrieveBranchLastCommitDate
  >;
const mockFetchAssociatedPr = fetchAssociatedPr as jest.MockedFunction<
  typeof fetchAssociatedPr
>;
const mockFetchPrMetadata = fetchPrMetadata as jest.MockedFunction<
  typeof fetchPrMetadata
>;

describe('buildMergeContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws error when not in merge conflict state', () => {
    mockIsInMergeConflictState.mockReturnValueOnce(false);

    expect(() => buildMergeContext()).toThrow(
      'Error: No merge conflict detected. Run this command after "git merge" produces conflicts.',
    );
  });

  it('throws error when no conflicted files found', () => {
    mockIsInMergeConflictState.mockReturnValueOnce(true);
    mockRetrieveConflictedFiles.mockReturnValueOnce([]);

    expect(() => buildMergeContext()).toThrow(
      'Error: In merge state but no conflicted files found. All conflicts may already be resolved.',
    );
  });

  it('builds complete merge context for single file without PR', () => {
    mockIsInMergeConflictState.mockReturnValueOnce(true);
    mockRetrieveConflictedFiles.mockReturnValueOnce(['src/file.ts']);
    mockRetrieveMergeBase.mockReturnValueOnce('abc123');
    mockRunCommand
      .mockReturnValueOnce('develop')
      .mockReturnValueOnce('remotes/origin/feature~1');
    mockReadFileSync.mockReturnValueOnce(
      '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> MERGE_HEAD',
    );
    mockRetrieveSquashedDiff
      .mockReturnValueOnce('+ours diff')
      .mockReturnValueOnce('+theirs diff');
    mockRetrieveBranchLastCommitDate
      .mockReturnValueOnce('2024-01-15T10:00:00Z')
      .mockReturnValueOnce('2024-01-16T10:00:00Z');
    mockFetchAssociatedPr.mockReturnValueOnce(null);

    const result = buildMergeContext();

    expect(result.ourBranchName).toBe('develop');
    expect(result.theirBranchName).toBe('feature');
    expect(result.mergeBaseSha).toBe('abc123');
    expect(result.conflictedFiles).toHaveLength(1);
    expect(result.conflictedFiles[0].path).toBe('src/file.ts');
    expect(result.conflictedFiles[0].contentWithMarkers).toContain(
      '<<<<<<< HEAD',
    );
    expect(result.associatedPr).toBeNull();
  });

  it('builds context with associated PR metadata', () => {
    mockIsInMergeConflictState.mockReturnValueOnce(true);
    mockRetrieveConflictedFiles.mockReturnValueOnce(['file.ts']);
    mockRetrieveMergeBase.mockReturnValueOnce('def456');
    mockRunCommand.mockReturnValueOnce('main').mockReturnValueOnce('feature');
    mockReadFileSync.mockReturnValueOnce('conflict content');
    mockRetrieveSquashedDiff.mockReturnValue('+diff');
    mockRetrieveBranchLastCommitDate.mockReturnValue('2024-01-01T00:00:00Z');
    mockFetchAssociatedPr.mockReturnValueOnce(42);
    mockFetchPrMetadata.mockReturnValueOnce({
      number: 42,
      title: 'Feature PR',
      description: 'PR description',
      url: 'https://github.com/owner/repo/pull/42',
      codeRabbitSummary: 'Summary',
    });

    const result = buildMergeContext();

    expect(result.associatedPr).toEqual({
      number: 42,
      title: 'Feature PR',
      description: 'PR description',
      url: 'https://github.com/owner/repo/pull/42',
      codeRabbitSummary: 'Summary',
    });
  });

  it('handles multiple conflicted files', () => {
    mockIsInMergeConflictState.mockReturnValueOnce(true);
    mockRetrieveConflictedFiles.mockReturnValueOnce(['a.ts', 'b.ts']);
    mockRetrieveMergeBase.mockReturnValueOnce('xyz');
    mockRunCommand.mockReturnValueOnce('develop').mockReturnValueOnce('feature');
    mockReadFileSync.mockReturnValue('content');
    mockRetrieveSquashedDiff.mockReturnValue('diff');
    mockRetrieveBranchLastCommitDate.mockReturnValue('2024-01-01T00:00:00Z');
    mockFetchAssociatedPr.mockReturnValueOnce(null);

    const result = buildMergeContext();

    expect(result.conflictedFiles).toHaveLength(2);
    expect(result.conflictedFiles[0].path).toBe('a.ts');
    expect(result.conflictedFiles[1].path).toBe('b.ts');
  });

  it('throws error when file cannot be read', () => {
    mockIsInMergeConflictState.mockReturnValueOnce(true);
    mockRetrieveConflictedFiles.mockReturnValueOnce(['missing.ts']);
    mockRetrieveMergeBase.mockReturnValueOnce('abc');
    mockRunCommand.mockReturnValueOnce('main').mockReturnValueOnce('feature');
    mockReadFileSync.mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });

    expect(() => buildMergeContext()).toThrow(
      'Failed to read conflicted file: missing.ts',
    );
  });

  it('truncates large file content', () => {
    mockIsInMergeConflictState.mockReturnValueOnce(true);
    mockRetrieveConflictedFiles.mockReturnValueOnce(['large.ts']);
    mockRetrieveMergeBase.mockReturnValueOnce('abc');
    mockRunCommand.mockReturnValueOnce('main').mockReturnValueOnce('feature');
    const largeContent = 'x'.repeat(150_000);
    mockReadFileSync.mockReturnValueOnce(largeContent);
    mockRetrieveSquashedDiff.mockReturnValue('diff');
    mockRetrieveBranchLastCommitDate.mockReturnValue('2024-01-01T00:00:00Z');
    mockFetchAssociatedPr.mockReturnValueOnce(null);

    const result = buildMergeContext();

    expect(result.conflictedFiles[0].contentWithMarkers.length).toBeLessThan(
      150_000,
    );
    expect(result.conflictedFiles[0].contentWithMarkers).toContain(
      '[file content truncated for size]',
    );
  });

  it('truncates large diff content', () => {
    mockIsInMergeConflictState.mockReturnValueOnce(true);
    mockRetrieveConflictedFiles.mockReturnValueOnce(['file.ts']);
    mockRetrieveMergeBase.mockReturnValueOnce('abc');
    mockRunCommand.mockReturnValueOnce('main').mockReturnValueOnce('feature');
    mockReadFileSync.mockReturnValueOnce('small content');

    const largeDiff = 'd'.repeat(15_000);
    mockRetrieveSquashedDiff.mockReturnValue(largeDiff);
    mockRetrieveBranchLastCommitDate.mockReturnValue('2024-01-01T00:00:00Z');
    mockFetchAssociatedPr.mockReturnValueOnce(null);

    const result = buildMergeContext();

    expect(result.conflictedFiles[0].oursDiff.diffFromMergeBase?.length).toBeLessThan(
      15_000,
    );
    expect(result.conflictedFiles[0].oursDiff.diffFromMergeBase).toContain(
      '[diff truncated for size]',
    );
  });
});

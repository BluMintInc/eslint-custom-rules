import { buildMergePrompt } from './build-merge-prompt';
import type { MergeContext } from '../../scripts/cli/git-merge/types';

describe('buildMergePrompt', () => {
  const baseContext: MergeContext = {
    ourBranchName: 'develop',
    theirBranchName: 'feature/new-thing',
    mergeBaseSha: 'abc123def',
    conflictedFiles: [
      {
        path: 'src/components/Button.tsx',
        contentWithMarkers:
          '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> MERGE_HEAD',
        oursDiff: {
          branchName: 'develop',
          lastCommitDate: '2024-01-15T10:00:00Z',
          diffFromMergeBase: '+const x = 1;',
        },
        theirsDiff: {
          branchName: 'feature/new-thing',
          lastCommitDate: '2024-01-16T14:30:00Z',
          diffFromMergeBase: '+const x = 2;',
        },
      },
    ],
    associatedPr: null,
  };

  it('generates prompt with basic context', () => {
    const result = buildMergePrompt(baseContext);

    expect(result).toContain('# Merge Conflict Resolution Task');
    expect(result).toContain('`develop`');
    expect(result).toContain('`feature/new-thing`');
    expect(result).toContain('`abc123def`');
  });

  it('includes file sections for all conflicted files', () => {
    const result = buildMergePrompt(baseContext);

    expect(result).toContain('### File: `src/components/Button.tsx`');
    expect(result).toContain(
      '#### OURS Changes (last modified: 2024-01-15T10:00:00Z)',
    );
    expect(result).toContain(
      '#### THEIRS Changes (last modified: 2024-01-16T14:30:00Z)',
    );
    expect(result).toContain('+const x = 1;');
    expect(result).toContain('+const x = 2;');
  });

  it('includes conflict markers in file content', () => {
    const result = buildMergePrompt(baseContext);

    expect(result).toContain('<<<<<<< HEAD');
    expect(result).toContain('=======');
    expect(result).toContain('>>>>>>> MERGE_HEAD');
  });

  it('includes PR context when associatedPr is present', () => {
    const contextWithPr: MergeContext = {
      ...baseContext,
      associatedPr: {
        number: 42,
        title: 'Add new feature',
        description: 'This PR implements something cool',
        url: 'https://github.com/owner/repo/pull/42',
        codeRabbitSummary: 'AI-generated summary of changes',
      },
    };

    const result = buildMergePrompt(contextWithPr);

    expect(result).toContain('## PR Context');
    expect(result).toContain('**PR #42**');
    expect(result).toContain('[Add new feature]');
    expect(result).toContain('This PR implements something cool');
    expect(result).toContain('### CodeRabbit Summary');
    expect(result).toContain('AI-generated summary of changes');
  });

  it('handles PR with no CodeRabbit summary', () => {
    const contextWithPrNoSummary: MergeContext = {
      ...baseContext,
      associatedPr: {
        number: 99,
        title: 'Quick fix',
        description: 'Fix a bug',
        url: 'https://github.com/owner/repo/pull/99',
        codeRabbitSummary: null,
      },
    };

    const result = buildMergePrompt(contextWithPrNoSummary);

    expect(result).toContain('## PR Context');
    expect(result).not.toContain('### CodeRabbit Summary');
  });

  it('handles PR with empty description', () => {
    const contextWithEmptyDescription: MergeContext = {
      ...baseContext,
      associatedPr: {
        number: 50,
        title: 'No description PR',
        description: '',
        url: 'https://github.com/owner/repo/pull/50',
        codeRabbitSummary: null,
      },
    };

    const result = buildMergePrompt(contextWithEmptyDescription);

    expect(result).toContain('(No description provided)');
  });

  it('handles PR with null description', () => {
    const contextWithNullDescription: MergeContext = {
      ...baseContext,
      associatedPr: {
        number: 51,
        title: 'Null description PR',
        description: null,
        url: 'https://github.com/owner/repo/pull/51',
        codeRabbitSummary: null,
      },
    };

    const result = buildMergePrompt(contextWithNullDescription);

    expect(result).toContain('(No description provided)');
  });

  it('handles null diff and timestamp values', () => {
    const contextWithNulls: MergeContext = {
      ...baseContext,
      conflictedFiles: [
        {
          path: 'file.ts',
          contentWithMarkers: 'content',
          oursDiff: {
            branchName: 'main',
            lastCommitDate: null,
            diffFromMergeBase: null,
          },
          theirsDiff: {
            branchName: 'feature',
            lastCommitDate: null,
            diffFromMergeBase: null,
          },
        },
      ],
    };

    const result = buildMergePrompt(contextWithNulls);

    expect(result).toContain('(last modified: unknown)');
    expect(result).toContain('(no changes)');
  });

  it('separates multiple files with dividers', () => {
    const contextWithMultipleFiles: MergeContext = {
      ...baseContext,
      conflictedFiles: [
        {
          path: 'a.ts',
          contentWithMarkers: 'content a',
          oursDiff: {
            branchName: 'main',
            lastCommitDate: '2024-01-01T00:00:00Z',
            diffFromMergeBase: '+a',
          },
          theirsDiff: {
            branchName: 'feature',
            lastCommitDate: '2024-01-02T00:00:00Z',
            diffFromMergeBase: '+a2',
          },
        },
        {
          path: 'b.ts',
          contentWithMarkers: 'content b',
          oursDiff: {
            branchName: 'main',
            lastCommitDate: '2024-01-01T00:00:00Z',
            diffFromMergeBase: '+b',
          },
          theirsDiff: {
            branchName: 'feature',
            lastCommitDate: '2024-01-02T00:00:00Z',
            diffFromMergeBase: '+b2',
          },
        },
      ],
    };

    const result = buildMergePrompt(contextWithMultipleFiles);

    expect(result).toContain('### File: `a.ts`');
    expect(result).toContain('### File: `b.ts`');
    expect(result).toContain('---');
  });

  it('includes resolution rules', () => {
    const result = buildMergePrompt(baseContext);

    expect(result).toContain('## Resolution Rules');
    expect(result).toContain('If two changes are compatible, keep both');
    expect(result).toContain('If one side fixes a bug');
    expect(result).toContain('Maintain formatting and local conventions');
  });

  it('includes step-by-step instructions', () => {
    const result = buildMergePrompt(baseContext);

    expect(result).toContain('## Instructions');
    expect(result).toContain('Compare Timestamps');
    expect(result).toContain('Examine Diffs');
    expect(result).toContain('git add');
  });
});

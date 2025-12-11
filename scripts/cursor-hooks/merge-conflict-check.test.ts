import { execSync } from 'node:child_process';
import { performMergeConflictCheck } from './merge-conflict-check';
import { isInMergeConflictState } from '../cli/git-merge/isInMergeConflictState';
import { buildMergeContext } from '../cli/git-merge/buildMergeContext';
import { buildMergePrompt } from '../../.github/scripts/build-merge-prompt';

jest.mock('node:child_process');
jest.mock('../cli/git-merge/isInMergeConflictState');
jest.mock('../cli/git-merge/buildMergeContext');
jest.mock('../../.github/scripts/build-merge-prompt');

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
const mockIsInMergeConflictState = isInMergeConflictState as jest.MockedFunction<
  typeof isInMergeConflictState
>;
const mockBuildMergeContext = buildMergeContext as jest.MockedFunction<
  typeof buildMergeContext
>;
const mockBuildMergePrompt = buildMergePrompt as jest.MockedFunction<
  typeof buildMergePrompt
>;

const mockInput = {
  conversation_id: 'test-conv-123',
  generation_id: 'test-gen-456',
  loop_count: 0,
  status: 'completed' as const,
};

describe('performMergeConflictCheck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns null when not in merge conflict state', () => {
    mockIsInMergeConflictState.mockReturnValueOnce(false);

    const result = performMergeConflictCheck(mockInput);

    expect(result).toBeNull();
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it('returns null when all conflicts are resolved', () => {
    mockIsInMergeConflictState.mockReturnValueOnce(true);
    mockExecSync.mockReturnValueOnce('✅ All merge conflicts resolved');

    const result = performMergeConflictCheck(mockInput);

    expect(result).toBeNull();
    expect(mockExecSync).toHaveBeenCalledWith(
      './scripts/check-merge-conflicts.sh',
      { encoding: 'utf-8', stdio: 'pipe' },
    );
  });

  it('returns followup message when conflicts remain', () => {
    mockIsInMergeConflictState.mockReturnValueOnce(true);
    mockExecSync.mockReturnValueOnce(
      '# Remaining Conflicted Files\n\n1. [ ] `file.ts` (2 conflict hunk(s))',
    );
    mockBuildMergeContext.mockReturnValueOnce({
      ourBranchName: 'develop',
      theirBranchName: 'feature',
      mergeBaseSha: 'abc123',
      conflictedFiles: [],
      associatedPr: null,
    });
    mockBuildMergePrompt.mockReturnValueOnce('Generated prompt content');

    const result = performMergeConflictCheck(mockInput);

    expect(result).not.toBeNull();
    expect(result?.followup_message).toContain(
      'You still have unresolved merge conflicts!',
    );
    expect(result?.followup_message).toContain('# Remaining Conflicted Files');
    expect(result?.followup_message).toContain('Generated prompt content');
  });

  it('returns null when check script fails', () => {
    mockIsInMergeConflictState.mockReturnValueOnce(true);
    mockExecSync.mockImplementationOnce(() => {
      const error = new Error('Script failed') as Error & {
        stdout?: string;
        stderr?: string;
      };
      error.stdout = 'stdout content';
      error.stderr = 'stderr content';
      throw error;
    });

    const result = performMergeConflictCheck(mockInput);

    expect(result).toBeNull();
  });

  it('returns null when buildMergeContext throws', () => {
    mockIsInMergeConflictState.mockReturnValueOnce(true);
    mockExecSync.mockReturnValueOnce('Some conflicts remain');
    mockBuildMergeContext.mockImplementationOnce(() => {
      throw new Error('Failed to build context');
    });

    const result = performMergeConflictCheck(mockInput);

    expect(result).toBeNull();
  });

  it('returns null when isInMergeConflictState throws', () => {
    mockIsInMergeConflictState.mockImplementationOnce(() => {
      throw new Error('Git error');
    });

    const result = performMergeConflictCheck(mockInput);

    expect(result).toBeNull();
  });

  it('logs progress to stderr', () => {
    const consoleSpy = jest.spyOn(console, 'error');
    mockIsInMergeConflictState.mockReturnValueOnce(true);
    mockExecSync.mockReturnValueOnce('✅ All merge conflicts resolved');

    performMergeConflictCheck(mockInput);

    expect(consoleSpy).toHaveBeenCalledWith(
      'Detected merge conflict state, checking for remaining conflicts...',
    );
    expect(consoleSpy).toHaveBeenCalledWith('All merge conflicts resolved');
  });

  it('includes checklist output in followup message', () => {
    mockIsInMergeConflictState.mockReturnValueOnce(true);

    const checklistOutput = `# Remaining Conflicted Files

1. [ ] \`src/a.ts\` (1 conflict hunk(s))
2. [ ] \`src/b.ts\` (3 conflict hunk(s))`;

    mockExecSync.mockReturnValueOnce(checklistOutput);
    mockBuildMergeContext.mockReturnValueOnce({
      ourBranchName: 'main',
      theirBranchName: 'feature',
      mergeBaseSha: 'xyz',
      conflictedFiles: [],
      associatedPr: null,
    });
    mockBuildMergePrompt.mockReturnValueOnce('Prompt');

    const result = performMergeConflictCheck(mockInput);

    expect(result?.followup_message).toContain('src/a.ts');
    expect(result?.followup_message).toContain('src/b.ts');
    expect(result?.followup_message).toContain('3 conflict hunk(s)');
  });
});

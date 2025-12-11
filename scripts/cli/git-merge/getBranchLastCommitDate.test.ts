import { runCommand } from '../git-utils';
import { retrieveBranchLastCommitDate } from './getBranchLastCommitDate';

jest.mock('../git-utils');

const mockRunCommand = runCommand as jest.MockedFunction<typeof runCommand>;

describe('retrieveBranchLastCommitDate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns ISO 8601 timestamp for the file', () => {
    mockRunCommand.mockReturnValueOnce('2024-01-15T10:30:00+00:00');

    const result = retrieveBranchLastCommitDate({
      ref: 'HEAD',
      file: 'src/file.ts',
    });

    expect(result).toBe('2024-01-15T10:30:00+00:00');
    expect(mockRunCommand).toHaveBeenCalledWith(
      `git log -1 --format='%aI' HEAD -- "src/file.ts"`,
      true,
    );
  });

  it('returns null on error', () => {
    mockRunCommand.mockImplementationOnce(() => {
      throw new Error('git log failed');
    });

    const result = retrieveBranchLastCommitDate({
      ref: 'MERGE_HEAD',
      file: 'missing.ts',
    });

    expect(result).toBeNull();
  });

  it('handles MERGE_HEAD ref', () => {
    mockRunCommand.mockReturnValueOnce('2024-02-20T14:45:00+00:00');

    const result = retrieveBranchLastCommitDate({
      ref: 'MERGE_HEAD',
      file: 'functions/src/test.ts',
    });

    expect(mockRunCommand).toHaveBeenCalledWith(
      `git log -1 --format='%aI' MERGE_HEAD -- "functions/src/test.ts"`,
      true,
    );
    expect(result).toBe('2024-02-20T14:45:00+00:00');
  });
});

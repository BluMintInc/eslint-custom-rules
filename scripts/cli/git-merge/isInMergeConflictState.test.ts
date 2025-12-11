import { runCommand } from '../git-utils';
import { isInMergeConflictState } from './isInMergeConflictState';

jest.mock('../git-utils');

const mockRunCommand = runCommand as jest.MockedFunction<typeof runCommand>;

describe('isInMergeConflictState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true when MERGE_HEAD exists', () => {
    mockRunCommand.mockReturnValueOnce('abc123');

    const result = isInMergeConflictState();

    expect(result).toBe(true);
    expect(mockRunCommand).toHaveBeenCalledWith(
      'git rev-parse -q --verify MERGE_HEAD',
      true,
    );
  });

  it('returns false when MERGE_HEAD does not exist (command throws)', () => {
    mockRunCommand.mockImplementationOnce(() => {
      throw new Error('fatal: Needed a single revision');
    });

    const result = isInMergeConflictState();

    expect(result).toBe(false);
  });

  it('returns true even when MERGE_HEAD returns empty string', () => {
    mockRunCommand.mockReturnValueOnce('');

    const result = isInMergeConflictState();

    expect(result).toBe(true);
  });
});

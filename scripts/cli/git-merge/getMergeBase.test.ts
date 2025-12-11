import { runCommand } from '../git-utils';
import { retrieveMergeBase } from './getMergeBase';

jest.mock('../git-utils');

const mockRunCommand = runCommand as jest.MockedFunction<typeof runCommand>;

describe('retrieveMergeBase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the merge-base commit SHA', () => {
    mockRunCommand.mockReturnValueOnce('abc123def456');

    const result = retrieveMergeBase();

    expect(result).toBe('abc123def456');
    expect(mockRunCommand).toHaveBeenCalledWith(
      'git merge-base HEAD MERGE_HEAD',
      true,
    );
  });

  it('propagates errors from runCommand', () => {
    mockRunCommand.mockImplementationOnce(() => {
      throw new Error('fatal: Not a git repository');
    });

    expect(() => retrieveMergeBase()).toThrow('fatal: Not a git repository');
  });
});

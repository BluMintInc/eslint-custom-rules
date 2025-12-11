import { runCommand } from '../git-utils';
import { fetchAssociatedPr } from './getAssociatedPr';

jest.mock('../git-utils');

const mockRunCommand = runCommand as jest.MockedFunction<typeof runCommand>;

describe('fetchAssociatedPr', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns PR number when found', () => {
    mockRunCommand
      .mockReturnValueOnce('remotes/origin/feature-branch')
      .mockReturnValueOnce('42');

    const result = fetchAssociatedPr();

    expect(result).toBe(42);
    expect(mockRunCommand).toHaveBeenNthCalledWith(
      1,
      'git name-rev --name-only MERGE_HEAD',
      true,
    );
    expect(mockRunCommand).toHaveBeenNthCalledWith(
      2,
      'gh pr list --head "feature-branch" --state open --json number --jq \'.[0].number\'',
      true,
    );
  });

  it('returns null when no PR exists', () => {
    mockRunCommand
      .mockReturnValueOnce('remotes/origin/local-branch')
      .mockReturnValueOnce('null');

    const result = fetchAssociatedPr();

    expect(result).toBeNull();
  });

  it('returns null when gh command returns empty', () => {
    mockRunCommand.mockReturnValueOnce('feature-branch').mockReturnValueOnce('');

    const result = fetchAssociatedPr();

    expect(result).toBeNull();
  });

  it('returns null when MERGE_HEAD branch is empty', () => {
    mockRunCommand.mockReturnValueOnce('');

    const result = fetchAssociatedPr();

    expect(result).toBeNull();
  });

  it('cleans up branch name with version suffix', () => {
    mockRunCommand
      .mockReturnValueOnce('remotes/origin/my-branch~2')
      .mockReturnValueOnce('123');

    const result = fetchAssociatedPr();

    expect(result).toBe(123);
    expect(mockRunCommand).toHaveBeenNthCalledWith(
      2,
      'gh pr list --head "my-branch" --state open --json number --jq \'.[0].number\'',
      true,
    );
  });

  it('cleans up branch name with caret suffix', () => {
    mockRunCommand.mockReturnValueOnce('feature^1^2').mockReturnValueOnce('456');

    const result = fetchAssociatedPr();

    expect(result).toBe(456);
    expect(mockRunCommand).toHaveBeenNthCalledWith(
      2,
      'gh pr list --head "feature" --state open --json number --jq \'.[0].number\'',
      true,
    );
  });

  it('returns null on error', () => {
    mockRunCommand.mockImplementationOnce(() => {
      throw new Error('git command failed');
    });

    const result = fetchAssociatedPr();

    expect(result).toBeNull();
  });
});

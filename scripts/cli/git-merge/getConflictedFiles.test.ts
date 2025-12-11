import { runCommand } from '../git-utils';
import { retrieveConflictedFiles } from './getConflictedFiles';

jest.mock('../git-utils');

const mockRunCommand = runCommand as jest.MockedFunction<typeof runCommand>;

describe('retrieveConflictedFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns array of conflicted file paths', () => {
    mockRunCommand.mockReturnValueOnce(
      'src/components/Button.tsx\nfunctions/src/util/helpers.ts',
    );

    const result = retrieveConflictedFiles();

    expect(result).toEqual([
      'src/components/Button.tsx',
      'functions/src/util/helpers.ts',
    ]);
    expect(mockRunCommand).toHaveBeenCalledWith(
      'git diff --name-only --diff-filter=U',
      true,
    );
  });

  it('returns empty array when no conflicts exist', () => {
    mockRunCommand.mockReturnValueOnce('');

    const result = retrieveConflictedFiles();

    expect(result).toEqual([]);
  });

  it('filters out empty lines from output', () => {
    mockRunCommand.mockReturnValueOnce('file1.ts\n\nfile2.ts\n');

    const result = retrieveConflictedFiles();

    expect(result).toEqual(['file1.ts', 'file2.ts']);
  });

  it('returns empty array on error', () => {
    mockRunCommand.mockImplementationOnce(() => {
      throw new Error('git command failed');
    });

    const result = retrieveConflictedFiles();

    expect(result).toEqual([]);
  });

  it('returns single file when only one conflict exists', () => {
    mockRunCommand.mockReturnValueOnce('single-file.ts');

    const result = retrieveConflictedFiles();

    expect(result).toEqual(['single-file.ts']);
  });
});

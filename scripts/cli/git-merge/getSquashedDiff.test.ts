import { runCommand } from '../git-utils';
import { retrieveSquashedDiff } from './getSquashedDiff';

jest.mock('../git-utils');

const mockRunCommand = runCommand as jest.MockedFunction<typeof runCommand>;

describe('retrieveSquashedDiff', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the squashed diff for a file', () => {
    const expectedDiff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
+const x = 1;
 const y = 2;`;

    mockRunCommand.mockReturnValueOnce(expectedDiff);

    const result = retrieveSquashedDiff({
      file: 'src/file.ts',
      fromRef: 'abc123',
      toRef: 'HEAD',
    });

    expect(result).toBe(expectedDiff);
    expect(mockRunCommand).toHaveBeenCalledWith(
      'git diff abc123..HEAD -- "src/file.ts"',
      true,
    );
  });

  it('returns null on error', () => {
    mockRunCommand.mockImplementationOnce(() => {
      throw new Error('git diff failed');
    });

    const result = retrieveSquashedDiff({
      file: 'nonexistent.ts',
      fromRef: 'abc',
      toRef: 'def',
    });

    expect(result).toBeNull();
  });

  it('handles files with spaces in path', () => {
    mockRunCommand.mockReturnValueOnce('diff content');

    const result = retrieveSquashedDiff({
      file: 'path/to/my file.ts',
      fromRef: 'base',
      toRef: 'HEAD',
    });

    expect(mockRunCommand).toHaveBeenCalledWith(
      'git diff base..HEAD -- "path/to/my file.ts"',
      true,
    );
    expect(result).toBe('diff content');
  });

  it('returns empty string when diff is empty', () => {
    mockRunCommand.mockReturnValueOnce('');

    const result = retrieveSquashedDiff({
      file: 'unchanged.ts',
      fromRef: 'abc',
      toRef: 'def',
    });

    expect(result).toBe('');
  });
});

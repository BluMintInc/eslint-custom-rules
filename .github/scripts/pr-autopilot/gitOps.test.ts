import { execFileSync, execSync } from 'node:child_process';
import { commitAll, undoLastCommit } from './gitOps';

jest.mock('node:child_process', () => ({
  execSync: jest.fn(),
  execFileSync: jest.fn(),
}));

const mockExecSync = execSync as unknown as jest.Mock;
const mockExecFileSync = execFileSync as unknown as jest.Mock;

/** Make `git diff --cached --quiet` report staged changes (exit 1), so commitAll
 * proceeds to the commit; every other git call succeeds. */
const withStagedChanges = (): void => {
  mockExecSync.mockImplementation((cmd: string) => {
    if (cmd.includes('diff --cached --quiet')) {
      const error = new Error('staged') as Error & { status: number };
      error.status = 1;
      throw error;
    }
    return Buffer.from('');
  });
};

describe('commitAll', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes the subject as a literal argv element via execFileSync (no shell)', () => {
    withStagedChanges();
    /** A crafted subject (e.g. a CI check name) must never be interpreted: with
     * an argv array there is no shell, so `$(…)`/backticks stay literal text. */
    const malicious = '$(touch pwned) && `id`';

    expect(commitAll('/repo', malicious)).toBe(true);

    expect(mockExecFileSync).toHaveBeenCalledTimes(1);
    const [cmd, argv] = mockExecFileSync.mock.calls[0];
    expect(cmd).toBe('git');
    expect(argv).toEqual(['commit', '-m', `chore(repo): ${malicious}`]);
  });

  it('returns false and does not commit when nothing is staged', () => {
    mockExecSync.mockImplementation(() => Buffer.from(''));

    expect(commitAll('/repo', 'whatever')).toBe(false);
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });
});

describe('undoLastCommit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecSync.mockReturnValue(Buffer.from(''));
  });

  it('drops the most recent commit and any working-tree changes in the cwd', () => {
    undoLastCommit('/repo');

    const commands = mockExecSync.mock.calls.map((call) => call[0]);
    /** HEAD~1 targets exactly the one commit just made; clean -fd also removes
     * untracked files so the next cycle starts from a pristine pushed state. */
    expect(commands).toEqual(['git reset --hard HEAD~1', 'git clean -fd']);
    for (const call of mockExecSync.mock.calls) {
      expect(call[1]).toMatchObject({ cwd: '/repo' });
    }
  });
});

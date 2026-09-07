import type { ClaudeCodePreToolUseInput } from '../preToolUseInput';
import { GIT_BASH_PLATFORM, MSYS_GUARD_PLATFORM_ENV } from './detectGitBash';
import { performMsysArgvGuard } from './performMsysArgvGuard';

const GIT_BASH_ENV = { [MSYS_GUARD_PLATFORM_ENV]: GIT_BASH_PLATFORM } as const;
const LINUX_ENV = {
  [MSYS_GUARD_PLATFORM_ENV]: 'other',
  OSTYPE: 'linux-gnu',
} as const;

/** The shape doctrine names: a `<ref>:<path>` read MSYS2 rewrites into a
 * Windows path list before git's `main` sees it. */
const REPORTED_COMMAND =
  'git show origin/develop:.claude/skills/claude-hooks/SKILL.md' as const;

/**
 * Narrows the guard's discriminated return to its deny arm. The `in` test alone
 * is not enough: the no-opinion arm declares `hookSpecificOutput?: undefined`,
 * so TypeScript keeps the property optional after it.
 */
const readDeny = (verdict: ReturnType<typeof performMsysArgvGuard>) => {
  const output = verdict.hookSpecificOutput;
  if (output === undefined) {
    throw new Error('expected a deny verdict');
  }
  return output;
};

const buildInput = (command: unknown, toolName = 'Bash') => {
  return {
    session_id: 'msys-guard-session',
    transcript_path: '/dev/null',
    cwd: '/c/Users/dev/eslint-custom-rules',
    permission_mode: 'bypassPermissions',
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: { command },
  } as unknown as ClaudeCodePreToolUseInput;
};

describe('performMsysArgvGuard — the Git Bash arm', () => {
  it('denies the reported command, naming the corrected one', () => {
    const output = readDeny(
      performMsysArgvGuard(buildInput(REPORTED_COMMAND), GIT_BASH_ENV),
    );

    expect(output.hookEventName).toBe('PreToolUse');
    expect(output.permissionDecision).toBe('deny');
    expect(output.permissionDecisionReason).toContain(
      `MSYS_NO_PATHCONV=1 ${REPORTED_COMMAND}`,
    );
  });

  it('has no opinion on the corrected command, so the retry lands', () => {
    expect(
      performMsysArgvGuard(
        buildInput(`MSYS_NO_PATHCONV=1 ${REPORTED_COMMAND}`),
        GIT_BASH_ENV,
      ),
    ).toEqual({});
  });

  /**
   * A pre-existing prefix clears a segment only when nothing ELSE in its argv
   * needed converting: the prefix is argv-wide, so here it would protect the
   * `<ref>:<path>` and break the `-C`. The shape an agent types unprompted,
   * since the mainline doctrine is "prefix unconditionally" — and one this
   * suite's other arms cannot reach, all of them carrying a single argument.
   */
  it('still denies a prefixed command whose -C the prefix would break', () => {
    const reason = readDeny(
      performMsysArgvGuard(
        buildInput(
          'MSYS_NO_PATHCONV=1 git -C /c/repo show origin/develop:.claude/x',
        ),
        GIT_BASH_ENV,
      ),
    ).permissionDecisionReason;

    expect(reason).toContain(
      'cd /c/repo && MSYS_NO_PATHCONV=1 git show origin/develop:.claude/x',
    );
  });

  it('has no opinion on an ordinary command', () => {
    expect(
      performMsysArgvGuard(buildInput('npm run build'), GIT_BASH_ENV),
    ).toEqual({});
  });

  /** The dropped family: this repo runs no firebase CLI, so an RTDB path is
   * nobody's offense here. */
  it('has no opinion on a firebase RTDB read', () => {
    expect(
      performMsysArgvGuard(
        buildInput('npx firebase database:get /status/uid'),
        GIT_BASH_ENV,
      ),
    ).toEqual({});
  });

  it('names only the FIRST offending segment of a compound command', () => {
    const reason = readDeny(
      performMsysArgvGuard(
        buildInput(
          'git show origin/develop:a/b; git ls-tree origin/develop:c/',
        ),
        GIT_BASH_ENV,
      ),
    ).permissionDecisionReason;

    expect(reason).toContain('origin/develop:a/b');
    expect(reason).not.toContain('origin/develop:c/');
  });
});

describe('performMsysArgvGuard — the non-Windows arm', () => {
  /**
   * The remedy is a verified no-op off Windows; a REFUSAL is not. Denying a
   * working command on two of three platforms is new friction with no bug to
   * prevent — and this repo's own maintainer loop runs on the Linux box that
   * would eat it.
   */
  it.each([
    ['the reported command', REPORTED_COMMAND],
    ['a cross-product command', 'git -C /home/dev/repo show a:b/c'],
  ])('stays silent on %s', (_label, command) => {
    expect(performMsysArgvGuard(buildInput(command), LINUX_ENV)).toEqual({});
  });

  it('emits no fail-open line off Windows, even for an unreadable payload', () => {
    const warn = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    expect(performMsysArgvGuard(buildInput(42), LINUX_ENV)).toEqual({});
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });
});

describe('performMsysArgvGuard — fail open, loudly', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  /** A guard that cannot read the literal argument must not block. */
  it('abstains on an unexpandable argument, and says so', () => {
    expect(
      performMsysArgvGuard(
        buildInput('git show "$REF:.claude/x"'),
        GIT_BASH_ENV,
      ),
    ).toEqual({});
    expect(warn).toHaveBeenCalledWith(
      'msys-argv-guard: fail-open (unexpandable-argv)',
    );
  });

  it('abstains on a missing tool_input', () => {
    const input = {
      tool_name: 'Bash',
    } as unknown as ClaudeCodePreToolUseInput;

    expect(performMsysArgvGuard(input, GIT_BASH_ENV)).toEqual({});
    expect(warn).toHaveBeenCalledWith(
      'msys-argv-guard: fail-open (missing-tool-input)',
    );
  });

  it('abstains on a non-string command', () => {
    expect(performMsysArgvGuard(buildInput(42), GIT_BASH_ENV)).toEqual({});
    expect(warn).toHaveBeenCalledWith(
      'msys-argv-guard: fail-open (non-string-command)',
    );
  });

  it('never names the command in the fail-open line', () => {
    performMsysArgvGuard(
      buildInput('git show "$TOKEN:secrets/prod.env"'),
      GIT_BASH_ENV,
    );

    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining('secrets/prod.env'),
    );
  });

  it('ignores a tool that is not Bash', () => {
    expect(
      performMsysArgvGuard(buildInput(REPORTED_COMMAND, 'Read'), GIT_BASH_ENV),
    ).toEqual({});
    expect(warn).not.toHaveBeenCalled();
  });
});

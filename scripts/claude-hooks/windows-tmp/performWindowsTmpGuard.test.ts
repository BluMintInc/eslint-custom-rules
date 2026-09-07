import {
  GIT_BASH_PLATFORM,
  MSYS_GUARD_PLATFORM_ENV,
} from '../msys-argv/detectGitBash';
import type { ClaudeCodePreToolUseInput } from '../preToolUseInput';
import { performWindowsTmpGuard } from './performWindowsTmpGuard';

const GIT_BASH_ENV = { [MSYS_GUARD_PLATFORM_ENV]: GIT_BASH_PLATFORM } as const;
const LINUX_ENV = { [MSYS_GUARD_PLATFORM_ENV]: 'other' } as const;

/** The shape doctrine names: a child parses the `/tmp` literal for itself, so
 * the write lands in MSYS's `/tmp` and the read looks in `C:\tmp`. */
const REPORTED_COMMAND =
  `node -p "JSON.parse(require('fs').readFileSync('/tmp/r3.json','utf8')).body"` as const;

const buildInput = (command: unknown, toolName = 'Bash') => {
  return {
    session_id: 'windows-tmp-session',
    transcript_path: '/dev/null',
    cwd: '/c/Users/dev/eslint-custom-rules',
    permission_mode: 'bypassPermissions',
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: { command },
  } as unknown as ClaudeCodePreToolUseInput;
};

describe('performWindowsTmpGuard — the Git Bash arm', () => {
  it('denies the reported command, prescribing the repo-local sink', () => {
    const { hookSpecificOutput } = performWindowsTmpGuard(
      buildInput(REPORTED_COMMAND),
      GIT_BASH_ENV,
    );

    expect(hookSpecificOutput).toMatchObject({
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: expect.stringContaining(
        'mkdir -p .claude/tmp/<scope>',
      ),
    });
  });

  it.each([
    ['a redirect the shell resolves', 'gh x --json body > /tmp/body.json'],
    ['an argv path a child receives already converted', 'jq .body /tmp/b.json'],
    ['the prescribed sink', 'node -e "require(\'./.claude/tmp/s/r.json\')"'],
    ['an unrelated command', 'npm run build'],
  ])('holds no opinion about %s', (_label, command) => {
    expect(performWindowsTmpGuard(buildInput(command), GIT_BASH_ENV)).toEqual(
      {},
    );
  });

  it('holds no opinion about a tool that is not Bash', () => {
    expect(
      performWindowsTmpGuard(
        buildInput(REPORTED_COMMAND, 'Read'),
        GIT_BASH_ENV,
      ),
    ).toEqual({});
  });
});

/**
 * Off Windows `/tmp` is one directory for the shell and every child it spawns,
 * so the flagged command WORKS and denying it is friction with no bug to
 * prevent — on the Linux box this repo's own maintainer loop runs on, among
 * others.
 */
describe('performWindowsTmpGuard — the non-Windows arm', () => {
  it('stays silent on the reported command', () => {
    expect(
      performWindowsTmpGuard(buildInput(REPORTED_COMMAND), LINUX_ENV),
    ).toEqual({});
  });

  it('emits no fail-open line off Windows, even for an unreadable payload', () => {
    const warn = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    expect(performWindowsTmpGuard(buildInput(42), LINUX_ENV)).toEqual({});
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });
});

describe('performWindowsTmpGuard — fail open, loudly', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it.each([
    ['a missing tool input', undefined, 'missing-tool-input'],
    ['a non-string command', 42, 'non-string-command'],
  ])('abstains on %s, and says so', (_label, command, reason) => {
    const input =
      command === undefined
        ? ({ tool_name: 'Bash' } as unknown as ClaudeCodePreToolUseInput)
        : buildInput(command);

    expect(performWindowsTmpGuard(input, GIT_BASH_ENV)).toEqual({});
    expect(warn).toHaveBeenCalledWith(
      `windows-tmp-guard: fail-open (${reason})`,
    );
  });
});

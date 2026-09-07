import type { ClaudeCodePreToolUseInput } from '../preToolUseInput';
import { performGateContainmentGuard } from './performGateContainmentGuard';

const buildInput = (
  toolInput: unknown,
  toolName = 'Bash',
): ClaudeCodePreToolUseInput => {
  return {
    session_id: 'session',
    transcript_path: '/dev/null',
    cwd: '/home/dev/eslint-custom-rules',
    permission_mode: 'default',
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: toolInput as ClaudeCodePreToolUseInput['tool_input'],
  };
};

describe('performGateContainmentGuard', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('denies a whole-suite run, naming the rewrite', () => {
    const decision = performGateContainmentGuard(
      buildInput({ command: 'npx jest' }),
    );

    expect(decision).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: expect.stringContaining(
          'npm run test:related',
        ),
      },
    });
  });

  it('holds no opinion about a scoped run', () => {
    expect(
      performGateContainmentGuard(
        buildInput({ command: 'npx jest src/tests/x.test.ts' }),
      ),
    ).toEqual({});
  });

  /** This guard has no platform gate, unlike the two that carry one: the memory
   * budget is machine-global on every platform the team develops on. */
  it('holds no opinion about a tool that is not Bash', () => {
    expect(
      performGateContainmentGuard(buildInput({ command: 'npx jest' }, 'Read')),
    ).toEqual({});
    expect(warn).not.toHaveBeenCalled();
  });

  /**
   * Abstaining and deciding "no opinion" both return `{}`, so the stderr line
   * is the only signal the guard never got to look.
   */
  it.each([
    ['a missing tool input', undefined, 'missing-tool-input'],
    ['a non-string command', { command: 7 }, 'non-string-command'],
    ['a command it cannot lex', { command: '(npx jest)' }, 'operator:('],
    [
      'a wrapper option hiding a command',
      { command: "env -S 'npx jest'" },
      'unmodelled-prefix',
    ],
  ])('fails open loudly on %s', (_label, toolInput, reason) => {
    expect(performGateContainmentGuard(buildInput(toolInput))).toEqual({});
    expect(warn).toHaveBeenCalledWith(
      `gate-containment-guard: fail-open (${reason})`,
    );
  });
});

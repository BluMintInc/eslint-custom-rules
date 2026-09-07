import type { ClaudeCodePreToolUseInput } from './preToolUseInput';

/**
 * The `tool_input.command` boundary for every hook matched on `Bash`.
 *
 * **Read through an `unknown` view rather than off the declared type.**
 * `readInput<T>()` CASTS parsed stdin, it does not validate it, so a payload
 * without `tool_input` throws a bare `TypeError` that an entry point reports as
 * a generic caught error — the guard still fails open, but WITHOUT the
 * `fail-open (<cause>)` line that is an operator's only signal it never got to
 * look. Fail-open is only safe while it is LOUD.
 *
 * **Reports a reason; warns nothing.** Each caller owns its own stderr prefix
 * (`gate-containment-guard:`, `msys-argv-guard:`, `windows-tmp-guard:`), so a
 * reader that wrote the line itself would take that choice away from all three.
 *
 * **A discriminated union, deliberately.** Returning the command or `undefined`
 * would collapse the two rejections into one, and each names a different defect
 * an operator greps for.
 */
export function readBashCommand(input: ClaudeCodePreToolUseInput) {
  const toolInput: unknown = input.tool_input;
  if (typeof toolInput !== 'object' || toolInput === null) {
    return { kind: 'unreadable', reason: 'missing-tool-input' } as const;
  }
  const { command } = toolInput as { readonly command?: unknown };
  if (typeof command !== 'string') {
    return { kind: 'unreadable', reason: 'non-string-command' } as const;
  }
  return { kind: 'command', command } as const;
}

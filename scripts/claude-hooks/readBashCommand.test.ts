import type { ClaudeCodePreToolUseInput } from './preToolUseInput';
import { readBashCommand } from './readBashCommand';

const buildInput = (toolInput: unknown) => {
  return { tool_input: toolInput } as unknown as ClaudeCodePreToolUseInput;
};

describe('readBashCommand', () => {
  it('reads the command off a well-formed payload', () => {
    expect(readBashCommand(buildInput({ command: 'npx jest' }))).toEqual({
      kind: 'command',
      command: 'npx jest',
    });
  });

  /**
   * `readInput` CASTS parsed stdin rather than validating it, so a payload
   * without `tool_input` would otherwise throw a bare `TypeError` an entry
   * point reports as a generic caught error — the guard still fails open, but
   * WITHOUT the `fail-open (<cause>)` line that is an operator's only signal it
   * never got to look.
   */
  it.each([
    ['a missing tool input', undefined, 'missing-tool-input'],
    ['a null tool input', null, 'missing-tool-input'],
    ['a string tool input', '/tmp/x.json', 'missing-tool-input'],
    ['a missing command', {}, 'non-string-command'],
    ['a non-string command', { command: 7 }, 'non-string-command'],
  ])('reports %s as unreadable', (_label, toolInput, reason) => {
    expect(readBashCommand(buildInput(toolInput))).toEqual({
      kind: 'unreadable',
      reason,
    });
  });
});

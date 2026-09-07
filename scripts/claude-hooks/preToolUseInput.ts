/**
 * Claude Code's `PreToolUse` hook payload, as it arrives on stdin.
 *
 * A DECLARED shape rather than a validated one: `readInput` casts the parsed
 * JSON, so every field here is a contract with Claude Code rather than a
 * guarantee about the bytes. That is why `readBashCommand` reads
 * `tool_input.command` through an `unknown` view instead of off this type — the
 * one field the guards decide on is also the one a malformed payload omits.
 *
 * Lives beside the guards rather than in `types.ts`, which the Stop hook owns:
 * the two hook families share no payload, and merging them would make either
 * one's edit a churn in the other's tests.
 */
export type ClaudeCodePreToolUseInput = {
  readonly session_id: string;
  readonly transcript_path: string;
  readonly cwd: string;
  readonly permission_mode: string;
  readonly hook_event_name: 'PreToolUse';
  readonly tool_name: string;
  readonly tool_input: {
    readonly [key: string]: unknown;
  };
};

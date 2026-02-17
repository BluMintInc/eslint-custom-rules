/**
 * Shared types for Claude Code stop hook modules.
 * Extracted to avoid circular dependencies between agent-check.ts
 * and modules it imports (pr-review-check.ts).
 */

export type Input = {
  readonly session_id: string;
  readonly transcript_path: string;
  readonly permission_mode: string;
  readonly hook_event_name: 'Stop';
  readonly stop_hook_active: boolean;
  readonly [key: string]: unknown;
};

export type AgentCheckResult =
  | { readonly decision: 'block'; readonly reason: string }
  | Record<string, never>;

/**
 * Shared types for Cursor stop hook modules.
 * Extracted to avoid circular dependencies between agent-check.ts
 * and modules it imports.
 */

export type Input = {
  readonly conversation_id: string;
  readonly generation_id: string;
  readonly loop_count: number;
  readonly status?: 'completed' | 'aborted' | 'error';
  readonly [key: string]: unknown;
};

export type AgentCheckResult = { readonly followup_message?: string };

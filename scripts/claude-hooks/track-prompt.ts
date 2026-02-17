import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  isRuleRequestConversation,
  markAsRuleRequest,
  modifyConversationLastActive,
  setLastUserMessage,
} from './change-log';

// Claude Code UserPromptSubmit input format
export type Input = {
  readonly hook_event_name: 'UserPromptSubmit';
  readonly prompt: string;
  readonly session_id: string;
  readonly [key: string]: unknown;
};

function isInput(value: unknown): value is Input {
  if (typeof value !== 'object' || value === null) return false;
  const maybe = value as { prompt?: unknown; session_id?: unknown };
  if (typeof maybe.prompt !== 'string') return false;
  if (maybe.session_id !== undefined && typeof maybe.session_id !== 'string') {
    return false;
  }
  return true;
}

function readInput() {
  try {
    if (process.stdin.isTTY) {
      return null;
    }
    const raw = readFileSync(0, 'utf-8');
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isInput(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Detects the rule-request flag in the prompt. This flag is injected by
 * the implement-rule agent to mark conversations as rule implementations.
 */
function detectRuleRequestFlag(prompt: string) {
  return prompt.includes('<!-- rule-request -->');
}

function executeMain() {
  const input = readInput();

  // Always allow the prompt to continue (Claude Code format: empty object)
  const output = {};

  if (input && input.prompt && input.session_id) {
    try {
      // Check for rule-request flag on first message (before marking as rule request)
      if (!isRuleRequestConversation(input.session_id)) {
        if (detectRuleRequestFlag(input.prompt)) {
          markAsRuleRequest(input.session_id);
        }
      }

      setLastUserMessage({
        conversationId: input.session_id,
        message: input.prompt,
      });
      modifyConversationLastActive(input.session_id);
    } catch (error) {
      // Ignore errors, don't block the user
      console.error('Error tracking prompt:', {
        error,
        conversationId: input.session_id,
      });
    }
  }

  console.log(JSON.stringify(output));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  executeMain();
}

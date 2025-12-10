import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  isRuleRequestConversation,
  markAsRuleRequest,
  modifyConversationLastActive,
  setLastUserMessage,
} from './change-log';

export type Input = {
  readonly prompt: string;
  readonly conversation_id?: string;
  readonly [key: string]: unknown;
};

function readInput() {
  try {
    if (process.stdin.isTTY) {
      return null;
    }
    const input = readFileSync(0, 'utf-8');
    if (!input) return null;
    return JSON.parse(input);
  } catch {
    return null;
  }
}

/**
 * Detects the rule-request flag in the prompt. This flag is injected by
 * cursor-implement-rule-agent.yml to mark conversations as rule implementations.
 */
function detectRuleRequestFlag(prompt: string) {
  return prompt.includes('<!-- rule-request -->');
}

function executeMain() {
  const input = readInput();

  // Always allow the prompt to continue
  const output = { continue: true };

  if (input && input.prompt && input.conversation_id) {
    try {
      // Check for rule-request flag on first message (before marking as rule request)
      if (!isRuleRequestConversation(input.conversation_id)) {
        if (detectRuleRequestFlag(input.prompt)) {
          markAsRuleRequest(input.conversation_id);
        }
      }

      setLastUserMessage({
        conversationId: input.conversation_id,
        message: input.prompt,
      });
      modifyConversationLastActive(input.conversation_id);
    } catch (error) {
      // Ignore errors, don't block the user
      console.error('Error tracking prompt:', {
        error,
        conversationId: input.conversation_id,
      });
    }
  }

  console.log(JSON.stringify(output));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  executeMain();
}

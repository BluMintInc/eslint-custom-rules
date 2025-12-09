import { readFileSync } from 'node:fs';
import {
  modifyConversationLastActive,
  setLastUserMessage,
  markAsRuleRequest,
  isRuleRequestConversation,
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
 * Detects if this is a rule-request conversation by checking for the
 * <!-- rule-request --> flag in the prompt. This flag is inserted by
 * the cursor-implement-rule-agent.yml workflow.
 */
function detectRuleRequestFlag(prompt: string): boolean {
  return prompt.includes('<!-- rule-request -->');
}

function executeMain() {
  const input = readInput();

  // Always allow the prompt to continue
  const output = { continue: true };

  if (input && input.prompt && input.conversation_id) {
    try {
      // Check for rule-request flag on first message (before it's been marked)
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
      console.error('Error tracking prompt:', error);
    }
  }

  console.log(JSON.stringify(output));
}

const isDirectExecution =
  process.argv[1] && process.argv[1].includes('track-prompt');

if (isDirectExecution) {
  executeMain();
}

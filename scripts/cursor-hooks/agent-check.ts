import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exec, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import {
  fetchAllConversationFiles,
  fetchChangedFiles,
  hasCheckWorkBeenPrompted,
  markCheckWorkPrompted,
  hasExpandTestsBeenPrompted,
  markExpandTestsPrompted,
  isRuleRequestConversation,
  setLastUserMessage,
  modifyConversationEnd,
  modifyHeartbeat,
  MAX_LOOPS,
} from './change-log';
import { validateRuleStructure } from './validate-rule-structure';
import type { Input } from './types';

function readInput() {
  try {
    if (process.stdin.isTTY) return null;
    const input = readFileSync(0, 'utf-8');
    if (!input) return null;
    return JSON.parse(input);
  } catch {
    return null;
  }
}

export function executeCommand(command: string) {
  try {
    const output = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
    return { isSuccess: true, output } as const;
  } catch (error: unknown) {
    const stdout = (error as any).stdout ? String((error as any).stdout) : null;
    const stderr = (error as any).stderr ? String((error as any).stderr) : null;
    return {
      isSuccess: false,
      output: `${stdout ?? ''}\n${stderr ?? ''}`,
    } as const;
  }
}

const execAsync = promisify(exec);

async function executeCommandAsync(command: string) {
  try {
    const { stdout, stderr } = await execAsync(command, {
      encoding: 'utf-8',
    });
    return {
      isSuccess: true,
      output: `${stdout ?? ''}\n${stderr ?? ''}`,
    } as const;
  } catch (error: unknown) {
    const stdout = (error as any).stdout ? String((error as any).stdout) : null;
    const stderr = (error as any).stderr ? String((error as any).stderr) : null;
    return {
      isSuccess: false,
      output: `${stdout ?? ''}\n${stderr ?? ''}`,
    } as const;
  }
}

function validateBuild() {
  const buildResult = executeCommand('npm run build');
  if (!buildResult.isSuccess) {
    return {
      followup_message: `Build failed.\n${buildResult.output}\n\nPlease fix the TypeScript compilation errors.`,
    } as const;
  }
  return null;
}

function validateLinting(params: {
  readonly conversationId: string;
  readonly generationId: string;
}) {
  const { conversationId, generationId } = params;
  const lintDiffScript = join(
    process.cwd(),
    'scripts/cursor-hooks/lint-diff.ts',
  );
  const lintCmd = `npx tsx "${lintDiffScript}" --conversation-id "${conversationId}" --generation-id "${generationId}"`;
  const lintResult = executeCommand(lintCmd);
  if (!lintResult.isSuccess) {
    return {
      followup_message: `Linting failed on changed files.\n${lintResult.output}\n\nPlease fix these linting errors.`,
    } as const;
  }
  return null;
}

async function validateTests() {
  const testResult = await executeCommandAsync('npm test');
  if (!testResult.isSuccess) {
    return {
      followup_message: `Tests failed.\n${testResult.output}\n\nPlease fix the failing tests. Remember to write 20+ comprehensive tests per rule.`,
    } as const;
  }
  return null;
}

function performRuleStructureValidation(changedFiles: readonly string[]) {
  // Detect if this is a new rule implementation by checking for new rule files
  const newRuleFiles = changedFiles.filter(
    (f) =>
      f.startsWith('src/rules/') && f.endsWith('.ts') && !f.includes('.test.'),
  );

  if (newRuleFiles.length === 0) return null; // Not a rule implementation

  for (const ruleFile of newRuleFiles) {
    // Extract rule name from path: src/rules/my-rule.ts -> my-rule
    const ruleName = ruleFile.replace('src/rules/', '').replace('.ts', '');
    const validation = validateRuleStructure(ruleName);

    if (!validation.isValid) {
      const issues = [
        ...validation.missingFiles.map((f) => `- Missing file: ${f}`),
        ...validation.indexIssues.map((i) => `- ${i}`),
      ].join('\n');

      return {
        followup_message: `ESLint Rule Structure Validation Failed.\n\nThe following issues were found with the rule "${ruleName}":\n${issues}\n\nPlease ensure all required files exist and src/index.ts properly exports the rule in all 3 places (import, configs.recommended.rules, and rules object).`,
      };
    }
  }

  return null;
}

const EXPAND_TESTS_PROMPT = `
Your implementation looks good so far! Now let's ensure comprehensive test coverage.

Please expand the test suite to have **at least 20 tests** covering edge cases:

1. **False Positive Tests** (Valid code that should NOT trigger the rule):
   - Edge cases where similar patterns are actually correct
   - Framework-specific code that resembles violations
   - Dynamic values that look like they should be flagged

2. **False Negative Tests** (Invalid code that SHOULD trigger the rule):
   - Subtle violations that might be missed
   - Complex nested cases
   - Multi-line variations

3. **Auto-fix Tests** (if the rule has a fixer):
   - Verify the auto-fix produces correct output
   - Edge cases where auto-fix might break code

Think outside the box. What could go wrong? What edge cases exist in real codebases?

After expanding tests, ensure all tests pass with: npm test
`;

async function performAgentCheckInternal(input: Input) {
  const { conversation_id, generation_id, loop_count = 0, status } = input;

  try {
    modifyHeartbeat(conversation_id);
  } catch {
    /* Ignore */
  }

  if (status !== 'completed') {
    modifyConversationEnd(conversation_id);
    return { followup_message: undefined } as const;
  }

  // Safety: Allow completion after MAX_LOOPS even if checks would fail
  // This prevents infinite loops when issues are unfixable
  if (loop_count >= MAX_LOOPS) {
    console.log(
      `MAX_LOOPS (${MAX_LOOPS}) reached for conversation ${conversation_id}. Allowing completion.`,
    );
    modifyConversationEnd(conversation_id);
    return { followup_message: undefined } as const;
  }

  // Priority 1: Build Check
  const buildResult = validateBuild();
  if (buildResult) return buildResult;

  // Priority 2: Linting Check
  const lintResult = validateLinting({
    conversationId: conversation_id,
    generationId: generation_id,
  });
  if (lintResult) return lintResult;

  // Priority 3: Tests Check
  const testResult = await validateTests();
  if (testResult) return testResult;

  const changedFiles = fetchChangedFiles({
    conversationId: conversation_id,
    generationId: generation_id,
  });

  // Priority 4: Rule Structure Validation (for rule implementations)
  const allChangedFiles = fetchAllConversationFiles({
    conversationId: conversation_id,
  });
  const ruleStructureResult = performRuleStructureValidation(allChangedFiles);
  if (ruleStructureResult) return ruleStructureResult;

  // Early exit if no files changed in this generation
  if (changedFiles.length === 0) {
    modifyConversationEnd(conversation_id);
    return { followup_message: undefined } as const;
  }

  // Priority 5: Check-Your-Work Prompt
  const hasBeenPromptedBefore = hasCheckWorkBeenPrompted(conversation_id);

  if (!hasBeenPromptedBefore) {
    markCheckWorkPrompted(conversation_id);
    return {
      followup_message: `Please check your work. It's highly likely you missed something originally requested of you and your solution is incomplete. Now is your chance to construct a new to-do list and meticulously fill in all remaining gaps in your solution. Make sure you've satisfied all requirements in @.cursor/rules/task-completion-standards.mdc.\n\nNote: If you need to create temporary files for notetaking or testing during this review, please place them in the \`.cursor/tmp/\` directory so they are ignored by our Cursor Hooks.`,
    } as const;
  }

  // Priority 6: Expand Tests Prompt (for rule implementations only, after first check-your-work)
  const isRuleRequest = isRuleRequestConversation(conversation_id);
  const hasExpandedTests = hasExpandTestsBeenPrompted(conversation_id);

  if (isRuleRequest && !hasExpandedTests) {
    markExpandTestsPrompted(conversation_id);
    return { followup_message: EXPAND_TESTS_PROMPT } as const;
  }

  // Subsequent check-your-work prompts
  return {
    followup_message: `Please double check your work again. Reminder: If you need to create temporary files for notetaking or testing during this review, please place them in the \`.cursor/tmp/\` directory so they are ignored by this check.`,
  } as const;
}

export async function performAgentCheck(input: Input) {
  const result = await performAgentCheckInternal(input);
  if (result.followup_message) {
    setLastUserMessage({
      conversationId: input.conversation_id,
      message: result.followup_message,
    });
  }
  return result;
}

export async function executeMain() {
  const input = readInput();
  if (!input || !input.conversation_id || !input.generation_id) {
    console.log(JSON.stringify({}));
    return;
  }
  const result = await performAgentCheck(input);
  console.log(JSON.stringify(result));
}

// Check if this file is being run directly (not imported)
const isDirectExecution = () => {
  return process.argv[1] && process.argv[1].endsWith('agent-check.ts');
};

if (isDirectExecution()) {
  executeMain().catch((error) => {
    console.error('Error in agent check:', error);
    process.exit(1);
  });
}

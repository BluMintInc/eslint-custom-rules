/* eslint-disable max-lines */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exec, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import {
  fetchAllConversationFiles,
  fetchChangedFiles,
  fetchLastUserMessage,
  hasCheckWorkBeenPrompted,
  hasExpandTestsBeenPrompted,
  isRuleRequestConversation,
  markCheckWorkPrompted,
  markExpandTestsPrompted,
  setLastUserMessage,
  modifyConversationEnd,
  modifyHeartbeat,
  MAX_LOOPS,
} from './change-log';
import type { Input, AgentCheckResult } from './types';
import { validateRuleStructure } from './validate-rule-structure';

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

type ExecError = Error & { stdout?: string | Buffer; stderr?: string | Buffer };

function formatExecError(error: unknown): string {
  const execError = error as ExecError;
  const stdout = execError.stdout ? String(execError.stdout) : '';
  const stderr = execError.stderr ? String(execError.stderr) : '';
  return [stdout, stderr].filter(Boolean).join('\n');
}

function isValidInput(value: unknown): value is Input {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const hasConversationId = typeof candidate.conversation_id === 'string';
  const hasGenerationId = typeof candidate.generation_id === 'string';
  const hasValidLoopCount =
    candidate.loop_count === undefined ||
    typeof candidate.loop_count === 'number';

  return hasConversationId && hasGenerationId && hasValidLoopCount;
}

function readInput() {
  try {
    if (process.stdin.isTTY) return null;
    const input = readFileSync(0, 'utf-8');
    if (!input) return null;
    const parsed: unknown = JSON.parse(input);
    return isValidInput(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function executeCommand(command: string) {
  // Uses shell execution; callers must validate and quote any interpolated values.
  try {
    const output = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
    return { isSuccess: true, output } as const;
  } catch (error: unknown) {
    return {
      isSuccess: false,
      output: formatExecError(error),
    } as const;
  }
}

const execAsync = promisify(exec);

// We need both sync (executeCommand) and async (executeCommandAsync) versions
// eslint-disable-next-line @typescript-eslint/naming-convention
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
    return {
      isSuccess: false,
      output: formatExecError(error),
    } as const;
  }
}

type CheckType = 'build' | 'lint' | 'test';

function filterTypeScriptFiles(files: readonly string[]) {
  return files.filter((file) => {
    return /\.(ts|tsx)$/.test(file);
  });
}

function extractChecks({
  conversationId,
  generationId,
}: {
  readonly conversationId: string;
  readonly generationId: string;
}) {
  const allChangedFiles = fetchAllConversationFiles({ conversationId });
  const changedTypeScriptFiles = filterTypeScriptFiles(allChangedFiles);

  if (changedTypeScriptFiles.length === 0) {
    return {} as const;
  }

  return {
    build: { conversationId, generationId },
    lint: { conversationId, generationId },
    test: { conversationId, changedTypeScriptFiles },
  };
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
      followup_message: `Linting failed on changed files.\n${lintResult.output}\n\nPlease fix these linting errors.\nNote: If any error appears to be a false positive (especially from custom rules), you may suppress it using \`// eslint-disable-next-line <rule-name>\`.`,
    } as const;
  }
  return null;
}

const JEST_BASE_COMMAND = 'node ./node_modules/jest/bin/jest' as const;
const JEST_FLAGS = '--passWithNoTests' as const;

export async function validateTests(params: {
  readonly conversationId: string;
  readonly changedTypeScriptFiles: readonly string[];
}) {
  const { changedTypeScriptFiles } = params;

  // Filter to identify "Source Files" (excluding tests, mocks, and type definitions)
  const sourceFiles = changedTypeScriptFiles.filter((file) => {
    const isTestFile = /\.(spec|test)\.(ts|tsx|js|jsx)$/.test(file);
    const isMockFile = file.includes('__mocks__/');
    // Exclude type definitions as per jest.mdc exception
    const isTypeFile =
      file.includes('functions/src/types/') || file.includes('/src/types/');
    return !isTestFile && !isMockFile && !isTypeFile;
  });

  let testCommand: string;

  if (sourceFiles.length > 0) {
    // Scenario A: Source Files Changed - Enforce 100% Coverage
    const filesArg = changedTypeScriptFiles.join(' ');

    // Build --collectCoverageFrom flags for each source file to strictly scope coverage
    const coverageFromFlags = sourceFiles
      .map((file) => {
        return `--collectCoverageFrom "${file}"`;
      })
      .join(' ');

    // Run with coverage check enabled
    testCommand = `CURSOR_AGENT_COVERAGE_CHECK=true ${JEST_BASE_COMMAND} --findRelatedTests ${filesArg} ${JEST_FLAGS} --collectCoverage ${coverageFromFlags}`;
  } else {
    // Scenario B: Only Tests/Exclusions Changed - Standard Check without coverage enforcement
    const filesArg = changedTypeScriptFiles.join(' ');
    testCommand = `${JEST_BASE_COMMAND} --findRelatedTests ${filesArg} ${JEST_FLAGS}`;
  }

  const testResult = await executeCommandAsync(testCommand);

  if (!testResult.isSuccess) {
    const { output } = testResult;
    const isCoverageFailure =
      output.includes('coverage threshold') ||
      output.includes('Insufficient coverage') ||
      output.includes('Jest: "global" coverage threshold for statements'); // Common Jest failure message

    if (isCoverageFailure) {
      return {
        followup_message: `Insufficient Code Coverage.\n\nYour changes to source files must have 100% test coverage (statements, branches, functions, lines). The current tests do not meet this threshold for the modified files.\n\n${output}\n\nPlease write additional tests to cover the untested lines and branches in the files you modified.`,
      } as const;
    }

    return {
      followup_message: `Tests failed.\n${output}\n\nSee @.cursor/rules/jest.mdc if you haven't already for an overview our Jest testing infrastructure and best practices.\n\nPlease analyze the failures, fix the broken tests or code, and ensure all tests pass.`,
    } as const;
  }

  return null;
}

const CODE_QUALITY_CHECKS: Readonly<
  Record<
    CheckType,
    ReadonlyArray<
      (
        params:
          | { readonly conversationId: string; readonly generationId: string }
          | {
              readonly conversationId: string;
              readonly changedTypeScriptFiles: readonly string[];
            },
      ) => Promise<AgentCheckResult | null> | AgentCheckResult | null
    >
  >
> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: [validateBuild as any],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lint: [validateLinting as any],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  test: [validateTests as any],
} as const;

const CHECK_PRIORITY_ORDER: CheckType[] = ['build', 'lint', 'test'];

class CheckRegistry {
  constructor(
    private readonly registry: Readonly<
      Record<
        CheckType,
        ReadonlyArray<
          (
            params:
              | {
                  readonly conversationId: string;
                  readonly generationId: string;
                }
              | {
                  readonly conversationId: string;
                  readonly changedTypeScriptFiles: readonly string[];
                },
          ) => Promise<AgentCheckResult | null> | AgentCheckResult | null
        >
      >
    >,
  ) {}

  async dispatch(
    checkDispatchMap: Readonly<
      Partial<
        Record<
          CheckType,
          | { readonly conversationId: string; readonly generationId: string }
          | {
              readonly conversationId: string;
              readonly changedTypeScriptFiles: readonly string[];
            }
        >
      >
    >,
  ) {
    const checkPromises: Array<Promise<AgentCheckResult | null>> = [];
    const checkTypes: CheckType[] = [];

    // eslint-disable-next-line no-restricted-properties
    for (const checkType of Object.keys(checkDispatchMap) as CheckType[]) {
      const params = checkDispatchMap[checkType];
      if (!params) continue;

      const checkFunctions = this.registry[checkType];
      if (
        !checkFunctions ||
        !Array.isArray(checkFunctions) ||
        checkFunctions.length === 0
      ) {
        continue;
      }

      const checkFn = checkFunctions[0];
      const result = checkFn(params);

      checkPromises.push(Promise.resolve(result));
      checkTypes.push(checkType);
    }

    const results = await Promise.all(checkPromises);

    for (const priorityType of CHECK_PRIORITY_ORDER) {
      const index = checkTypes.indexOf(priorityType);
      if (index !== -1 && results[index]) {
        return results[index];
      }
    }

    return null;
  }
}

async function performQualityChecks(input: Input) {
  const { conversation_id, generation_id } = input;

  const checkDispatchMap = extractChecks({
    conversationId: conversation_id,
    generationId: generation_id,
  });

  // eslint-disable-next-line no-restricted-properties
  if (Object.keys(checkDispatchMap).length === 0) {
    return null;
  }

  const checkRegistry = new CheckRegistry(CODE_QUALITY_CHECKS);
  return await checkRegistry.dispatch(checkDispatchMap);
}

/**
 * Extract rule name from changed files by looking for src/rules/*.ts patterns.
 */
function extractRuleNameFromFiles(files: readonly string[]) {
  for (const file of files) {
    const match = /src\/rules\/([^/]+)\.ts$/.exec(file);
    if (match && match[1] && !match[1].includes('.test')) {
      return match[1];
    }
  }
  return null;
}

/**
 * Validate rule structure for rule implementations.
 * Returns a followup message if validation fails, null otherwise.
 */
function performRuleStructureValidation(changedFiles: readonly string[]) {
  const ruleName = extractRuleNameFromFiles(changedFiles);
  if (!ruleName) {
    return null;
  }

  const result = validateRuleStructure(ruleName);
  if (result.isValid) {
    return null;
  }

  const issues: string[] = [];
  if (result.missingFiles.length > 0) {
    issues.push(
      `Missing files:\n${result.missingFiles
        .map((f) => `  - ${f}`)
        .join('\n')}`,
    );
  }
  if (result.indexIssues.length > 0) {
    issues.push(
      `Index issues:\n${result.indexIssues.map((i) => `  - ${i}`).join('\n')}`,
    );
  }

  return {
    followup_message: `Rule structure validation failed for "${ruleName}":\n\n${issues.join(
      '\n\n',
    )}\n\nPlease ensure all required files exist and src/index.ts properly exports the rule.`,
  } as const;
}

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

  // Priority 0: Merge Conflict Check - merge conflicts block all other validation
  const { performMergeConflictCheck } = await import('./merge-conflict-check');
  const mergeConflictResult = performMergeConflictCheck(input);
  if (mergeConflictResult) return mergeConflictResult;

  // Priority 1: PR Review Check
  const { performPrReviewCheck } = await import('./pr-review-check');
  const prReviewResult = await performPrReviewCheck(input);
  if (prReviewResult) return prReviewResult;

  const qualityCheckResult = await performQualityChecks(input);
  if (qualityCheckResult) return qualityCheckResult;

  const changedFiles = fetchChangedFiles({
    conversationId: conversation_id,
    generationId: generation_id,
  });
  if (changedFiles.length === 0 || loop_count >= MAX_LOOPS) {
    modifyConversationEnd(conversation_id);
    return { followup_message: undefined } as const;
  }

  const isRuleRequest = isRuleRequestConversation(conversation_id);
  if (isRuleRequest) {
    const ruleStructureResult = performRuleStructureValidation(changedFiles);
    if (ruleStructureResult) return ruleStructureResult;
  }

  const hasBeenPromptedBefore = hasCheckWorkBeenPrompted(conversation_id);
  markCheckWorkPrompted(conversation_id);
  if (isRuleRequest && hasBeenPromptedBefore) {
    const hasExpandTestsPrompted = hasExpandTestsBeenPrompted(conversation_id);
    if (!hasExpandTestsPrompted) {
      markExpandTestsPrompted(conversation_id);
      return { followup_message: EXPAND_TESTS_PROMPT } as const;
    }
  }

  const followupMessage = hasBeenPromptedBefore
    ? `Please double check your work again. Reminder: If you need to create temporary files for notetaking or testing during this review, please place them in the \`.cursor/tmp/\` directory so they are ignored by this check.`
    : `Please check your work. It's highly likely you missed something originally requested of you and your solution is incomplete. Now is your chance to construct a new to-do list to run for several more hours, meticulously filling in all remaining gaps in your solution. If your task was to create a plan, diagnosis, or report, make sure that your markdown file is complete, self-consistent, and correct. If your task was to implement a feature, make sure you've implemented the feature completely and correctly, and that you've properly tested your implementation. If your task was to fix a bug, make sure you've fixed the bug without introducing regressions elsewhere, created a test to make sure your fix works, and tested your fix. Please do not stop for a long time, and before you do, make sure you've completely satisfied @.cursor/rules/task-completion-standards.mdc.\n\nNote: If you need to create temporary files for notetaking or testing during this review, please place them in the \`.cursor/tmp/\` directory so they are ignored by our Cursor Hooks.`;

  return { followup_message: followupMessage } as const;
}

function isDuplicateMessage({
  conversationId,
  followupMessage,
}: {
  readonly conversationId: string;
  readonly followupMessage: string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const lastMessage = fetchLastUserMessage(conversationId);
  if (lastMessage && lastMessage === followupMessage) {
    try {
      modifyConversationEnd(conversationId);
    } catch {
      /* Ignore */
    }
    return true;
  }
  return false;
}

export async function performAgentCheck(input: Input) {
  const result = await performAgentCheckInternal(input);
  if (result.followup_message) {
    if (
      isDuplicateMessage({
        conversationId: input.conversation_id,
        followupMessage: result.followup_message,
      })
    ) {
      return {} as const;
    }
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
/** Conditional to avoid Jest parsing issues */
const isDirectExecution = () => {
  return process.argv[1] && process.argv[1].endsWith('agent-check.ts');
};

if (isDirectExecution()) {
  executeMain().catch((error) => {
    console.error('Error in agent check:', error);
    process.exit(1);
  });
}

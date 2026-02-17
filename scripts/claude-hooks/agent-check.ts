/* eslint-disable max-lines */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exec, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import {
  fetchAllConversationFiles,
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
  const hasSessionId = typeof candidate.session_id === 'string';
  const hasStopHookActive = typeof candidate.stop_hook_active === 'boolean';

  return hasSessionId && hasStopHookActive;
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
}: {
  readonly conversationId: string;
}) {
  const allChangedFiles = fetchAllConversationFiles({ conversationId });
  const changedTypeScriptFiles = filterTypeScriptFiles(allChangedFiles);

  if (changedTypeScriptFiles.length === 0) {
    return {} as const;
  }

  return {
    build: { conversationId },
    lint: { conversationId },
    test: { conversationId, changedTypeScriptFiles },
  };
}

function validateBuild() {
  const buildResult = executeCommand('npm run build');
  if (!buildResult.isSuccess) {
    return {
      decision: 'block',
      reason: `Build failed.\n${buildResult.output}\n\nPlease fix the TypeScript compilation errors.`,
    } as const;
  }
  return null;
}

function validateLinting(params: { readonly conversationId: string }) {
  const { conversationId } = params;
  const lintDiffScript = join(
    process.cwd(),
    'scripts/claude-hooks/lint-diff.ts',
  );
  const lintCmd = `npx tsx "${lintDiffScript}" --conversation-id "${conversationId}"`;
  const lintResult = executeCommand(lintCmd);
  if (!lintResult.isSuccess) {
    return {
      decision: 'block',
      reason: `Linting failed on changed files.\n${lintResult.output}\n\nPlease fix these linting errors.\nNote: If any error appears to be a false positive (especially from custom rules), you may suppress it using \`// eslint-disable-next-line <rule-name>\`.`,
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
    // Exclude type definitions as per jest skill exception
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
    testCommand = `CLAUDE_AGENT_COVERAGE_CHECK=true ${JEST_BASE_COMMAND} --findRelatedTests ${filesArg} ${JEST_FLAGS} --collectCoverage ${coverageFromFlags}`;
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
        decision: 'block',
        reason: `Insufficient Code Coverage.\n\nYour changes to source files must have 100% test coverage (statements, branches, functions, lines). The current tests do not meet this threshold for the modified files.\n\n${output}\n\nPlease write additional tests to cover the untested lines and branches in the files you modified.`,
      } as const;
    }

    return {
      decision: 'block',
      reason: `Tests failed.\n${output}\n\nSee the \`jest\` agent in Claude Code if you haven't already for an overview of our Jest testing infrastructure and best practices.\n\nPlease analyze the failures, fix the broken tests or code, and ensure all tests pass.`,
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
          | { readonly conversationId: string }
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
          | { readonly conversationId: string }
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
  const { session_id } = input;

  const checkDispatchMap = extractChecks({
    conversationId: session_id,
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
 * Returns a block result if validation fails, null otherwise.
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
    decision: 'block',
    reason: `Rule structure validation failed for "${ruleName}":\n\n${issues.join(
      '\n\n',
    )}\n\nPlease ensure all required files exist and src/index.ts properly exports the rule.`,
  } as const;
}

async function performAgentCheckInternal(input: Input) {
  const { session_id, stop_hook_active } = input;
  try {
    modifyHeartbeat(session_id);
  } catch {
    /* Ignore */
  }

  // stop_hook_active === true means a stop hook is already running; skip checks to avoid loops
  if (stop_hook_active === true) {
    modifyConversationEnd(session_id);
    return {} as const;
  }

  // Priority 0: Merge Conflict Check - merge conflicts block all other validation
  const { performMergeConflictCheck } = await import(
    './merge-conflict-check.js'
  );
  const mergeConflictResult = performMergeConflictCheck(input);
  if (mergeConflictResult) return mergeConflictResult;

  // Priority 1: PR Review Check
  const { performPrReviewCheck } = await import('./pr-review-check.js');
  const prReviewResult = await performPrReviewCheck(input);
  if (prReviewResult) return prReviewResult;

  const qualityCheckResult = await performQualityChecks(input);
  if (qualityCheckResult) return qualityCheckResult;

  const changedFiles = fetchAllConversationFiles({
    conversationId: session_id,
  });

  // Use a loop counter sourced from the change-log to bound the validation loop
  const loopCount = (input.loop_count as number | undefined) ?? 0;
  if (changedFiles.length === 0 || loopCount >= MAX_LOOPS) {
    modifyConversationEnd(session_id);
    return {} as const;
  }

  const isRuleRequest = isRuleRequestConversation(session_id);
  if (isRuleRequest) {
    const ruleStructureResult = performRuleStructureValidation(changedFiles);
    if (ruleStructureResult) return ruleStructureResult;
  }

  const hasBeenPromptedBefore = hasCheckWorkBeenPrompted(session_id);
  markCheckWorkPrompted(session_id);
  if (isRuleRequest && hasBeenPromptedBefore) {
    const hasExpandTestsPrompted = hasExpandTestsBeenPrompted(session_id);
    if (!hasExpandTestsPrompted) {
      markExpandTestsPrompted(session_id);
      return { decision: 'block', reason: EXPAND_TESTS_PROMPT } as const;
    }
  }

  const reason = hasBeenPromptedBefore
    ? `Please double check your work again. Reminder: If you need to create temporary files for notetaking or testing during this review, please place them in the \`.claude/tmp/\` directory so they are ignored by this check.`
    : `Please check your work. It's highly likely you missed something originally requested of you and your solution is incomplete. Now is your chance to construct a new to-do list to run for several more hours, meticulously filling in all remaining gaps in your solution. If your task was to create a plan, diagnosis, or report, make sure that your markdown file is complete, self-consistent, and correct. If your task was to implement a feature, make sure you've implemented the feature completely and correctly, and that you've properly tested your implementation. If your task was to fix a bug, make sure you've fixed the bug without introducing regressions elsewhere, created a test to make sure your fix works, and tested your fix. Please do not stop for a long time, and before you do, make sure you've completely satisfied the task-completion-standards skill.\n\nNote: If you need to create temporary files for notetaking or testing during this review, please place them in the \`.claude/tmp/\` directory so they are ignored by our Claude Code Hooks.`;

  return { decision: 'block', reason } as const;
}

function isDuplicateMessage({
  conversationId,
  reason,
}: {
  readonly conversationId: string;
  readonly reason: string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const lastMessage = fetchLastUserMessage(conversationId);
  if (lastMessage && lastMessage === reason) {
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
  if (
    'decision' in result &&
    result.decision === 'block' &&
    'reason' in result
  ) {
    if (
      isDuplicateMessage({
        conversationId: input.session_id,
        reason: (result as { decision: 'block'; reason: string }).reason,
      })
    ) {
      return {} as const;
    }
    setLastUserMessage({
      conversationId: input.session_id,
      message: (result as { decision: 'block'; reason: string }).reason,
    });
  }
  return result;
}

export async function executeMain() {
  const input = readInput();
  if (!input || !input.session_id) {
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

import { execSync } from 'node:child_process';
import { isInMergeConflictState } from '../cli/git-merge/isInMergeConflictState';
import { buildMergeContext } from '../cli/git-merge/buildMergeContext';
import { buildMergePrompt } from '../../.github/scripts/build-merge-prompt';
import type { Input } from './types';

const SUCCESS_PATTERN = /✅ All merge conflicts resolved/;

type ExecError = Error & { stdout?: string | Buffer; stderr?: string | Buffer };

function executeCommand(command: string) {
  try {
    const output = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
    return { isSuccess: true, output } as const;
  } catch (error: unknown) {
    const execError = error as ExecError;
    const stdout = execError.stdout ? String(execError.stdout) : '';
    const stderr = execError.stderr ? String(execError.stderr) : '';
    return { isSuccess: false, output: `${stdout}\n${stderr}` } as const;
  }
}

/**
 * Stop hook check for merge conflicts.
 *
 * Priority 0 check that runs before PR review checks and code quality checks.
 * Agents cannot stop while merge conflicts remain unresolved.
 */
export function performMergeConflictCheck(input: Input) {
  void input;

  try {
    if (!isInMergeConflictState()) {
      return null;
    }

    console.error(
      'Detected merge conflict state, checking for remaining conflicts...',
    );

    const result = executeCommand('./scripts/check-merge-conflicts.sh');

    if (!result.isSuccess) {
      console.error('Failed to check for remaining conflicts');
      return null;
    }

    if (SUCCESS_PATTERN.test(result.output)) {
      console.error('All merge conflicts resolved');
      return null;
    }

    console.error('Unresolved merge conflicts found, preventing stop');

    const context = buildMergeContext();
    const prompt = buildMergePrompt(context);

    const followupMessage = `You still have unresolved merge conflicts! Please continue resolving them.

${result.output}

---

${prompt}`;

    return {
      followup_message: followupMessage,
    } as const;
  } catch (error) {
    console.error('Error in merge conflict check:', error);
    return null;
  }
}

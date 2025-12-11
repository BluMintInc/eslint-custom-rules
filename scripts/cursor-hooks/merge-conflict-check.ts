import { isInMergeConflictState } from '../cli/git-merge/isInMergeConflictState';
import { buildMergeContext } from '../cli/git-merge/buildMergeContext';
import { buildMergePrompt } from '../../.github/scripts/build-merge-prompt';
import type { Input } from './types';
import { executeCommand } from './agent-check';

const SUCCESS_PATTERN = /✅ All merge conflicts resolved/;

/**
 * Stop hook check for merge conflicts.
 *
 * Priority 0 check that runs before PR review checks and code quality checks.
 * Agents cannot stop while merge conflicts remain unresolved.
 */
/**
 * @param _input - Required by hook interface but unused for merge conflict detection.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function performMergeConflictCheck(_input: Input) {
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

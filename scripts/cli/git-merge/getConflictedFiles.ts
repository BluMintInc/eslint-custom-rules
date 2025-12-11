import { runCommand } from '../git-utils';

/**
 * Returns list of files with unresolved merge conflicts.
 * Uses `git diff --name-only --diff-filter=U` to find unmerged paths.
 */
export function retrieveConflictedFiles(): string[] {
  try {
    const output = runCommand('git diff --name-only --diff-filter=U', true);
    if (!output) {
      return [];
    }
    return output.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

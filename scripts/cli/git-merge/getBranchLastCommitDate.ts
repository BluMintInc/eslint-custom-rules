import { runCommand } from '../git-utils';

/**
 * Returns the ISO 8601 timestamp of the most recent commit
 * on a branch that touched the specified file.
 * Used for the freshness heuristic in conflict resolution.
 */
export function retrieveBranchLastCommitDate(params: {
  readonly ref: string;
  readonly file: string;
}) {
  const { ref, file } = params;
  try {
    const output = runCommand(
      `git log -1 --format='%aI' ${ref} -- "${file}"`,
      true,
    );
    return output || null;
  } catch {
    return null;
  }
}

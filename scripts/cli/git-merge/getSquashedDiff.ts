import { runCommand } from '../git-utils';

/**
 * Returns the squashed diff for a specific file between two refs.
 * Shows the net change as if all commits were squashed into one.
 */
export function retrieveSquashedDiff(params: {
  readonly file: string;
  readonly fromRef: string;
  readonly toRef: string;
}) {
  const { file, fromRef, toRef } = params;
  try {
    return runCommand(`git diff ${fromRef}..${toRef} -- "${file}"`, true);
  } catch {
    return null;
  }
}

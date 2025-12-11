const SAFE_BRANCH_PATTERN = /^[A-Za-z0-9._/-]+$/;

/**
 * Normalizes git branch names and strips ancestry markers while ensuring safety for shell usage.
 * Returns null when the branch is empty or contains characters outside the allowlist.
 */
export function normalizeBranchName(rawName: string): string | null {
  const normalized = rawName
    .replace(/^remotes\/origin\//, '')
    .replace(/~\d+$/, '')
    .replace(/\^.*$/, '')
    .trim();

  if (!normalized) {
    return null;
  }

  if (!SAFE_BRANCH_PATTERN.test(normalized)) {
    console.error(
      `Branch name "${normalized}" contains unsupported characters; expected only letters, numbers, dot, underscore, slash, or dash.`,
    );
    return null;
  }

  return normalized;
}

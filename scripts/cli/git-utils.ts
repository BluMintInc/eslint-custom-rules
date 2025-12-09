import { execSync } from 'node:child_process';

/**
 * Execute a shell command synchronously and return stdout.
 * Throws on failure with detailed error information.
 */
export function runCommand(command: string, suppressOutput = false): string {
  try {
    const result = execSync(command, {
      encoding: 'utf8',
      stdio: suppressOutput ? 'pipe' : ['pipe', 'pipe', 'inherit'],
    });
    return result.trim();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-restricted-syntax
    throw new Error(`Command failed: ${command}\n${message}`);
  }
}

/**
 * Check if a required CLI tool is available in PATH.
 */
export function ensureDependency(tool: string) {
  try {
    runCommand(`command -v ${tool}`, true);
  } catch {
    console.error(`Error: ${tool} is not installed or not in PATH.`);
    console.error(`Please install ${tool} and try again.`);
    process.exit(1);
  }
}

/**
 * Check for uncommitted changes in git working directory.
 */
export function ensureGitClean() {
  try {
    runCommand('git diff --quiet', true);
    runCommand('git diff --cached --quiet', true);
  } catch {
    console.error('Error: You have uncommitted changes.');
    console.error(
      'Please commit or stash your changes before running the script.',
    );
    process.exit(1);
  }
}

/**
 * Get current git branch name.
 */
export function retrieveCurrentBranch(): string {
  try {
    return runCommand('git rev-parse --abbrev-ref HEAD', true);
  } catch {
    console.error('Error: Could not determine current branch.');
    process.exit(1);
  }
}

/**
 * Given a branch name, find the associated open PR number.
 */
export function inferPrFromBranch(branch: string): number | undefined {
  try {
    const result = runCommand(
      `gh pr list --head "${branch}" --state open --json number --jq '.[0].number'`,
      true,
    );
    if (!result || result === 'null') {
      return undefined;
    }
    return Number.parseInt(result, 10);
  } catch {
    return undefined;
  }
}

/**
 * Given a PR number, get the head branch name.
 */
export function inferBranchFromPr(prId: number): string {
  try {
    const result = runCommand(
      `gh pr view ${prId} --json headRefName --jq '.headRefName'`,
      true,
    );
    return result;
  } catch {
    console.error(`Error: Could not fetch branch name for PR #${prId}`);
    process.exit(1);
  }
}

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
    throw new Error(`Command failed: ${command}\n${message}`, {
      cause: error instanceof Error ? error : undefined,
    });
  }
}

const BRANCH_NAME_PATTERN =
  /^(?!\/)(?!.*\/\/)(?!.*\/$)(?!-)(?!refs\/)[A-Za-z0-9._/-]+$/;

function assertValidBranchName(branch: string) {
  if (!branch || !BRANCH_NAME_PATTERN.test(branch)) {
    throw new Error(`Invalid branch name: "${branch}"`);
  }
}

function exitWithError(...lines: string[]): never {
  for (const line of lines) {
    console.error(line);
  }
  process.exit(1);
}

/**
 * Check if a required CLI tool is available in PATH.
 */
export function ensureDependency(tool: string) {
  try {
    runCommand(`command -v "${tool}"`, true);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    exitWithError(
      `Error: ${tool} is not installed or not in PATH.`,
      'Please install the dependency and try again.',
      message,
    );
  }
}

/**
 * Check for uncommitted changes in git working directory.
 */
export function ensureGitClean() {
  try {
    const status = runCommand('git status --porcelain', true);
    if (status.trim().length > 0) {
      exitWithError(
        'Error: You have uncommitted or untracked changes.',
        status.trim(),
        'Please commit or stash your changes before running the script.',
      );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    exitWithError('Error: Failed to check git status.', message);
  }
}

/**
 * Get current git branch name.
 */
export function retrieveCurrentBranch(): string {
  try {
    return runCommand('git rev-parse --abbrev-ref HEAD', true);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    exitWithError('Error: Could not determine current branch.', message);
  }
}

/**
 * Given a branch name, find the associated open PR number.
 */
export function inferPrFromBranch(branch: string): number | undefined {
  try {
    assertValidBranchName(branch);
    runCommand(`git check-ref-format --branch "${branch}"`, true);

    const result = runCommand(
      `gh pr list --head "${branch}" --state open --json number --jq '.[0].number'`,
      true,
    );
    if (!result || result === 'null') {
      return undefined;
    }
    return Number.parseInt(result, 10);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to infer PR from branch "${branch}": ${message}`);
    return undefined;
  }
}

/**
 * Given a PR number, get the head branch name.
 */
export function inferBranchFromPr(prId: number): string {
  if (!Number.isInteger(prId) || !Number.isFinite(prId) || prId <= 0) {
    exitWithError(`Invalid PR id: ${prId}. Must be a positive integer.`);
  }
  try {
    const result = runCommand(
      `gh pr view ${prId} --json headRefName --jq '.headRefName'`,
      true,
    );
    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    exitWithError(
      `Error: Could not fetch branch name for PR #${prId}`,
      message,
    );
  }
}

#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
import {
  runCommand,
  ensureDependency,
  ensureGitClean,
  retrieveCurrentBranch,
  inferPrFromBranch,
  inferBranchFromPr,
} from '../../scripts/cli/git-utils';

function sanitizeCodeRabbitSummary(summary: string) {
  return summary.trim();
}

interface AddressReviewOptions {
  pr?: number;
  reviewBatch?: number;
  forceBot?: boolean;
  forceHuman?: boolean;
}

interface ReviewContext {
  pr: {
    number: number;
    title: string;
    head_branch: string;
    base_branch: string;
    description: string;
    url: string;
  };
  review: {
    id: number;
    author: string;
    author_type: string;
    is_bot: boolean;
    comment_count: number;
  } | null;
  coderabbit_summary: string;
}

/**
 * Determine if a review was submitted by a bot.
 */
function determineIfBot(reviewId: number, prNumber: number): boolean {
  try {
    const repo = process.env.GITHUB_REPOSITORY || runCommand('gh repo view --json nameWithOwner --jq .nameWithOwner', true);
    const [owner, name] = repo.split('/');

    const query = `
      query {
        repository(owner: "${owner}", name: "${name}") {
          pullRequest(number: ${prNumber}) {
            reviews(first: 100) {
              nodes {
                databaseId
                author {
                  login
                  __typename
                }
              }
            }
          }
        }
      }
    `;

    // Escape single quotes in GraphQL query for shell command safety
    const result = runCommand(
      `gh api graphql -f query='${query.replace(/'/g, "'\\''")}' --jq '.data.repository.pullRequest.reviews.nodes[] | select(.databaseId == ${reviewId})'`,
      true
    );

    if (!result) {
      return false;
    }

    const review = JSON.parse(result);
    const authorType = review.author?.__typename;
    const authorLogin = review.author?.login || '';

    if (authorType === 'Bot') {
      return true;
    }

    // GitHub account type isn't always 'Bot' for bot accounts, so also check username patterns
    // for our known AI review bots: CodeRabbit, Graphite, Cursor BugBot
    const botPattern = /(coderabbit|graphite|cursor|bugbot)/i;
    return botPattern.test(authorLogin);
  } catch (error) {
    console.warn(`Warning: Could not determine review author type, defaulting to human review.`);
    return false;
  }
}

/**
 * Fetch the number of inline comments in a review.
 */
function fetchReviewCommentCount(prNumber: number, reviewId: number): number {
  try {
    const repo = process.env.GITHUB_REPOSITORY || runCommand('gh repo view --json nameWithOwner --jq .nameWithOwner', true);
    const result = runCommand(
      `gh api "/repos/${repo}/pulls/${prNumber}/reviews/${reviewId}/comments" --jq 'length'`,
      true
    );
    return parseInt(result, 10);
  } catch {
    console.warn('Warning: Could not fetch review comment count.');
    return 0;
  }
}

/**
 * Fetch the first CodeRabbit comment on the PR (truncated).
 */
function fetchCodeRabbitSummary(prNumber: number): string {
  try {
    const result = runCommand(
      `gh pr view ${prNumber} --json comments --jq '.comments[] | select(.author.login == "coderabbitai") | .body' | head -n 100`,
      true
    );
    const sanitized = sanitizeCodeRabbitSummary(result ?? '');
    return sanitized || '(No CodeRabbit summary found)';
  } catch {
    return '(No CodeRabbit summary found)';
  }
}

/**
 * Build review context similar to Python script.
 */
export function buildReviewContext(prNumber: number, reviewBatch: number | undefined, forceBot: boolean, forceHuman: boolean): ReviewContext {
  try {
    const prJson = runCommand(
      `gh pr view ${prNumber} --json number,title,body,headRefName,baseRefName,url`,
      true
    );
    const pr = JSON.parse(prJson);

    const repo = process.env.GITHUB_REPOSITORY || runCommand('gh repo view --json nameWithOwner --jq .nameWithOwner', true);

    let review: ReviewContext['review'] = null;
    if (reviewBatch !== undefined) {
      let isBot = false;
      if (forceBot) {
        isBot = true;
      } else if (forceHuman) {
        isBot = false;
      } else {
        isBot = determineIfBot(reviewBatch, prNumber);
      }

      const commentCount = fetchReviewCommentCount(prNumber, reviewBatch);

      review = {
        id: reviewBatch,
        author: '(Review author)',
        author_type: isBot ? 'Bot' : 'User',
        is_bot: isBot,
        comment_count: commentCount,
      };
    } else if (forceBot || forceHuman) {
      // Create synthetic review object when force flags are used without a specific review batch
      // This ensures the prompt builder receives a non-null review object
      const isBot = forceBot ? true : false;
      review = {
        id: 0,
        author: '(Review author)',
        author_type: isBot ? 'Bot' : 'User',
        is_bot: isBot,
        comment_count: 0, // Will be updated after fetching comments
      };
    }

    if (!review) {
      // Fallback: provide a placeholder review to keep downstream tooling stable
      review = {
        id: 0,
        author: '(Review author)',
        author_type: 'User',
        is_bot: false,
        comment_count: 0,
      };
    }

    const coderabbitSummary = fetchCodeRabbitSummary(prNumber);

    return {
      pr: {
        number: pr.number,
        title: pr.title,
        head_branch: pr.headRefName,
        base_branch: pr.baseRefName,
        description: pr.body || '',
        url: pr.url || `https://github.com/${repo}/pull/${prNumber}`,
      },
      review,
      coderabbit_summary: coderabbitSummary,
    };
  } catch (error) {
    console.error(`Error: Could not fetch PR details for PR #${prNumber}`);
    console.error((error as Error).message);
    process.exit(1);
  }
}

/**
 * Fetch unresolved comments using the appropriate bash script.
 */
function fetchUnresolvedComments(prNumber: number, reviewBatch: number | undefined, isBot: boolean): string {
  try {
    const scriptPath = isBot
      ? './scripts/pr-check-bot-comments.sh'
      : './scripts/pr-check-comments.sh';

    let command = `${scriptPath} --pr=${prNumber}`;
    if (reviewBatch !== undefined) {
      command += ` --review-batch=${reviewBatch}`;
    }

    // Use appropriate limit based on review type
    const limit = isBot ? 5 : 7;
    if (isBot) {
      // pr-check-bot-comments.sh defaults to 5, no need to pass limit
    } else {
      command += ` --limit=${limit}`;
    }

    return runCommand(command, true);
  } catch (error) {
    console.error('Error: Could not fetch unresolved comments.');
    console.error((error as Error).message);
    process.exit(1);
  }
}

/**
 * Sanitize branch name by replacing invalid characters.
 * Matches the sanitization logic in cursor-pr-review-agent.yml to ensure consistency
 * between cloud agent branches and local agent branches.
 */
export function sanitizeBranchName(branchName: string): string {
  return branchName
    .replace(/[^A-Za-z0-9._\/-]+/g, '-')
    .replace(/\/+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

/**
 * Create and checkout a new git branch.
 */
function createTargetBranch(sourceBranch: string, prNumber: number, reviewId: number | undefined): string {
  const reviewSuffix = reviewId !== undefined ? `-review-pr-${prNumber}-${reviewId}` : `-review-pr-${prNumber}`;
  const targetBranchRaw = `${sourceBranch}${reviewSuffix}`;
  const targetBranch = sanitizeBranchName(targetBranchRaw);

  // Check if branch already exists and switch to it, otherwise create it
  try {
    runCommand(`git rev-parse --verify ${targetBranch}`, true);
    // Branch exists, switch to it
    try {
      runCommand(`git checkout ${targetBranch}`, true);
      console.log(`(Branch already exists, switched to it)`);
      return targetBranch;
    } catch (error) {
      console.error(`Error: Could not switch to existing branch '${targetBranch}'`);
      console.error((error as Error).message);
      process.exit(1);
    }
  } catch {
    // Branch doesn't exist, create it
    try {
      runCommand(`git checkout -b ${targetBranch}`, true);
      return targetBranch;
    } catch (error) {
      console.error(`Error: Could not create and checkout branch '${targetBranch}'`);
      console.error((error as Error).message);
      process.exit(1);
    }
  }
}

/**
 * Output instructions to the developer.
 */
function outputInstructions(targetBranch: string, promptPath: string): void {
  console.log('\n' + '='.repeat(70));
  console.log('✅ Setup Complete!');
  console.log('='.repeat(70));
  console.log(`\n📍 You are now on branch: ${targetBranch}`);
  console.log(`\n📄 The agent prompt has been written to:\n   ${promptPath}`);
  console.log('\n📋 Next Steps:');
  console.log('   1. Open the prompt file above');
  console.log('   2. Copy its entire contents');
  console.log('   3. Open a new Cursor Composer conversation');
  console.log('   4. Paste the prompt and start the agent');
  console.log('\n🔄 The agent will loop using Cursor Hooks until all review comments');
  console.log('   are addressed. It cannot stop until all comments are resolved.');
  console.log('\n' + '='.repeat(70) + '\n');
}

/**
 * Parse CLI arguments.
 * @param args - Array of command-line arguments (defaults to process.argv.slice(2))
 * @returns Parsed options
 * @throws Error if invalid arguments or conflicting flags
 */
export function parseArgs(args: string[] = process.argv.slice(2)): AddressReviewOptions {
  const options: AddressReviewOptions = {};

  for (const arg of args) {
    if (arg.startsWith('--pr=')) {
      options.pr = parseInt(arg.substring(5), 10);
    } else if (arg.startsWith('--review-batch=')) {
      options.reviewBatch = parseInt(arg.substring(15), 10);
    } else if (arg === '--force-bot') {
      options.forceBot = true;
    } else if (arg === '--force-human') {
      options.forceHuman = true;
    } else {
      throw new Error(`Unknown argument '${arg}'`);
    }
  }

  if (options.forceBot && options.forceHuman) {
    throw new Error('Cannot specify both --force-bot and --force-human');
  }

  return options;
}

/**
 * Main function.
 */
async function main(): Promise<void> {
  console.log('🚀 Setting up local PR review addressing workflow...\n');

  // Check dependencies
  console.log('Checking dependencies...');
  ensureDependency('gh');
  ensureDependency('jq');
  ensureDependency('git');
  console.log('✓ All dependencies found\n');

  // Check git state
  console.log('Checking git working directory...');
  ensureGitClean();
  console.log('✓ Working directory is clean\n');

  // Parse arguments
  let options: AddressReviewOptions;
  try {
    options = parseArgs();
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    console.error('Usage: npm run address-review -- [--pr=<number>] [--review-batch=<number>] [--force-bot] [--force-human]');
    process.exit(1);
  }

  // Determine PR number
  let prNumber = options.pr;
  let sourceBranch: string;

  if (!prNumber) {
    sourceBranch = retrieveCurrentBranch();
    console.log(`Inferring PR number from current branch: ${sourceBranch}`);
    prNumber = inferPrFromBranch(sourceBranch);
    if (!prNumber) {
      console.error(`Error: No open PR found for branch '${sourceBranch}'.`);
      console.error('Use --pr=<number> to specify PR explicitly.');
      process.exit(1);
    }
    console.log(`✓ Found PR #${prNumber}\n`);
  } else {
    sourceBranch = inferBranchFromPr(prNumber);
    console.log(`Using PR #${prNumber} (branch: ${sourceBranch})\n`);
  }

  // Build review context
  console.log('Building review context...');
  const context = buildReviewContext(
    prNumber,
    options.reviewBatch,
    options.forceBot ?? false,
    options.forceHuman ?? false
  );
  console.log('✓ Review context built\n');

  // Determine if bot review (value already resolved in context)
  const isBot = context.review?.is_bot ?? false;
  console.log(`Review type: ${isBot ? 'AI Bot' : 'Human'}`);

  // Fetch unresolved comments
  console.log('Fetching unresolved comments...');
  const comments = fetchUnresolvedComments(prNumber, options.reviewBatch, isBot);

  // Check if there are any unresolved comments
  const commentCount = (comments.match(/^[0-9]+\. \[ \] /gm) || []).length;
  if (commentCount === 0) {
    console.log('✅ All review comments are already resolved on PR #' + prNumber);
    console.log('No action needed.');
    process.exit(0);
  }
  console.log(`✓ Found ${commentCount} unresolved comment(s)\n`);

  // Build final context without mutating the original
  const finalContext: ReviewContext =
    context.review &&
    context.review.comment_count === 0 &&
    (options.forceBot || options.forceHuman) &&
    options.reviewBatch === undefined
      ? {
          ...context,
          review: { ...context.review, comment_count: commentCount },
        }
      : context;

  // Write context and comments to temp files
  const repoRoot = runCommand('git rev-parse --show-toplevel', true);
  const tmpDir = path.join(repoRoot, '.cursor', 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });

  const contextPath = path.join(tmpDir, 'pr-review-context.json');
  const commentsPath = path.join(tmpDir, 'pr-review-comments.md');

  fs.writeFileSync(contextPath, JSON.stringify(finalContext, null, 2));
  fs.writeFileSync(commentsPath, comments);

  // Build prompt using existing prompt builder
  console.log('Building agent prompt...');
  const promptBuilderPath = path.join(repoRoot, '.github', 'scripts', 'build-pr-review-prompt.ts');
  const prompt = runCommand(`npx tsx "${promptBuilderPath}" "${contextPath}" "${commentsPath}"`, true);

  const promptPath = path.join(tmpDir, 'pr-review-prompt.md');
  fs.writeFileSync(promptPath, prompt);
  console.log('✓ Prompt written to .cursor/tmp/pr-review-prompt.md\n');

  // Create and checkout target branch
  console.log('Creating review branch...');
  const targetBranch = createTargetBranch(sourceBranch, prNumber, options.reviewBatch);
  console.log(`✓ Created and checked out branch: ${targetBranch}\n`);

  // Output instructions
  outputInstructions(targetBranch, promptPath);
}

// Check if this file is being run directly (not imported)
const isDirectExecution = () => {
  const scriptPath = process.argv[1];
  if (!scriptPath) return false;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metaUrl = (typeof import.meta !== 'undefined'
      ? (import.meta as any)?.url
      : null) as string | null;
    if (metaUrl) {
      return scriptPath === fileURLToPath(metaUrl);
    }
  } catch {
    /* ignore and fall back */
  }

  return scriptPath.endsWith('address-review.ts');
};

// Run main function only if executed directly
if (isDirectExecution()) {
  main().catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}


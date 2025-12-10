#!/usr/bin/env tsx
/* eslint-disable no-console */
import {
  ensureDependency,
  inferBranchFromPr,
  retrieveCurrentBranch,
  runCommand,
} from '../../scripts/cli/git-utils';

export type MergeReviewProps = {
  readonly message?: string;
};
export type ReviewBranchDetail = {
  readonly reviewBranch: string;
  readonly baseBranchCandidate: string;
  readonly prNumber: number;
  readonly reviewBatch?: number;
  readonly reviewerType?: 'human' | 'bot';
};

/* eslint-disable security/detect-unsafe-regex */
const REVIEW_BRANCH_REGEX =
  /^(?<base>[\w.-]+)-review-pr-(?<pr>\d+)(?:-(?<reviewBatch>\d+))?(?:-(?<reviewerType>human|bot))?$/;
/* eslint-enable security/detect-unsafe-regex */
const consumeMessageValue = (queue: string[], arg: string) => {
  const next = queue.shift();
  if (!next || next.startsWith('-')) {
    throw new Error(
      `invalid-argument: Missing commit message value for merge-review: ${arg}`,
    );
  }
  return next;
};

export const parseArgs = (args: readonly string[] = process.argv.slice(2)) => {
  let message: string | undefined;
  const queue = [...args];

  while (queue.length > 0) {
    const arg = queue.shift() as string;

    if (arg === '--message' || arg === '-m') {
      message = consumeMessageValue(queue, arg);
      continue;
    }

    if (arg.startsWith('--message=')) {
      message = arg.slice('--message='.length);
      continue;
    }

    if (arg.startsWith('-m=')) {
      message = arg.slice(3);
      continue;
    }

    throw new Error(`invalid-argument: Unknown merge-review argument: ${arg}`);
  }

  return { message } satisfies MergeReviewProps;
};
export const parseReviewBranchName = (branch: string) => {
  const match = REVIEW_BRANCH_REGEX.exec(branch);
  if (!match?.groups) {
    throw new Error(
      `invalid-argument: Branch does not match review branch pattern: ${branch}`,
    );
  }

  const groups = match.groups as {
    base: string;
    pr: string;
    reviewBatch?: string;
    reviewerType?: 'human' | 'bot';
  };

  return {
    reviewBranch: branch,
    baseBranchCandidate: groups.base,
    prNumber: Number.parseInt(groups.pr, 10),
    reviewBatch: groups.reviewBatch
      ? Number.parseInt(groups.reviewBatch, 10)
      : undefined,
    reviewerType: groups.reviewerType,
  } as const satisfies ReviewBranchDetail;
};

export const doesBranchExist = (branch: string) => {
  try {
    runCommand(`git show-ref --verify --quiet refs/heads/${branch}`, true);
    return true;
  } catch {
    return false;
  }
};

export const resolveBaseBranch = (details: ReviewBranchDetail) => {
  if (doesBranchExist(details.baseBranchCandidate)) {
    return details.baseBranchCandidate;
  }

  const inferred = inferBranchFromPr(details.prNumber);
  if (doesBranchExist(inferred)) {
    return inferred;
  }

  return inferred;
};

const hasStagedChanges = () => {
  try {
    runCommand('git diff --cached --quiet', true);
    return false;
  } catch {
    return true;
  }
};

// eslint-disable-next-line arrow-body-style
const stageAllChanges = () => runCommand('git add -A', true);

const commitStagedChanges = (message: string) => {
  const escapedMessage = message.replaceAll('"', '\\"');
  runCommand(`git commit -m "${escapedMessage}"`);
};
export const buildDefaultCommitMessage = (details: ReviewBranchDetail) => {
  const prSuffix = ` for PR #${details.prNumber}`;
  const reviewSuffix = details.reviewBatch
    ? ` (review ${details.reviewBatch})`
    : undefined;

  return reviewSuffix === undefined
    ? `chore: merge review branch${prSuffix}`
    : `chore: merge review branch${prSuffix}${reviewSuffix}`;
};

export const mergeReview = (options?: MergeReviewProps) => {
  ensureDependency('git');
  ensureDependency('gh');

  const currentBranch = retrieveCurrentBranch();
  const details = parseReviewBranchName(currentBranch);
  const baseBranch = resolveBaseBranch(details);
  console.log(`Review branch: ${details.reviewBranch}`);
  console.log(`Base branch:   ${baseBranch}`);

  stageAllChanges();
  const hasChangesStaged = hasStagedChanges();

  if (hasChangesStaged) {
    const trimmedMessage = options?.message?.trim();
    const commitMessage =
      trimmedMessage && trimmedMessage.length > 0
        ? trimmedMessage
        : buildDefaultCommitMessage(details);
    console.log(`Committing staged changes with message: "${commitMessage}"`);
    commitStagedChanges(commitMessage);
  } else {
    console.log('No changes to commit; continuing to merge.');
  }

  console.log(`Checking out ${baseBranch}...`);
  runCommand(`git checkout ${baseBranch}`);

  console.log(`Merging ${details.reviewBranch} into ${baseBranch}...`);
  runCommand(`git merge ${details.reviewBranch}`);

  console.log('✅ Merge complete.');
};

const isDirectExecution = () => {
  return process.env.JEST_WORKER_ID === undefined;
};

export const runMergeReviewCli = (
  deps: Readonly<{
    parseArgsImpl?: typeof parseArgs;
    mergeReviewImpl?: typeof mergeReview;
  }> = {},
) => {
  const { parseArgsImpl = parseArgs, mergeReviewImpl = mergeReview } = deps;
  try {
    const options = parseArgsImpl();
    mergeReviewImpl(options);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
};
export const runMergeReviewCliIfDirect = (
  runCli: () => void = runMergeReviewCli,
) => {
  if (isDirectExecution()) {
    runCli();
  }
};

/* istanbul ignore next */
runMergeReviewCliIfDirect();

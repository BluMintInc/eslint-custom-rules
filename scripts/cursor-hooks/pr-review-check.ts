/* eslint-disable max-lines */
import { executeCommand } from './agent-check';
import type { Input } from './types';

const BOT_NAME_PATTERN = /(coderabbit|graphite|cursor|bugbot)/i;
const SUCCESS_PATTERN = /✅ All .* are resolved/;
const NO_PR_PATTERN = /No open pull request found/i;
const SAFE_BRANCH_PATTERN = /^(?!\/)(?!.*\/\/)(?!.*\/$)[A-Za-z0-9._/-]+$/;
const BOT_REVIEW_BATCH_SIZE = 5;
const HUMAN_REVIEW_BATCH_SIZE = 7;

export function extractPrReviewContext(branchName: string) {
  // Pattern: .*-review-pr-(\d+)-(\d+)(?:[/-]|$)
  const reviewMatch = /(?:^|[/-])review-pr-(\d+)-(\d+)(?:[/-]|$)/.exec(
    branchName,
  );

  if (!reviewMatch) {
    return null;
  }

  return {
    prNumber: Number(reviewMatch[1]),
    reviewId: Number(reviewMatch[2]),
  } as const;
}

function fetchAllReviews(prNumber: number) {
  const query = `
    query {
      repository(owner: "${
        process.env.GITHUB_REPOSITORY?.split('/')[0] || 'BluMintInc'
      }", name: "${
    process.env.GITHUB_REPOSITORY?.split('/')[1] || 'eslint-custom-rules'
  }") {
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

  const result = executeCommand(`gh api graphql -f query='${query}'`);
  if (!result.isSuccess) {
    return null;
  }

  try {
    return JSON.parse(result.output);
  } catch (error) {
    console.error('Failed to parse review list response:', error);
    return null;
  }
}

export function determineBotReview(params: {
  readonly prNumber: number;
  readonly reviewId: number;
}) {
  const { prNumber, reviewId } = params;

  try {
    const data = fetchAllReviews(prNumber);
    if (!data) {
      console.error(
        'Could not fetch review author info, assuming human review',
      );
      return false;
    }

    const reviews = data?.data?.repository?.pullRequest?.reviews?.nodes || [];

    const review = reviews.find(
      (reviewNode: {
        readonly databaseId: number;
        readonly author: {
          readonly __typename: string;
          readonly login: string;
        };
      }) => {
        return reviewNode.databaseId === reviewId;
      },
    );

    if (!review) {
      console.error('Review not found, assuming human review');
      return false;
    }

    const authorType = review.author?.__typename;
    const authorLogin = review.author?.login ?? null;

    // Check if author type is Bot OR username matches bot pattern
    if (authorType === 'Bot') {
      return true;
    }

    if (authorLogin) {
      return BOT_NAME_PATTERN.test(authorLogin);
    }

    return false;
  } catch (error) {
    console.error('Error determining bot review, assuming human:', error);
    return false;
  }
}

type CommentCheckResult = {
  readonly hasComments: boolean;
  readonly commentsList: string;
};

function runUnresolvedCommentCheck(command: string): CommentCheckResult {
  const result = executeCommand(command);

  if (!result.isSuccess) {
    console.error('Failed to fetch unresolved comments, assuming none remain');
    return {
      hasComments: false,
      commentsList: 'Failed to fetch comments',
    };
  }

  const hasComments =
    !SUCCESS_PATTERN.test(result.output) && !NO_PR_PATTERN.test(result.output);

  return {
    hasComments,
    commentsList: result.output,
  };
}

export function validateBotUnresolvedComments(params: {
  readonly prNumber: number;
  readonly reviewId?: number;
}): CommentCheckResult {
  const { prNumber, reviewId } = params;
  const reviewArg = reviewId !== undefined ? ` --review-batch=${reviewId}` : '';
  return runUnresolvedCommentCheck(
    `npm run fetch-unresolved-bot-comments -- --pr=${prNumber}${reviewArg}`,
  );
}

export function validateHumanUnresolvedComments(params: {
  readonly prNumber: number;
  readonly reviewId?: number;
}): CommentCheckResult {
  const { prNumber, reviewId } = params;
  const reviewArg = reviewId !== undefined ? ` --review-batch=${reviewId}` : '';
  return runUnresolvedCommentCheck(
    `npm run fetch-unresolved-comments -- --pr=${prNumber}${reviewArg}`,
  );
}

export function validateUnresolvedComments(params: {
  readonly prNumber: number;
  readonly reviewId?: number;
  readonly isBot: boolean;
}): CommentCheckResult {
  const { prNumber, reviewId, isBot } = params;
  return isBot
    ? validateBotUnresolvedComments({ prNumber, reviewId })
    : validateHumanUnresolvedComments({ prNumber, reviewId });
}

function findOpenPrNumberForBranch(branchName: string) {
  if (!SAFE_BRANCH_PATTERN.test(branchName)) {
    console.error(
      `Branch name contains unsupported characters: ${branchName}. Skipping PR lookup.`,
    );
    return null;
  }

  // Branch name is validated and quoted before shell execution; executeCommand currently accepts only string commands.
  const prLookup = executeCommand(
    `gh pr list --head "${branchName}" --state open --json number --jq '.[0].number'`,
  );

  if (!prLookup.isSuccess) {
    console.error('Could not determine PR number for branch', branchName);
    return null;
  }

  const prNumberRaw = prLookup.output.trim();
  if (!prNumberRaw || prNumberRaw === 'null') {
    return null;
  }

  const parsed = Number(prNumberRaw);
  return Number.isNaN(parsed) ? null : parsed;
}

type ReviewDetection =
  | {
      readonly hasComments: true;
      readonly reviewType: 'bot' | 'human';
      readonly commentsList: string;
      readonly prNumber: number;
    }
  | {
      readonly hasComments: true;
      readonly reviewType: 'mixed';
      readonly botCommentsList: string;
      readonly humanCommentsList: string;
      readonly prNumber: number;
    }
  | null;

function validateWithoutReviewBatch(branchName: string): ReviewDetection {
  const prNumber = findOpenPrNumberForBranch(branchName);
  if (!prNumber) {
    return null;
  }

  const botResult = validateBotUnresolvedComments({
    prNumber,
  });

  const humanResult = validateHumanUnresolvedComments({
    prNumber,
  });

  const hasBot = botResult.hasComments;
  const hasHuman = humanResult.hasComments;

  if (hasBot && hasHuman) {
    return {
      hasComments: true,
      reviewType: 'mixed',
      botCommentsList: botResult.commentsList,
      humanCommentsList: humanResult.commentsList,
      prNumber,
    };
  }

  if (hasBot) {
    return {
      hasComments: true,
      reviewType: 'bot',
      commentsList: botResult.commentsList,
      prNumber,
    };
  }

  if (hasHuman) {
    return {
      hasComments: true,
      reviewType: 'human',
      commentsList: humanResult.commentsList,
      prNumber,
    };
  }

  return null;
}

function constructFollowupMessage(isBot: boolean, commentsList: string) {
  const batchSize = isBot ? BOT_REVIEW_BATCH_SIZE : HUMAN_REVIEW_BATCH_SIZE;

  const resolutionInstructions = isBot
    ? `Please make a todolist of at least ${batchSize} items, one for each of these comments, whereby for each comment you:
- Step 1: Do codebase research, web research, deep thinking to validate whether the comment is a legitimate concern. If not, skip to Step 5 to mark it as invalid. About 50% of comments are valid.
- Step 2: Think deeply about the comment's suggested recommendation, tweaking it and selecting the best presented options. Expect to make tweaks to the recommendation most of the time.
- Step 3: Implement Changes: Navigate to the specified file(s) and line(s) to apply the necessary edits for valid items.
- Step 4: Update documentation if applicable (follow the \`system-documentation\` rule).
- Step 5: Resolve and Annotate Excluded/Processed Items: Generate \`decisions.json\` from the annotated chat checklist and run \`npm run apply-comment-decisions -- .cursor/tmp/decisions.json\` to react with 👍/👎 and resolve threads. The \`decisions.json\` file must be an array of objects with fields:
  - \`url\` (required): the comment URL (e.g., \`...#discussion_r123456789\`)
  - \`valid\` (required, boolean): true for valid, false for invalid`
    : `Please make a todolist of at least ${batchSize} items, one for each of these comments, whereby for each comment you:
- Step 1: Perform Codebase Analysis: Given the comment, perform deep research on the codebase to understand the context and arm yourself to make the best code decisions.
- Step 2: Implement Changes: Navigate to the specified file(s) and line(s), apply the necessary code changes to address the reviewer's concerns. Where the reviewer provided insights, add succinct in-code comments to capture the rationale.
- Step 3: Update Documentation: If applicable, update related \`.mdc\` documentation guides to incorporate captured insights and reflect current behavior.
- Step 4: Resolve Addressed Comments: Run \`npm run resolve-comments -- <comment_url>\` to mark the corresponding review threads as resolved.`;

  const messagePrefix = isBot
    ? 'You have more unresolved AI bot review comments'
    : 'You have more unresolved review comments';

  return `${messagePrefix}! Please continue addressing them.


# Unresolved Comments Checklist

${commentsList}

# Reminder Instructions

${resolutionInstructions}`;
}

function constructMixedFollowupMessage(params: {
  readonly botCommentsList: string;
  readonly humanCommentsList: string;
}) {
  const botSection = constructFollowupMessage(true, params.botCommentsList);
  const humanSection = constructFollowupMessage(
    false,
    params.humanCommentsList,
  );

  return `You have both unresolved AI bot review comments and human review comments. Address both sets before stopping.

${botSection}

---

${humanSection}`;
}

/**
 * _input reserved for future context-aware checks (e.g., branching on task type).
 */
export function performPrReviewCheck(_input: Input) {
  void _input;
  try {
    // Extract branch name from git
    const branchResult = executeCommand('git rev-parse --abbrev-ref HEAD');
    if (!branchResult.isSuccess) {
      return null; // Not in a git repo or other error
    }

    const branchName = branchResult.output.trim();
    if (!SAFE_BRANCH_PATTERN.test(branchName)) {
      console.error(
        `Branch name contains unsupported characters: ${branchName}. Skipping PR review check.`,
      );
      return null;
    }

    const context = extractPrReviewContext(branchName);

    if (!context) {
      const fallbackResult = validateWithoutReviewBatch(branchName);
      if (!fallbackResult) {
        return null; // Not a PR review branch
      }

      console.error(
        `Detected unresolved ${fallbackResult.reviewType} review comments on PR #${fallbackResult.prNumber} for branch ${branchName}`,
      );

      const followupMessage =
        fallbackResult.reviewType === 'mixed'
          ? constructMixedFollowupMessage({
              botCommentsList: fallbackResult.botCommentsList,
              humanCommentsList: fallbackResult.humanCommentsList,
            })
          : constructFollowupMessage(
              fallbackResult.reviewType === 'bot',
              fallbackResult.commentsList,
            );

      return {
        followup_message: followupMessage,
      } as const;
    }

    console.error(
      `Detected PR review branch: PR #${context.prNumber}, Review ${context.reviewId}`,
    );

    // Determine if this is a bot review
    const isBot = determineBotReview(context);
    console.error(`Review type: ${isBot ? 'bot' : 'human'}`);

    // Check for unresolved comments
    const { hasComments, commentsList } = isBot
      ? validateBotUnresolvedComments(context)
      : validateHumanUnresolvedComments(context);

    if (!hasComments) {
      console.error('No unresolved comments remaining');
      return null; // No intervention needed
    }

    console.error('Unresolved comments found, preventing stop');

    const followupMessage = constructFollowupMessage(isBot, commentsList);

    return {
      followup_message: followupMessage,
    } as const;
  } catch (error) {
    console.error('Error in PR review check:', error);
    return null; // Don't block agent on check errors
  }
}

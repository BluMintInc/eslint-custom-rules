/* eslint-disable max-lines */
import { execSync } from 'node:child_process';
import type { Input } from './types';

const BOT_NAME_PATTERN = /(coderabbit|graphite|cursor|bugbot)/i;
const SUCCESS_PATTERN = /✅ All .* are resolved/;
const NO_PR_PATTERN = /No open pull request found/i;

function executeCommand(command: string) {
  try {
    const output = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
    return { isSuccess: true, output } as const;
  } catch (error: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stdout = (error as any).stdout ? String((error as any).stdout) : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stderr = (error as any).stderr ? String((error as any).stderr) : null;
    return {
      isSuccess: false,
      output: `${stdout ?? ''}\n${stderr ?? ''}`,
    } as const;
  }
}

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
    process.env.GITHUB_REPOSITORY?.split('/')[1] || 'custom-eslint-rules'
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

  return JSON.parse(result.output);
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

export function validateUnresolvedComments(params: {
  readonly prNumber: number;
  readonly reviewId?: number;
  readonly isBot: boolean;
}) {
  const { prNumber, reviewId, isBot } = params;

  const reviewArg = reviewId !== undefined ? ` --review-batch=${reviewId}` : '';

  const command = isBot
    ? `npm run fetch-unresolved-bot-comments -- --pr=${prNumber}${reviewArg}`
    : `npm run fetch-unresolved-comments -- --pr=${prNumber}${reviewArg}`;

  const result = executeCommand(command);

  if (!result.isSuccess) {
    console.error('Failed to fetch unresolved comments, assuming none remain');
    return {
      hasComments: false,
      commentsList: 'Failed to fetch comments',
    } as const;
  }

  // Parse output to detect if comments remain
  // The script outputs "✅ All ... are resolved" when no comments remain
  const hasComments =
    !SUCCESS_PATTERN.test(result.output) && !NO_PR_PATTERN.test(result.output);

  return {
    hasComments,
    commentsList: result.output,
  } as const;
}

function findOpenPrNumberForBranch(branchName: string) {
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

  const botResult = validateUnresolvedComments({
    prNumber,
    isBot: true,
  });

  const humanResult = validateUnresolvedComments({
    prNumber,
    isBot: false,
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
  const batchSize = isBot ? 5 : 7;

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function performPrReviewCheck(_input: Input) {
  try {
    // Extract branch name from git
    const branchResult = executeCommand('git rev-parse --abbrev-ref HEAD');
    if (!branchResult.isSuccess) {
      return null; // Not in a git repo or other error
    }

    const branchName = branchResult.output.trim();
    const context = extractPrReviewContext(branchName);

    if (!context) {
      const fallbackResult = validateWithoutReviewBatch(branchName);
      if (!fallbackResult) {
        return null; // Not a PR review branch
      }

      const { prNumber, reviewType } = fallbackResult;

      console.error(
        `Detected unresolved ${reviewType} review comments on PR #${prNumber} for branch ${branchName}`,
      );

      const followupMessage =
        reviewType === 'mixed'
          ? constructMixedFollowupMessage({
              botCommentsList: fallbackResult.botCommentsList,
              humanCommentsList: fallbackResult.humanCommentsList,
            })
          : constructFollowupMessage(
              reviewType === 'bot',
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
    const { hasComments, commentsList } = validateUnresolvedComments({
      ...context,
      isBot,
    });

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

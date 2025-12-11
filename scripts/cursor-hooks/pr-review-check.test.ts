import { execSync } from 'node:child_process';
import {
  extractPrReviewContext,
  determineBotReview,
  validateUnresolvedComments,
  performPrReviewCheck,
} from './pr-review-check';

jest.mock('node:child_process');

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('extractPrReviewContext', () => {
  it('extracts PR number and review ID from valid branch name', () => {
    const result = extractPrReviewContext('feature/auth-review-pr-123-456789');
    expect(result).toEqual({ prNumber: 123, reviewId: 456789 });
  });

  it('extracts from branch with leading pattern', () => {
    const result = extractPrReviewContext('review-pr-42-789');
    expect(result).toEqual({ prNumber: 42, reviewId: 789 });
  });

  it('extracts from branch with middle pattern', () => {
    const result = extractPrReviewContext('main-review-pr-100-200-additional');
    expect(result).toEqual({ prNumber: 100, reviewId: 200 });
  });

  it('returns null for branch without pattern', () => {
    const result = extractPrReviewContext('feature/simple-branch');
    expect(result).toBeNull();
  });

  it('returns null for empty string', () => {
    const result = extractPrReviewContext('');
    expect(result).toBeNull();
  });

  it('handles sanitized branch names with dashes', () => {
    const result = extractPrReviewContext('some-feature-review-pr-999-111111');
    expect(result).toEqual({ prNumber: 999, reviewId: 111111 });
  });
});

describe('determineBotReview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true when author type is Bot', () => {
    const mockGraphQLResponse = {
      data: {
        repository: {
          pullRequest: {
            reviews: {
              nodes: [
                {
                  databaseId: 123,
                  author: {
                    login: 'someuser',
                    __typename: 'Bot',
                  },
                },
              ],
            },
          },
        },
      },
    };

    mockExecSync.mockReturnValueOnce(JSON.stringify(mockGraphQLResponse));

    const result = determineBotReview({
      prNumber: 456,
      reviewId: 123,
    });
    expect(result).toBe(true);
  });

  it('returns true when author login matches coderabbit pattern', () => {
    const mockGraphQLResponse = {
      data: {
        repository: {
          pullRequest: {
            reviews: {
              nodes: [
                {
                  databaseId: 123,
                  author: {
                    login: 'coderabbitai',
                    __typename: 'User',
                  },
                },
              ],
            },
          },
        },
      },
    };

    mockExecSync.mockReturnValueOnce(JSON.stringify(mockGraphQLResponse));

    const result = determineBotReview({
      prNumber: 456,
      reviewId: 123,
    });
    expect(result).toBe(true);
  });

  it('returns true when author login matches graphite pattern', () => {
    const mockGraphQLResponse = {
      data: {
        repository: {
          pullRequest: {
            reviews: {
              nodes: [
                {
                  databaseId: 123,
                  author: {
                    login: 'graphite-app',
                    __typename: 'User',
                  },
                },
              ],
            },
          },
        },
      },
    };

    mockExecSync.mockReturnValueOnce(JSON.stringify(mockGraphQLResponse));

    const result = determineBotReview({
      prNumber: 456,
      reviewId: 123,
    });
    expect(result).toBe(true);
  });

  it('returns true when author login matches cursor pattern (case-insensitive)', () => {
    const mockGraphQLResponse = {
      data: {
        repository: {
          pullRequest: {
            reviews: {
              nodes: [
                {
                  databaseId: 123,
                  author: {
                    login: 'CursorBot',
                    __typename: 'User',
                  },
                },
              ],
            },
          },
        },
      },
    };

    mockExecSync.mockReturnValueOnce(JSON.stringify(mockGraphQLResponse));

    const result = determineBotReview({
      prNumber: 456,
      reviewId: 123,
    });
    expect(result).toBe(true);
  });

  it('returns false for human reviewer', () => {
    const mockGraphQLResponse = {
      data: {
        repository: {
          pullRequest: {
            reviews: {
              nodes: [
                {
                  databaseId: 123,
                  author: {
                    login: 'john-doe',
                    __typename: 'User',
                  },
                },
              ],
            },
          },
        },
      },
    };

    mockExecSync.mockReturnValueOnce(JSON.stringify(mockGraphQLResponse));

    const result = determineBotReview({
      prNumber: 456,
      reviewId: 123,
    });
    expect(result).toBe(false);
  });

  it('returns false when review not found', () => {
    const mockGraphQLResponse = {
      data: {
        repository: {
          pullRequest: {
            reviews: {
              nodes: [
                {
                  databaseId: 999, // Different review ID
                  author: {
                    login: 'someuser',
                    __typename: 'Bot',
                  },
                },
              ],
            },
          },
        },
      },
    };

    mockExecSync.mockReturnValueOnce(JSON.stringify(mockGraphQLResponse));

    const result = determineBotReview({
      prNumber: 456,
      reviewId: 123,
    });
    expect(result).toBe(false);
  });

  it('returns false when GraphQL query fails', () => {
    mockExecSync.mockImplementationOnce(() => {
      throw new Error('gh command failed');
    });

    const result = determineBotReview({
      prNumber: 456,
      reviewId: 123,
    });
    expect(result).toBe(false);
  });
});

describe('validateUnresolvedComments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('detects unresolved human comments', () => {
    const mockOutput = `## Unresolved human review comments (2)

1. [ ] john-doe — src/components/Button.tsx:42
   - **URL**: https://github.com/BluMintInc/agora/pull/123#discussion_r456789
   - **Comment**: Consider using useMemo here`;

    mockExecSync.mockReturnValueOnce(mockOutput);

    const result = validateUnresolvedComments({
      prNumber: 123,
      reviewId: 456,
      isBot: false,
    });

    expect(result.hasComments).toBe(true);
    expect(result.commentsList).toContain('Unresolved human review comments');
    expect(mockExecSync).toHaveBeenCalledWith(
      'npm run fetch-unresolved-comments -- --pr=123 --review-batch=456',
      expect.any(Object),
    );
  });

  it('detects unresolved bot comments', () => {
    const mockOutput = `## Unresolved AI bot review comments (3)

1. [ ] coderabbitai — src/hooks/useData.ts:15`;

    mockExecSync.mockReturnValueOnce(mockOutput);

    const result = validateUnresolvedComments({
      prNumber: 123,
      reviewId: 456,
      isBot: true,
    });

    expect(result.hasComments).toBe(true);
    expect(result.commentsList).toContain('Unresolved AI bot review comments');
    expect(mockExecSync).toHaveBeenCalledWith(
      'npm run fetch-unresolved-bot-comments -- --pr=123 --review-batch=456',
      expect.any(Object),
    );
  });

  it('detects when all comments are resolved (human)', () => {
    const mockOutput = '✅ All human review comments are resolved.';

    mockExecSync.mockReturnValueOnce(mockOutput);

    const result = validateUnresolvedComments({
      prNumber: 123,
      reviewId: 456,
      isBot: false,
    });

    expect(result.hasComments).toBe(false);
    expect(result.commentsList).toContain('All');
    expect(result.commentsList).toContain('resolved');
  });

  it('detects when all comments are resolved (bot)', () => {
    const mockOutput = '✅ All AI bot review comments are resolved.';

    mockExecSync.mockReturnValueOnce(mockOutput);

    const result = validateUnresolvedComments({
      prNumber: 123,
      reviewId: 456,
      isBot: true,
    });

    expect(result.hasComments).toBe(false);
    expect(result.commentsList).toContain('All');
    expect(result.commentsList).toContain('resolved');
  });

  it('handles script failure gracefully', () => {
    mockExecSync.mockImplementationOnce(() => {
      throw new Error('Script failed');
    });

    const result = validateUnresolvedComments({
      prNumber: 123,
      reviewId: 456,
      isBot: false,
    });

    expect(result.hasComments).toBe(false);
    expect(result.commentsList).toContain('Failed to fetch comments');
  });
});

describe('performPrReviewCheck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when not on a PR review branch', () => {
    mockExecSync.mockReturnValueOnce('feature/simple-branch\n');

    const result = performPrReviewCheck({
      conversation_id: 'conv-123',
      generation_id: 'gen-456',
      loop_count: 0,
    });

    expect(result).toBeNull();
  });

  it('returns null when no unresolved comments remain (human review)', () => {
    mockExecSync
      .mockReturnValueOnce('feature/auth-review-pr-123-456789\n') // git branch
      .mockReturnValueOnce(
        JSON.stringify({
          data: {
            repository: {
              pullRequest: {
                reviews: {
                  nodes: [
                    {
                      databaseId: 456789,
                      author: { login: 'john-doe', __typename: 'User' },
                    },
                  ],
                },
              },
            },
          },
        }),
      ) // GitHub API - human review
      .mockReturnValueOnce('✅ All human review comments are resolved.'); // fetch-unresolved-comments

    const result = performPrReviewCheck({
      conversation_id: 'conv-123',
      generation_id: 'gen-456',
      loop_count: 0,
    });

    expect(result).toBeNull();
  });

  it('returns followup message when unresolved human comments exist', () => {
    const mockCommentsList = `## Unresolved human review comments (2)

1. [ ] john-doe — src/components/Button.tsx:42
   - **URL**: https://github.com/BluMintInc/agora/pull/123#discussion_r456789`;

    mockExecSync
      .mockReturnValueOnce('feature/auth-review-pr-123-456789\n') // git branch
      .mockReturnValueOnce(
        JSON.stringify({
          data: {
            repository: {
              pullRequest: {
                reviews: {
                  nodes: [
                    {
                      databaseId: 456789,
                      author: { login: 'john-doe', __typename: 'User' },
                    },
                  ],
                },
              },
            },
          },
        }),
      ) // GitHub API - human review
      .mockReturnValueOnce(mockCommentsList); // fetch-unresolved-comments

    const result = performPrReviewCheck({
      conversation_id: 'conv-123',
      generation_id: 'gen-456',
      loop_count: 0,
    });

    expect(result).not.toBeNull();
    expect(result?.followup_message).toContain(
      'You have more unresolved review comments',
    );
    expect(result?.followup_message).toContain(mockCommentsList);
    expect(result?.followup_message).toContain('npm run resolve-comments');
  });

  it('returns followup message when unresolved bot comments exist', () => {
    const mockCommentsList = `## Unresolved AI bot review comments (1)

1. [ ] coderabbitai — src/hooks/useData.ts:15`;

    mockExecSync
      .mockReturnValueOnce('develop-review-pr-100-200\n') // git branch
      .mockReturnValueOnce(
        JSON.stringify({
          data: {
            repository: {
              pullRequest: {
                reviews: {
                  nodes: [
                    {
                      databaseId: 200,
                      author: { login: 'coderabbitai', __typename: 'Bot' },
                    },
                  ],
                },
              },
            },
          },
        }),
      ) // GitHub API - bot review
      .mockReturnValueOnce(mockCommentsList); // fetch-unresolved-bot-comments

    const result = performPrReviewCheck({
      conversation_id: 'conv-123',
      generation_id: 'gen-456',
      loop_count: 0,
    });

    expect(result).not.toBeNull();
    expect(result?.followup_message).toContain(
      'You have more unresolved AI bot review comments',
    );
    expect(result?.followup_message).toContain(mockCommentsList);
    expect(result?.followup_message).toContain(
      'npm run apply-comment-decisions',
    );
    expect(result?.followup_message).toContain('decisions.json');
  });

  it('handles errors gracefully', () => {
    mockExecSync.mockImplementationOnce(() => {
      throw new Error('Git command failed');
    });

    const result = performPrReviewCheck({
      conversation_id: 'conv-123',
      generation_id: 'gen-456',
      loop_count: 0,
    });

    expect(result).toBeNull();
  });
});

#!/bin/bash

set -euo pipefail

# Usage: bash scripts/pr-resolve-comments.sh [--pr=<PR_NUMBER>] [--branch=<BRANCH>] <comment_url_1> [comment_url_2] ...
# Resolves the review threads containing the provided comment URLs. If --pr is provided,
# resolves threads on that PR explicitly; otherwise, resolves on the open PR for the chosen branch (current branch by default).

# Prefer non-interactive token from env for Background Agents
# If GH_TOKEN/GITHUB_TOKEN are unset but GITHUB_BLUBOT_PAT is provided, use it.
if [ -z "${GH_TOKEN:-}" ] && [ -z "${GITHUB_TOKEN:-}" ] && [ -n "${GITHUB_BLUBOT_PAT:-}" ]; then
  export GH_TOKEN="$GITHUB_BLUBOT_PAT"
fi

if ! command -v gh &> /dev/null; then
  echo "gh (GitHub CLI) could not be found. Please install it." >&2
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo "jq could not be found. Please install it." >&2
  exit 1
fi

# Ensure GitHub authentication is available (gh auth or GH_TOKEN)
if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Please run 'gh auth login' or set GH_TOKEN (or GITHUB_BLUBOT_PAT) with sufficient repo scope to write PRs." >&2
  exit 1
fi

PR_OVERRIDE=""
BRANCH_OVERRIDE=""
COMMENTS=()
for arg in "$@"; do
  case "$arg" in
    --pr=*) PR_OVERRIDE="${arg#*=}" ;;
    --branch=*) BRANCH_OVERRIDE="${arg#*=}" ;;
    *) COMMENTS+=("$arg") ;;
  esac
done

if [ "${#COMMENTS[@]}" -eq 0 ]; then
  echo "Usage: $0 [--pr=<PR_NUMBER>] <comment_url_1> [comment_url_2] ..." >&2
  exit 1
fi

if [ -n "$PR_OVERRIDE" ]; then
  PR_NUMBER="$PR_OVERRIDE"
else
  if [ -n "$BRANCH_OVERRIDE" ]; then
    BRANCH="$BRANCH_OVERRIDE"
    echo "Checking for open PR on branch override: $BRANCH"
  else
    BRANCH=$(git rev-parse --abbrev-ref HEAD)
    echo "Checking for open PR on current branch: $BRANCH"
  fi

  PR_NUMBER=$(gh pr list --head "$BRANCH" --state open --json number --jq '.[0].number' 2>/dev/null)

  if [ -z "$PR_NUMBER" ] || [ "$PR_NUMBER" == "null" ]; then
    if [ -z "$BRANCH_OVERRIDE" ]; then
      BASE_BRANCH=$(echo "$BRANCH" | sed -E 's/^(.*)-review-pr-[0-9]+(-[0-9]+)?(-human|-bot)?$/\1/')
      if [ "$BASE_BRANCH" != "$BRANCH" ]; then
        echo "No open pull request found for branch '$BRANCH'. Trying inferred base branch '$BASE_BRANCH'..."
        PR_NUMBER=$(gh pr list --head "$BASE_BRANCH" --state open --json number --jq '.[0].number' 2>/dev/null)
        if [ -n "$PR_NUMBER" ] && [ "$PR_NUMBER" != "null" ]; then
          BRANCH="$BASE_BRANCH"
        fi
      fi
    fi
  fi

  if [ -z "$PR_NUMBER" ] || [ "$PR_NUMBER" == "null" ]; then
    echo "No open pull request found for branch '$BRANCH'." >&2
    exit 1
  fi
fi

OWNER=$(gh repo view --json owner --jq '.owner.login')
REPO_NAME=$(gh repo view --json name --jq '.name')

QUERY='
query($owner: String!, $name: String!, $number: Int!, $threadsAfter: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $threadsAfter) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          comments(first: 100) {
            nodes {
              databaseId
              url
            }
          }
        }
      }
    }
  }
}'

# Aggregate all reviewThreads across pages
ALL_THREADS='[]'
THREADS_AFTER=""
while true; do
  if [ -n "$THREADS_AFTER" ]; then
    PAGE_JSON=$(gh api graphql -f owner="$OWNER" -f name="$REPO_NAME" -F number="$PR_NUMBER" -f query="$QUERY" -f threadsAfter="$THREADS_AFTER")
  else
    PAGE_JSON=$(gh api graphql -f owner="$OWNER" -f name="$REPO_NAME" -F number="$PR_NUMBER" -f query="$QUERY")
  fi
  NODES=$(echo "$PAGE_JSON" | jq -c '.data.repository.pullRequest.reviewThreads.nodes')
  ALL_THREADS=$(jq -c -n --argjson a "$ALL_THREADS" --argjson b "$NODES" '$a + $b')
  HAS_NEXT=$(echo "$PAGE_JSON" | jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.hasNextPage')
  if [ "$HAS_NEXT" != "true" ]; then
    break
  fi
  THREADS_AFTER=$(echo "$PAGE_JSON" | jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.endCursor')
done

THREADS_JSON=$(jq -n --argjson nodes "$ALL_THREADS" '{ data: { repository: { pullRequest: { reviewThreads: { nodes: $nodes } } } } }')

RESOLVE_THREAD_MUTATION='mutation($threadId: ID!) { resolveReviewThread(input: { threadId: $threadId }) { thread { isResolved } } }'

APPLIED=0
FAILED=0

for COMMENT_URL in "${COMMENTS[@]}"; do
  # Extract numeric database id from URL if present; else try direct URL match
  COMMENT_DB_ID=$(echo "$COMMENT_URL" | sed -E -n 's/.*discussion_r([0-9]+).*/\1/p')

  if [ -n "$COMMENT_DB_ID" ]; then
    THREAD_ID=$(echo "$THREADS_JSON" | jq -r --arg id "$COMMENT_DB_ID" '
      .data.repository.pullRequest.reviewThreads.nodes[]? |
      select(.comments.nodes[]? | (.databaseId|tostring) == $id) |
      .id' | head -n1)
  else
    THREAD_ID=$(echo "$THREADS_JSON" | jq -r --arg url "$COMMENT_URL" '
      .data.repository.pullRequest.reviewThreads.nodes[]? |
      select(.comments.nodes[]? | (.url // "") == $url) |
      .id' | head -n1)
  fi

  if [ -z "$THREAD_ID" ]; then
    echo "Unable to map comment URL: $COMMENT_URL to a GraphQL thread id." >&2
    FAILED=$((FAILED+1))
    continue
  fi

  gh api graphql -f query="$RESOLVE_THREAD_MUTATION" -f threadId="$THREAD_ID" >/dev/null
  echo "Resolved thread for $COMMENT_URL"
  APPLIED=$((APPLIED+1))
done

echo "Done. Resolved: $APPLIED, Failed: $FAILED"

#!/bin/bash

set -euo pipefail

# Usage: npm run apply-comment-decisions -- path/to/decisions.json [--pr=<PR_NUMBER>]
# decisions.json format (array of objects):
# [
#   { "url": "https://github.com/org/repo/pull/123#discussion_r123456789", "valid": true },
#   { "url": "https://github.com/org/repo/pull/123#discussion_r987654321", "valid": false }
# ]
# Note: Invalid items receive a thumbs down and are marked resolved; no reply is posted.

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

# Ensure GitHub authentication is available (either gh login or GH_TOKEN)
if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Please run 'gh auth login' or set GH_TOKEN with 'repo' write scope." >&2
  exit 1
fi

DECISIONS_FILE=${1:-}
if [ -z "${DECISIONS_FILE}" ]; then
  echo "Usage: $0 path/to/decisions.json [--pr=<PR_NUMBER>]" >&2
  exit 1
fi

if [ ! -f "$DECISIONS_FILE" ]; then
  echo "Decisions file not found: $DECISIONS_FILE" >&2
  exit 1
fi

# Optional PR override parsing
PR_OVERRIDE=""
for arg in "$@"; do
  case "$arg" in
    --pr=*) PR_OVERRIDE="${arg#*=}" ;;
  esac
done

# Current branch and PR discovery
if [ -n "$PR_OVERRIDE" ]; then
  PR_NUMBER="$PR_OVERRIDE"
else
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  if [ -z "$BRANCH" ]; then
    echo "Error: Could not determine current branch." >&2
    exit 1
  fi

  PR_NUMBER=$(gh pr list --head "$BRANCH" --state open --json number --jq '.[0].number' 2>/dev/null)
  if [ -z "$PR_NUMBER" ] || [ "$PR_NUMBER" == "null" ]; then
    echo "No open pull request found for branch '$BRANCH'. Consider passing --pr=<PR_NUMBER>." >&2
    exit 1
  fi
fi

OWNER=$(gh repo view --json owner --jq '.owner.login')
REPO_NAME=$(gh repo view --json name --jq '.name')
if [ -z "$OWNER" ] || [ -z "$REPO_NAME" ]; then
  echo "Error: Could not determine repository owner and name from git remote." >&2
  exit 1
fi

echo "Applying decisions from: $DECISIONS_FILE"

# Preflight: Verify token has permissions to mutate PR (add/remove reaction on PR itself)
PR_ID_QUERY='
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) { id }
  }
}'

PR_NODE_ID=$(gh api graphql -f owner="$OWNER" -f name="$REPO_NAME" -F number="$PR_NUMBER" -f query="$PR_ID_QUERY" 2>/dev/null | jq -r '.data.repository.pullRequest.id // empty')

if [ -z "$PR_NODE_ID" ] || [ "$PR_NODE_ID" = "null" ]; then
  echo "Error: Unable to query PR node id. Ensure the PR exists and you have access." >&2
  exit 1
fi

ADD_REACTION_TEST='mutation($subjectId: ID!) { addReaction(input: {subjectId: $subjectId, content: EYES}) { subject { id } } }'
REMOVE_REACTION_TEST='mutation($subjectId: ID!) { removeReaction(input: {subjectId: $subjectId, content: EYES}) { subject { id } } }'

if ! gh api graphql -f query="$ADD_REACTION_TEST" -f subjectId="$PR_NODE_ID" >/dev/null 2>&1; then
  echo "Permission error: Unable to mutate PR via GraphQL (addReaction failed)." >&2
  echo "This usually means your GitHub token lacks write permissions to Pull Requests." >&2
  echo "Fix: Run 'gh auth login' with a user that has repo write access, or export GH_TOKEN for a PAT with 'repo' scope (fine-grained: Pull requests=Read and write)." >&2
  echo "You can then re-run: npm run apply-comment-decisions -- $DECISIONS_FILE --pr=$PR_NUMBER" >&2
  exit 2
else
  # Clean up the reaction we just added
  gh api graphql -f query="$REMOVE_REACTION_TEST" -f subjectId="$PR_NODE_ID" >/dev/null 2>&1 || true
fi

# Fetch ALL review threads with pagination to ensure we can map any comment IDs
QUERY='
query($owner: String!, $name: String!, $number: Int!, $threadsAfter: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $threadsAfter) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          comments(first: 100) {
            nodes {
              id
              databaseId
              url
            }
          }
        }
      }
    }
  }
}'

# Aggregate all thread nodes across pages
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
TMP_DIR="$REPO_ROOT/.cursor/tmp/pr_review_apply"
mkdir -p "$TMP_DIR"
ALL_THREADS_FILE="$TMP_DIR/review_threads_all.json"
PAGE_FILE="$TMP_DIR/review_threads_page.json"
TMP_FILE="$TMP_DIR/review_threads_tmp.json"

cleanup() {
  rm -f "$ALL_THREADS_FILE" "$PAGE_FILE" "$TMP_FILE" 2>/dev/null || true
}
trap cleanup EXIT

echo '[]' > "$ALL_THREADS_FILE"

THREADS_AFTER=""
while true; do
  if [ -n "$THREADS_AFTER" ]; then
    PAGE_JSON=$(gh api graphql -f owner="$OWNER" -f name="$REPO_NAME" -F number="$PR_NUMBER" -f query="$QUERY" -f threadsAfter="$THREADS_AFTER" 2>/dev/null)
  else
    PAGE_JSON=$(gh api graphql -f owner="$OWNER" -f name="$REPO_NAME" -F number="$PR_NUMBER" -f query="$QUERY" 2>/dev/null)
  fi
  echo "$PAGE_JSON" | jq -c '.data.repository.pullRequest.reviewThreads.nodes' > "$PAGE_FILE"
  jq -s '.[0] + .[1]' "$ALL_THREADS_FILE" "$PAGE_FILE" > "$TMP_FILE" && mv "$TMP_FILE" "$ALL_THREADS_FILE"

  HAS_NEXT=$(echo "$PAGE_JSON" | jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.hasNextPage')
  if [ "$HAS_NEXT" != "true" ]; then
    break
  fi
  THREADS_AFTER=$(echo "$PAGE_JSON" | jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.endCursor')
done

# Mutations
ADD_REACTION_MUTATION='
mutation($subjectId: ID!, $content: ReactionContent!) {
  addReaction(input: {subjectId: $subjectId, content: $content}) {
    subject { id }
  }
}'

RESOLVE_THREAD_MUTATION='
mutation($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { isResolved }
  }
}'

# Iterate over decisions
APPLIED=0
FAILED=0

while IFS= read -r item; do
  URL=$(echo "$item" | jq -r '.url // empty')
  VALID_BOOL=$(echo "$item" | jq -r 'if has("valid") then (if .valid then "true" else "false" end) else "" end')
  REASON=$(echo "$item" | jq -r '.reason // empty')

  if [ -z "$URL" ] || [ -z "$VALID_BOOL" ]; then
    echo "Skipping malformed entry (requires url and valid): $item" >&2
    FAILED=$((FAILED+1))
    continue
  fi

  COMMENT_DB_ID=$(echo "$URL" | sed -E -n 's/.*discussion_r([0-9]+).*/\1/p')
  if [ -z "$COMMENT_DB_ID" ]; then
    echo "Could not extract numeric comment id from URL: $URL" >&2
    FAILED=$((FAILED+1))
    continue
  fi

  # Lookup node and thread ids from aggregated threads file
  COMMENT_NODE_ID=$(jq -r --arg id "$COMMENT_DB_ID" '
    .[]?
    | .comments.nodes[]? 
    | select((.databaseId|tostring) == $id) 
    | .id' "$ALL_THREADS_FILE" | head -n1)

  THREAD_ID=$(jq -r --arg id "$COMMENT_DB_ID" '
    .[]?
    | select(.comments.nodes[]? | (.databaseId|tostring) == $id)
    | .id' "$ALL_THREADS_FILE" | head -n1)

  if [ -z "$COMMENT_NODE_ID" ] || [ -z "$THREAD_ID" ]; then
    echo "Unable to map comment $COMMENT_DB_ID to GraphQL node/thread. Ensure the comment belongs to this PR." >&2
    FAILED=$((FAILED+1))
    continue
  fi

  # React thumbs up/down
  if [ "$VALID_BOOL" = "true" ]; then
    REACTION="THUMBS_UP"
  else
    REACTION="THUMBS_DOWN"
  fi

  if ! gh api graphql -f query="$ADD_REACTION_MUTATION" -f subjectId="$COMMENT_NODE_ID" -f content="$REACTION" >/dev/null 2>&1; then
    echo "Failed to add reaction on comment $COMMENT_DB_ID. Ensure token has write access to PRs (see preflight guidance)." >&2
    FAILED=$((FAILED+1))
    continue
  fi

  # Always resolve the review thread, regardless of validity
  if ! gh api graphql -f query="$RESOLVE_THREAD_MUTATION" -f threadId="$THREAD_ID" >/dev/null 2>&1; then
    echo "Failed to resolve thread for comment $COMMENT_DB_ID. Ensure token has write access to PRs (see preflight guidance)." >&2
    FAILED=$((FAILED+1))
    continue
  fi

  echo "Applied decision to comment #$COMMENT_DB_ID: reaction=$REACTION, resolved=true"
  APPLIED=$((APPLIED+1))
done < <(jq -c '.[]' "$DECISIONS_FILE")

echo "Done. Applied: $APPLIED, Failed: $FAILED"

# Fail the script if any applications failed so CI can detect partial failures
if [ "$FAILED" -gt 0 ]; then
  exit 1
fi


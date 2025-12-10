#!/bin/bash

set -euo pipefail

# Parse flags
BOTS_ONLY=false
INCLUDE_BOTS=false
LIMIT=""
PR_OVERRIDE=""
BOTS_REGEX="(coderabbit|graphite|cursor|bugbot)"
REVIEW_BATCH=""
for arg in "$@"; do
  case "$arg" in
    --bots-only) BOTS_ONLY=true ;;
    --include-bots) INCLUDE_BOTS=true ;;
    --limit=*) LIMIT="${arg#*=}" ;;
    --pr=*) PR_OVERRIDE="${arg#*=}" ;;
    --bots-regex=*) BOTS_REGEX="${arg#*=}" ;;
    --review-batch=*) REVIEW_BATCH="${arg#*=}" ;;
  esac
done

# Human-readable label for logs
LABEL="human review comments"
if [ "$BOTS_ONLY" = true ]; then
  LABEL="AI bot review comments"
elif [ "$INCLUDE_BOTS" = true ]; then
  LABEL="review comments"
fi

if [ -n "$REVIEW_BATCH" ]; then
  LABEL="$LABEL (review batch $REVIEW_BATCH)"
fi

# Prefer non-interactive token from env for Background Agents
# If GH_TOKEN/GITHUB_TOKEN are unset but GITHUB_BLUBOT_PAT is provided, use it.
if [ -z "${GH_TOKEN:-}" ] && [ -z "${GITHUB_TOKEN:-}" ] && [ -n "${GITHUB_BLUBOT_PAT:-}" ]; then
  export GH_TOKEN="$GITHUB_BLUBOT_PAT"
fi

# Check if gh and jq are installed
if ! command -v gh &> /dev/null; then
  echo "gh (GitHub CLI) could not be found. Please install it." >&2
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo "jq could not be found. Please install it." >&2
  exit 1
fi

# Ensure GitHub authentication is available to read PR data (gh auth or GH_TOKEN)
if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Please run 'gh auth login' or set GH_TOKEN with sufficient repo scope to read PRs." >&2
  exit 1
fi

# Determine PR number
if [ -n "$PR_OVERRIDE" ]; then
  PR_NUMBER="$PR_OVERRIDE"
  echo "Checking for unresolved $LABEL on PR #$PR_NUMBER (override)"
else
  # Get current branch name
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  if [ -z "$BRANCH" ]; then
      echo "Error: Could not determine current branch." >&2
      exit 1
  fi
  echo "Checking for unresolved $LABEL on PR for branch: $BRANCH"

  # Get PR number for the current branch.
  # We're interested in the open PR for the current branch.
  PR_NUMBER=$(gh pr list --head "$BRANCH" --state open --json number --jq '.[0].number' 2>/dev/null)

  if [ -z "$PR_NUMBER" ] || [ "$PR_NUMBER" == "null" ]; then
    echo "No open pull request found for branch '$BRANCH'."
    exit 0
  fi
  echo "Found PR #$PR_NUMBER. Fetching unresolved $LABEL..."
fi

# Ensure temp directory exists (use repo root when available)
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
mkdir -p "$REPO_ROOT/.cursor/tmp"
TMP_DIR="$REPO_ROOT/.cursor/tmp/pr_review"
mkdir -p "$TMP_DIR"

# Owner / repo
OWNER=$(gh repo view --json owner --jq '.owner.login')
REPO_NAME=$(gh repo view --json name --jq '.name')
if [ -z "$OWNER" ] || [ -z "$REPO_NAME" ]; then
  echo "Error: Could not determine repository owner and name from git remote." >&2
  exit 1
fi

# Enhanced GraphQL query with pagination to fetch ALL review threads with line information and code context
QUERY='
query($owner: String!, $name: String!, $number: Int!, $threadsAfter: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $threadsAfter) {
        pageInfo { hasNextPage endCursor }
        nodes {
          isResolved
          comments(first: 100) {
            nodes {
              url
              path
              author { login __typename }
              bodyText
              line
              diffHunk
              pullRequestReview { databaseId }
            }
          }
        }
      }
    }
  }
}'

# JQ filter to build a numbered Markdown checklist
# Input to this filter is an ARRAY of reviewThread nodes (across ALL pages)
# shellcheck disable=SC2016
JQ_FILTER='
def indent(s):
  (s // "")
  | gsub("\r"; "")
  | split("\n")
  | map("     " + .)
  | join("\n");

def line_suffix(l): if l then ":" + (l|tostring) else "" end;

($reviewBatch|tonumber? // null) as $rb
|
[
  .[]?
  | select(.isResolved == false)
  | .comments.nodes[]?
  | select(.author.login != null)
  | select(
      if $botsOnly then
        (.author.__typename == "Bot") or ((.author.login // "") | ascii_downcase | test($botsRegex))
      elif $includeBots then
        true
      else
        (.author.__typename != "Bot") and (((.author.login // "") | ascii_downcase | test($botsRegex)) | not)
      end
    )
  | select(($rb == null) or ((.pullRequestReview.databaseId // -1) == $rb))
  # Skip comments explicitly marked for humans: case-insensitive, ignores leading whitespace
  | select(((.bodyText // "") | test("^[[:space:]]*human:"; "i")) | not)
  | {
      url: (.url // "No URL"),
      path: (.path // "Unknown file"),
      line: .line,
      author: (.author.login // "Unknown"),
      body: (.bodyText // ""),
      diff: (.diffHunk // "")
    }
] as $items
| (if ($limit != null and ($limit|type) == "number") then ($items[0:$limit]) else $items end) as $items
| if ($items|length) == 0 then
    "✅ All " + $label + " are resolved."
  else
    "## Unresolved " + $label + " (" + (($items|length)|tostring) + ")\n\n"
    + (
      $items
      | to_entries
      | map(
          ((.key + 1)|tostring) + ". [ ] " + .value.author + " — " + .value.path + line_suffix(.value.line) + "\n"
          + "   - **URL**: " + .value.url + "\n"
          + "   - **Comment**:\n\n"
          + (if (.value.body|length) > 0 then indent(.value.body) + "\n" else "     <no body>\n" end)
          + (if (.value.diff|length) > 0 then "   - **Code Context**:\n\n     ```diff\n" + indent(.value.diff) + "\n     ```\n" else "" end)
        )
      | join("\n")
    )
  end
'
# shellcheck enable=SC2016

ALL_THREADS_FILE="$TMP_DIR/review_threads.json"
PAGE_FILE="$TMP_DIR/review_threads_page.json"
TMP_FILE="$TMP_DIR/review_threads_tmp.json"
echo '[]' > "$ALL_THREADS_FILE"

# Paginate through ALL reviewThreads
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

# Execute the jq filter over the aggregated threads to get unresolved comments
# NOTE: We have to use -F capitalized for the number parameter otherwise it will crash.
if [ "$BOTS_ONLY" = true ]; then BOTS_ONLY_JSON=true; else BOTS_ONLY_JSON=false; fi
if [ "$INCLUDE_BOTS" = true ]; then INCLUDE_BOTS_JSON=true; else INCLUDE_BOTS_JSON=false; fi
if [ -n "$LIMIT" ]; then LIMIT_JSON=$LIMIT; else LIMIT_JSON=7; fi

UNRESOLVED_COMMENTS=$(cat "$ALL_THREADS_FILE" | jq -r \
  --argjson botsOnly "$BOTS_ONLY_JSON" \
  --argjson includeBots "$INCLUDE_BOTS_JSON" \
  --arg label "$LABEL" \
  --argjson limit "$LIMIT_JSON" \
  --arg botsRegex "$BOTS_REGEX" \
  --arg reviewBatch "${REVIEW_BATCH}" \
  "$JQ_FILTER")

# Count checklist items (lines starting with `N. [ ] `) safely without failing the script
COMMENT_COUNT=$(echo "$UNRESOLVED_COMMENTS" | awk '/^[0-9]+\. \[ \] /{c++} END{print c+0}')

echo ""
if [ "$COMMENT_COUNT" -gt 0 ]; then
  echo "🔥 Found $COMMENT_COUNT unresolved $LABEL on PR #$PR_NUMBER:"
  echo ""
  echo "$UNRESOLVED_COMMENTS"
else
  echo "$UNRESOLVED_COMMENTS"
fi


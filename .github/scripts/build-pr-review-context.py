#!/usr/bin/env python3
"""
Builds structured context for the PR Review agent prompt.

Outputs:
- PR metadata (number, title, branches, description, URL)
- Review metadata (id, author, author type, is_bot, comment count)
- CodeRabbit summary (if available)
"""

import json
import os
import re
import subprocess
import sys


class CommandError(Exception):
    """Raised when a shell command fails."""


def run_command(cmd):
    """Run a shell command and return stdout."""
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise CommandError(
            f"Command failed (code {result.returncode}): {' '.join(cmd)}\n{result.stderr}"
        )
    return result.stdout.strip()


def fetch_optional(fetch_fn, fallback_value, error_prefix="Warning"):
    """Fetch optional data with error logging and fallback."""
    try:
        return fetch_fn()
    except Exception as e:
        print(f"{error_prefix}: {e}", file=sys.stderr)
        return fallback_value


def fetch_pr_details(pr_number):
    """Fetch PR details using gh CLI."""
    try:
        result = run_command([
            "gh", "pr", "view", pr_number,
            "--json", "number,title,body,headRefName,baseRefName,url"
        ])
        return json.loads(result)
    except (CommandError, subprocess.CalledProcessError, json.JSONDecodeError, KeyError) as e:
        print(f"Error fetching PR details: {e}", file=sys.stderr)
        return None


def fetch_coderabbit_summary(pr_number):
    """Fetch the first CodeRabbit comment on the PR."""
    result = run_command([
        "gh", "pr", "view", pr_number,
        "--json", "comments",
        "--jq", '.comments[] | select(.author.login == "coderabbitai") | .body'
    ])
    # Take first 100 lines
    lines = result.split('\n')[:100]
    return '\n'.join(lines) if lines else "(No CodeRabbit summary found)"


def determine_bot_status(author_login: str, author_type: str) -> bool:
    """
    Determine if the review is from a bot by checking both type and username.
    
    Checks:
    1. GitHub account type === 'Bot'
    2. Username matches known bot patterns (case-insensitive)
    """
    if author_type == 'Bot':
        return True

    # Check if username matches known bot patterns
    bot_pattern = r'(coderabbit|graphite|cursor|bugbot)'
    if re.search(bot_pattern, author_login, re.IGNORECASE):
        return True
    
    return False


def fetch_review_comment_count(pr_number: str, review_id: str) -> int:
    """
    Fetch the number of inline comments in a review using GitHub GraphQL API.
    """
    repo = os.environ.get("GITHUB_REPOSITORY", "").split("/")
    if len(repo) != 2:
        return 0
    
    owner, name = repo
    
    rest_result = run_command([
        "gh", "api",
        f"/repos/{owner}/{name}/pulls/{pr_number}/reviews/{review_id}/comments",
        "--jq", "length"
    ])
    
    return int(rest_result)


def main():
    """Main entry point."""
    pr_number = os.environ.get("PR_NUMBER")
    review_id = os.environ.get("REVIEW_ID")
    review_author_login = os.environ.get("REVIEW_AUTHOR_LOGIN")
    review_author_type = os.environ.get("REVIEW_AUTHOR_TYPE")
    
    if not pr_number:
        print("Error: PR_NUMBER environment variable not set", file=sys.stderr)
        sys.exit(1)
    
    if not review_id:
        print("Error: REVIEW_ID environment variable not set", file=sys.stderr)
        sys.exit(1)
    
    if not review_author_login:
        print("Error: REVIEW_AUTHOR_LOGIN environment variable not set", file=sys.stderr)
        sys.exit(1)
    
    if not review_author_type:
        print("Error: REVIEW_AUTHOR_TYPE environment variable not set", file=sys.stderr)
        sys.exit(1)
    
    # Gather PR context
    pr_details = fetch_pr_details(pr_number)
    if not pr_details:
        print("Error: Could not fetch PR details", file=sys.stderr)
        sys.exit(1)
    
    # Compute repository slug for URL construction
    repo_slug = os.environ.get("GITHUB_REPOSITORY", "BluMintInc/eslint-custom-rules")
    
    # Fetch CodeRabbit summary
    coderabbit_summary = fetch_optional(
        lambda: fetch_coderabbit_summary(pr_number),
        "(No CodeRabbit summary found)",
        "Could not fetch CodeRabbit summary"
    )
    
    # Determine if this is a bot review
    is_bot = determine_bot_status(review_author_login, review_author_type)
    
    # Fetch review comment count
    comment_count = fetch_optional(
        lambda: fetch_review_comment_count(pr_number, review_id),
        0,
        "Could not fetch review comment count"
    )
    
    # Build structured output
    output = {
        "pr": {
            "number": pr_details.get("number"),
            "title": pr_details.get("title"),
            "head_branch": pr_details.get("headRefName"),
            "base_branch": pr_details.get("baseRefName"),
            "description": pr_details.get("body", ""),
            "url": pr_details.get("url", f"https://github.com/{repo_slug}/pull/{pr_number}")
        },
        "review": {
            "id": int(review_id),
            "author": review_author_login,
            "author_type": review_author_type,
            "is_bot": is_bot,
            "comment_count": comment_count
        },
        "coderabbit_summary": coderabbit_summary
    }
    
    # Output as JSON
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()


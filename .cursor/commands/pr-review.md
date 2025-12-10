# Addressing Pull Request Review Comments

When you are asked to "address all outstanding PR review comments" or a similar request, follow this workflow to systematically resolve the feedback. 

## Continuous Execution Requirement

- Do not stop after each step. Execute the entire workflow end-to-end in a single continuous session.
- Only pause if blocked by missing information or required approval; use the Interactive MCP tools to ask for exactly what you need, then continue.
- Update the checklist as you go and immediately proceed to the next item.
- Before yielding, verify the Definition of Done below.

## Workflow

1.  **Fetch Unresolved Comments**: Execute the `npm run fetch-unresolved-comments` script. This script uses `gh` to retrieve all unresolved human review comments from the current pull request.

    - Optional: To process a specific review batch (e.g., when multiple reviews exist or when a background agent is launched for a single review), pass the review ID via:

      ```bash
      npm run fetch-unresolved-comments -- --review-batch=<REVIEW_ID>
      ```
      The `<REVIEW_ID>` is the GitHub review identifier (numeric) available in review webhooks and comments. This allows multiple review batches to be addressed in parallel by separate background agents.

    - Optional: If running on a branch that isn't the PR's source branch (e.g., a background agent branch), specify the PR explicitly:

      ```bash
      npm run fetch-unresolved-comments -- --pr=<PR_NUMBER>
      ```

2.  **Perform Codebase Analysis**: Given the review comments you'll need to address, perform deep research on the codebase to understand the context of the comments and arm yourself to be able to make the best code decisions to address the comments.

3.  **Implement Changes**: Process the checklist one-by-one. For each checklist item, navigate to the specified file(s) and line(s), apply the necessary code changes to address the reviewer's concerns, and where the reviewer provided insights, add succinct in-code comments to capture the rationale. Mark the item complete before proceeding to the next.

4.  **Update Documentation**: If applicable, update any related `.mdc` documentation guides to incorporate the captured insights and reflect current behavior and design decisions (follow the `system-documentation` rule).

5.  **Resolve Addressed Comments**: When you've addressed items, run `npm run resolve-comments -- <comment_url_1> <comment_url_2> ...` to mark the corresponding review threads as resolved. This accepts PR review comment URLs (e.g., `...#discussion_r123456789`) and resolves their threads directly.

## Definition of Done
- All PR review comments are resolved; `npm run fetch-unresolved-comments` returns none.
- `.cursor/tmp/pr-review-checklist.md` exists and all items are checked off.
- All necessary code edits are implemented; modified files pass linting; relevant tests pass.
- Related documentation guides are updated where applicable.
- Follow `task-completion-standards.mdc` for linting, testing, and documentation before finishing.


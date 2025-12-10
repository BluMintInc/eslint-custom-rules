# Addressing AI Bot PR Review Comments

AI-generated PR comments can be helpful but are frequently incorrect (roughly ~50%). Use this workflow to systematically triage, validate, and address PR review comments authored by our AI bots: coderabbatai, graphite-app, and Cursor BugBot.

## Continuous Execution Requirement

- Do not stop after each step. Execute this workflow end-to-end in a single continuous session.
- Keep the checklist updated as you progress and move directly to the next item.
- Confirm the Definition of Done before yielding.

## Workflow

1.  **Fetch Unresolved AI Bot Comments (Create Chat Checklist)**: Execute `npm run fetch-unresolved-bot-comments` to retrieve unresolved review comments authored by the AI bots (coderabbatai, graphite-app, Cursor BugBot). Treat this outputted markdown checklist as the single source of truth for triage and progress.

    - Optional: To process a specific review batch (e.g., when multiple AI bot reviews exist or when separate background agents are launched for each), pass the review ID via:

      ```bash
      npm run fetch-unresolved-bot-comments -- --review-batch=<REVIEW_ID>
      ```
      The `<REVIEW_ID>` is the GitHub review identifier (numeric) available in review webhooks and comments. This enables parallel processing of distinct review batches.

    - Optional: If running from a non-source branch created by an automation/background agent, specify the PR explicitly:

      ```bash
      npm run fetch-unresolved-bot-comments -- --pr=<PR_NUMBER>
      ```


2.  **Triage and Annotate In-Chat, One-by-One**: For each comment in the checklist:
    - Read up on referenced files/lines and surrounding context
    - Check alignment with relevant .mdc systems' documentation
    - Categorize the comment as: Valid or Invalid

    - Only proceed to implementation for items marked Valid. Leave Invalid out of scope (note rationale).

3.  **Implement Changes, One-by-One**: Process Valid checklist items one-by-one. For each, navigate to the specified file(s) and line(s) to apply the necessary edits.

4.  **Update Documentation**: If applicable, update related `.mdc` documentation guides to incorporate captured insights and reflect current behavior and design decisions (follow the `system-documentation` rule).

5.  **Resolve and Annotate Excluded/Processed Items**: Generate `decisions.json` from the annotated chat checklist and run `npm run apply-comment-decisions -- .cursor/tmp/decisions.json` (or another path you choose) to:
    - React with 👍 for valid items or 👎 for invalid items
    - Mark each addressed comment as resolved
    The `decisions.json` file should be an array of objects with fields:
    - `url` (required): the comment URL (e.g., `...#discussion_r123456789`)
    - `valid` (required, boolean): true for valid, false for invalid

## Definition of Done

- All validated AI bot comments are addressed and resolved; `npm run fetch-unresolved-bot-comments` returns none for the PR. Otherwise, please loop back to step 1.
- Adhere to `task-completion-standards.mdc` for linting, testing, and documentation prior to finishing.


---
name: repo-maintenance
description: "Use when triaging or maintaining the eslint-custom-rules repository."
user-invocable: false
---

# ESLint Custom Rules Repository Maintenance Guide

## The "Staying on Top" Ethos

**Goal: 0 Outstanding Issues**

If we can get to the point where there are **0 ESLint Issues** in the codebase, it will become impossible for new ESLint bugs & requests to accidentally be ignored in the noise. Every new ESLint bug and request will be immediately noticed and quickly addressed.

As a result, our AI agents do a very good job of writing extensible, bug-free, performant code. We want to get to the point where every ESLint Issue that is opened is addressed right away.

## Workflow Overview

This repo is operated by an **autonomous maintainer** (`/maintainer`, backed by the
deterministic toolkit `scripts/maintainer.ts`) — not by humans triaging labels. The
old label-driven GitHub-Action agents (research, implement, fix, bot-review) and their
trigger labels (`claude-research`, `research-complete`, `claude-implement`,
`claude-fix`, `claude-address-bot-review`) have been **removed**. The maintainer acts
on **all** open issues; the `bug` / `rule-request` labels only choose which subagent
handles them.

### 1. The maintainer loop

Run `/maintainer` (see `.claude/commands/maintainer.md`). It:
- Drains the open-issue queue **bugs-before-features, oldest-first** (`scripts/maintainer.ts next`).
- Per issue, spawns the routing subagent — `bug` → `fix-bug`, `rule-request` → `implement-rule` (`chooseAgent`). Labels **only choose the subagent**; there is **no research prerequisite** and no trigger labels.
- Validates each change through the repo stop-hook gate (`scripts/maintainer.ts validate`: build + changed-file lint + related tests) and self-merges to `develop` with a deterministic, scope-correct conventional commit (`scripts/maintainer.ts scope` → `fix(<rule>)` for an edited rule / `feat(<rule>)` for a new one).
- On an empty queue, promotes `develop → main` (`scripts/maintainer.ts release`), firing semantic-release (npm publish + `release-manifest.json`) and notifying agora.

Triage is therefore minimal: just ensure each issue carries `bug` or `rule-request` so it routes to the right subagent. An unlabeled issue defaults to `fix-bug`.

### 2. Enforcing Implementation Standards (Stop Hooks)

The repo's own Stop Hook gates every change before it can merge — the maintainer leans on it rather than reinventing validation:

1. **File Structure Verification** (rule implementations): the agent must have created/updated ALL of:
    - `src/index.ts` (import, `rules` object, recommended config)
    - `src/rules/<rule-name>.ts`
    - `src/tests/<rule-name>.test.ts`
    - `docs/rules/<rule-name>.md`
    - `README.md`
    If a file is missing, the Stop Hook blocks completion and forces a fix.

2. **Quality Checks**: build (`npm run build`) must succeed, ESLint must pass on the **changed files** (scoped, not whole-repo — avoids tripping on unrelated pre-existing debt), and the tests **related to the change** (`jest --findRelatedTests`) must pass. The full suite is the CI backstop. For rule implementations the hook also prompts the agent to "Expand Tests" toward 20+ cases covering false positives/negatives.

### 3. Driving a PR to clean

To drive any open PR to review-clean + CI-green — addressing CodeRabbit/human review comments and fixing failing checks autonomously, committing + pushing each cycle — run `npm run pr-autopilot -- --pr=<n>` (see `.github/scripts/pr-autopilot.ts`). This replaces the old `claude-address-bot-review` label trigger. A human can run it the same way.

## Troubleshooting

### Fixing Build/Test Failures

For a PR branch whose CI is red:
1. `git checkout <pr-branch-name>`
2. Run the `fix-build-test` agent (it runs build/tests, diagnoses errors, and loops until `npm run build` and `npm test` pass), or run `npm run pr-autopilot -- --pr=<n>` which folds this in.
3. Commit & push.

### Addressing Bot Reviews

To address bot reviews (CodeRabbit, Cursor Bugbot) on a PR, run `npm run pr-autopilot -- --pr=<n>` — it drains unresolved review comments and pushes fixes each cycle.

**Note**: If a subagent stops abruptly, resume it by sending: "It looks like you were interrupted. Please continue."

# AI-Powered Merge Conflict Resolution System

## Overview

This repository (BluMint’s `eslint-custom-rules`) uses Cursor Hooks and Background Agents to automate rule development and PR review addressing.

Merge conflicts are still a frequent source of friction—especially when multiple branches modify the same rule implementation, documentation, or the large `src/index.ts` registry.

This system adds a workflow that:

1. **Gathers high-signal merge context** (conflict markers, per-branch squashed diffs, file freshness timestamps, and optional PR metadata)
2. **Generates a structured Cursor prompt** at `.cursor/tmp/merge-conflict-prompt.md`
3. **Prevents agents from stopping** until merge conflicts are fully resolved via a new **Priority 0** stop hook

The UX mirrors the existing review workflow (`npm run address-review`): prepare context → generate prompt → paste into Composer → agent loops until complete.

---

## User Workflow

```bash
# 1) Start a merge that produces conflicts
git merge feature/something

# 2) Generate the merge-conflict resolution prompt
npm run address-merge-conflicts

# 3) Copy/paste .cursor/tmp/merge-conflict-prompt.md into Cursor Composer
# 4) Resolve files, remove conflict markers, and stage:
#    git add <file>
# 5) The Cursor stop hook blocks completion until conflicts are gone
```

---

## Why This Is Better Than Manual Conflict Resolution

- **Squashed diffs (net change)**: The agent sees what each branch changed relative to merge-base, not noisy commit history.
- **Freshness heuristic**: The last commit timestamp per branch/file helps prefer the most recent intent when changes are compatible.
- **Stop-hook enforcement**: Merge conflicts block compilation and linting; this system ensures they’re resolved before any other checks.

---

## What Gets Collected

For each conflicted file:

- The **current file contents** including `<<<<<<<`, `=======`, `>>>>>>>` markers
- **OURS** squashed diff: `merge-base → HEAD` for this file
- **THEIRS** squashed diff: `merge-base → MERGE_HEAD` for this file
- **Last commit timestamp** on each branch that touched this file (for freshness)

Optional:

- If the incoming merge head is associated with an open PR, we also fetch:
  - PR number, title, description, URL
  - CodeRabbit summary (if present)

---

## Key Files Added

### Scripts

- `.github/scripts/address-merge-conflicts.ts`
  - Entry point for `npm run address-merge-conflicts`
  - Validates merge state
  - Builds merge context and writes `.cursor/tmp/merge-conflict-prompt.md`

- `.github/scripts/build-merge-prompt.ts`
  - Pure prompt builder shared by both the initial setup script and stop-hook followups

- `scripts/check-merge-conflicts.sh`
  - Emits either:
    - `✅ All merge conflicts resolved`
    - or a checklist of remaining conflicted files + conflict hunk counts

### Cursor Hooks

- `scripts/cursor-hooks/merge-conflict-check.ts`
  - **Stop hook Priority 0**: blocks stop while conflicts remain

- `scripts/cursor-hooks/agent-check.ts`
  - Updated to run merge-conflict check before PR review and quality checks

### Git Merge Utilities

All merge utilities live under `scripts/cli/git-merge/`:

- `types.ts` — shared types for merge context
- `isInMergeConflictState.ts` — checks for `MERGE_HEAD`
- `getConflictedFiles.ts` — lists conflicted files (`git diff --diff-filter=U`)
- `getMergeBase.ts` — computes merge base (`git merge-base HEAD MERGE_HEAD`)
- `getSquashedDiff.ts` — per-file squashed diff (`git diff base..ref -- file`)
- `getBranchLastCommitDate.ts` — per-file last commit timestamp (`git log -1 -- file`)
- `getAssociatedPr.ts` — tries to resolve the merge-head branch to an open PR
- `fetchPrMetadata.ts` — fetches title/body/url + CodeRabbit summary (no PR diff)
- `buildMergeContext.ts` — orchestrates the complete context build

---

## Stop Hook Behavior

When the agent attempts to stop, the stop hook now runs checks in this order:

1. Heartbeat update
2. Status check
3. **Merge conflict check (Priority 0)**
4. PR review check (Priority 1)
5. Build/lint/test (quality gates)

If conflicts remain, the agent receives a follow-up message that includes:

- A checklist of remaining conflicted files
- A refreshed merge prompt produced from current repo state

---

## Prompt Resolution Philosophy

The generated prompt instructs the agent to:

- Prefer **freshest** changes when compatible
- Avoid blindly choosing ours/theirs; **synthesize** when possible
- Preserve bug fixes/API updates even if older
- Remove all conflict markers and leave the file in a clean, compilable state

---

## Notes / Limitations

- Very large files/diffs are truncated to keep prompts manageable.
- Binary conflicts are not handled specially and may require manual resolution.
- PR metadata requires authenticated `gh` CLI.

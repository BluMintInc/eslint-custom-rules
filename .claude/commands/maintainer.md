---
description: Autonomously drain the open-issue queue to zero, then cut a release. Sole operator of this repo.
argument-hint: "[--max-issues=N] [--dry-run]"
model: opus
---

# Maintainer — autonomous sole operator of `eslint-custom-rules`

You are the **maintainer**: a continuously-running, goal-driven session whose
**goal is to drive the open-issue queue to zero and then cut a release**, fully
unattended. You run *inside this repo* (`BluMintInc/eslint-custom-rules`). You
are its sole operator — you self-merge to `develop` and promote `develop → main`.

Run this as a `/loop` (self-paced) under that goal. Use **ultracode** (a dynamic
Workflow) for hard rule fixes. Leverage the deterministic toolkit
`scripts/maintainer.ts` for everything that must not be improvised, and the
per-issue subagents (`fix-bug`, `implement-rule`) for the actual code changes.

`$ARGUMENTS` may carry `--max-issues=N` (stop after N issues this run; default:
drain fully) and `--dry-run` (print git/gh actions instead of performing them —
use this to rehearse).

## Invariants (do not violate)

- **Priority: bugs before features; within each, oldest first.** Never reorder.
- **Conventional commit, scope = rule name:** `fix(<rule>): … (closes #<n>)` or
  `feat(<rule>): … (closes #<n>)`. The commitlint `blumint-rule-scope` rule and
  the `validate-commit-scopes` CI gate reject any other scope — a wrong scope
  breaks `release-manifest.json` and agora's re-enable. One rule per commit.
- **Never merge a red gate.** A change must pass build + lint + test (the repo
  stop hook) before it merges.
- **Release only on an empty queue.** Promote `develop → main`, then
  fast-forward `develop` to `main` to cure branch drift.
- **Act on ALL open issues** — no label filtering. Labels only choose the agent.

## Loop (one cycle)

1. **Sync.** `git checkout develop && git pull --ff-only origin develop`.
2. **Pick.** `npx tsx scripts/maintainer.ts next` → JSON `{number,title,kind,agent,branch}`
   (or `null`). If `null`, go to **Release**.
3. **Branch.** `git checkout -b <branch>` (the `branch` from step 2, e.g.
   `develop-fix-bug-<n>`). If it already exists, check it out and rebase on develop.
4. **Implement.** Fetch the issue body (`gh issue view <n> --repo BluMintInc/eslint-custom-rules --json title,body,labels`).
   Spawn the chosen subagent via the `Task` tool:
   - `agent: "fix-bug"` for bugs, `agent: "implement-rule"` for rule-requests.
   - Pass the full issue body. If it carries a ready failing `RuleTester` case,
     instruct the subagent to drop it in verbatim, confirm it fails, then fix
     until valid+invalid tests pass.
   - For a hard fix, run a dynamic **Workflow**: find → fix → adversarially
     verify the fix's tests actually fail before / pass after.
5. **Validate.** `npx tsx scripts/maintainer.ts validate` (runs build + lint +
   test — the same gate the stop hook enforces). If it fails, iterate on the fix;
   do not proceed until green.
6. **Commit + merge.** Commit with `fix(<rule>): … (closes #<n>)` (or `feat`).
   Then `npx tsx scripts/maintainer.ts merge --issue=<n> --branch=<branch>`
   (`--dry-run` to rehearse). The `closes #<n>` auto-closes the issue on merge to
   develop.
7. **Repeat** from step 1 until `next` returns `null` (respecting `--max-issues`).

## Release (queue empty)

8. `npx tsx scripts/maintainer.ts release` — promotes `develop → main`
   (`--ff-only`) which triggers `semantic-release.yml` (npm publish + CHANGELOG +
   `release-manifest.json` via the prepareCmd), then fast-forwards `develop` to
   `main`. (`--dry-run` to rehearse.)
9. **agora is notified automatically** by the release workflow's `successCmd`
   (`scripts/dispatch-agora-release.js` → `repository_dispatch` to agora). No
   manual dispatch needed; `npx tsx scripts/maintainer.ts dispatch --version=<v>`
   exists only as a fallback.

## Notes

- Every change you produce is gated by this repo's own stop hooks before it can
  merge — lean on them; do not reinvent validation.
- If an issue is genuinely unactionable (e.g. needs human product input), comment
  on it explaining why and move on; do not block the queue.
- Keep going. The first run clears a multi-month backlog and cuts the first
  release in months — expect it to take a while.

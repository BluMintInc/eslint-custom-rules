---
name: claude-hooks
description: "Use when understanding the automated agent quality checks, hooks, and workflow system."
user-invocable: false
---

# Claude Code Hooks and GitHub Workflows System

## Purpose

This system automates the ESLint rule development lifecycle using **Claude Code Hooks** for local quality enforcement. The repo is driven by the autonomous **maintainer** (`/maintainer`), which spawns the `fix-bug` / `implement-rule` subagents per issue; the **Stop Hook** gates every change before it can merge.

> **Note:** The earlier label-driven GitHub-Action workflows (`claude-rule-research-agent.yml`, `claude-implement-rule-agent.yml`, `claude-fix-bug-agent.yml`) and the web-research step have been **removed**. Issues are no longer triggered by `claude-*` labels — the maintainer acts on all open issues directly, and `bug` / `rule-request` only choose the subagent. The Hooks documented below are still live and authoritative.

## Why the System Was Built

Automation reduces manual toil by enforcing local quality gates at agent stop-time, so an agent can't finish a rule fix/implementation until build, scoped lint, scoped tests, and (for new rules) the required file structure all pass.

## Lifecycle Overview

```
Open issue (bug | rule-request)
        │  maintainer: `scripts/maintainer.ts next`  (bugs before features, oldest first)
        ▼
fix-bug  /  implement-rule  subagent   (chosen by label; no research step)
        │  edits rule + tests (+ docs / index.ts / README for new rules)
        ▼
Stop Hook gate (.claude/hooks/stop.sh → agent-check.ts):
        build → lint changed files → related tests → rule-structure (new rules)
        │  green
        ▼
maintainer self-merges to develop (scope-correct commit) → release on empty queue
```

## Definitions

| Term | Description |
|------|-------------|
| **Claude Code Hook** | Lifecycle event handler that runs automated checks at key agent milestones |
| **Stop Hook** | Quality gate that blocks completion until required checks succeed |
| **Validation Loop** | Iterative rerun cycle triggered by failing checks, bounded by MAX_LOOPS to avoid infinite prompting |
| **Quality Gate** | Ordered set of build, lint, test, and structure checks applied before an agent can finish |
| **Rule Implementation Lifecycle** | Multi-stage flow from issue selection through implementation, validation, and merge |

## Core Components

- Claude Code Hooks: Local lifecycle scripts that enforce lint/build/test and prompt tracking on every agent run.
- Maintainer toolkit (`scripts/maintainer.ts`): Selects the next issue, validates, derives the commit scope, merges, and releases.
- Validation Layers: Stop hook checks that gate completion on build, lint, tests, and rule structure for reliability.
- Change Log: Per-session file tracking that keeps prompts idempotent and resumes validation across loops.

## How It Makes Developers' Lives Easier

- Automated quality gates prevent manual babysitting of lint/build/test steps.
- Structured prompts and rule scaffolding reduce errors and keep implementations consistent.
- Loop prevention and concurrency controls avoid duplicated agent runs and wasted API cycles.

## Directory Structure

```
.claude/
├── settings.json                        # Hook configuration
├── hooks/
│   ├── stop.sh                          # Stop hook entry point
│   ├── track-changes.sh                 # File change tracking
│   ├── track-prompt.sh                  # Prompt tracking & rule-request detection
│   ├── gate-containment-guard.sh        # PreToolUse: whole-suite and governor-stripping jest
│   ├── msys-argv-guard.sh               # PreToolUse: Git Bash argv conversion
│   ├── windows-tmp-guard.sh             # PreToolUse: Git Bash temp-path capture
│   └── lib/shim-harness.mjs             # Shared driver for the three shim suites
├── agents/
│   ├── implement-rule.md                # New rule implementation guide
│   └── fix-bug.md                       # Bug fix guide
├── skills/
│   ├── task-completion-standards/SKILL.md  # Quality checklist
│   └── claude-hooks/SKILL.md           # This documentation
└── tmp/
    └── hooks/
        └── agent-change-log.json        # Auto-created change log

scripts/
├── check-merge-conflicts.sh          # Lists remaining conflicted files (merge conflict stop hook)
├── claude-hooks/
│   ├── agent-check.ts                   # Main stop hook logic
│   ├── gate-containment-guard-check.ts  # PreToolUse entry point
│   ├── gate-containment/                # Its lexing, rules and deny text
│   ├── msys-argv-guard-check.ts         # PreToolUse entry point
│   ├── msys-argv/                       # Its lexing, rules and deny text
│   ├── windows-tmp-guard-check.ts       # PreToolUse entry point
│   ├── windows-tmp/                     # Its lexing, rules and deny text
│   ├── change-log.ts                    # Change log utilities
│   ├── lint-diff.ts                     # Lint changed files only
│   ├── merge-conflict-check.ts          # Merge conflict stop logic (Priority 0)
│   ├── pr-review-check.ts               # PR review comment check for stop hook (Priority 1)
│   ├── track-changes.ts                 # Track file modifications
│   ├── track-prompt.ts                  # Track prompts & detect flags
│   ├── types.ts                         # Shared TypeScript types
│   └── validate-rule-structure.ts       # Validate rule has all files
├── cli/
│   ├── git-utils.ts                     # Git CLI utilities
│   └── git-merge/                       # Merge-conflict context utilities
│       ├── types.ts
│       ├── isInMergeConflictState.ts
│       ├── getConflictedFiles.ts
│       ├── getMergeBase.ts
│       ├── getSquashedDiff.ts
│       ├── getBranchLastCommitDate.ts
│       ├── getAssociatedPr.ts
│       ├── fetchPrMetadata.ts
│       └── buildMergeContext.ts
├── github/                             # GitHub helper scripts
└── maintainer.ts                       # Deterministic maintainer toolkit (next/count/validate/scope/merge/release)
```

## GitHub Labels

| Label | Purpose |
|-------|---------|
| `rule-request` | New ESLint rule request → routes to the `implement-rule` subagent |
| `bug` | Bug in an existing rule → routes to the `fix-bug` subagent |

Labels **only choose the subagent**. There are no `claude-*` trigger labels and no research prerequisite; the maintainer acts on all open issues (an unlabeled issue defaults to `fix-bug`).

## Maintainer-Driven Lifecycle

The maintainer (`.claude/commands/maintainer.md`) drives the loop per issue:

1. **Select** — `scripts/maintainer.ts next` returns the next issue (bugs before features, oldest first), the routing subagent (`fix-bug` / `implement-rule`), and the branch (`develop-<agent>-<n>`).
2. **Branch & implement** — check out the branch and spawn the subagent with the issue body. Rule-requests carry the `<!-- rule-request -->` flag so the Stop Hook emits the "Expand Tests" prompt.
3. **Validate** — `scripts/maintainer.ts validate` runs the same gate the Stop Hook enforces (build + changed-file lint + related tests).
4. **Commit & merge** — `scripts/maintainer.ts scope` derives `{rule, changeType}` from the diff for a scope-correct `fix(<rule>)` / `feat(<rule>)` commit; `scripts/maintainer.ts merge` merges to `develop` and closes the issue.
5. **Release** — on an empty queue, `scripts/maintainer.ts release` promotes `develop → main`.

## Claude Code Hooks System

### Hook Configuration (`.claude/settings.json`)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/msys-argv-guard.sh\"",
            "timeout": 5
          },
          {
            "type": "command",
            "command": "\"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/windows-tmp-guard.sh\"",
            "timeout": 5
          },
          {
            "type": "command",
            "command": "\"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/gate-containment-guard.sh\"",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/track-changes.sh"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/track-prompt.sh"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/stop.sh"
          }
        ]
      }
    ]
  }
}
```

Each `PreToolUse` command is quoted and anchored on `${CLAUDE_PROJECT_DIR:-.}`, so a guard fires from whatever directory the tool call is made in and a project path containing a space reaches the shim as one word rather than two. The entries sit in agora's order, since these are ports and a diff between the two copies should read as a deliberate difference.

### Hook Input/Output Formats

**PostToolUse (track-changes)**:

```json
{
  "session_id": "abc123",
  "tool_use_id": "tool_xyz",
  "tool_name": "Edit",
  "tool_input": { "file_path": "src/rules/my-rule.ts" },
  "cwd": "/path/to/repo"
}
```

**UserPromptSubmit (track-prompt)**:

```json
{
  "hook_event_name": "UserPromptSubmit",
  "session_id": "abc123",
  "prompt": "Implement the my-rule ESLint rule <!-- rule-request -->"
}
```
Output: `{}` (empty object allows prompt through)

**Stop (agent-check)**:

```json
{
  "session_id": "abc123",
  "transcript_path": "/tmp/transcript.jsonl",
  "permission_mode": "default",
  "hook_event_name": "Stop",
  "stop_hook_active": false
}
```
Output: `{ "decision": "block", "reason": "..." }` to block, `{}` to allow stop.

### Stop Hook Execution Order

1. **Heartbeat Update**: Record activity timestamp
2. **Status Check**: Skip checks if `stop_hook_active === true` (prevents infinite loops)
3. **Merge Conflict Check (Priority 0)**: If a `git merge` is in progress and conflicts remain, block completion and provide a fresh conflict-resolution prompt. Use `npm run address-merge-conflicts` to generate the initial prompt.
4. **PR Review Check (Priority 1)**: For PR review branches (`*-review-pr-*`), check for unresolved comments (see `.claude/skills/automated-review-addressing/SKILL.md`)
5. **Build Validation**: `npm run build` must succeed
6. **Linting Validation**: ESLint on changed files only (not whole-repo — avoids tripping on unrelated pre-existing debt)
7. **Test Validation**: the tests related to the changed files must pass (`jest --findRelatedTests`), not the whole suite (355 files, seventeen of them 8 to 22 minutes each; the full suite is the CI backstop). Operands come from `scripts/related-tests.ts`, the same builder `npm run test:related` uses, so the hook and the maintainer's `validate` gate agree on what a registry change runs
8. **Rule Structure Validation**: For rule implementations, verify:
   - `src/rules/{rule-name}.ts` exists
   - `src/tests/{rule-name}.test.ts` exists
   - `docs/rules/{rule-name}.md` exists
   - `src/index.ts` updated in 3 places (import, config, rules)
   - `README.md` mentions the rule
9. **Check-Your-Work Prompt**: Self-review prompt
10. **Expand Tests Prompt**: For rule implementations only (requires 20+ tests)

#### The Governor

Every heavy step the Stop Hook runs is admitted by agora's machine-global exec-governor whenever `BLUMINT_GOVERNOR_CLI` names its `cli.ts`. Several autonomous loops share one box and each runs jest as its gate, so a run that WAITS is the normal case rather than a stall; the grant arrives as `BLUMINT_MAX_WORKERS`, which `jest.config.js` reads instead of sizing its fleet from installed memory. `scripts/governor.ts` also sets `TSX_TSCONFIG_PATH` to the tsconfig beside the configured CLI on every governed invocation — without it agora's CLI cannot resolve its own `functions/*` alias from this directory, and the client degrades to a bare, ungoverned run that reads exactly like a governed one. `.claude/skills/repo-maintenance/SKILL.md` §2b owns the configuration and the twenty-minute child ceiling.

#### Critical Insights for Maintainers

- Order is fail-fast by design: stop on build errors before lint/test to avoid long runs on broken builds, prevent expensive lint/test runs, and reduce agent API costs.
- Common pain points: flaky tests or slow lint/test runs can loop; rerun locally with the same commands in stop.sh and scope to changed files when possible.
- Rule structure validation loops if required files are missing or src/index.ts exports are incomplete; ensure all items in the checklist above exist before reruns.
- MAX_LOOPS in change-log.ts prevents infinite prompting; increase only when intentionally allowing longer runs.
- Hook side-effects cascade: PR review checks can short-circuit quality checks, and change-log updates influence later prompts; watch the console output to see which stage stopped the run.

### Rule Request Detection

The `<!-- rule-request -->` flag in the first prompt marks conversations as rule implementations:

```typescript
function detectRuleRequestFlag(prompt: string): boolean {
  return prompt.includes('<!-- rule-request -->');
}
```

This triggers the "Expand Tests" prompt after the first "Check Your Work" prompt.

### Change Log Structure

`.claude/tmp/hooks/agent-change-log.json`:

```json
{
  "session-abc123": {
    "_metadata": {
      "hasCheckWorkPrompted": true,
      "hasExpandTestsPrompted": false,
      "isRuleRequest": true,
      "lastUserMessage": "...",
      "endTimestamp": null,
      "lastActivityTimestamp": 1700000100000
    },
    "tool-use-xyz": ["src/rules/new-rule.ts", "src/tests/new-rule.test.ts"]
  }
}
```

## PreToolUse Bash Guards

Three hooks read the command a Bash call is about to run and may DENY it, printing the corrected command in the denial. They share one shape: a bash shim spools stdin to a `mktemp` file, applies a pure-`grep -qE` prefilter, and only then pays a `tsx` bootstrap to reach its checker. Every failure path prints `{}`, exits 0 and writes one stderr line naming the failure CLASS, never the command — a guard that cannot read a payload must not block work, and must not leak the payload into a log either.

**The bar a deny must clear is the fixed point: every rewrite a deny publishes is a command the same guard ALLOWS.** A `PreToolUse` reason frequently never reaches the model, so the retry is made blind, and a rewrite the guard would deny again makes the agent bounce instead of converge. Each guard's `.test.mjs` asserts it end to end by feeding the checker its own published output rather than a hand-written list.

**A prefilter that disagrees with its checker costs a deny silently**, since a payload the prefilter skips never reaches the checker at all. Each guard therefore carries a `*Prefilter.test.ts` that reads the pattern out of the SHIPPED shim (`readShimGrepPatterns`) and asserts every denied spelling still matches it.

### `gate-containment-guard.sh`

Denies two shapes, in this order — the whole-suite rule first, because its remedy is a fresh command carrying no environment prefix, so publishing the environment rewrite for a command that is both would hand back a command the first rule denies.

| Denied shape | Published rewrite |
|---|---|
| jest through any launcher, or `npm test` / `npm run test` / `npm run test:ci` / `npm t` — npm's own options are walked at both positions they sit, so `npm --silent test` and `npm run -s test` are the same denied run as the bare spellings — where no operand and no scoping flag narrows the run (`--findRelatedTests`, `--runTestsByPath`, `--testPathPattern(s)`, `-t`, `--onlyChanged`, `--changedSince`, `--lastCommit`, `--shard`) and no non-run flag ends it (`--listTests`, `--showConfig`, `--help`, `--version`, `--clearCache`). For an `npm` head the tokens after `--` are what is graded, so `npm test -- src/x.test.ts` is scoped and passes | `npm run test:related`, surviving flags republished after `--` |
| any command carrying a jest or npm-test head in one segment that also assigns, exports, unsets or `env -u`s a governor-family name in any segment: `BLUMINT_GOVERNOR_*`, `BLUMINT_MAX_WORKERS`, `BLUMINT_WORKER_BUDGET_MB`, `TSX_TSCONFIG_PATH`, `CI` | the same command with every such assignment, unset and `env` option removed |

Two republishing details are load-bearing rather than cosmetic:

* **The worker flags are DROPPED, not republished.** A jest CLI `--maxWorkers` outranks `jest.config.js`'s own sizing, so carrying it onto the remedy would publish a governed command that still fans out to the count that filled the box.
* **A value option is republished ATTACHED** (`--config=jest.config.js`), whatever spelling the author wrote. `test-related.ts` reads a dash-prefixed token as a flag and everything else as a path, so a detached value would arrive as a `--findRelatedTests` operand naming a file no suite relates to — a run of zero tests at exit 0, which is the silent green this guard exists to prevent. `scripts/test-related.test.ts` binds the two modules by re-partitioning each published rewrite.

`--watch` on a whole suite is denied with the first rule's rewrite: this repo's watcher would hold no lease and re-run the corpus on every keystroke.

**The table is what the guard denies, not everything that could run the suite.** Three shapes are deliberately outside it, so read it as a floor rather than as a proof:

* **A command carried inside another command's argument** — `bash -c "npx jest"`, `sh -c`, `env -S`. The value is one token, and a token-position walk cannot see the invocation inside it; re-implementing each wrapper's own splitting is how a bypass gets built out of the mitigation. Where the wrapper is one this repo models, the walk REFUSES and the guard writes a `fail-open (unmodelled-prefix)` line, so the shape is at least visible. Where it is not — `bash`, `sh`, `zsh` — the command is allowed in silence.
* **Shell grouping.** A subshell, `( … )`, is refused outright and reported as `fail-open (operator:()`. Brace grouping is not, and the asymmetry is the lexer's rather than a decision: `{` lexes as an ordinary word rather than an operator, so `{ npx jest; }` is a segment headed by a token no registry carries, and it is allowed in silence.
* **A yarn or pnpm SCRIPT.** A jest binary through either launcher is convicted; `yarn test` is not. Neither manager is installed on the box this repo's suite is sized for, and both forward a trailing operand with no `--`, so a script arm could not tell the scoped `yarn test src/tests/x.test.ts` from a bare run and would deny it.

### `msys-argv-guard.sh` and `windows-tmp-guard.sh`

Ported from agora for the team's Git Bash machines, where this repo is checked out too. Both gate on the platform BEFORE reading stdin and export the verdict through `BLUMINT_MSYS_GUARD_PLATFORM`, which the two share on purpose; off Git Bash each drains stdin, prints `{}` and exits 0, costing one `bash` start per Bash call. That same variable is how a Linux box exercises the Git Bash branch in the `.test.mjs` suites.

#### `msys-argv-guard.sh`

Denies a command whose argv MSYS2 rewrites before the program's `main` sees it — `git show <ref>:<path>`, whose colon becomes a Windows path-list separator — and publishes `MSYS_NO_PATHCONV=1 <command>`. agora's `firebase` family is dropped with the CLI this repo does not run, leaving `git-ref-path` as the sole entry in `BINARY_FAMILIES`; a second family is a data edit there.

**A pre-existing prefix clears a segment only when nothing ELSE in its argv needed converting.** The prefix is argv-wide, so `MSYS_NO_PATHCONV=1 git -C /c/repo show <ref>:<path>` protects the read and breaks the `-C`: it stays a deny, published as the `cd /c/repo && MSYS_NO_PATHCONV=1 git show <ref>:<path>` split, or as an explicit `C:/…` rewrite where a `cd` cannot express the conflict.

#### `windows-tmp-guard.sh`

Denies a rooted `/tmp` literal sitting inside a code string a CHILD parses for itself (`node -e "require('/tmp/x')"`), and publishes a repo-local sink under `.claude/tmp/<scope>` for the write and the read together. MSYS2 converts a path in argv, never one inside the code a child resolves, so the child reads the literal against the current drive as `C:\tmp\…` and dies `ENOENT`, or `MODULE_NOT_FOUND`, one command after a write that plainly succeeded and naming a path nobody typed.

**A `/tmp` path bash itself resolves is correct as written.** A redirect (`> /tmp/x`), a `cat /tmp/x`, a path handed to a child in argv (`jq … /tmp/x.json`) are all left alone, and the deny says so, because the expensive misreading of this rule is the over-correction that rewrites the half MSYS2 handles properly. The remedy names no single pasteable command, since the fix spans the write and the read while the guard sees only the read.

## Quality Enforcement

### Required Files for New Rules

1. `src/rules/{rule-name}.ts` - Rule implementation
2. `src/tests/{rule-name}.test.ts` - Test suite (20+ tests required)
3. `docs/rules/{rule-name}.md` - Documentation
4. `src/index.ts` updates:
   - Import statement
   - `configs.recommended.rules` entry
   - `rules` object entry
5. `README.md` mention

### Test Requirements

- Minimum 20 tests per rule
- 10+ valid cases (code that should NOT trigger)
- 10+ invalid cases (code that SHOULD trigger)
- Edge cases from issue specification
- Auto-fix tests if rule has `fixable: 'code'`

## Loop Prevention

The system uses `MAX_LOOPS = 200` to prevent infinite loops. After 200 iterations, agents complete even if checks fail.

## Common Issues

### Agent Stuck in Loop

If an agent keeps failing the same check:
- Check the error output in the agent conversation
- The agent will auto-stop after MAX_LOOPS iterations
- Review the failing validation and fix manually if needed

### Structure Validation Failing

Common mistakes:
1. Missing import in `src/index.ts`
2. Missing entry in `configs.recommended.rules`
3. Missing entry in `rules` object
4. Documentation not created
5. README not updated

## Development Tips

### Running Hooks Locally

```bash
# Test stop hook
echo '{"session_id":"test","hook_event_name":"Stop","stop_hook_active":false,"transcript_path":"/tmp/x.jsonl","permission_mode":"default"}' \
  | npx tsx scripts/claude-hooks/agent-check.ts

# Test lint-diff
npx tsx scripts/claude-hooks/lint-diff.ts --conversation-id "test"

# Test validate-rule-structure
node -e "const {validateRuleStructure} = require('./scripts/claude-hooks/validate-rule-structure'); console.log(validateRuleStructure('my-rule-name'));"
```

### Debugging Change Log

```bash
# View current change log
cat .claude/tmp/hooks/agent-change-log.json | jq .

# Clear change log (for testing)
rm .claude/tmp/hooks/agent-change-log.json
```

### Verifying Script Execution

```bash
# Ensure shell scripts are executable
chmod +x .claude/hooks/*.sh

# Test shell script directly
echo '{"session_id":"test","hook_event_name":"Stop","stop_hook_active":false,"transcript_path":"/tmp/x.jsonl","permission_mode":"default","cwd":"/path/to/repo"}' \
  | .claude/hooks/stop.sh
```

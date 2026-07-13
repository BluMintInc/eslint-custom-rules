# Disallow eslint-disable justifications that reference the agent development harness (worktree, cwd, stop-hook, claude) instead of the code’s own semantics (`@blumintinc/blumint/no-harness-coupled-disables`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

An `eslint-disable` directive is a permanent statement about the code: "this
rule does not apply here, and here is the code-level reason why." When the
stated reason is instead a quirk of the **agent development harness** — the
Claude Code CLI tooling (stop hooks, git worktrees, the lint-invocation working
directory, agent sessions) that runs *around* the repository — the suppression
is coupled to an ephemeral tooling bug rather than to the code.

That coupling fossilizes: the harness bug gets fixed in hook configuration weeks
later, but nobody circles back to the source file. The disable outlives its
cause and silently suppresses the rule against future, genuine violations. The
correct fix for "the stop hook lints from the wrong cwd and misresolves path
aliases" lives in the hook's lint invocation (its working directory or resolver
settings) — **never** in the file being linted.

This rule scans the justification text of every `eslint-disable`,
`eslint-disable-next-line`, and `eslint-disable-line` directive and reports one
that references the harness vocabulary. It is pure comment-text analysis: no
type information, no parser services, no NLP.

## What is detected

The justification text is everything after the `--` separator in a directive
(the rule-name list before `--` is never scanned). For multi-line block
directives the entire body is scanned, and an immediately-adjacent preceding
comment is scanned when the directive defers to it ("see above").

The matched vocabulary is a fixed, closed list:

- **Unconditional (always flag):** `worktree` (incl. `worktrees`,
  `worktree-cwd`, `cross-worktree`), `cwd` (incl. `CWDs`, `cwd's`), `claude`
  (incl. `Claude's`, `claude code`), and the Stop-hook compound `stop-hook` /
  `stop hook` / `stop_hook` (incl. near-adjacent forms like `stop lint hook`).
- **Conditional (flag only in a harness compound):** `hook` flags only in the
  `stop hook` compound — a bare React "hook" never flags. `session` flags only
  in `agent session` / `claude session` — a bare auth "session" never flags.

Matching is case-insensitive throughout.

This rule has no configuration. The harness vocabulary is a fixed constant by
design: a configurable word list would let projects opt out of exactly the
vocabulary this house-standard check exists to catch.

## Examples

### Incorrect

```ts
/* eslint-disable import/order -- worktree stop-hook runs ESLint from the primary repo cwd; order below is correct for CI */

// eslint-disable-next-line import/no-extraneous-dependencies -- false positive in git worktrees

// eslint-disable-next-line max-lines-per-function -- claude code's stop hook times out re-linting this file

// eslint-disable-next-line import/order -- tracked at owner/repo#123, stop-hook cwd bug
```

A tracking-issue reference does not exempt harness-coupled text — the fix still
belongs in harness config, not in source.

### Correct

```ts
// No disable at all: the harness quirk is fixed in the hook's lint invocation
// and the source stays clean.
import type { Member } from 'functions/src/types/Team';

// A disable justified by code-level semantics (bare "hook" = React hook):
// eslint-disable-next-line react-hooks/exhaustive-deps -- this hook fetches once on mount, deps are intentionally empty

// Domain vocabulary (bare "session" = auth session):
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- this token is regenerated per auth session

// Genuine environment difference — CI/editor/local are not harness vocabulary:
// eslint-disable-next-line no-process-env -- disabled in CI where NODE_ENV differs
```

## When Not To Use It

If your repository is not developed through the Claude Code CLI harness (no git
worktrees, no stop hooks, no agent sessions), the vocabulary this rule targets
will not appear in your justifications and the rule is inert — but it is safe to
leave enabled.

## Related

- Bare disables with no `--` justification are out of scope for this rule; pair
  it with ESLint core's `--report-unused-disable-directives` to catch
  suppressions that no longer suppress anything.

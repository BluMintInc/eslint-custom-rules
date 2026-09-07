#!/bin/bash
# PreToolUse hook for the Bash tool
# Denies a jest run this repo cannot afford on a shared box — a whole-suite run
# through any launcher or npm script, and any run that touches the governor's
# own environment — and publishes the scoped, governed command to retry with,
# so one blind retry converges.
#
# Follows agora's .claude/hooks/gate-containment-guard.sh, the established
# PreToolUse:Bash shape — pure-bash prefilter ahead of the tsx bootstrap,
# PROJECT_ROOT from BASH_SOURCE, stdin persisted to a `mktemp -t` file passed
# via JSON_INPUT_FILE, no node_modules auto-bootstrap, and FAIL OPEN on every
# bootstrap failure (print `{}`, exit 0, never `exit 1`), because a hook matched
# on `Bash` would otherwise wedge every command in the session.
#
# NO PLATFORM GATE, unlike the two guards that carry one. The memory budget is
# machine-global on every platform the team develops on, so both the refusal and
# its remedy are platform-neutral — the asymmetry that justifies the MSYS gate
# (a remedy that is inert off Windows, a refusal that is not) has no counterpart
# here.

# Persist stdin to a temp file to avoid passing large payloads via argv (E2BIG).
# Never fabricate a predictable /tmp name: stdin is redirected into it below, so
# a guessable name in a world-writable dir is a symlink-overwrite vector
# (CWE-377). Keep the `mktemp -t` form (unpredictable on both BSD and GNU); do
# NOT rewrite it as `mktemp <dir>/name.XXXXXX.json`, since BSD only substitutes
# a TRAILING run of X's, leaving a suffix after them literal.
TMP_FILE=$(mktemp -t gate-containment-guard-XXXXXX.json 2>/dev/null)
if [ -z "$TMP_FILE" ] || [ ! -e "$TMP_FILE" ]; then
  # The `fail-open (<cause>)` wording every other path in this unit uses, so an
  # operator sweeping `fail-open (` finds this one too — abstaining and holding
  # no opinion both print `{}`, so the stderr line is the only signal the guard
  # never got to look. Drain stdin before leaving: exiting with an unread pipe
  # is the one way this path could make itself felt on the writer.
  echo "gate-containment-guard: fail-open (temp-file-unavailable)" >&2
  cat >/dev/null 2>/dev/null
  echo "{}"
  exit 0
fi

cleanup() {
  rm -f "$TMP_FILE"
}
trap cleanup EXIT

# stdin is single-consumption — read it ONCE, here, before anything inspects it.
# mktemp + cat come FIRST and the grep SECOND, not the reverse: prefiltering
# ahead of mktemp would force a second stdin mechanism (a shell variable),
# mangling trailing newlines and NUL bytes in the payload to save microseconds,
# when what is actually being avoided is the tsx resolution below.
cat >"$TMP_FILE"

# ---------------------------------------------------------------------------
# The prefilter. THE PREFILTER NEVER DECIDES ANYTHING: it decides only whether a
# payload is worth a tsx bootstrap. Whether a matched command actually runs the
# whole suite, or strips the governor, needs the lexer — segment splitting,
# wrapper prefixes, launcher unwrapping, operand position, the tokens after
# `--` — none of which a bash regex can model, so a shape-based short-circuit
# that ALLOWED would silently void this whole unit.
#
# It errs toward matching, and may only ever err that way: an unnecessary
# bootstrap costs latency, a skipped one costs the deny.
#
# The two head alternatives are already a superset of BOTH rules today, since
# the governor-environment rule convicts only a command that also carries a jest
# or npm-test head. The environment alternatives are carried anyway, so a later
# rule convicting on the environment alone finds the prefilter already admitting
# its subject rather than silently inert on it.
#
# It matches the WHOLE payload, `tool_input.description` included, and that
# false-match class is accepted rather than unnoticed: only `tool_input.command`
# reaches the checker, so a description reading "Run the jest suite" pays the
# tsx resolution for a command that could never be an offense. Scoping the grep
# to that field means locating a JSON key with a bash regex, which models
# neither escaping, key order nor whitespace, and which fails CLOSED — letting a
# reordered or pretty-printed payload carry a real offense past the checker.
#
# The leading class admits `-` and `/` deliberately: `--unset` carries the
# `unset` alternative, and `resolveBinaryName` strips a `.js`/`.cjs`/`.mjs`
# suffix precisely so `node ./node_modules/jest/bin/jest.js` classifies as
# `jest`. `scripts/claude-hooks/gate-containment/gateContainmentPrefilter.test.ts`
# reads this grep out of this file and asserts every denied spelling still
# passes it, so the two copies cannot drift.
#
# The npm alternative admits ANY run of tokens between `npm` and its test
# script, because npm's own options may sit at both positions the checker walks
# — `npm --silent test` and `npm run -s test` run the same 355 suites the bare
# spellings do, and a pattern demanding `test` immediately after `npm ` or
# `npm run ` skips every one of them. That token run is what forces the one
# trailing class in this pattern: the grep reads the whole payload, so without a
# boundary after `t` the alternative would match any npm payload whose prose
# carries a word starting with `t`, and the bootstrap this prefilter exists to
# avoid would be paid on nearly every npm command in the session. The boundary
# costs nothing a rule denies, since every denied script token ends at `test`,
# `tst` or `t` followed by whitespace, `:` or the end of the payload.
# ---------------------------------------------------------------------------
grep -qE -- '(^|[^[:alnum:]_])(jest|unset|BLUMINT_|TSX_TSCONFIG_PATH|CI=|npm([[:space:]]+[^[:space:]]+)*[[:space:]]+(test|tst|t)([^[:alnum:]_]|$))' "$TMP_FILE" || {
  echo "{}"
  exit 0
}

# Derive project root from this script's location (<project-root>/.claude/hooks/)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)" || {
  echo "{}"
  exit 0
}
cd "$PROJECT_ROOT" || { echo "{}"; exit 0; }

# NO node_modules auto-bootstrap: on the harness's hottest tool path it would
# mean N concurrent `npm install`s over one shared tree, and a worktree's
# `node_modules` is a link into the primary checkout's install.
TSX_BIN="$PROJECT_ROOT/node_modules/.bin/tsx"
if [ ! -x "$TSX_BIN" ]; then
  echo "gate-containment-guard: fail-open (toolchain-unavailable)" >&2
  echo "{}"
  exit 0
fi

TS_SCRIPT="scripts/claude-hooks/gate-containment-guard-check.ts"

if [ ! -f "$TS_SCRIPT" ]; then
  echo "gate-containment-guard: fail-open (toolchain-unavailable)" >&2
  echo "{}"
  exit 0
fi

# Registered with an explicit `"timeout": 5` in .claude/settings.json, matching
# the sibling Bash guards: a hook that EXCEEDS its timeout produces no decision,
# which reads as no-opinion — a structurally silent fail-open the prefilter
# above exists to keep out of reach.
JSON_INPUT_FILE="$TMP_FILE" TSX_BIN="$TSX_BIN" "$TSX_BIN" "$TS_SCRIPT"

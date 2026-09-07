#!/bin/bash
# PreToolUse hook for the Bash tool
# Denies a command MSYS2's argument conversion would silently rewrite before the
# program's `main` sees it — `git show <ref>:<path>`, which arrives as
# `origin\develop;.claude\x` and answers "unknown revision or path" about a file
# that exists. The deny names the exact corrected command, so one retry
# converges.
#
# Follows agora's .claude/hooks/msys-argv-guard.sh, the established
# PreToolUse:Bash shape — pure-bash prefilter ahead of the tsx bootstrap,
# PROJECT_ROOT from BASH_SOURCE, stdin persisted to a `mktemp -t` file passed
# via JSON_INPUT_FILE, and FAIL OPEN on every bootstrap failure (print `{}`,
# exit 0, never `exit 1`), because a hook matched on `Bash` would otherwise
# wedge every command in the session.
#
# The `firebase database:*` family agora also models is absent: this repo runs
# no firebase CLI, so admitting those spellings would buy a tsx bootstrap for a
# command the checker has no rule for.
#
# ---------------------------------------------------------------------------
# THE PLATFORM GATE RUNS FIRST, BEFORE STDIN IS EVEN READ.
#
# The precedent reads stdin before anything inspects it, and states why: a
# prefilter ahead of `mktemp` would force a second stdin mechanism. That
# rationale does not reach this gate, which reads no stdin at all — only the
# environment — so it costs one `case` and lets Linux and macOS leave without
# a temp file, a grep, or a tsx resolution.
#
# The gate exists because the REMEDY is platform-neutral and the REFUSAL is
# not. `MSYS_NO_PATHCONV=1` is a verified no-op off Windows, which is why
# doctrine prescribes it unconditionally; denying a working command on two of
# three platforms is new friction with no bug to prevent — this repo's own
# maintainer loop runs on the Linux box that would eat it.
#
# stdin is still DRAINED on the way out. Exiting with an unread pipe is the one
# way this fast path could make itself felt on the platforms it exists to leave
# alone.
# ---------------------------------------------------------------------------

if [ -n "${BLUMINT_MSYS_GUARD_PLATFORM:-}" ]; then
  # The injectable signal, which the checker reads too: one detection, agreed
  # by both tiers, and the seam the tests drive both arms through.
  MSYS_GUARD_PLATFORM="$BLUMINT_MSYS_GUARD_PLATFORM"
elif [ -n "${MSYSTEM:-}" ]; then
  # Exported by Git Bash (MINGW64/MINGW32/MSYS), so it survives into children.
  MSYS_GUARD_PLATFORM="git-bash"
else
  # $OSTYPE is a bash shell variable rather than an exported one, so it is
  # readable HERE and (usually) not in the checker — which is why the shim
  # resolves the platform and passes its verdict on.
  case "${OSTYPE:-}" in
    msys* | cygwin*) MSYS_GUARD_PLATFORM="git-bash" ;;
    *) MSYS_GUARD_PLATFORM="other" ;;
  esac
fi

if [ "$MSYS_GUARD_PLATFORM" != "git-bash" ]; then
  cat >/dev/null 2>/dev/null
  echo "{}"
  exit 0
fi

# Persist stdin to a temp file to avoid passing large payloads via argv (E2BIG).
# Never fabricate a predictable /tmp name: stdin is redirected into it below, so
# a guessable name in a world-writable dir is a symlink-overwrite vector
# (CWE-377). Keep the `mktemp -t` form (unpredictable on both BSD and GNU); do
# NOT rewrite it as `mktemp <dir>/name.XXXXXX.json`, since BSD only substitutes
# a TRAILING run of X's.
TMP_FILE=$(mktemp -t msys-argv-guard-XXXXXX.json 2>/dev/null)
if [ -z "$TMP_FILE" ] || [ ! -e "$TMP_FILE" ]; then
  echo "msys-argv-guard: fail-open (temp-file-unavailable)" >&2
  cat >/dev/null 2>/dev/null
  echo "{}"
  exit 0
fi

cleanup() {
  rm -f "$TMP_FILE"
}
trap cleanup EXIT

# stdin is single-consumption — read it ONCE, here, before anything inspects it.
cat >"$TMP_FILE"

# ---------------------------------------------------------------------------
# The prefilter. THE PREFILTER NEVER DECIDES ANYTHING: it only decides whether
# a payload is worth a tsx bootstrap. Whether a matched command actually
# converts needs the lexer (segment splitting, wrapper heads, env assignments,
# the `a:b` shape), none of which a bash regex can model — so a shape-based
# short-circuit that ALLOWED would silently void this unit.
#
# It errs toward matching, and may only ever err that way: an unnecessary
# bootstrap costs latency, a skipped one costs the deny. Two conditions, both
# required, so the frequent half of each (`git` alone; the word `show` alone)
# does not carry the payload on its own. Both are cheap and both run only on
# Git Bash, where the unprefixed command is broken anyway.
#
# The verb grep stays UNCONDITIONAL rather than gaining a colon-shape third
# condition: a colon is not a necessary condition, since the checker denies
# `git show "origin/develop: .claude/x"`, which carries no adjacent colon-shape,
# so such a condition would convert a guaranteed superset into a heuristic.
#
# The trailing class must NOT exclude `.`: the checker's `resolveBinaryName`
# strips a `.exe`/`.cmd`/`.bat` suffix precisely so `git.exe` classifies as
# `git`, and excluding `.` would make every one of those spellings skip the
# bootstrap and run unguarded — the prefilter erring in the one direction the
# rule above forbids. `scripts/claude-hooks/msys-argv/msysArgvPrefilter.test.ts`
# reads BOTH greps out of this file and asserts every registry member and every
# modelled binary spelling still passes them, so the two copies cannot drift.
# ---------------------------------------------------------------------------
grep -qE -- '(^|[^[:alnum:]_-])(git)([^[:alnum:]_-]|$)' "$TMP_FILE" || {
  echo "{}"
  exit 0
}
grep -qE -- '(^|[^[:alnum:]_-])(show|cat-file|ls-tree|rev-parse)([^[:alnum:]_-]|$)' "$TMP_FILE" || {
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
  echo "msys-argv-guard: fail-open (toolchain-unavailable)" >&2
  echo "{}"
  exit 0
fi

TS_SCRIPT="scripts/claude-hooks/msys-argv-guard-check.ts"

if [ ! -f "$TS_SCRIPT" ]; then
  echo "msys-argv-guard: fail-open (toolchain-unavailable)" >&2
  echo "{}"
  exit 0
fi

# Registered with an explicit `"timeout": 5` in .claude/settings.json, matching
# the sibling Bash guards: a hook that EXCEEDS its timeout produces no decision,
# which reads as no-opinion — a structurally silent fail-open the platform gate
# and prefilter above exist to keep out of reach.
JSON_INPUT_FILE="$TMP_FILE" TSX_BIN="$TSX_BIN" \
  BLUMINT_MSYS_GUARD_PLATFORM="$MSYS_GUARD_PLATFORM" "$TSX_BIN" "$TS_SCRIPT"

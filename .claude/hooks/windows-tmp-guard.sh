#!/bin/bash
# PreToolUse hook for the Bash tool
# Denies a command that hands a /tmp literal to a child process to resolve for
# ITSELF — an -e/-c body or any read call inside a code string. On Git Bash the
# shell writes MSYS's /tmp and the child resolves the same string against the
# current drive, so the write succeeds and the read dies one command later
# naming a path nobody typed. The deny names the repo-local sink to move the
# capture to.
#
# Follows .claude/hooks/msys-argv-guard.sh, the established PreToolUse:Bash
# shape — platform gate first, pure-bash prefilter ahead of the tsx bootstrap,
# PROJECT_ROOT from BASH_SOURCE, stdin persisted to a `mktemp -t` file passed
# via JSON_INPUT_FILE, and FAIL OPEN on every bootstrap failure (print `{}`,
# exit 0, never `exit 1`), because a hook matched on `Bash` would otherwise
# wedge every command in the session.
#
# The platform gate runs before stdin is even read, because the REMEDY is
# platform-neutral and the REFUSAL is not: off Windows `/tmp` is genuinely one
# directory for the shell and for every child it spawns, so the flagged command
# WORKS there and denying it is new friction with no bug to prevent — this
# repo's own maintainer loop runs on the Linux box that would eat it.
#
# The verdict is resolved here and exported, rather than re-derived in the
# checker, for the reason detectGitBash.ts states: $OSTYPE is a bash shell
# variable rather than an exported one, so it is readable HERE and not in a
# child. BLUMINT_MSYS_GUARD_PLATFORM is deliberately the SAME variable the
# sibling guard uses — one platform question, one answer, one seam for tests to
# drive both arms through.
#
# stdin is still DRAINED on the way out. Exiting with an unread pipe is the one
# way this fast path could make itself felt on the platforms it exists to leave
# alone.

if [ -n "${BLUMINT_MSYS_GUARD_PLATFORM:-}" ]; then
  MSYS_GUARD_PLATFORM="$BLUMINT_MSYS_GUARD_PLATFORM"
elif [ -n "${MSYSTEM:-}" ]; then
  # Exported by Git Bash (MINGW64/MINGW32/MSYS), so it survives into children.
  MSYS_GUARD_PLATFORM="git-bash"
else
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
TMP_FILE=$(mktemp -t windows-tmp-guard-XXXXXX.json 2>/dev/null)
if [ -z "$TMP_FILE" ] || [ ! -e "$TMP_FILE" ]; then
  echo "windows-tmp-guard: fail-open (temp-file-unavailable)" >&2
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
# a payload is worth a tsx bootstrap. WHICH POSITION a /tmp literal occupies is
# the entire rule, and no bash regex can answer it — a redirect target, an argv
# element and a read call all carry the same four characters.
#
# It errs toward matching, and may only ever err that way: an unnecessary
# bootstrap costs latency, a skipped one costs the deny. ONE condition,
# deliberately. A second grep on the interpreter set (`node`, `python`) reads
# like a free narrowing and is not a NECESSARY condition — the checker convicts
# a read call inside ANY child's code string — so it would trade a guaranteed
# superset for a heuristic, in the one direction the rule above forbids.
#
# The leading class mirrors the checker's own ROOT_TMP prefix, which is what
# keeps the REMEDY off the bootstrap: `.claude/tmp/<scope>/x` carries `/tmp`
# preceded by a word character, so a corrected retry costs nothing. There is
# deliberately no trailing constraint — more permissive is the allowed
# direction. `scripts/claude-hooks/windows-tmp/windowsTmpPrefilter.test.ts`
# reads this grep out of this file and asserts every command the checker denies
# still passes it, so the two copies cannot drift.
# ---------------------------------------------------------------------------
grep -qE -- '(^|[^[:alnum:]_./-])/tmp' "$TMP_FILE" || {
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
  echo "windows-tmp-guard: fail-open (toolchain-unavailable)" >&2
  echo "{}"
  exit 0
fi

TS_SCRIPT="scripts/claude-hooks/windows-tmp-guard-check.ts"

if [ ! -f "$TS_SCRIPT" ]; then
  echo "windows-tmp-guard: fail-open (toolchain-unavailable)" >&2
  echo "{}"
  exit 0
fi

# Registered with an explicit `"timeout": 5` in .claude/settings.json, matching
# the sibling Bash guards: a hook that EXCEEDS its timeout produces no decision,
# which reads as no-opinion — a structurally silent fail-open the platform gate
# and prefilter above exist to keep out of reach.
JSON_INPUT_FILE="$TMP_FILE" TSX_BIN="$TSX_BIN" \
  BLUMINT_MSYS_GUARD_PLATFORM="$MSYS_GUARD_PLATFORM" "$TSX_BIN" "$TS_SCRIPT"

/**
 * PreToolUse hook for the `Bash` tool, refusing a command MSYS2's argument
 * conversion would silently rewrite before the program sees it.
 *
 * On Git Bash, `git show <ref>:<path>` arrives as `origin\develop;.claude\x`
 * and answers `unknown revision or path` — a false negative indistinguishable
 * from the file genuinely not existing at that ref. Doc-only fixes did not stop
 * it recurring in agora, so the rule is enforced here instead: the guard names
 * the exact corrected command, so one retry converges.
 *
 * Matched on `Bash`, so it sees every command in every session and subagent.
 * `.claude/hooks/msys-argv-guard.sh` gates on the platform and prefilters on
 * the verb set before resolving `tsx`, which keeps every non-Windows box — and
 * the overwhelmingly common command on a Windows one — off this file entirely.
 *
 * **Synchronous throughout**: an `async runCli` would break the `flushAndExit`
 * ordering.
 */
import stringify from 'safe-stable-stringify';
import { flushAndExit } from './flushAndExit';
import { isDirectExecution } from './isDirectExecution';
import { performMsysArgvGuard } from './msys-argv/performMsysArgvGuard';
import type { ClaudeCodePreToolUseInput } from './preToolUseInput';
import { readInput } from './readInput';

/**
 * CLI entry: runs the check and flushes the process. No-op when imported, so
 * importing this module has no side effects.
 *
 * **An unexpected error exits 0 and names only the reason CLASS**, the shape the
 * shim's own contract states: this hook fronts every Bash call, so a non-zero
 * exit is noise on a path that is already abstaining, and the error
 * object is command-derived content this guard must not echo. Nothing is
 * re-printed to stdout, because the realistic throw IS the stdout write — a
 * second one would escape the catch that exists to contain the first.
 */
export function runCli() {
  if (!isDirectExecution('msys-argv-guard-check.ts')) {
    return;
  }
  try {
    executeMain();
  } catch {
    console.error('msys-argv-guard: fail-open (unexpected-error)');
  }
  flushAndExit(0);
}

export function executeMain() {
  const input = readInput<ClaudeCodePreToolUseInput>();
  if (!input) {
    /**
     * Abstaining and deciding "no opinion" both print `{}`, so stdout alone
     * cannot tell an operator that a convertible command ran ungated. The
     * warning is the only signal that the guard never got to look.
     */
    console.error('msys-argv-guard: fail-open (unreadable-input)');
    console.log('{}');
    return;
  }

  console.log(stringify(performMsysArgvGuard(input, process.env)));
}

runCli();

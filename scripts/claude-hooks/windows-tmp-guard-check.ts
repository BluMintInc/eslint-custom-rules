/**
 * PreToolUse hook for the `Bash` tool, refusing a command that hands a `/tmp`
 * literal to a child process to resolve for ITSELF.
 *
 * On Git Bash the shell writes MSYS's `/tmp` while a native child resolves the
 * same string against the current drive, so the write succeeds and the read one
 * command later dies `ENOENT … 'C:\tmp\x'` — or, when `$(…)` swallows the dead
 * child's empty stdout, as a validation failure two commands downstream naming
 * neither `/tmp` nor a path.
 *
 * Matched on `Bash`, so it sees every command in every session and subagent.
 * `.claude/hooks/windows-tmp-guard.sh` gates on the platform and prefilters on
 * a rooted `/tmp` before resolving `tsx`, keeping every non-Windows box — and
 * the overwhelmingly common command on a Windows one — off this file entirely.
 *
 * **Synchronous throughout**: an `async runCli` would break the `flushAndExit`
 * ordering.
 */
import stringify from 'safe-stable-stringify';
import { flushAndExit } from './flushAndExit';
import { isDirectExecution } from './isDirectExecution';
import type { ClaudeCodePreToolUseInput } from './preToolUseInput';
import { readInput } from './readInput';
import { performWindowsTmpGuard } from './windows-tmp/performWindowsTmpGuard';

/**
 * CLI entry: runs the check and flushes the process. No-op when imported, so
 * importing this module has no side effects.
 */
export function runCli() {
  if (!isDirectExecution('windows-tmp-guard-check.ts')) {
    return;
  }
  try {
    executeMain();
    flushAndExit(0);
  } catch (error) {
    console.error('Error in Windows /tmp guard check:', error);
    flushAndExit(1);
  }
}

export function executeMain() {
  const input = readInput<ClaudeCodePreToolUseInput>();
  if (!input) {
    console.error('windows-tmp-guard: fail-open (unreadable-input)');
    console.log('{}');
    return;
  }

  console.log(stringify(performWindowsTmpGuard(input, process.env)));
}

runCli();

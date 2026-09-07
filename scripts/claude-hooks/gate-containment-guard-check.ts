/**
 * PreToolUse hook for the `Bash` tool, refusing a jest run this repo cannot
 * afford on a shared box.
 *
 * Two shapes: a whole-suite run through any launcher or npm script, and any run
 * that touches the governor's own environment. The reservation the pool never
 * sees is the whole failure — every governed check on the box sizes itself as
 * if that process were not there, which is how a machine running several agents
 * runs out of memory while every check reads green.
 *
 * Matched on `Bash`, so it sees every command in every session and subagent.
 * `.claude/hooks/gate-containment-guard.sh` prefilters before resolving `tsx`,
 * which keeps the overwhelmingly common command off this file entirely.
 *
 * **Synchronous throughout**: an `async runCli` would break the `flushAndExit`
 * ordering.
 */
import stringify from 'safe-stable-stringify';
import { flushAndExit } from './flushAndExit';
import { performGateContainmentGuard } from './gate-containment/performGateContainmentGuard';
import { isDirectExecution } from './isDirectExecution';
import type { ClaudeCodePreToolUseInput } from './preToolUseInput';
import { readInput } from './readInput';

/**
 * CLI entry: runs the check and flushes the process. No-op when imported, so
 * importing this module has no side effects.
 *
 * **The unexpected-error path exits 0 and names only the reason CLASS**, where
 * the two sibling entry points exit 1 and log the error object. Both
 * divergences are deliberate: this hook fronts every Bash call, so a non-zero
 * exit is noise on a path that is already abstaining, and the error object is
 * command-derived content this matcher must not echo. Nothing is re-printed to
 * stdout, because the realistic throw IS stdout — a second write there would
 * escape the catch that exists to contain the first.
 */
export function runCli() {
  if (!isDirectExecution('gate-containment-guard-check.ts')) {
    return;
  }
  try {
    executeMain();
  } catch {
    console.error('gate-containment-guard: fail-open (unexpected-error)');
  }
  flushAndExit(0);
}

export function executeMain() {
  const input = readInput<ClaudeCodePreToolUseInput>();
  if (!input) {
    /**
     * Abstaining and deciding "no opinion" both print `{}`, so stdout alone
     * cannot tell an operator that an unscoped run went unchallenged. The
     * warning is the only signal that the guard never got to look.
     */
    console.error('gate-containment-guard: fail-open (unreadable-input)');
    console.log('{}');
    return;
  }

  console.log(stringify(performGateContainmentGuard(input)));
}

runCli();

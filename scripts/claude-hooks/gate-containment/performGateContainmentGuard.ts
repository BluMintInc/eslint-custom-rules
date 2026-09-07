import type { ClaudeCodePreToolUseInput } from '../preToolUseInput';
import { readBashCommand } from '../readBashCommand';
import { buildGateContainmentDenyReason } from './buildGateContainmentDenyReason';
import { findGateContainmentOffenses } from './findGateContainmentOffenses';

/**
 * The `PreToolUse:Bash` decision function for an unscoped or ungoverned jest
 * run: given one hook payload, either a `deny` naming the command to retry
 * with, or `{}` — no opinion.
 *
 * **The branches are ordered, and the order is semantic:**
 *
 * 0. Not a `Bash` call — nothing to read.
 * 1. An unreadable payload or command — fail open, loudly.
 * 2. A run this repo cannot afford — deny, naming the rewrite.
 * 3. Everything else — `{}`.
 *
 * There is no platform gate, unlike the two `Bash` guards that carry one: the
 * memory budget is machine-global on every platform the team develops on, so
 * both the refusal and its remedy are platform-neutral.
 *
 * **Fail open, never deny, on anything unreadable.** This hook sits in front of
 * every Bash call, so a deny on a lexer limitation would wedge a session over a
 * command that may be perfectly fine. Each fail-open writes one stderr line
 * naming the reason CLASS — never the command, which this hook sees for every
 * session and subagent and which routinely carries credentials.
 *
 * **The deny payload is built inline**, not by a helper: returning a helper's
 * object makes TypeScript union `{}` with the deny shape and subtype-reduce the
 * whole thing to `{}`, silently erasing the contract for every consumer.
 */
export function performGateContainmentGuard(input: ClaudeCodePreToolUseInput) {
  if (input.tool_name !== 'Bash') {
    return {} as const;
  }

  const read = readBashCommand(input);
  if (read.kind === 'unreadable') {
    warnFailOpen(read.reason);
    return {} as const;
  }

  const found = findGateContainmentOffenses(read.command);
  if (found.kind === 'unreadable') {
    warnFailOpen(found.reason);
    return {} as const;
  }

  /**
   * The FIRST offense only, so the reason stays a single deterministic edit
   * rather than a list to reconcile — and because a compound command's later
   * segments are re-checked the moment the corrected command is retried.
   */
  const [offense] = found.offenses;
  if (offense === undefined) {
    return {} as const;
  }

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: buildGateContainmentDenyReason(offense),
    },
  } as const;
}

/**
 * One stderr line per fail-open, naming the reason CLASS and nothing else, in
 * the same `fail-open (<cause>)` format `.claude/hooks/gate-containment-guard.sh`
 * emits for its own bootstrap failures — keep the two greppable together.
 */
function warnFailOpen(reason: string) {
  console.error(`gate-containment-guard: fail-open (${reason})`);
}

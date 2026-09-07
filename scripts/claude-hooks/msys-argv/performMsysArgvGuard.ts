import type { ClaudeCodePreToolUseInput } from '../preToolUseInput';
import { readBashCommand } from '../readBashCommand';
import { buildMsysArgvDenyReason } from './buildMsysArgvDenyReason';
import { detectGitBash } from './detectGitBash';
import { findMsysArgvOffenses } from './findMsysArgvOffenses';

/**
 * The `PreToolUse:Bash` decision function for MSYS2 argument conversion: given
 * one hook payload and an environment, either a `deny` naming the exact
 * corrected command, or `{}` — no opinion.
 *
 * **The branches are ordered, and the order is semantic:**
 *
 * 0. Not a `Bash` call — nothing to read.
 * 1. **Not Git Bash — no opinion, before anything else is even looked at.**
 *    First deliberately, so that on Linux and macOS this guard emits nothing at
 *    all: no deny, and no fail-open line for a payload shape it would never
 *    have had an opinion about. The remedy it prescribes is inert off Windows,
 *    but a REFUSAL is not.
 * 2. An unreadable payload or command — fail open, loudly.
 * 3. A command carrying a convertible argument — deny, naming the retry.
 * 4. Everything else — `{}`.
 *
 * **Fail open, never deny, on anything unreadable.** Each fail-open writes one
 * stderr line naming the reason CLASS — never the command, which this hook sees
 * for every session and subagent and which routinely carries credentials.
 *
 * **The deny payload is built inline**, not by a helper, whose object would make
 * TypeScript union `{}` with the deny shape and subtype-reduce the whole thing
 * to `{}`, silently erasing the contract for every consumer.
 */
export function performMsysArgvGuard(
  input: ClaudeCodePreToolUseInput,
  env: Record<string, string | undefined>,
) {
  if (input.tool_name !== 'Bash' || !detectGitBash(env)) {
    return {} as const;
  }

  const read = readBashCommand(input);
  if (read.kind === 'unreadable') {
    warnFailOpen(read.reason);
    return {} as const;
  }

  const found = findMsysArgvOffenses(read.command);
  if (found.kind === 'unreadable') {
    warnFailOpen(found.reason);
    return {} as const;
  }

  /**
   * The FIRST offense only, so the reason stays a single deterministic edit
   * rather than a list the agent has to reconcile — and because a compound
   * command's later segments are re-checked the moment the corrected command is
   * retried.
   */
  const [offense] = found.offenses;
  if (offense === undefined) {
    return {} as const;
  }

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: buildMsysArgvDenyReason(offense),
    },
  } as const;
}

/**
 * One stderr line per fail-open, naming the reason CLASS and nothing else, in
 * the same `fail-open (<cause>)` format `.claude/hooks/msys-argv-guard.sh`
 * emits for its own bootstrap failures — keep the two greppable together.
 */
function warnFailOpen(reason: string) {
  console.error(`msys-argv-guard: fail-open (${reason})`);
}

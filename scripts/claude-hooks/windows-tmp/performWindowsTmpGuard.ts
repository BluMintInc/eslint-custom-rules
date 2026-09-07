import { detectGitBash } from '../msys-argv/detectGitBash';
import type { ClaudeCodePreToolUseInput } from '../preToolUseInput';
import { readBashCommand } from '../readBashCommand';
import { buildWindowsTmpDenyReason } from './buildWindowsTmpDenyReason';
import { findWindowsTmpChildReads } from './findWindowsTmpChildReads';

/**
 * The `PreToolUse:Bash` decision for a `/tmp` literal a child process resolves
 * for itself: a `deny` naming the sink to move the capture to, or `{}` for no
 * opinion.
 *
 * The platform gate is first because the REMEDY is platform-neutral and the
 * REFUSAL is not: off Windows `/tmp` is one directory for the shell and for
 * every child it spawns, so the flagged command works and denying it is
 * friction with no bug to prevent — on the Linux box this repo's own maintainer
 * loop runs on, among others.
 *
 * The deny payload is built inline rather than returned by a helper, whose
 * object would make TypeScript union `{}` with the deny shape and
 * subtype-reduce the whole thing to `{}`, silently erasing the contract for
 * every consumer.
 */
export function performWindowsTmpGuard(
  input: ClaudeCodePreToolUseInput,
  env: Record<string, string | undefined>,
) {
  if (input.tool_name !== 'Bash' || !detectGitBash(env)) {
    return {} as const;
  }

  const read = readBashCommand(input);
  if (read.kind === 'unreadable') {
    /**
     * Abstaining and deciding "no opinion" both print `{}`, so stdout alone
     * cannot tell an operator the guard never got to look. The stderr line is
     * the whole compensating control for failing open.
     */
    console.error(`windows-tmp-guard: fail-open (${read.reason})`);
    return {} as const;
  }

  const [offense] = findWindowsTmpChildReads(read.command);
  if (offense === undefined) {
    return {} as const;
  }

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: buildWindowsTmpDenyReason(offense),
    },
  } as const;
}

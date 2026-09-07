import { formatBacktickedList } from '../formatBacktickedList';
import { quoteShellToken } from './formatShellSegment';
import type { MsysArgvOffense, MsysArgvRetry } from './types';

/**
 * The blanket-prefix warning both cross-product arms share. Stated as the
 * argv-SCOPE fact rather than as a rule about this one command, because that is
 * what a reader needs in order to recognize the next instance.
 */
const CONFLICT_WARNING =
  '`MSYS_NO_PATHCONV=1` suppresses conversion for the WHOLE argv of a command, so prefixing this one as written also breaks' as const;

/**
 * What MSYS2 does to a `<ref>:<path>` argument. Stated rather than looked up by
 * family: the union has one member here, and a lookup keyed on it would buy no
 * extensibility a second member could not add in one edit.
 */
const GIT_REF_PATH_CAUSE =
  'MSYS2 rewrites it into a Windows path LIST before git sees it — the colon becomes `;` and every `/` becomes `\\` — so git answers `unknown revision or path` about a file that may well exist' as const;

const DOCTRINE_REFERENCE =
  'The `MSYS_NO_PATHCONV=1` prefix is a verified no-op on Linux and macOS. See .claude/skills/shell-portability/SKILL.md.' as const;

/**
 * The deny text an agent reads off the tool result.
 *
 * **Written for an opaque delivery.** A `PreToolUse:Bash` deny frequently
 * surfaces to the agent as a bare "permission denied" naming no rule, so the
 * corrected command leads and the rationale follows it. Even wholly unread, the
 * deny is the better failure: it is loud, where the command it replaces answers
 * `unknown revision or path` about a file that exists.
 */
export function buildMsysArgvDenyReason(offense: MsysArgvOffense) {
  const { argument, retry } = offense;
  return [
    `\`${argument}\` is not a path on this machine, but ${GIT_REF_PATH_CAUSE}.`,
    describeRetry(retry),
    DOCTRINE_REFERENCE,
  ].join('\n\n');
}

function describeRetry(retry: MsysArgvRetry) {
  if (retry.kind === 'prefix') {
    return `Retry with:\n\n  MSYS_NO_PATHCONV=1 ${retry.command}`;
  }
  if (retry.kind === 'split') {
    return `${CONFLICT_WARNING} \`${
      retry.directory
    }\`, which IS a filesystem path. Split it instead:\n\n  cd ${quoteShellToken(
      retry.directory,
    )} && MSYS_NO_PATHCONV=1 ${retry.command}`;
  }
  return describeRewrite(retry.conflicting);
}

/**
 * Deliberately NOT a pasteable line, unlike the two arms above.
 *
 * Only the author knows what `/c/…` is on this machine, so the guard cannot
 * compute the `C:/…` form — and printing `MSYS_NO_PATHCONV=1 <the unchanged
 * command>` beneath an instruction to rewrite one of its arguments is the shape
 * a hurried reader copies WITHOUT the rewrite, arriving at exactly the blanket
 * prefix the sentence above it forbids. So the remedy is two ordered steps with
 * a placeholder standing where the value must be substituted, and the command
 * that would otherwise be copied never appears in runnable form.
 *
 * EVERY conflicting path is named. Naming one of several yields a remedy that,
 * followed exactly, still breaks the rest — while reading as complete.
 */
function describeRewrite(conflicting: readonly string[]) {
  const [first, ...rest] = conflicting;
  if (first === undefined) {
    /** Unreachable: the rewrite arm is only built from a non-empty conflict
     * list. Kept as a throw rather than a fallback so a future caller that
     * breaks that invariant fails loudly instead of emitting a message naming
     * no path at all. */
    throw new Error('a rewrite retry must name at least one conflicting path');
  }
  const listed = formatBacktickedList(first, rest);
  const arePlural = rest.length > 0;
  return `${CONFLICT_WARNING} ${listed}, which ${
    arePlural ? 'ARE filesystem paths' : 'IS a filesystem path'
  } — and no \`cd\` expresses ${
    arePlural ? 'them' : 'this one'
  }, so there is no command to paste. Two steps, in order: (1) replace ${listed} with ${
    arePlural ? 'their' : 'its'
  } \`C:/…\` forward-slash form, which needs no conversion — only you know what that path is on this machine; (2) then prefix the rewritten command:\n\n  MSYS_NO_PATHCONV=1 <the command, with ${listed} replaced by ${
    arePlural ? 'their' : 'its'
  } C:/… form>`;
}

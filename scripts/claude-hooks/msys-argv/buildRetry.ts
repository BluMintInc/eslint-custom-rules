import { findAbsoluteOperands } from './findPrefixConflict';
import { formatShellSegment } from './formatShellSegment';
import type { MsysArgvConflict } from './types';

/** The env assignment that already suppresses the conversion. Its presence on a
 * segment is what makes the guard's retry converge in exactly one hop. */
export const PATHCONV_ENV = 'MSYS_NO_PATHCONV' as const;

/** Drops a leading `MSYS_NO_PATHCONV=…` assignment, so a remedy that adds its
 * own prefix never publishes the token twice. */
export function stripPathconvAssignment(tokens: readonly string[]) {
  return tokens.filter((token) => {
    return !token.startsWith(`${PATHCONV_ENV}=`);
  });
}

/**
 * The command to publish back. A sole-segment command is re-published
 * VERBATIM — the agent's own bytes, quoting intact — because a re-quoted
 * reconstruction of the command they just typed reads as a different command
 * and costs a round of comparison. Only a multi-segment command is rebuilt, and
 * only the offending segment of it.
 *
 * A segment that ALREADY carries the prefix is rebuilt rather than republished
 * verbatim: `tokens` arrives with that assignment already dropped, so the
 * rebuild is what keeps the remedy from publishing the prefix twice.
 */
export function buildRetry(context: {
  readonly tokens: readonly string[];
  readonly conflict: MsysArgvConflict | undefined;
  readonly command: string;
  readonly isSoleSegment: boolean;
  readonly isSuppressed: boolean;
  readonly binaryIndex: number;
  readonly argumentIndex: number;
}) {
  const { tokens, conflict, isSuppressed, isSoleSegment, command } = context;
  const segmentCommand =
    isSoleSegment && !isSuppressed
      ? command.trim()
      : formatShellSegment(tokens);
  if (conflict === undefined) {
    return { kind: 'prefix', command: segmentCommand } as const;
  }
  if (conflict.source === 'operand') {
    return {
      kind: 'rewrite',
      conflicting: conflict.argument,
      command: segmentCommand,
    } as const;
  }
  return buildDirectoryRetry({ ...context, conflict, segmentCommand });
}

/**
 * The `-C <absolute>` case, where a `cd` reproduces the removed argument
 * exactly — but only when removing it leaves NOTHING a blanket prefix would
 * still break. A second `-C`, or any other absolute-valued argument, survives
 * that removal, and publishing `cd <dir> && MSYS_NO_PATHCONV=1 <command still
 * carrying /abs>` hands back the very blanket prefix the message forbids one
 * sentence earlier. The fallback enumerates every survivor, the removed `-C`
 * value included, since the published command no longer carries the `cd`.
 */
function buildDirectoryRetry(context: {
  readonly tokens: readonly string[];
  readonly conflict: Extract<MsysArgvConflict, { source: 'directory-flag' }>;
  readonly segmentCommand: string;
  readonly binaryIndex: number;
  readonly argumentIndex: number;
}) {
  const { tokens, conflict, segmentCommand, binaryIndex, argumentIndex } =
    context;
  const withoutDirectory = tokens.filter((_token, index) => {
    return index !== conflict.optionIndex && index !== conflict.optionIndex + 1;
  });
  const residual = findAbsoluteOperands(
    tokens,
    binaryIndex,
    argumentIndex,
  ).filter((value) => {
    return value !== conflict.argument;
  });
  if (residual.length > 0) {
    return {
      kind: 'rewrite',
      conflicting: [conflict.argument, ...residual],
      command: segmentCommand,
    } as const;
  }
  return {
    kind: 'split',
    directory: conflict.argument,
    command: formatShellSegment(withoutDirectory),
  } as const;
}

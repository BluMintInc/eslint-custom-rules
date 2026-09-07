import { indexTokens } from './indexTokens';
import { resolvePosixAbsoluteValue } from './msysArgvShapes';
import type { LocatedCandidate } from './types';

/**
 * The arguments in the SAME segment that a blanket `MSYS_NO_PATHCONV=1` would
 * break — the case a naive guard gets wrong, since the prefix suppresses
 * conversion for the command's WHOLE argv rather than for the one argument the
 * author meant to protect.
 *
 * Same-segment only, because that argv scope is exactly one command's: the
 * `cd /abs && git show <ref>:<path>` form an agent already writes carries no
 * conflict, and is in fact the remedy this function's `directory-flag` arm
 * routes toward.
 */
export function findPrefixConflict(
  tokens: readonly string[],
  binaryIndex: number,
  located: LocatedCandidate,
) {
  const { directoryOption, argumentIndex } = located;
  if (directoryOption !== undefined) {
    return {
      source: 'directory-flag',
      argument: directoryOption.value,
      optionIndex: directoryOption.optionIndex,
    } as const;
  }
  const argument = findAbsoluteOperands(tokens, binaryIndex, argumentIndex);
  if (argument.length === 0) {
    return;
  }
  return { source: 'operand', argument } as const;
}

/**
 * EVERY POSIX-absolute value the segment carries besides the convertible
 * argument itself — never just the first. The prefix is argv-wide, so a message
 * naming one of two absolute paths is a remedy that, followed exactly, still
 * breaks the other, and reads as complete while doing so.
 *
 * Sliced past the binary: argv[0] is the program to exec and is never subject
 * to MSYS argument conversion, so an absolute-path binary is not a conflict and
 * reporting it would suppress the executable `split` remedy in favour of a
 * substitution the reader cannot perform.
 *
 * Mapped to the VALUE before the search rather than after: an `=`-joined option
 * carries its path inside, and a message naming the whole token where the
 * reader needs the path is about the wrong string.
 */
export function findAbsoluteOperands(
  tokens: readonly string[],
  binaryIndex: number,
  argumentIndex: number,
) {
  return indexTokens(tokens)
    .slice(binaryIndex + 1)
    .filter(({ index }) => {
      return index !== argumentIndex;
    })
    .flatMap(({ value }) => {
      const absolute = resolvePosixAbsoluteValue(value);
      return absolute === undefined ? [] : [absolute];
    });
}

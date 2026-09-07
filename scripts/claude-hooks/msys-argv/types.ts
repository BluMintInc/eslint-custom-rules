/**
 * The command family whose argument at the matched position is known never to
 * be a path on this machine — the whole basis for deciding by text.
 *
 * agora models a second, `firebase-rtdb-path`. This repo runs no firebase CLI,
 * so carrying it would buy a `tsx` bootstrap for a command the checker has no
 * rule for. Kept as a one-member union rather than collapsed to nothing,
 * because the family is what pairs an argv SHAPE with the commands whose
 * argument at that position is never a local path — and a second family is then
 * a data edit rather than a redesign.
 */
export const MSYS_ARGV_FAMILY_VALUES = ['git-ref-path'] as const;
export type MsysArgvFamily = typeof MSYS_ARGV_FAMILY_VALUES[number];

/** How the agent should re-issue the command. */
export type MsysArgvRetry =
  /** `MSYS_NO_PATHCONV=1 <command>` — the ordinary single-argument case. */
  | { readonly kind: 'prefix'; readonly command: string }
  /**
   * `cd <directory> && MSYS_NO_PATHCONV=1 <command>` — the cross-product case,
   * where a blanket prefix would ALSO suppress conversion of a genuine
   * filesystem path in the same argv.
   */
  | {
      readonly kind: 'split';
      readonly directory: string;
      readonly command: string;
    }
  /**
   * Doctrine's other lane, for a cross-product a `cd` cannot express: hand each
   * conflicting argument its `C:/…` forward-slash form, which needs no
   * conversion, and only then prefix.
   *
   * `conflicting` is a LIST because the prefix suppresses conversion for the
   * whole argv: a message naming one of two absolute paths is a remedy that,
   * followed exactly, still breaks the other — silently, since it reads as
   * complete.
   */
  | {
      readonly kind: 'rewrite';
      readonly conflicting: readonly string[];
      readonly command: string;
    };

/** One command MSYS2 would rewrite before the program's `main` sees it. */
export type MsysArgvOffense = {
  readonly family: MsysArgvFamily;
  readonly verb: string;
  readonly argument: string;
  readonly retry: MsysArgvRetry;
};

/**
 * A `-C <absolute>` recorded on the walk to git's verb. Carried separately from
 * the ordinary operand scan because it is the one conflict a `cd` reproduces
 * exactly, which is what makes the SPLIT remedy executable.
 */
export type DirectoryOption = {
  readonly optionIndex: number;
  readonly value: string;
};

/** The convertible argument a segment carries, before any remedy is chosen. */
export type LocatedCandidate = {
  readonly verb: string;
  readonly argumentIndex: number;
  readonly argument: string;
  readonly directoryOption?: DirectoryOption;
};

/**
 * One lexed token paired with its position in the segment, so a walk that must
 * report WHERE it found something carries the index alongside the value instead
 * of threading a second counter through every predicate.
 */
export type IndexedToken = {
  readonly index: number;
  readonly value: string;
};

/**
 * The arguments in the SAME segment that a blanket prefix would break.
 *
 * `argument` is a LIST on the operand arm for the reason the rewrite retry
 * states: the prefix is argv-wide, so naming one of several absolute paths
 * yields a remedy that still breaks the rest.
 */
export type MsysArgvConflict =
  | { readonly source: 'operand'; readonly argument: readonly string[] }
  | {
      readonly source: 'directory-flag';
      readonly argument: string;
      readonly optionIndex: number;
    };

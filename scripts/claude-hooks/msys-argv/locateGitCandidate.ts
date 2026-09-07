import { indexTokens } from './indexTokens';
import { isPathListShaped } from './msysArgvShapes';
import type { DirectoryOption, IndexedToken, LocatedCandidate } from './types';

/**
 * The verb set doctrine names for the `<ref>:<path>` argument shape.
 *
 * Deliberately closed: a verb whose operand is a real working-tree path
 * (`git add`, `git checkout`) must never be told to suppress conversion.
 *
 * Exported for `msysArgvPrefilter.test.ts`, which asserts every member still
 * passes the shim's bash prefilter — a verb added here is otherwise silently
 * inert on the only platform this guard runs on.
 */
export const GIT_REF_PATH_VERBS = new Set([
  'show',
  'cat-file',
  'ls-tree',
  'rev-parse',
]);

/** git globals consuming the FOLLOWING token, so the walk to the verb does not
 * mistake an option's value for it. */
const GIT_VALUE_OPTIONS = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--exec-path',
  '--config-env',
]);

/**
 * The one global whose value a `cd` reproduces exactly, which is what makes the
 * SPLIT remedy executable. `--git-dir`/`--work-tree` are absent on purpose:
 * their absolute values are still caught, as ordinary operands, and routed to
 * the rewrite lane rather than to a `cd` that would not be equivalent.
 */
const GIT_CHANGE_DIRECTORY_OPTION = '-C' as const;

/** After this, git's operands are pathspecs rather than `<ref>:<path>` reads. */
const PATHSPEC_SEPARATOR = '--' as const;

/**
 * Where a git read's convertible argument sits, and what else in its argv a
 * blanket prefix would break.
 */
export function locateGitCandidate(
  tokens: readonly string[],
  binaryIndex: number,
) {
  const indexed = indexTokens(tokens);
  const head = walkGitGlobals(indexed, binaryIndex + 1);
  if (head === undefined || !GIT_REF_PATH_VERBS.has(head.verb.value)) {
    return;
  }
  const argument = findGitArgument(indexed, head.verb.index + 1);
  if (argument === undefined) {
    return;
  }
  /** Annotated on a local rather than returned with a `satisfies`, which this
   * repo's prettier is too old to parse. */
  const candidate: LocatedCandidate = {
    verb: head.verb.value,
    argumentIndex: argument.index,
    argument: argument.value,
    directoryOption: head.directoryOption,
  };
  return candidate;
}

/** The first convertible operand, or `undefined` once `--` proves the rest are
 * pathspecs. */
function findGitArgument(indexed: readonly IndexedToken[], start: number) {
  const operands = indexed.slice(start);
  const separator = operands.findIndex(({ value }) => {
    return value === PATHSPEC_SEPARATOR;
  });
  const searchable = separator === -1 ? operands : operands.slice(0, separator);
  return searchable.find(({ value }) => {
    return isPathListShaped(value);
  });
}

/**
 * Walks git's pre-subcommand globals to the verb, recording a `-C <absolute>`
 * on the way — without it the cross-product case is not even detectable, since
 * `show` sits at token 3 rather than token 1.
 *
 * An unrecognized flag is consumed as a boolean, and that is the walk's whole
 * error budget. Two outcomes follow, both benign: a genuinely boolean global is
 * skipped and the verb is found, while a VALUE-taking global this list omits
 * leaves its value standing in verb position, where it fails the verb-set test
 * and the whole segment is silently ALLOWED. That is the fail-open direction —
 * a walk that guessed an unknown flag's arity would eventually name the wrong
 * token as the convertible argument and publish a retry that is not the
 * author's command. Growing this list converts a fail-open into a deny, never a
 * correctness fix.
 */
function walkGitGlobals(indexed: readonly IndexedToken[], start: number) {
  let directoryOption: DirectoryOption | undefined;
  /** The value-taking option whose value the NEXT token is, so a `-C <dir>`
   * pair is consumed without index arithmetic. */
  let pendingOption: IndexedToken | undefined;
  for (const token of indexed.slice(start)) {
    if (pendingOption !== undefined) {
      directoryOption ??= readDirectoryOption(pendingOption, token);
      pendingOption = undefined;
      continue;
    }
    if (!token.value.startsWith('-')) {
      return { verb: token, directoryOption } as const;
    }
    if (!token.value.includes('=') && GIT_VALUE_OPTIONS.has(token.value)) {
      pendingOption = token;
    }
  }
  /** No verb before the segment ended — a truncated option (`git -C`) or a
   * command that never reaches a subcommand (`git --version`). */
}

/** A `-C` whose value is POSIX-absolute — the only conflict a `cd` reproduces. */
function readDirectoryOption(option: IndexedToken, value: IndexedToken) {
  if (
    option.value !== GIT_CHANGE_DIRECTORY_OPTION ||
    !value.value.startsWith('/')
  ) {
    return;
  }
  return { optionIndex: option.index, value: value.value } as const;
}

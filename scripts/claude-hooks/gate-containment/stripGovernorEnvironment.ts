import type { ParseEntry } from 'shell-quote';
import {
  formatShellSegment,
  quoteShellToken,
} from '../msys-argv/formatShellSegment';
import { namesOption } from '../readOptionName';
import {
  FILE_DESCRIPTOR_PATTERN,
  REDIRECT_OPERATORS,
} from '../splitShellSegments';

/**
 * The variables this repo's governor participation hangs on, as a FAMILY rather
 * than a list. A rule naming the four spellings a transcript happens to show is
 * a rule the next spelling walks past, and the next spelling is cheap:
 * `BLUMINT_GOVERNOR_STATE_DIR=/tmp/x` moves a run to a private pool exactly as
 * silently as unsetting the CLI path does.
 */
const GOVERNOR_NAME_PREFIX = 'BLUMINT_GOVERNOR_' as const;

const GOVERNOR_NAMES: ReadonlySet<string> = new Set([
  /** The grant the governor hands a jest run; overriding either re-sizes the
   * fleet the admission just costed. */
  'BLUMINT_MAX_WORKERS',
  'BLUMINT_WORKER_BUDGET_MB',
  /** What lets the governor's own CLI resolve its imports from this directory.
   * Without it the client degrades to an ungoverned run. */
  'TSX_TSCONFIG_PATH',
  'CI',
] as const);

/** The operators this unit can re-emit. Anything else — a redirect, a subshell
 * — leaves a command it cannot republish faithfully. */
const SPLIT_OPERATORS: ReadonlySet<string> = new Set([
  '&&',
  '||',
  ';',
  '|',
  '&',
] as const);

/** A backtick survives `shell-quote` as an ordinary character, so a command
 * substitution needs its own test: the token text is not what would reach the
 * program. */
const COMMAND_SUBSTITUTION_CHARACTER = '`' as const;

const ENV_ASSIGNMENT_PATTERN = /^[A-Z_a-z]\w*=/;

/** The shell builtins whose operands are bare variable NAMES rather than a
 * command. */
const NAME_LIST_BUILTINS: ReadonlySet<string> = new Set(['unset', 'export']);

const ENV_BINARY = 'env' as const;
const ENV_UNSET_OPTIONS = ['-u', '--unset'] as const;

type Piece = {
  tokens: readonly string[];
  /** The redirections decorating this segment, already re-assembled
   * (`2>&1`, `>/tmp/out.log`). Kept apart from `tokens` because they are shell
   * syntax rather than argv: quoting `>` would emit `'>'`, which redirects
   * nothing. */
  redirects: readonly string[];
  /** The operator that FOLLOWS this segment, kept so a surviving neighbour is
   * re-emitted with the join the author wrote. */
  operator: string | undefined;
};

const emptyPiece = (): Piece => ({
  tokens: [],
  redirects: [],
  operator: undefined,
});

/**
 * The same command with every governor-family assignment, unset and `env`
 * option removed — the rewrite the environment rule publishes.
 *
 * Three outcomes, and the distinction between the last two is what keeps an
 * ordinary command quiet: `clean` means the command touches none of these names
 * and is nobody's offense, while `unreadable` means it touches one and this
 * lexer cannot re-emit the result faithfully. Reporting a command with no
 * family name as unreadable would put a fail-open line in front of every
 * `npx jest "$FILES"` in the session.
 *
 * A remedy is only worth publishing while it is FAITHFUL, so an expansion or a
 * backtick abstains rather than handing back a command the author never wrote.
 * A redirection is MODELLED rather than abstained on, because abstaining there
 * fails the rule open on `env -u BLUMINT_GOVERNOR_CLI npx jest x 2>&1 | tail`
 * — the incident's own spelling behind the suffix an agent appends to nearly
 * every long command.
 */
export function stripGovernorEnvironment(tokens: readonly ParseEntry[]) {
  const removed: string[] = [];
  const pieces: Piece[] = [emptyPiece()];
  let isUnreadable = false;
  /** Set when a redirection operator is consumed and cleared by the word that
   * follows it, mirroring `splitShellSegments`: the target is always the very
   * next entry, so one bit of state reads it. */
  let pendingRedirect: string | undefined;

  for (const token of tokens) {
    const piece = pieces[pieces.length - 1];
    if (pendingRedirect !== undefined) {
      const operator = pendingRedirect;
      pendingRedirect = undefined;
      /** An operator standing where a target belongs (`>|`) leaves a redirect
       * that cannot be re-emitted, so no faithful remedy exists. */
      if (typeof token !== 'string') {
        isUnreadable = true;
        continue;
      }
      piece.redirects = [
        ...piece.redirects,
        `${operator}${quoteShellToken(token)}`,
      ];
      continue;
    }
    if (typeof token === 'string') {
      isUnreadable ||=
        token.length === 0 || token.includes(COMMAND_SUBSTITUTION_CHARACTER);
      piece.tokens = [...piece.tokens, token];
      continue;
    }
    if ('op' in token && REDIRECT_OPERATORS.has(token.op)) {
      pendingRedirect = `${takeFileDescriptor(piece)}${token.op}`;
      continue;
    }
    /**
     * An unmodelled construct still ENDS the segment rather than aborting the
     * walk: the family names on either side of it must still be found, or a
     * command carrying both a subshell and a governor strip would report clean.
     */
    if (!('op' in token) || !SPLIT_OPERATORS.has(token.op)) {
      isUnreadable = true;
      pieces.push(emptyPiece());
      continue;
    }
    piece.operator = token.op;
    pieces.push(emptyPiece());
  }

  /** A redirection with no target ran off the end of the command, which is not
   * a shape any remedy can reproduce. */
  isUnreadable ||= pendingRedirect !== undefined;

  const survivors = pieces.flatMap((piece) => {
    const stripped = stripSegment(piece.tokens, removed);
    /** A segment emptied by the strip goes with the operator that joined it —
     * and with its own redirections, which decorated the command that left. */
    return stripped.length === 0 ? [] : [{ ...piece, tokens: stripped }];
  });

  if (removed.length === 0) {
    return { kind: 'clean' } as const;
  }
  if (isUnreadable) {
    return { kind: 'unreadable' } as const;
  }
  return {
    kind: 'stripped',
    command: formatPieces(survivors),
    removed,
  } as const;
}

/**
 * The single-digit word a redirection was written against, removed from the
 * segment it would otherwise be an argument of. `shell-quote` reports adjacency
 * nowhere — `cmd 2>f` and `cmd 2 >f` tokenize identically — so `cmd 2 >f`
 * re-emits as `cmd 2>f`, the same assumption `splitShellSegments` already makes
 * when it discards the descriptor outright.
 */
function takeFileDescriptor(piece: Piece) {
  const last = piece.tokens[piece.tokens.length - 1];
  if (typeof last !== 'string' || !FILE_DESCRIPTOR_PATTERN.test(last)) {
    return '';
  }
  piece.tokens = piece.tokens.slice(0, -1);
  return last;
}

function formatPieces(survivors: readonly Piece[]) {
  return survivors
    .map(({ tokens, redirects, operator }, index) => {
      const segment = [formatShellSegment(tokens), ...redirects].join(' ');
      /** The LAST survivor's operator is dropped: it joined a segment the strip
       * removed, so re-emitting it would end the command on a dangling `&&`. */
      return index === survivors.length - 1 || operator === undefined
        ? segment
        : `${segment} ${operator}`;
    })
    .join(' ');
}

/**
 * One segment's strip, in the order a shell reads it: the leading `NAME=value`
 * run, then an `env` wrapper's own options, then a `unset`/`export` operand
 * list. One pass rather than the loop `resolveInvocationHead` runs, because a
 * second `env` behind the first sets nothing this rule convicts on.
 */
function stripSegment(tokens: readonly string[], removed: string[]) {
  const { kept, index } = stripLeadingAssignments(tokens, removed);
  const head = tokens[index];
  if (head === ENV_BINARY) {
    return stripEnvWrapper(tokens, index, kept, removed);
  }
  if (NAME_LIST_BUILTINS.has(head)) {
    const names = stripNameList(tokens.slice(index + 1), removed);
    /** A builtin left with no names to act on did nothing, so the segment goes
     * rather than surviving as a bare `unset`. */
    return names.length === 0 ? [] : [...kept, head, ...names];
  }
  return [...kept, ...tokens.slice(index)];
}

function stripLeadingAssignments(tokens: readonly string[], removed: string[]) {
  const kept: string[] = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!ENV_ASSIGNMENT_PATTERN.test(token)) {
      break;
    }
    recordOrKeep(token.slice(0, token.indexOf('=')), token, kept, removed);
    index += 1;
  }
  return { kept, index } as const;
}

/**
 * `env`'s own run: its flags, its `-u NAME` removals and the `NAME=value`
 * assignments it sets, up to the wrapped command. A wrapper left holding none
 * of its own options is a no-op that would read as a surviving prefix, so it
 * goes with the option it carried.
 */
function stripEnvWrapper(
  tokens: readonly string[],
  envIndex: number,
  leading: readonly string[],
  removed: string[],
) {
  const kept: string[] = [];
  let index = envIndex + 1;
  while (index < tokens.length) {
    const token = tokens[index];
    const unset = readEnvUnset(token);
    if (unset !== undefined) {
      index = stripEnvUnset(tokens, index, unset.attachedName, kept, removed);
      continue;
    }
    if (ENV_ASSIGNMENT_PATTERN.test(token)) {
      recordOrKeep(token.slice(0, token.indexOf('=')), token, kept, removed);
      index += 1;
      continue;
    }
    if (!token.startsWith('-')) {
      break;
    }
    kept.push(token);
    index += 1;
  }
  const wrapper = kept.length === 0 ? [] : [ENV_BINARY, ...kept];
  return [...leading, ...wrapper, ...tokens.slice(index)];
}

/**
 * Whether a token is one of env's unset options, and the name it carries when
 * the spelling attaches one.
 *
 * Four spellings, not two: `-u NAME`, `--unset NAME`, `--unset=NAME` and
 * `-uNAME`. The last is real GNU syntax one deleted space from the spelling
 * this repo's incident was built on, and reading it as an unknown flag lets the
 * strip walk straight past the name it exists to remove.
 */
function readEnvUnset(token: string) {
  for (const option of ENV_UNSET_OPTIONS) {
    if (namesOption(token, option)) {
      const equalsIndex = token.indexOf('=');
      return {
        attachedName:
          equalsIndex === -1 ? undefined : token.slice(equalsIndex + 1),
      } as const;
    }
    /** Attachment is unambiguous only for the single-letter option; `--unsetCI`
     * is not a spelling env accepts. */
    if (
      option.length === 2 &&
      token.length > option.length &&
      token.startsWith(option)
    ) {
      return { attachedName: token.slice(option.length) } as const;
    }
  }
  return undefined;
}

/** One unset option and the name it removes, reporting where the walk
 * resumes. */
function stripEnvUnset(
  tokens: readonly string[],
  index: number,
  attachedName: string | undefined,
  kept: string[],
  removed: string[],
) {
  const token = tokens[index];
  const name = attachedName ?? tokens[index + 1];
  const consumed = attachedName === undefined ? 2 : 1;
  /** A truncated `env -u` names nothing to remove, so it is carried through
   * untouched and the command is somebody else's problem. */
  if (name === undefined) {
    kept.push(token);
    return index + 1;
  }
  if (isGovernorName(name)) {
    removed.push(name);
    return index + consumed;
  }
  kept.push(token);
  if (attachedName === undefined) {
    kept.push(name);
  }
  return index + consumed;
}

/** A `unset`/`export` operand list, minus the family names it carried. */
function stripNameList(operands: readonly string[], removed: string[]) {
  const kept: string[] = [];
  for (const operand of operands) {
    const equalsIndex = operand.indexOf('=');
    const name = equalsIndex === -1 ? operand : operand.slice(0, equalsIndex);
    recordOrKeep(name, operand, kept, removed);
  }
  return kept;
}

function recordOrKeep(
  name: string,
  token: string,
  kept: string[],
  removed: string[],
) {
  if (isGovernorName(name)) {
    removed.push(name);
    return;
  }
  kept.push(token);
}

function isGovernorName(name: string) {
  return name.startsWith(GOVERNOR_NAME_PREFIX) || GOVERNOR_NAMES.has(name);
}

import { parse, type ParseEntry } from 'shell-quote';
import { injectNewlineSeparators } from '../injectNewlineSeparators';
import { resolveBinaryName } from '../resolveBinaryName';
import { resolveInvocationHead } from '../resolveInvocationHead';
import { splitShellSegments } from '../splitShellSegments';
import {
  buildRetry,
  PATHCONV_ENV,
  stripPathconvAssignment,
} from './buildRetry';
import { findPrefixConflict } from './findPrefixConflict';
import { locateGitCandidate } from './locateGitCandidate';
import type { MsysArgvFamily, MsysArgvOffense } from './types';

const NO_OFFENSE = { kind: 'none' } as const;

/**
 * Which family a binary token names. A `Map` rather than an `if` chain: the key
 * is a token off an untyped shell-token stream, and a second family is a
 * one-line data edit. agora's copy carries a `firebase` entry too; this repo
 * runs no firebase CLI, so modelling it would deny a command nobody types here.
 */
const BINARY_FAMILIES: ReadonlyMap<string, MsysArgvFamily> = new Map([
  ['git', 'git-ref-path'],
]);

/** The runner that puts itself in binary position ahead of the real command. */
const NPX_BINARY = 'npx' as const;

/**
 * A backtick survives `shell-quote` as an ordinary character, so it needs its
 * own test: the token text is not what would reach the program.
 */
const COMMAND_SUBSTITUTION_CHARACTER = '`' as const;

/**
 * Substituted for every `$VAR`/`$(…)` expansion so an unexpandable spelling is
 * DETECTABLE. `shell-quote` otherwise resolves an unset variable to the empty
 * string with no marker, which would let the guard decide on an argument the
 * agent never wrote.
 *
 * A printable string rather than a control character: a source file carrying a
 * literal NUL is BINARY to git and to every diff tool, and the only cost of a
 * printable sentinel is that an agent typing this exact string gets a
 * fail-open — the harmless direction.
 */
const UNEXPANDED_MARKER = '::BLUMINT_MSYS_GUARD_UNEXPANDED::' as const;

/**
 * The commands in a Bash `tool_input.command` that MSYS2's argument conversion
 * would rewrite — **lexing only**, no platform opinion (`detectGitBash` owns
 * that) and no message (`buildMsysArgvDenyReason` owns that).
 *
 * `unreadable` and an empty `offenses` array are distinct on purpose: the first
 * means the command could not be read literally, the second means it was read
 * and carries nothing to object to. Only the first is worth a fail-open line.
 */
export function findMsysArgvOffenses(command: string) {
  let tokens: ParseEntry[];
  try {
    tokens = parse(injectNewlineSeparators(command), () => {
      return UNEXPANDED_MARKER;
    });
  } catch {
    return { kind: 'unreadable', reason: 'unparseable-shell' } as const;
  }

  const split = splitShellSegments(tokens);
  if (split.kind === 'unmodelled') {
    return { kind: 'unreadable', reason: split.reason } as const;
  }

  const populated = split.segments.filter((segment) => {
    return segment.length > 0;
  });
  return convictSegments(populated, command);
}

/**
 * Walks the segments, banking every conviction. An `unreadable` segment does
 * NOT discard the ones already convicted: abstaining is right for a segment the
 * lexer could not read, and catastrophic for its neighbours — a command whose
 * first half is a plain convertible read and whose second carries an expansion
 * would otherwise fail open ENTIRELY, running the first half unprefixed.
 *
 * Denying loses nothing the unreadable half owns: `buildRetry` republishes only
 * the OFFENDING segment of a multi-segment command.
 */
function convictSegments(
  populated: readonly (readonly ParseEntry[])[],
  command: string,
) {
  const offenses: MsysArgvOffense[] = [];
  let unreadable: { kind: 'unreadable'; reason: string } | undefined;
  for (const segment of populated) {
    const found = inspectSegment(segment, command, populated.length === 1);
    if (found.kind === 'unreadable') {
      unreadable ??= found;
      continue;
    }
    if (found.kind === 'offense') {
      offenses.push(found.offense);
    }
  }
  if (offenses.length === 0 && unreadable !== undefined) {
    return unreadable;
  }
  return { kind: 'offenses', offenses } as const;
}

/**
 * One segment's verdict. A segment whose binary names no modelled family
 * returns `none` SILENTLY rather than fail-open: this hook sits in front of
 * every Bash call, and a stderr line per unmodelled wrapper would bury the
 * lines that mean something.
 */
function inspectSegment(
  segment: readonly ParseEntry[],
  command: string,
  isSoleSegment: boolean,
) {
  const head = resolveInvocationHead(segment);
  if (head.kind !== 'resolved' || head.index >= segment.length) {
    return NO_OFFENSE;
  }
  const binary = segment[head.index];
  if (typeof binary !== 'string') {
    return NO_OFFENSE;
  }
  const classified = classifyFamily(binary, segment, head.index);
  if (classified === undefined) {
    return NO_OFFENSE;
  }
  const literal = readLiteralTokens(segment);
  if (literal === undefined) {
    return { kind: 'unreadable', reason: 'unexpandable-argv' } as const;
  }
  /**
   * Dropped HERE, before any index is derived, so every downstream index
   * addresses one token list. Stripping it later would shift the `-C` position
   * the split arm removes by one and publish a mangled command.
   */
  const stripped = stripPathconvAssignment(literal, classified.binaryIndex);
  const binaryIndex =
    classified.binaryIndex - (literal.length - stripped.length);
  /**
   * A pre-existing prefix makes the segment compliant ONLY when nothing else in
   * its argv needed converting — which is what makes the published retry a
   * fixed point. It is emphatically not "already compliant" in general:
   * `MSYS_NO_PATHCONV=1 git -C /c/repo show <ref>:<path>` is the shape doctrine
   * names as broken, so returning on the strength of the prefix alone would
   * silently allow the one command the deny text teaches against.
   */
  const isSuppressed = head.envAssignments.some(({ name }) => {
    return name === PATHCONV_ENV;
  });
  return locateOffense({
    family: classified.family,
    binaryIndex,
    tokens: stripped,
    command,
    isSoleSegment,
    isSuppressed,
  });
}

/**
 * Which family a segment's binary position names, and WHERE that binary sits —
 * never the family alone. The index is what every downstream positional walk
 * keys off, so an `npx`-wrapped command whose family is resolved from a later
 * token must carry that token's index with it.
 */
function classifyFamily(
  binary: string,
  segment: readonly ParseEntry[],
  binaryIndex: number,
) {
  const name = resolveBinaryName(binary);
  const direct = BINARY_FAMILIES.get(name);
  if (direct !== undefined) {
    return { family: direct, binaryIndex } as const;
  }
  if (name !== NPX_BINARY) {
    return;
  }
  return findWrappedFamily(segment, binaryIndex);
}

/**
 * `npx <binary> …` puts `npx` in binary position. Matching the wrapped name
 * anywhere after it — rather than walking `npx`'s own options — is safe because
 * the family alone denies nothing: the family's own verb AND its convertible
 * operand still have to be present.
 */
function findWrappedFamily(
  segment: readonly ParseEntry[],
  binaryIndex: number,
) {
  /** Resolved and indexed in ONE pass, against the ORIGINAL segment: the index
   * returned must address that segment, since every downstream walk slices
   * it. */
  const [wrapped] = segment.flatMap((token, index) => {
    if (typeof token !== 'string' || index <= binaryIndex) {
      return [];
    }
    const family = BINARY_FAMILIES.get(resolveBinaryName(token));
    return family === undefined
      ? []
      : [{ family, binaryIndex: index } as const];
  });
  return wrapped;
}

/**
 * The segment as literal strings, or `undefined` when any token is one the
 * guard cannot read at face value: a `{comment:…}`/`{op:…}` construct, an
 * expansion, or a backtick.
 */
function readLiteralTokens(segment: readonly ParseEntry[]) {
  const literal: string[] = [];
  for (const token of segment) {
    if (
      typeof token !== 'string' ||
      token.includes(UNEXPANDED_MARKER) ||
      token.includes(COMMAND_SUBSTITUTION_CHARACTER)
    ) {
      return;
    }
    literal.push(token);
  }
  return literal;
}

function locateOffense(context: {
  readonly family: MsysArgvFamily;
  readonly binaryIndex: number;
  readonly tokens: readonly string[];
  readonly command: string;
  readonly isSoleSegment: boolean;
  readonly isSuppressed: boolean;
}) {
  const { family, binaryIndex, tokens, isSuppressed } = context;
  const located = locateGitCandidate(tokens, binaryIndex);
  if (located === undefined) {
    return NO_OFFENSE;
  }
  const conflict = findPrefixConflict(tokens, binaryIndex, located);
  /** An already-prefixed segment is compliant exactly when nothing else in its
   * argv needed converting — the fixed point that makes one retry converge. */
  if (isSuppressed && conflict === undefined) {
    return NO_OFFENSE;
  }
  const offense: MsysArgvOffense = {
    family,
    verb: located.verb,
    argument: located.argument,
    retry: buildRetry({
      ...context,
      conflict,
      argumentIndex: located.argumentIndex,
    }),
  };
  return { kind: 'offense', offense } as const;
}

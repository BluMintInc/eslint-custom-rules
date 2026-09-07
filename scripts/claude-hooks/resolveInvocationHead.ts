import type { ParseEntry } from 'shell-quote';
import { namesOption } from './readOptionName';

/**
 * How much of a wrapper command stands between its own token and the command it
 * wraps. Modelled per command as data rather than as one global "skip the next
 * token" rule, because the wrappers genuinely differ: `timeout` takes a
 * mandatory DURATION positional, `nice -n 5` takes an option value, and `env`
 * takes neither but re-opens the `NAME=value` prefix the segment head already
 * scanned once.
 */
type PrefixCommandSpec = {
  /** Options consuming the following token as their value (`-s KILL`). */
  readonly valueOptions: readonly string[];
  /** Options carrying no value (`--foreground`). */
  readonly flagOptions: readonly string[];
  /** Mandatory positionals standing between the options and the wrapped
   * command (`timeout <DURATION> <command>`). */
  readonly positionals: number;
};

/**
 * The wrapper commands an agent routinely puts in front of a real invocation.
 * Without this registry each such command lexes as a segment whose binary token
 * is the wrapper, which no rule matches, so the whole invocation becomes
 * invisible to policy and is ALLOWED with no stderr line.
 *
 * `env` earns its entry twice over here: it is both a common wrapper and the
 * governor-stripping spelling this repo's gate-containment rule convicts on.
 *
 * A `Map` rather than a `Record`: the lookup key is a token off an untyped
 * shell-token stream, and a `string` key makes the caller narrow the
 * `ParseEntry` it holds before it can ask.
 *
 * The option lists are the spellings an agent plausibly types, not each
 * wrapper's full manual. That bound is safe because an unmodelled option is
 * LOUD rather than silent: the walk refuses, and each caller turns the refusal
 * into its own abstention.
 */
const PREFIX_COMMANDS: ReadonlyMap<string, PrefixCommandSpec> = new Map([
  [
    'timeout',
    {
      valueOptions: ['-s', '--signal', '-k', '--kill-after'],
      flagOptions: ['--foreground', '--preserve-status', '-v', '--verbose'],
      positionals: 1,
    },
  ],
  [
    /**
     * `-S`/`--split-string` is deliberately absent from BOTH lists, and it does
     * the OPPOSITE of an opaque value: GNU coreutils splits that string into a
     * command and runs it, so `env -S 'npx jest'` carries a whole invocation
     * inside one token. Modelled as a value option it would be consumed, the
     * head would advance past it, and the segment would lex as containing no
     * jest invocation at all — the silent gap this registry exists to close,
     * reopened by the entry meant to close it. Unmodelled, the walk refuses and
     * the caller abstains loudly.
     */
    'env',
    {
      valueOptions: ['-u', '--unset', '-C', '--chdir'],
      flagOptions: [
        '-i',
        '--ignore-environment',
        '-0',
        '--null',
        '-v',
        '--debug',
      ],
      positionals: 0,
    },
  ],
  [
    'nice',
    {
      valueOptions: ['-n', '--adjustment'],
      flagOptions: [],
      positionals: 0,
    },
  ],
  [
    'time',
    {
      valueOptions: ['-o', '--output', '-f', '--format'],
      flagOptions: ['-p', '--portability', '-a', '--append', '-v', '--verbose'],
      positionals: 0,
    },
  ],
  [
    'stdbuf',
    {
      valueOptions: ['-i', '--input', '-o', '--output', '-e', '--error'],
      flagOptions: [],
      positionals: 0,
    },
  ],
  [
    'sudo',
    {
      valueOptions: [
        '-u',
        '--user',
        '-g',
        '--group',
        '-p',
        '--prompt',
        '-C',
        '--close-from',
        '-h',
        '--host',
      ],
      flagOptions: [
        '-E',
        '--preserve-env',
        '-H',
        '--set-home',
        '-n',
        '--non-interactive',
        '-S',
        '--stdin',
        '-b',
        '--background',
        '-k',
        '--reset-timestamp',
      ],
      positionals: 0,
    },
  ],
  [
    /**
     * `-c`/`--command` — the util-linux spelling, which carries the command as
     * an option VALUE rather than a trailing operand — is deliberately absent
     * from both lists, for the reason `env -S` states.
     */
    'script',
    {
      valueOptions: ['-t', '--timing', '-T', '--log-timing'],
      flagOptions: [
        '-a',
        '--append',
        '-q',
        '--quiet',
        '-f',
        '--flush',
        '-e',
        '--return',
      ],
      positionals: 1,
    },
  ],
  [
    'xargs',
    {
      valueOptions: [
        '-a',
        '--arg-file',
        '-d',
        '--delimiter',
        '-E',
        '-I',
        '-i',
        '--replace',
        '-L',
        '--max-lines',
        '-n',
        '--max-args',
        '-P',
        '--max-procs',
        '-s',
        '--max-chars',
      ],
      flagOptions: [
        '-0',
        '--null',
        '-p',
        '--interactive',
        '-r',
        '--no-run-if-empty',
        '-t',
        '--verbose',
        '-x',
        '--exit',
      ],
      positionals: 0,
    },
  ],
]);

/**
 * Options whose VALUE is a command line rather than a datum. Refused wherever
 * they appear, in every spelling, because every rule downstream assumes the
 * command it lexes is the command that runs — and these carry a second one
 * inside a single token, invisible to a token-position walk.
 *
 * Refusal, not modelling: parsing the nested string correctly would mean
 * re-implementing each wrapper's own splitting rules, and a subtly-wrong
 * re-implementation is how a bypass gets built out of the mitigation.
 */
const COMMAND_BEARING_OPTIONS = [
  '-S',
  '--split-string',
  '-c',
  '--command',
] as const;

const ENV_ASSIGNMENT_PATTERN = /^[A-Z_a-z]\w*=/;

/**
 * Walks a segment's head — its `NAME=value` assignments and any wrapper
 * commands — and reports where the real binary position begins, along with
 * every assignment collected on the way.
 *
 * Loops rather than stripping one wrapper, so `timeout 120 env CI=true nice npx
 * jest` resolves. The loop is what makes the `env` case correct: assignments
 * are re-collected after every wrapper, and skipping `env` without re-collecting
 * would drop the very assignment the gate-containment rule convicts on.
 *
 * `unmodelled-prefix` is a REFUSAL TO GUESS, not a verdict: the caller decides
 * whether it is loud or silent, which is what stops an ordinary command from
 * emitting a fail-open line on every call.
 */
export function resolveInvocationHead(segment: readonly ParseEntry[]) {
  const envAssignments: { name: string; value: string }[] = [];
  let index = 0;

  while (index < segment.length) {
    const { envAssignments: collected, index: afterAssignments } =
      collectEnvAssignments(segment, index);
    envAssignments.push(...collected);
    index = afterAssignments;

    const head = segment[index];
    /** A non-string head is a `{comment:…}` construct or the end of a segment
     * that was assignments and nothing else — neither is a wrapper this
     * registry models, so the walk ends here as it does for any unregistered
     * command. */
    const spec =
      typeof head === 'string' ? PREFIX_COMMANDS.get(head) : undefined;
    if (spec === undefined) {
      break;
    }
    const advanced = skipPrefixCommand(segment, index + 1, spec);
    if (advanced === undefined) {
      return { kind: 'unmodelled-prefix' } as const;
    }
    index = advanced;
  }

  return { kind: 'resolved', envAssignments, index } as const;
}

/**
 * Consumes one wrapper's own options and positionals, and reports where the
 * wrapped command begins — or `undefined` for a shape this registry does not
 * model.
 *
 * An `=`-joined option is accepted without a registry lookup: it is
 * self-contained by construction, so it cannot shift the binary position
 * whichever option it names. Every other unrecognized flag-shaped token
 * refuses, because guessing its arity is exactly how a wrapper's argument gets
 * mistaken for the binary. "Self-contained" bounds the ARITY and not the
 * CONTENT, which is why {@link COMMAND_BEARING_OPTIONS} is tested first.
 */
function skipPrefixCommand(
  segment: readonly ParseEntry[],
  start: number,
  spec: PrefixCommandSpec,
) {
  let index = start;
  while (index < segment.length) {
    const token = segment[index];
    if (typeof token !== 'string' || !token.startsWith('-')) {
      break;
    }
    if (isCommandBearingOption(token)) {
      return;
    }
    if (token.includes('=') || spec.flagOptions.includes(token)) {
      index += 1;
      continue;
    }
    if (spec.valueOptions.includes(token)) {
      index += 2;
      continue;
    }
    if (!hasAttachedShortValue(token, spec.valueOptions)) {
      return;
    }
    index += 1;
  }

  const afterPositionals = index + spec.positionals;
  /** An option value or a positional running past the segment's end is a
   * truncated wrapper, not a resolvable binary position. */
  return afterPositionals <= segment.length ? afterPositionals : undefined;
}

/**
 * Whether a token is a short value option carrying its value ATTACHED, the
 * third spelling beside the bare and `=`-joined ones — `env -uCI`, `sudo
 * -uroot`, `xargs -n5`, all real GNU syntax one deleted space from the detached
 * form. Unmodelled it is not merely missed: the token matches no list, the walk
 * refuses, the whole segment resolves to no invocation, and every rule
 * downstream is silently skipped, so the governor strip this repo convicts on
 * would pass at exit 0.
 *
 * Bounded to a single-dash, single-letter option, which is the only spelling
 * where attachment is unambiguous: `--unsetCI` is not an option any of these
 * wrappers accepts, and treating it as one would consume a token the shell
 * hands the wrapped command.
 */
function hasAttachedShortValue(token: string, valueOptions: readonly string[]) {
  return valueOptions.some((option) => {
    return (
      option.length === 2 &&
      !option.startsWith('--') &&
      token.length > option.length &&
      token.startsWith(option)
    );
  });
}

/** Matches the bare token and its `=`-joined form (`--split-string=…`). */
function isCommandBearingOption(token: string) {
  return COMMAND_BEARING_OPTIONS.some((option) => {
    return namesOption(token, option);
  });
}

/**
 * Consumes the `NAME=value` run starting at `start`, and reports where it ends.
 * Returned as a pair rather than by mutating a caller-owned array: the index is
 * the only thing the caller needs from the scan.
 */
function collectEnvAssignments(segment: readonly ParseEntry[], start: number) {
  const envAssignments: { name: string; value: string }[] = [];
  let index = start;
  while (index < segment.length) {
    const token = segment[index];
    if (typeof token !== 'string') {
      break;
    }
    const assignment = parseEnvAssignmentToken(token);
    if (assignment === undefined) {
      break;
    }
    envAssignments.push(assignment);
    index += 1;
  }
  return { envAssignments, index } as const;
}

function parseEnvAssignmentToken(token: string) {
  if (!ENV_ASSIGNMENT_PATTERN.test(token)) {
    return;
  }
  const equalsIndex = token.indexOf('=');
  return {
    name: token.slice(0, equalsIndex),
    value: token.slice(equalsIndex + 1),
  } as const;
}

import type { ParseEntry } from 'shell-quote';
import { namesOption } from '../readOptionName';
import { resolveBinaryName } from '../resolveBinaryName';

/**
 * How much of a head stands between its own token and what it runs — a
 * launcher's options before the program, and `npm`'s before the subcommand.
 *
 * `passthroughSubcommands` are the words a launcher puts between itself and the
 * program (`yarn run jest`, `pnpm exec jest`), consumed rather than matched, so
 * one walk serves every launcher instead of a branch per spelling.
 *
 * `commandBearingOptions` are refused rather than modelled, for the reason
 * `resolveInvocationHead` states: their value is a program, and a token-position
 * walk cannot see the invocation hiding inside one.
 *
 * Data rather than a branch per launcher, so the next one is a one-line edit.
 * agora's own copy models `npx` and `node` alone; this port carries the five
 * further spellings a survey found reaching jest in this repo, since a launcher
 * missing here is a whole-suite run allowed with no stderr line.
 */
type LauncherSpec = {
  readonly valueOptions: readonly string[];
  readonly commandBearingOptions: readonly string[];
  readonly passthroughSubcommands: readonly string[];
};

const NPX_OPTIONS: LauncherSpec = {
  /**
   * `npx` forwards npm's own configuration, so any of these may sit between the
   * head and the package name in its separate-value spelling. An option missing
   * from this list makes the walk land on its VALUE, which names no tool, and
   * the command is allowed — the fail-open direction.
   */
  valueOptions: [
    '-p',
    '--package',
    '--cache',
    '--registry',
    '--prefix',
    '--userconfig',
    '--globalconfig',
    '--node-options',
    '-w',
    '--workspace',
  ],
  commandBearingOptions: ['-c', '--call'],
  passthroughSubcommands: [],
};

/**
 * `npm`'s OWN options, the ones that may sit between the head and the
 * subcommand (`npm --silent test`) and between `run` and the script name
 * (`npm run -s test`). Without this walk an ordinary `--silent` — the flag an
 * agent reaches for the moment output gets long — makes the whole segment
 * resolve to nothing, and the whole suite runs allowed and unremarked.
 *
 * Arity matters more here than in the launcher specs, because a missing entry
 * cuts BOTH ways: an unlisted value option's value is read as the subcommand,
 * so `npm --prefix test run build` would deny a build. The listed spellings are
 * npm's own configuration options that take a separate value; a boolean is
 * covered by the walk's default arity rather than by a list, since npm has
 * dozens and enumerating them is how the next one gets missed.
 */
const NPM_OPTIONS: LauncherSpec = {
  valueOptions: [
    '--prefix',
    '--loglevel',
    '--cache',
    '--registry',
    '--userconfig',
    '--globalconfig',
    '--node-options',
    '--script-shell',
    '--omit',
    '--include',
    '-w',
    '--workspace',
    /** npm's own shorthand for `--prefix`, verified against `npm -C <dir>
     * config get prefix`, which echoes the directory the option consumed. */
    '-C',
  ],
  commandBearingOptions: ['-c', '--call'],
  passthroughSubcommands: [],
};

const LAUNCHERS: ReadonlyMap<string, LauncherSpec> = new Map([
  ['npx', NPX_OPTIONS],
  ['bunx', NPX_OPTIONS],
  [
    'node',
    {
      /** An unlisted bare option is treated as a flag, the fail-open direction:
       * the walk then lands on that option's value, which is not a tool name,
       * and the command is allowed. */
      valueOptions: [
        '-r',
        '--require',
        '--import',
        '--loader',
        '--experimental-loader',
        '--conditions',
        '-C',
        '--env-file',
      ],
      commandBearingOptions: ['-e', '--eval', '-p', '--print', '-c', '--check'],
      passthroughSubcommands: [],
    },
  ],
  [
    'yarn',
    {
      valueOptions: ['--cwd'],
      commandBearingOptions: [],
      passthroughSubcommands: ['run', 'exec', 'dlx'],
    },
  ],
  [
    'pnpm',
    {
      valueOptions: ['-C', '--dir', '--filter'],
      commandBearingOptions: ['-c', '--command'],
      passthroughSubcommands: ['run', 'exec', 'dlx'],
    },
  ],
]);

/** `npm`'s own aliases for the whole-suite script, which take no `run`. */
const NPM_TEST_ALIASES: ReadonlySet<string> = new Set(['test', 'tst', 't']);

/** The subcommands whose next operand is a SCRIPT name. `rum` and `urn` are
 * npm's own aliases for `run`, and npm runs the script either way, so leaving
 * them out is a deny one typo walks past. */
const NPM_RUN_SUBCOMMANDS: ReadonlySet<string> = new Set([
  'run',
  'run-script',
  'rum',
  'urn',
]);

/** The subcommands whose next operand is a BINARY, which the launcher walk then
 * resolves exactly as `npx` is resolved. */
const NPM_EXEC_SUBCOMMANDS: ReadonlySet<string> = new Set(['exec', 'x']);

const JEST_BINARY = 'jest' as const;

/**
 * An npm script's own arguments begin after `--`; everything before it is
 * npm's. Without that boundary a scoped `npm test -- src/x.test.ts` reads as a
 * whole-suite run, since the operand would look like npm's rather than jest's.
 */
const NPM_ARGUMENT_SEPARATOR = '--' as const;

/**
 * What a segment's binary position runs, and where its own arguments begin — or
 * `undefined` for every segment this guard has no opinion about.
 *
 * Two arms, because this repo reaches the same suite two ways and each is
 * graded differently: a jest BINARY, whose argv is jest's, and an npm SCRIPT,
 * whose argv is npm's until `--`.
 *
 * **The HEAD is lexed, never the command text.** An inner invocation carried as
 * a quoted argument (`npx tsx scripts/x.ts -- "npx jest"`) is one string token
 * in operand position, so the segment resolves to `tsx` and is left alone,
 * where a substring scan would convict it.
 */
export function resolveToolInvocation(
  segment: readonly ParseEntry[],
  headIndex: number,
) {
  const head = segment[headIndex];
  if (typeof head !== 'string') {
    return;
  }
  const name = resolveBinaryName(head);
  if (name === JEST_BINARY) {
    return { kind: 'jest-binary', argumentsIndex: headIndex + 1 } as const;
  }
  if (name === 'npm') {
    return resolveNpmInvocation(segment, headIndex + 1);
  }
  const spec = LAUNCHERS.get(name);
  return spec === undefined
    ? undefined
    : resolveWrapped(segment, headIndex + 1, spec);
}

/**
 * `npm`'s three shapes: the bare test aliases, a named script, and `exec`,
 * which is `npx` under another name. Anything else — `install`, a bare `run`
 * with no script — resolves to nothing.
 *
 * npm's own options are walked at BOTH positions a subcommand or script name
 * can hide behind, since `npm --silent test` and `npm run -s test` are the same
 * whole-suite run as the bare spellings.
 */
function resolveNpmInvocation(segment: readonly ParseEntry[], start: number) {
  const subcommandIndex = skipOptions(segment, start, NPM_OPTIONS);
  if (subcommandIndex === undefined) {
    return;
  }
  const subcommand = segment[subcommandIndex];
  if (typeof subcommand !== 'string') {
    return;
  }
  if (NPM_TEST_ALIASES.has(subcommand)) {
    return buildNpmScript(segment, 'test');
  }
  if (NPM_EXEC_SUBCOMMANDS.has(subcommand)) {
    return resolveWrapped(segment, subcommandIndex + 1, NPX_OPTIONS);
  }
  if (!NPM_RUN_SUBCOMMANDS.has(subcommand)) {
    return;
  }
  const scriptIndex = skipOptions(segment, subcommandIndex + 1, NPM_OPTIONS);
  if (scriptIndex === undefined) {
    return;
  }
  const script = segment[scriptIndex];
  return typeof script === 'string'
    ? buildNpmScript(segment, script)
    : undefined;
}

/** A script's arguments start after `--`, or nowhere at all when the segment
 * carries none — which reads as an empty argument list rather than as an
 * unknown one, since npm's own flags are not the script's. */
function buildNpmScript(segment: readonly ParseEntry[], script: string) {
  const separator = segment.indexOf(NPM_ARGUMENT_SEPARATOR);
  return {
    kind: 'npm-script',
    script,
    argumentsIndex: separator === -1 ? segment.length : separator + 1,
  } as const;
}

/**
 * Walks one launcher's own options to the program it runs. `undefined` — no
 * opinion — whenever the walk runs off the end, meets a token it cannot
 * classify, or lands on something other than jest.
 */
function resolveWrapped(
  segment: readonly ParseEntry[],
  start: number,
  spec: LauncherSpec,
) {
  let index = start;
  while (index < segment.length) {
    const landed = skipOptions(segment, index, spec);
    if (landed === undefined) {
      return;
    }
    const token = segment[landed];
    if (typeof token !== 'string') {
      return;
    }
    if (spec.passthroughSubcommands.includes(token)) {
      index = landed + 1;
      continue;
    }
    return resolveBinaryName(token) === JEST_BINARY
      ? ({ kind: 'jest-binary', argumentsIndex: landed + 1 } as const)
      : undefined;
  }
}

/**
 * Advances past one command's own options to the token it acts on — a
 * subcommand, a script name or a program — reporting where that token sits.
 *
 * Shared by the launcher walk and the `npm` one, because an option run in front
 * of a program and one in front of a subcommand are the same problem: modelling
 * it in one place leaves every spelling at the other silently allowed.
 *
 * `undefined` — no opinion — for a command-bearing option, whose value is a
 * whole invocation a token-position walk cannot see inside. An index past the
 * segment's end means the options ran out the command, which the caller reads
 * as the absent token it is.
 *
 * An unlisted flag-shaped token is treated as carrying no value, the fail-open
 * direction: the walk then lands on that option's value, which names neither a
 * subcommand nor a tool, and the command is allowed.
 */
function skipOptions(
  segment: readonly ParseEntry[],
  start: number,
  spec: LauncherSpec,
) {
  let index = start;
  while (index < segment.length) {
    const token = segment[index];
    if (typeof token !== 'string' || !token.startsWith('-')) {
      return index;
    }
    if (isCommandBearing(token, spec.commandBearingOptions)) {
      return;
    }
    /** An `=`-joined option is self-contained, so it shifts no position. */
    index += !token.includes('=') && spec.valueOptions.includes(token) ? 2 : 1;
  }
  return index;
}

function isCommandBearing(token: string, options: readonly string[]) {
  return options.some((option) => {
    return namesOption(token, option);
  });
}

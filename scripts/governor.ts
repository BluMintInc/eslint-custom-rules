/**
 * Machine-wide admission control for this repo's jest gates.
 *
 * Several autonomous agent loops share one office box, and every one of them
 * runs jest as its validate gate. Jest sizes its worker fleet from the memory
 * it can see, so two gates that start together each reserve against a machine
 * the other has already spent, commit more than exists, and are both
 * OOM-killed. Sampling free memory cannot prevent that — the fatal allocation
 * spikes are shorter than any sampling interval — but a reservation can.
 *
 * agora ships an `exec-governor` whose lease pool lives outside every repo
 * (`~/.cache/blumint/exec-governor`) and whose `run` subcommand takes an
 * arbitrary command, so this repo joins the same pool without importing
 * anything from that clone (issue #2286).
 *
 * The clone's path is machine-specific, so it arrives through
 * `BLUMINT_GOVERNOR_CLI`. Where that is unset — CI, a laptop, any checkout with
 * no agora beside it — the command runs exactly as it does today. A repo must
 * not need a peer clone present in order to run its own tests.
 */
import { existsSync } from 'node:fs';

export const GOVERNOR_CLI_ENV = 'BLUMINT_GOVERNOR_CLI';

/**
 * The governor sizes a reservation per profile, and `jest` is the one profile
 * describing a multi-process fleet. Every gate wrapped here is a jest run.
 */
export const GOVERNOR_PROFILE = 'jest';

export type GovernorDeps = {
  readonly env?: NodeJS.ProcessEnv;
  readonly fileExists?: (path: string) => boolean;
};

/**
 * The governor CLI to route through, or `null` to run the command bare.
 *
 * A configured-but-missing path degrades to bare rather than failing. An agora
 * clone that moved is a fact about the machine, not a defect in the change
 * under test, and erroring here would turn every gate on the box red until
 * someone re-exported a variable — the opposite of the availability this is
 * meant to buy.
 */
export function resolveGovernorCli(deps: GovernorDeps = {}): string | null {
  const { env = process.env, fileExists = existsSync } = deps;
  const configured = env[GOVERNOR_CLI_ENV];
  if (typeof configured !== 'string') {
    return null;
  }
  const trimmed = configured.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (!fileExists(trimmed)) {
    return null;
  }
  return trimmed;
}

/**
 * Single-quote a path for a shell command line, so a clone under a directory
 * with a space or a `$` reaches the governor as one argument.
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Wrap an argv pair for a spawn-style runner (`execFileSync`).
 *
 * The governor captures its child's output and replays it on exit rather than
 * inheriting the parent's streams, so a wrapped gate reports at the end instead
 * of live. That is the price of the reservation, and it is worth paying: an
 * ungoverned gate streams right up to the SIGKILL that discards the whole run.
 */
export function governArgv(
  command: string,
  args: readonly string[],
  deps: GovernorDeps = {},
): [string, string[]] {
  const cli = resolveGovernorCli(deps);
  if (cli === null) {
    return [command, [...args]];
  }
  return [
    'npx',
    [
      'tsx',
      cli,
      'run',
      `--profile=${GOVERNOR_PROFILE}`,
      '--',
      command,
      ...args,
    ],
  ];
}

/**
 * Wrap a shell command string.
 *
 * The governor `exec`s its program directly rather than through a shell, so a
 * `VAR=value` assignment must stay OUTSIDE the wrapper — prefixed to the string
 * this returns, where the caller's own shell applies it and the governed child
 * inherits it. Passing an assignment through as the program makes it the
 * executable name and the run dies with ENOENT.
 */
export function governShellCommand(
  command: string,
  deps: GovernorDeps = {},
): string {
  const cli = resolveGovernorCli(deps);
  if (cli === null) {
    return command;
  }
  return `npx tsx ${shellQuote(
    cli,
  )} run --profile=${GOVERNOR_PROFILE} -- ${command}`;
}

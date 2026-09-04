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

/**
 * Whether a governed run failed BEFORE it reached the command it wraps.
 *
 * `resolveGovernorCli` already degrades to bare when the configured path is
 * gone, on the principle that a peer clone which moved is a fact about the
 * machine rather than a defect in the change under test. A clone that is
 * PRESENT but cannot load reaches that same conclusion one step later: the
 * governor resolves its own imports against its repo root, so `npx tsx <cli>`
 * launched from this checkout dies at module resolution and never starts jest.
 * Without this the gate reports "Tests failed" for every change on the box,
 * which is the outcome that principle exists to prevent.
 *
 * Keyed on the governor's own path appearing in the resolution failure, so a
 * missing module raised by the code under test is never mistaken for one — that
 * is a real failure and must still block.
 */
export function isGovernorStartupFailure(
  output: string,
  deps: GovernorDeps = {},
): boolean {
  const cli = resolveGovernorCli(deps);
  if (cli === null) {
    return false;
  }
  if (
    !output.includes('MODULE_NOT_FOUND') &&
    !output.includes('Cannot find module')
  ) {
    return false;
  }
  return output.includes(cli);
}

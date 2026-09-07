#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * The canonical scoped jest run for this repo.
 *
 * `npm test` is the whole suite — 355 files, seventeen of them 8 to 22 minutes
 * each — so it is CI's command and never a local one. That leaves the Bash
 * guard denying every whole-suite spelling with no rewrite to publish, which is
 * what this script is: a run scoped to the files a change touches and reserved
 * against the machine-wide pool, spelled the same way the maintainer's own
 * validate gate spells it.
 *
 *   npm run test:related                       → the branch's changed files
 *   npm run test:related -- src/rules/foo.ts   → those files
 *   npm run test:related -- --coverage         → flags reach jest, not the path list
 */
import { isGovernorStartupFailure } from './governor';
import {
  changedTestRelevantFiles,
  runStep,
  StepFailure,
  type Runner,
} from './maintainer';
import {
  buildRelatedTestsInvocation,
  type RelatedTestsInvocation,
} from './related-tests';

export const USAGE = [
  'Usage: npm run test:related [-- <file|flag>...]',
  '',
  'Runs the tests related to the given files, or to the files changed on this',
  'branch when none are given, under the machine-wide exec-governor.',
  '',
  '  <file>   a path whose related suites should run',
  '  <flag>   any jest flag, passed through (attach its value: --flag=value)',
  '  --help   print this and exit',
].join('\n');

export type PartitionedArguments = {
  readonly flags: string[];
  readonly files: string[];
  readonly help: boolean;
};

/**
 * A dash-prefixed token is a jest flag and everything else is a path. A
 * detached flag value is indistinguishable from a path, so the attached
 * spelling is the one this reads, and the Bash guard republishes every value
 * option attached for that reason (`classifyToolRun.ts`). A caller spelling a
 * value detached hands jest its own flag value as a relatedness operand, which
 * runs zero tests at exit 0 — hence the USAGE line above.
 */
export function partitionArguments(
  argv: readonly string[],
): PartitionedArguments {
  const flags: string[] = [];
  const files: string[] = [];
  for (const token of argv) {
    if (token === '--') {
      continue;
    }
    if (token.startsWith('-')) {
      flags.push(token);
      continue;
    }
    files.push(token);
  }
  return {
    flags,
    files,
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

/** The child output a caught step failure carries, if it carries any. */
function outputOf(error: unknown): string {
  return error instanceof StepFailure ? error.output : '';
}

/**
 * The governed attempt is captured so its failure can be READ: a governor that
 * dies before it reaches jest must not decide this verdict, and `stdio:
 * 'inherit'` would keep no output to test (issue #2332). The unwrapped retry
 * streams, since nothing asks anything of its output.
 */
function runInvocation(
  invocation: RelatedTestsInvocation,
  run: Runner,
): number {
  const { command, args, env, bare } = invocation;
  const governed = command !== bare[0] || args.join(' ') !== bare[1].join(' ');
  try {
    run(command, args, governed ? { capture: true, env } : undefined);
    return 0;
  } catch (error) {
    if (!governed || !isGovernorStartupFailure(outputOf(error))) {
      return 1;
    }
    console.error(
      'test:related: the configured governor could not start; re-running unwrapped',
    );
    try {
      run(bare[0], bare[1]);
      return 0;
    } catch {
      return 1;
    }
  }
}

/**
 * Injected so an arm of this script's own suite can state what it spawns
 * without spawning it. Left to their defaults a test run would take this
 * branch's changed files and hand them to a real jest, from inside jest.
 */
export type TestRelatedDeps = {
  readonly run?: Runner;
  readonly changedFiles?: () => string[];
};

export function main(
  argv: readonly string[],
  deps: TestRelatedDeps = {},
): number {
  const { run = runStep, changedFiles = changedTestRelevantFiles } = deps;
  const { flags, files, help } = partitionArguments(argv);
  if (help) {
    console.log(USAGE);
    return 0;
  }
  const targets = files.length > 0 ? files : changedFiles();
  if (targets.length === 0) {
    console.log(
      'test:related: no changed TypeScript files on this branch — nothing to run.',
    );
    return 0;
  }
  return runInvocation(buildRelatedTestsInvocation(targets, {}, flags), run);
}

if (process.env.JEST_WORKER_ID === undefined && require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

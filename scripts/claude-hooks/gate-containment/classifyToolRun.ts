import type { ParseEntry } from 'shell-quote';
import { formatShellSegment } from '../msys-argv/formatShellSegment';
import { readOptionName } from '../readOptionName';
import type { GateContainmentOffense } from './types';
import type { resolveToolInvocation } from './resolveToolInvocation';

/** The npm scripts that run the WHOLE suite. In this repo that is never a local
 * command, so the head that runs it is a raw spelling here even though the
 * identical head is canonical in agora. */
const WHOLE_SUITE_SCRIPTS: ReadonlySet<string> = new Set([
  'test',
  'test:ci',
] as const);

/** The canonical scoped, governed run — the only local jest this repo has, and
 * therefore the one rewrite this rule can publish. */
const SCOPED_SCRIPT = 'npm run test:related' as const;

/**
 * Flags that narrow a jest run to a subset of the suite. `--testPathPatterns`
 * is jest 30's rename of `--testPathPattern`, and both are listed so a checkout
 * mid-upgrade is not denied for spelling the older one.
 */
const JEST_SCOPING_FLAGS: ReadonlySet<string> = new Set([
  '--findRelatedTests',
  '--runTestsByPath',
  '--testPathPatterns',
  '--testPathPattern',
  '--testNamePattern',
  '-t',
  '--selectProjects',
  '--projects',
  '--onlyChanged',
  '-o',
  '--onlyFailures',
  '-f',
  '--changedSince',
  '--lastCommit',
  '--shard',
] as const);

/** Flags under which jest runs no tests at all, so there is nothing to govern
 * and nothing the scoped remedy would reproduce. */
const JEST_NON_RUN_FLAGS: ReadonlySet<string> = new Set([
  '--help',
  '-h',
  '--version',
  '-v',
  '--showConfig',
  '--listTests',
  '--clearCache',
  '--init',
] as const);

/**
 * The flags that size the fleet, and the one exception to republishing.
 *
 * A jest CLI `--maxWorkers` OUTRANKS `jest.config.js`'s own sizing, so carrying
 * it onto the remedy would publish a "governed" command that still fans out to
 * the count that filled the box — which is the incident this whole guard exists
 * to close. `-w` is jest's alias for it rather than a watch flag.
 */
const JEST_WORKER_FLAGS: ReadonlySet<string> = new Set([
  '--maxWorkers',
  '-w',
  '--workerIdleMemoryLimit',
] as const);

/**
 * Options whose next token is a VALUE rather than an operand. Skipping them is
 * what keeps `--maxWorkers 13` — the exact spelling that filled the box — from
 * reading as a path-scoped run and being allowed.
 *
 * An unlisted option is treated as a flag, so its follower reads as an operand
 * and the run reads as scoped: the fail-open direction, costing a deny this
 * guard would otherwise have issued.
 *
 * Exported so the round-trip arm of `test-related.test.ts` drives one case per
 * member rather than a hand-copied list: the receiving script splits on the
 * dash alone, so a member republished detached would silently become a
 * relatedness operand, and a list that rots is a list that stops covering the
 * next member added here.
 */
export const JEST_VALUE_OPTIONS: ReadonlySet<string> = new Set([
  '--maxWorkers',
  '-w',
  '--workerIdleMemoryLimit',
  '--config',
  '-c',
  '--rootDir',
  '--reporters',
  '--testEnvironment',
  '--coverageDirectory',
  '--collectCoverageFrom',
  '--cacheDirectory',
  '--globalSetup',
  '--globalTeardown',
  '--maxConcurrency',
  '--outputFile',
  '--testTimeout',
  '--testMatch',
  '--testRegex',
  '--setupFiles',
  '--setupFilesAfterEnv',
] as const);

/**
 * Whether one resolved invocation runs the whole suite, and what to publish
 * back — or `undefined` for every run this guard has no opinion about.
 *
 * The rule is HAS-shaped in both directions it can afford to be: it convicts on
 * the ABSENCE of narrowing, which is what a whole-suite run is, and it abstains
 * on the presence of anything it cannot read. Both refusals also guarantee the
 * republish is faithful, since a token this lexer cannot re-emit leaves the
 * argument list unknown.
 *
 * A `--watch` is denied here, unlike in agora, and the asymmetry is the point:
 * agora's watcher holds a governed lease for a session, while this repo's would
 * hold nothing at all and re-run the whole corpus on every keystroke.
 */
export function classifyToolRun(
  segment: readonly ParseEntry[],
  invocation: NonNullable<ReturnType<typeof resolveToolInvocation>>,
) {
  if (
    invocation.kind === 'npm-script' &&
    !WHOLE_SUITE_SCRIPTS.has(invocation.script)
  ) {
    return;
  }
  const republishable = readWholeSuiteArguments(
    segment.slice(invocation.argumentsIndex),
  );
  if (republishable === undefined) {
    return;
  }
  /** Annotated on a local rather than returned with a `satisfies`, which this
   * repo's prettier is too old to parse. */
  const offense: GateContainmentOffense = {
    rule: 'whole-suite',
    rewrite:
      republishable.length === 0
        ? SCOPED_SCRIPT
        : `${SCOPED_SCRIPT} -- ${formatShellSegment(republishable)}`,
  };
  return offense;
}

/**
 * The arguments to carry onto the remedy, or `undefined` for a run this guard
 * holds no opinion about.
 *
 * The surviving arguments are republished because a rewrite dropping `-u`,
 * `--bail` or `--detectOpenHandles` answers a different question than the
 * command it replaces, and the one blind retry this guard is architected around
 * would then read every stale snapshot as a regression. The worker flags are
 * the sole exception; see {@link JEST_WORKER_FLAGS}.
 */
function readWholeSuiteArguments(args: readonly ParseEntry[]) {
  const republishable: string[] = [];
  let index = 0;
  while (index < args.length) {
    const token = args[index];
    /** A token this lexer cannot read at face value — a `{comment:…}`
     * construct, or the empty string `shell-quote` yields for an unexpanded
     * `$VAR` — leaves the argument list unknown, so no faithful republish
     * exists. */
    if (typeof token !== 'string' || token.length === 0) {
      return;
    }
    /** An operand narrows the run to a path, which is the allowed shape. */
    if (!token.startsWith('-')) {
      return;
    }
    const name = readOptionName(token);
    if (JEST_SCOPING_FLAGS.has(name) || JEST_NON_RUN_FLAGS.has(name)) {
      return;
    }
    const isWorkerFlag = JEST_WORKER_FLAGS.has(name);
    if (token.includes('=') || !JEST_VALUE_OPTIONS.has(name)) {
      if (!isWorkerFlag) {
        republishable.push(token);
      }
      index += 1;
      continue;
    }
    const value = args[index + 1];
    /** A separate value the lexer cannot read, or one that never arrived,
     * leaves the same unknown argument list an unreadable operand does. */
    if (typeof value !== 'string' || value.length === 0) {
      return;
    }
    if (!isWorkerFlag) {
      /** Republished ATTACHED, whatever spelling the author wrote. The remedy
       * runs through `test-related.ts`, which reads a dash-prefixed token as a
       * flag and everything else as a path, so a detached `--config
       * jest.config.js` would arrive there as a `--findRelatedTests` operand
       * naming a file no suite relates to — a run of zero tests at exit 0,
       * which is the silent green this guard exists to prevent. Both spellings
       * reach jest's own parser identically. */
      republishable.push(`${token}=${value}`);
    }
    index += 2;
  }
  return republishable;
}

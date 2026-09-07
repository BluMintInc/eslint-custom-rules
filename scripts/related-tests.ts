/**
 * The one builder every caller of a scoped jest run in this repo goes through.
 *
 * A gate that denies the whole-suite spellings has to publish a rewrite that is
 * itself allowed and that actually reserves against the machine-wide pool.
 * Building that command in one place is what keeps the Stop hook, the
 * maintainer's validate gate and `npm run test:related` naming the same
 * operands and taking the same lease.
 */
import {
  governArgv,
  type GovernedInvocation,
  type GovernorDeps,
} from './governor';
import { REGISTRY_GUARD_SUITES } from './registry-guard-suites';

/**
 * Jest's own JS entry point, headed with `node`.
 *
 * The governor spawns the command after its `--` as argv with no shell, so an
 * `npx` head dies ENOENT on Git Bash.
 */
const JEST_ENTRY = './node_modules/jest/bin/jest';

/**
 * The registry, however a caller spells it. The Stop hook's change log records
 * the absolute path Claude Code reports while the maintainer's git diff yields
 * a repo-relative one, and both name the same file.
 */
const REGISTRY_PATH = /(^|\/)src\/index\.ts$/;

const toPosix = (file: string) => file.replace(/\\/g, '/');

const namesRegistry = (file: string) => REGISTRY_PATH.test(toPosix(file));

const alreadyNamed = (changedFiles: readonly string[], suite: string) =>
  changedFiles.some((file) => {
    const posix = toPosix(file);
    return posix === suite || posix.endsWith(`/${suite}`);
  });

/**
 * The files a `--findRelatedTests` run should be given.
 *
 * A named test file is always selected, so appending the registry guards is how
 * a registry change reaches suites relatedness cannot find (see
 * `registry-guard-suites.ts` for why it cannot).
 */
export function resolveRelatedTestOperands(
  changedFiles: readonly string[],
): string[] {
  const operands = [...changedFiles];
  if (!changedFiles.some(namesRegistry)) {
    return operands;
  }
  for (const { path } of REGISTRY_GUARD_SUITES) {
    if (!alreadyNamed(changedFiles, path)) {
      operands.push(path);
    }
  }
  return operands;
}

export type RelatedTestsInvocation = GovernedInvocation & {
  /** The unwrapped argv to retry with when the governor cannot start. */
  readonly bare: readonly [string, string[]];
};

/**
 * `jestFlags` carry a caller's own flags — the guard republishes a denied
 * command's surviving flags into the rewrite it publishes, and a flag that
 * reached jest as a path operand would silently narrow the run to nothing.
 */
export function buildRelatedTestsInvocation(
  changedFiles: readonly string[],
  deps: GovernorDeps = {},
  jestFlags: readonly string[] = [],
): RelatedTestsInvocation {
  const operands = resolveRelatedTestOperands(changedFiles);
  const bare: [string, string[]] = [
    'node',
    [
      JEST_ENTRY,
      '--findRelatedTests',
      ...operands,
      '--passWithNoTests',
      ...jestFlags,
    ],
  ];
  return { ...governArgv(bare[0], bare[1], deps), bare };
}

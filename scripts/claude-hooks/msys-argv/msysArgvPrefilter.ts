import { join } from 'node:path';
import { readShimGrepPatterns } from '../readShimGrepPatterns';

/**
 * Reads the shim's two bash prefilters out of the shim itself, for the reason
 * {@link readShimGrepPatterns} owns.
 *
 * That the two tiers can disagree while both stay green is not hypothetical: in
 * agora the binary grep's trailing class once excluded `.`, so every
 * `git.exe`-style spelling `resolveBinaryName` exists to normalize skipped the
 * bootstrap entirely.
 */
const SHIM_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '.claude',
  'hooks',
  'msys-argv-guard.sh',
);

/** How many prefilters the shim is expected to carry. A mismatch means the
 * prefilter moved, so any binding built on it is void and must say so rather
 * than silently grading fewer patterns. */
const EXPECTED_PREFILTER_COUNT = 2 as const;

/**
 * @param shimPath the shim to read; defaults to the registered one. Overridden
 * only by this module's own test, to drive the moved-prefilter guard — the one
 * branch no edit to the real shim can reach while it stays well-formed.
 */
export function readShimPrefilters(shimPath: string = SHIM_PATH) {
  const patterns = readShimGrepPatterns(shimPath);
  const [binary, verb] = patterns;
  /**
   * One condition, on the two destructured values rather than on the length:
   * they are what the caller uses, so testing them directly needs no second
   * clause no input can independently fail. A third pattern is caught by the
   * length test alone.
   */
  if (
    binary === undefined ||
    verb === undefined ||
    patterns.length !== EXPECTED_PREFILTER_COUNT
  ) {
    throw new Error(
      `expected ${EXPECTED_PREFILTER_COUNT} grep patterns in ${shimPath}, found ${patterns.length} — the prefilter moved, so this binding is void`,
    );
  }
  return { binary, verb } as const;
}

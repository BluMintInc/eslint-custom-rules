import { join } from 'node:path';
import { readShimGrepPatterns } from '../readShimGrepPatterns';

/**
 * Reads the shim's one bash prefilter out of the shim itself, for the reason
 * {@link readShimGrepPatterns} owns.
 */
const SHIM_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '.claude',
  'hooks',
  'windows-tmp-guard.sh',
);

/** How many prefilters the shim is expected to carry. A mismatch means the
 * prefilter moved, so any binding built on it is void and must say so rather
 * than silently grading a pattern that is no longer the gate. */
const EXPECTED_PREFILTER_COUNT = 1 as const;

/**
 * @param shimPath the shim to read; defaults to the registered one. Overridden
 * only by this module's own test, to drive the moved-prefilter guard — the one
 * branch no edit to the real shim can reach while it stays well-formed.
 */
export function readWindowsTmpPrefilter(shimPath: string = SHIM_PATH) {
  const patterns = readShimGrepPatterns(shimPath);
  const [rootTmp] = patterns;
  /**
   * One condition, on the destructured value rather than on the length alone:
   * it is what the caller uses, so testing it directly needs no second clause
   * no input can independently fail. A second pattern is caught by the length
   * test.
   */
  if (rootTmp === undefined || patterns.length !== EXPECTED_PREFILTER_COUNT) {
    throw new Error(
      `expected ${EXPECTED_PREFILTER_COUNT} grep pattern in ${shimPath}, found ${patterns.length} — the prefilter moved, so this binding is void`,
    );
  }
  return rootTmp;
}

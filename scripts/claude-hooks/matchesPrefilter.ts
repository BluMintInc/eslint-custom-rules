import { spawnSync } from 'node:child_process';

/** `grep`'s "matched" and "no match" statuses; anything else is a real failure
 * rather than a verdict. */
const GREP_MATCHED = 0 as const;
const GREP_NO_MATCH = 1 as const;

/**
 * Whether a command passes one of a shim's prefilter patterns, evaluated by the
 * REAL `grep -E` rather than by a JS `RegExp`.
 *
 * The distinction is load-bearing: the patterns use POSIX bracket expressions
 * (`[:alnum:]`), which JS does not implement — it reads them as ordinary
 * character sets — so a JS-side check would silently grade a different pattern
 * than the one that ships, and could report a passing bind over a broken
 * prefilter.
 */
export function matchesPrefilter(pattern: string, command: string) {
  const result = spawnSync('grep', ['-qE', '--', pattern], {
    input: command,
    encoding: 'utf8',
  });
  const isMatched = result.status === GREP_MATCHED;
  if (!isMatched && result.status !== GREP_NO_MATCH) {
    throw new Error(`grep failed on ${pattern}: ${result.stderr}`);
  }
  return isMatched;
}

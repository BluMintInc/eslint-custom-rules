import type { IndexedToken } from './types';

/**
 * Pairs each token with its position, so a walk that must report WHERE it found
 * something reads a value and an index together rather than threading a second
 * counter through every predicate — and so a `find` that legitimately misses is
 * the only absent case, instead of an indexed read that could be off the end.
 */
export function indexTokens(tokens: readonly string[]) {
  return tokens.map((value, index): IndexedToken => {
    return { index, value };
  });
}

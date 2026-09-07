import { readFileSync } from 'node:fs';

/**
 * The `grep -qE -- '<pattern>' "$TMP_FILE"` lines a `PreToolUse:Bash` shim
 * carries, in file order.
 *
 * Every such shim prefilters in pure bash before resolving `tsx`, which makes
 * the prefilter a hand-maintained second copy of what its checker models — and
 * a copy nothing else grades: both tiers stay green while disagreeing, and the
 * disagreement costs a DENY. Each shim's binding test reads its SHIPPED
 * patterns through this function rather than restating them, because a
 * restatement is a third copy to drift.
 *
 * Anchored on the FLAGS rather than on the pattern, so editing a pattern is
 * what a binding test grades rather than what hides the pattern from it.
 *
 * Counting and naming stay with each caller: how many prefilters a shim owes
 * and what each one means are facts about that shim.
 */
const GREP_PATTERN = /^grep -qE -- '(.+)' "\$TMP_FILE"/gm;

export function readShimGrepPatterns(shimPath: string) {
  const shim = readFileSync(shimPath, 'utf8');
  /** Narrowed inside a `flatMap` rather than behind a nullish fallback, which
   * would fabricate an empty pattern for a caller to grade against. */
  return [...shim.matchAll(GREP_PATTERN)].flatMap((match) => {
    const [, pattern] = match;
    return typeof pattern === 'string' ? [pattern] : [];
  });
}

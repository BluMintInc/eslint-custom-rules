/**
 * Pattern options are declared as bare `string[]` because JSON Schema cannot
 * express "is a compilable regex". Schema validation therefore hands any string
 * straight to `new RegExp`, and an exception raised while building a rule aborts
 * the entire lint run — every file, every other rule — with an opaque
 * `Error while loading rule …` naming neither the option nor the offending
 * value.
 *
 * Rejecting the configuration is the right response: silently dropping a
 * pattern would leave the consumer's allowlist inert, so the code they
 * deliberately excluded would be reported anyway with no indication why. This
 * helper makes the rejection actionable and uniform — every failure is
 * collected and rethrown as a single error naming the rule, the option and each
 * bad pattern alongside the underlying regex error.
 */

export type PatternRejection = {
  /**
   * Refuses a pattern that compiles but is still unacceptable — a source with
   * nested quantifiers, say, which risks catastrophic backtracking. Checked
   * before compilation, so a refused pattern is never also reported as invalid.
   */
  isRejected: (pattern: string) => boolean;
  /**
   * Builds the clause head for refused patterns, e.g.
   * `unsafe allowPatterns (avoid nested quantifiers…)`. Receives the option name
   * so callers need not repeat it.
   */
  describe: (optionName: string) => string;
};

function describeError(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error
    ? ` (${String((error as { message?: string }).message)})`
    : '';
}

/**
 * Compiles a user-supplied list of regex sources, throwing one actionable
 * configuration error listing every pattern that failed.
 *
 * @param ruleName Rule id used to prefix the thrown message.
 * @param optionName Option the patterns came from, named in the thrown message.
 * @param patterns Regex source strings supplied by the consumer.
 * @param flags Flags applied to every compiled pattern (`'i'`, say).
 * @param rejection Optional extra admissibility check applied before compiling.
 */
export function compilePatternOption(
  ruleName: string,
  optionName: string,
  patterns: readonly string[],
  flags?: string,
  rejection?: PatternRejection,
): RegExp[] {
  const invalid: string[] = [];
  const rejected: string[] = [];

  const compiled = patterns.flatMap((pattern) => {
    try {
      if (rejection?.isRejected(pattern)) {
        rejected.push(pattern);
        return [];
      }
      return [new RegExp(pattern, flags)];
    } catch (error: unknown) {
      invalid.push(`${pattern}${describeError(error)}`);
      return [];
    }
  });

  if (invalid.length === 0 && rejected.length === 0) {
    return compiled;
  }

  const clauses: string[] = [];
  if (invalid.length > 0) {
    clauses.push(`invalid ${optionName}: ${invalid.join(', ')}`);
  }
  if (rejected.length > 0 && rejection) {
    clauses.push(`${rejection.describe(optionName)}: ${rejected.join(', ')}`);
  }
  throw new Error(`${ruleName}: ${clauses.join('; ')}`);
}

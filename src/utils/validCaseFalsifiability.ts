/**
 * `RuleTester` registers the rule under exactly the bare name passed to `run()`,
 * so a block `eslint-disable` written *inside a test fixture* silences the very
 * rule the case is asserting about. A `valid` case carrying one passes for every
 * possible implementation — including one that reports on every node — so it
 * proves nothing while looking like false-positive protection.
 *
 * That is the worst place to lose coverage: CLAUDE.md ranks a false positive
 * above a false negative, and agora disables a rule outright on any report, so
 * `valid` cases are what stand between a regression and a rule being switched
 * off downstream.
 *
 * Line-scoped directives (`eslint-disable-line`, `eslint-disable-next-line`) are
 * deliberately not treated this way. They pin suppression to one line, so a rule
 * that moved or widened its report still escapes them and fails the case.
 * Likewise a plugin-prefixed id (`@blumintinc/blumint/<name>`) does not suppress
 * anything under `RuleTester`, which knows the rule only by its bare name.
 *
 * Known blind spot: a fixture whose line-scoped directives happen to cover
 * *every* reportable line is inert too, and this check does not see it —
 * deciding that needs to know which lines a rule would report on, which is a
 * whole-suite mutation run rather than something a per-suite check can afford.
 * Two such cases exist (both in `prefer-fragment-component`'s suppression
 * matrix). `.claude/tmp/vacuous-sweep.sh` is the exhaustive dynamic check and
 * puts the true total at 23 against the 21 counted here.
 */

/** ESLint separates a directive's rule list from its justification with ` -- `. */
const JUSTIFICATION = /\s--\s[\s\S]*$/;

/**
 * Block-form disables only. `eslint-disable` written as a line comment is not a
 * directive at all, and the `-line` / `-next-line` forms are line-scoped.
 */
const BLOCK_DISABLE =
  /\/\*\s*eslint-disable(?!-next-line\b|-line\b)([\s\S]*?)\*\//g;

/**
 * The rule ids a block disable turns off, or `null` for a bare directive, which
 * turns off everything.
 */
function disabledRules(directiveBody: string): Set<string> | null {
  const body = directiveBody.replace(JUSTIFICATION, '').trim();
  if (body === '') {
    return null;
  }
  return new Set(
    body
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

/** Whether `code` blanket-disables `ruleName` somewhere in the fixture. */
export function suppressesRuleUnderTest(
  code: string,
  ruleName: string,
): boolean {
  BLOCK_DISABLE.lastIndex = 0;
  let match = BLOCK_DISABLE.exec(code);
  while (match !== null) {
    const rules = disabledRules(match[1]);
    if (rules === null || rules.has(ruleName)) {
      return true;
    }
    match = BLOCK_DISABLE.exec(code);
  }
  return false;
}

type ValidCase = string | { code?: string };

function codeOf(testCase: ValidCase): string {
  if (typeof testCase === 'string') {
    return testCase;
  }
  return testCase?.code ?? '';
}

/**
 * Cases that carry a blanket disable *on purpose*: they exist to prove a rule
 * honours suppression (the #1404 import-carrier class), so the directive is the
 * subject of the test rather than an accident.
 *
 * Counts are exact — not a minimum — so a newly added inert case fails here
 * instead of shipping. Resolving #1489, which decides whether these are
 * redundant with the guards already in each rule's `invalid` array, is what
 * removes entries; the map should only ever shrink.
 */
export const CASES_ALLOWED_TO_SUPPRESS: Readonly<Record<string, number>> =
  Object.freeze({
    'enforce-assert-safe-object-key': 2,
    'enforce-memoize-async': 2,
    'enforce-memoize-getters': 2,
    'enforce-querykey-ts': 2,
    'enforce-stable-hash-spread-props': 2,
    'fast-deep-equal-over-microdiff': 2,
    'no-array-length-in-deps': 2,
    'prefer-fragment-component': 3,
    'prefer-usecallback-over-usememo-for-functions': 2,
    'require-memoize-jsx-returners': 2,
  });

/**
 * Throws when a rule's `valid` array contains more blanket-suppressed cases than
 * are deliberately allowed.
 */
export function assertValidCasesCanFail(
  ruleName: string,
  valid: readonly ValidCase[],
): void {
  const suppressed = valid.filter((testCase) =>
    suppressesRuleUnderTest(codeOf(testCase), ruleName),
  );
  const allowed = CASES_ALLOWED_TO_SUPPRESS[ruleName] ?? 0;
  if (suppressed.length <= allowed) {
    return;
  }

  const excerpts = suppressed
    .map((testCase) => codeOf(testCase).trim().split('\n')[0])
    .map((line) => `    ${line.slice(0, 100)}`)
    .join('\n');

  throw new Error(
    `${ruleName}: ${suppressed.length} valid case(s) blanket-disable the rule ` +
      `under test, but only ${allowed} are allowed.\n` +
      `RuleTester registers this rule as '${ruleName}', so a block ` +
      `/* eslint-disable */ (bare or naming it) inside the fixture silences it ` +
      `— the case then passes for every possible implementation and asserts ` +
      `nothing.\n` +
      `Remove the directive (the case should pass on its own), or use a ` +
      `line-scoped eslint-disable-next-line, which still pins the report ` +
      `location.\nOffending case(s):\n${excerpts}`,
  );
}

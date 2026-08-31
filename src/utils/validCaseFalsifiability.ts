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
 * That is only true of a fixture the directives do not cover completely. One
 * whose line-scoped directives happen to cover every line a report could land on
 * is inert exactly like a blanket disable, and no per-suite check can see it:
 * deciding it needs to know which lines the rule reports on and which other
 * nodes of that kind the fixture holds, which is a lint of the fixture rather
 * than a scan of its text.
 *
 * `LINE_SCOPED_CASES_ALLOWED_TO_SUPPRESS` below is that accounting, measured and
 * enforced exactly by `src/tests/line-scoped-suppression-exactness.test.ts` —
 * which runs the lint this check cannot. The reconciliation lives in an asserted
 * map rather than in this comment, because prose drifts: the sentence it
 * replaces claimed two such cases, named a `.claude/tmp` script that no longer
 * exists as the authority, and understated the real total by an order of
 * magnitude (#2232).
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

/**
 * Every comment span, block or line. A line-scoped directive is legal in either
 * form — ESLint honours the block spelling of `eslint-disable-next-line` — so
 * matching only the `//` form would miss it.
 */
const COMMENT_SPAN = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

/** The directive body, once the comment delimiters are off. */
const LINE_SCOPED_DIRECTIVE = /^\s*eslint-disable-(next-line|line)\b([\s\S]*)$/;

export type LineScopedDirective = {
  kind: 'line' | 'next-line';
  /** The 1-based line the directive suppresses reports on. */
  covers: number;
  /** The rule ids it turns off, or `null` for a bare directive (all of them). */
  rules: Set<string> | null;
};

/**
 * Every line-scoped directive in `code`, with the line each one covers.
 *
 * Scanned textually, like the block-form matcher above, so it can run in the
 * `RuleTester` hot path without a parse. The consequence is that a directive
 * spelled inside a string or template literal counts as one; the guard that
 * consumes this cross-checks each candidate against ESLint's own directive
 * processing, so a textual false positive cannot silently enter the accounting.
 */
export function lineScopedDirectives(code: string): LineScopedDirective[] {
  const directives: LineScopedDirective[] = [];
  COMMENT_SPAN.lastIndex = 0;
  let match = COMMENT_SPAN.exec(code);
  while (match !== null) {
    const span = match[0];
    const body = span.startsWith('//')
      ? span.slice(2)
      : span.slice(2, span.length - 2);
    const directive = LINE_SCOPED_DIRECTIVE.exec(body);
    if (directive) {
      const startLine = code.slice(0, match.index).split('\n').length;
      // `eslint-disable-next-line` applies to the line after the comment ENDS,
      // which is not the line it starts on once the block form spans lines.
      const endLine = startLine + (span.split('\n').length - 1);
      directives.push({
        kind: directive[1] as 'line' | 'next-line',
        covers: directive[1] === 'line' ? startLine : endLine + 1,
        rules: disabledRules(directive[2]),
      });
    }
    match = COMMENT_SPAN.exec(code);
  }
  return directives;
}

/**
 * The lines on which `ruleName` is suppressed by a line-scoped directive.
 *
 * A BARE line-scoped directive counts: it turns off every rule on its line,
 * which suppresses the rule under test at least as completely as one naming it.
 * Reading only the named spelling would leave the strongest form of the same
 * suppression outside the accounting.
 */
export function lineScopedCoverage(
  code: string,
  ruleName: string,
): Set<number> {
  const covered = new Set<number>();
  for (const directive of lineScopedDirectives(code)) {
    if (directive.rules === null || directive.rules.has(ruleName)) {
      covered.add(directive.covers);
    }
  }
  return covered;
}

/**
 * Cases whose line-scoped directives cover every line the rule under test could
 * report on, so the case cannot fail for any implementation — the line-scoped
 * twin of `CASES_ALLOWED_TO_SUPPRESS`, and the same contract: counts are EXACT,
 * not a ceiling, so both a new inert case and one that stops being inert fail.
 *
 * Every entry is the #1404 idiom in its line-scoped spelling: a fixture that
 * exists to prove the rule (and its fixer) honours per-line suppression, so the
 * directive is the subject of the test rather than an accident. All nine rules
 * ship `fixable: 'code'`, which is what those cases pin — a suppressed report
 * takes its fix with it, and the file must come back from `--fix` untouched.
 *
 * Keyed by the DISPLAY name passed to `run()`, the name `RuleTester` registers
 * and therefore the name a fixture's directive has to spell.
 *
 * `src/tests/line-scoped-suppression-exactness.test.ts` measures this by linting
 * each candidate with the report site instrumented; see its header for how a
 * case is classified inert. Three of the 23 candidates are deliberately absent
 * because they measure FALSIFIABLE: `prefer-clone-deep`'s one case (a nested
 * `ObjectExpression` survives outside the covered line) and both
 * `enforce-assert-safe-object-key` cases (it reports on an `Identifier`, and
 * those fixtures hold identifiers — the key's own declaration among them — on
 * uncovered lines).
 */
export const LINE_SCOPED_CASES_ALLOWED_TO_SUPPRESS: Readonly<
  Record<string, number>
> = Object.freeze({
  'enforce-memoize-async': 2,
  'enforce-memoize-getters': 2,
  'enforce-querykey-ts': 2,
  'enforce-stable-hash-spread-props': 2,
  'fast-deep-equal-over-microdiff': 2,
  'no-array-length-in-deps': 4,
  'prefer-fragment-component': 3,
  'prefer-usecallback-over-usememo-for-functions': 1,
  'require-memoize-jsx-returners': 2,
});

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

import { Linter } from 'eslint';
import {
  FixtureCase,
  defaultFilenameFor,
  defineCorpusParsers,
  fallbackFilenamesFor,
  harvestFixtureCorpus,
  parserKeyFor,
  parserOptionsFor,
  severityWithOptions,
  silentWithoutProgramRuleNames,
} from '../utils/fixtureCorpus';

// Using require to avoid test build-time ESM interop issues; the test runner
// only needs the plugin object shape (rules), not types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as {
  rules: Record<string, { meta?: Record<string, unknown> }>;
};
const PREFIX = '@blumintinc/blumint/';

/**
 * A fixer must remove its own trigger. When it does not, ESLint's fix loop
 * re-applies it on every pass until it gives up at the tenth, so a single
 * `--fix` multiplies the fix into the file and still reports the error.
 *
 * `RuleTester` cannot see this: it applies exactly ONE fix pass, and only
 * compares against `output` when a case declares one. A non-convergent fixer
 * therefore looks correct, and a case can even enshrine the broken single-pass
 * result as its expectation — which is what hid #1461, where a `headerTemplate`
 * that did not satisfy the rule was prepended ten times to every matching file.
 *
 * This guard runs the real multi-pass `Linter#verifyAndFix` loop and requires
 * that no message from the same rule survives it *still carrying a fix*. That
 * phrasing is what keeps it precise: a rule that legitimately reports
 * unfixable violations alongside fixable ones leaves messages behind with no
 * `fix`, and those are not failures. Output that no longer parses is also a
 * failure — a fix may not corrupt the file it edits.
 *
 * A SUGGESTION is the same transform behind a human keystroke, and `meta
 * .fixable` alone made every suggestion-only rule invisible here (#1601). It is
 * probed on the same corpus but under a DIFFERENT definition of convergence,
 * because `--fix` never applies a suggestion: each suggestion is applied ALONE
 * to the untouched input, never composed with a sibling and never iterated to a
 * fixed point, since neither is a state a consumer can reach. What must hold is
 * one step of progress — the rule must not still report that same messageId at
 * the same count or higher on the output, which is what a suggestion that fails
 * to clear its own trigger looks like from the editor.
 *
 * The corpus is the suite's OWN `RuleTester` cases, captured by
 * `harvestFixtureCorpus` with their `options`, `filename` and `parserOptions`
 * attached. Text-parsing the test files for string literals — what this guard
 * did until #1732 — silently dropped every case a suite assembles by
 * interpolation and stripped the configuration from the ones it kept, so a rule
 * could read as swept while nothing of it had been probed.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const linter = new Linter();
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}
defineCorpusParsers(linter);

const configFor = (rule: string, testCase: FixtureCase): Linter.Config =>
  ({
    // The fixture's OWN parser. Convergence is a property of the fix loop, not
    // of TypeScript, and the two rules whose only fixtures are JSON and
    // Markdown ship `fixable: 'code'` — under the TypeScript parser their input
    // is a fatal, no fix is ever offered, and the loop goes unexercised (#1860).
    parser: parserKeyFor(testCase),
    parserOptions: parserOptionsFor(testCase),
    rules: { [PREFIX + rule]: severityWithOptions(testCase) },
  } as Linter.Config);

type Finding = {
  kind:
    | 'non-convergent'
    | 'fix-breaks-parse'
    | 'suggestion-non-convergent'
    | 'suggestion-breaks-parse';
  detail: string;
  code: string;
  options?: readonly unknown[];
  origin: string;
  filename: string;
  output: string;
};

type CaseOutcome = {
  reported: boolean;
  /** A fix was offered, so convergence was genuinely exercised. */
  checked: boolean;
  finding: Finding | null;
};

const SILENT: CaseOutcome = { reported: false, checked: false, finding: null };

const checkCase = (
  rule: string,
  testCase: FixtureCase,
  filename: string,
): CaseOutcome => {
  const id = PREFIX + rule;
  const config = configFor(rule, testCase);
  let before: Linter.LintMessage[];
  try {
    before = linter.verify(testCase.code, config, { filename });
  } catch {
    return SILENT;
  }
  const mine = before.filter((m) => m.ruleId === id);
  // Nothing to converge unless this configuration actually offers a fix. This
  // also skips input that does not parse, which reports fatally and nothing else.
  if (!mine.some((m) => m.fix)) {
    return { reported: mine.length > 0, checked: false, finding: null };
  }

  const context = {
    code: testCase.code,
    options: testCase.options,
    origin: testCase.origin,
    filename,
  };

  let output: string;
  let after: Linter.LintMessage[];
  try {
    output = linter.verifyAndFix(testCase.code, config, { filename }).output;
    after = linter.verify(output, config, { filename });
  } catch (err) {
    return {
      reported: true,
      checked: true,
      finding: {
        kind: 'fix-breaks-parse',
        detail: `linting the fixed output threw: ${(err as Error).message}`,
        ...context,
        output: '',
      },
    };
  }

  const fatal = after.find((m) => m.fatal || m.ruleId === null);
  if (fatal) {
    return {
      reported: true,
      checked: true,
      finding: {
        kind: 'fix-breaks-parse',
        detail: fatal.message,
        ...context,
        output,
      },
    };
  }

  const stillFixable = after.filter((m) => m.ruleId === id && m.fix);
  if (stillFixable.length > 0) {
    return {
      reported: true,
      checked: true,
      finding: {
        kind: 'non-convergent',
        detail: `${
          stillFixable.length
        } fixable message(s) survive the fix loop: ${stillFixable
          .map((m) => m.messageId || m.message)
          .join(', ')}`,
        ...context,
        output,
      },
    };
  }
  return { reported: true, checked: true, finding: null };
};

const applyEdit = (
  text: string,
  fix: { range: readonly number[]; text: string },
) => text.slice(0, fix.range[0]) + fix.text + text.slice(fix.range[1]);

/** A rule reporting without a messageId still needs a stable counting key. */
const keyOf = (message: Linter.LintMessage) =>
  message.messageId || message.message;

/**
 * Convergence for a suggestion, which the fix loop never touches.
 *
 * Each suggestion is applied on its own to the ORIGINAL source. Composing two
 * suggestions from one report, or feeding a suggestion's output back through
 * the rule, would judge it against a state no editor can produce. One step of
 * progress is the whole contract: after accepting the suggestion, the rule must
 * report that messageId strictly fewer times than before. Equal or higher means
 * the suggestion did not clear the trigger it was offered for, and the human
 * who accepted it is looking at the same squiggle.
 */
const checkSuggestions = (
  rule: string,
  testCase: FixtureCase,
  filename: string,
): { applied: number; findings: Finding[] } => {
  const id = PREFIX + rule;
  const config = configFor(rule, testCase);
  let before: Linter.LintMessage[];
  try {
    before = linter.verify(testCase.code, config, { filename });
  } catch {
    return { applied: 0, findings: [] };
  }
  // Input that does not parse reports fatally and nothing else.
  if (before.some((m) => m.fatal)) return { applied: 0, findings: [] };

  const mine = before.filter((m) => m.ruleId === id);
  const beforeCounts = new Map<string, number>();
  for (const m of mine) {
    beforeCounts.set(keyOf(m), (beforeCounts.get(keyOf(m)) || 0) + 1);
  }

  const context = {
    code: testCase.code,
    options: testCase.options,
    origin: testCase.origin,
    filename,
  };

  const findings: Finding[] = [];
  let applied = 0;
  for (const message of mine) {
    for (const suggestion of message.suggestions || []) {
      if (!suggestion.fix) continue;
      const output = applyEdit(testCase.code, suggestion.fix);
      if (output === testCase.code) continue;
      applied++;

      let after: Linter.LintMessage[];
      try {
        after = linter.verify(output, config, { filename });
      } catch (err) {
        findings.push({
          kind: 'suggestion-breaks-parse',
          detail: `linting the suggested output threw: ${
            (err as Error).message
          }`,
          ...context,
          output,
        });
        continue;
      }

      const fatal = after.find((m) => m.fatal);
      if (fatal) {
        findings.push({
          kind: 'suggestion-breaks-parse',
          detail: `"${suggestion.desc}" produced unparseable output: ${fatal.message}`,
          ...context,
          output,
        });
        continue;
      }

      const key = keyOf(message);
      const wasReported = beforeCounts.get(key) || 0;
      const stillReported = after.filter(
        (m) => m.ruleId === id && keyOf(m) === key,
      ).length;
      if (stillReported >= wasReported) {
        findings.push({
          kind: 'suggestion-non-convergent',
          detail: `"${suggestion.desc}" left ${key} reported ${stillReported} time(s), was ${wasReported}`,
          ...context,
          output,
        });
      }
    }
  }
  return { applied, findings };
};

const corpus = harvestFixtureCorpus();

const fixableRules = Object.entries(plugin.rules)
  .filter(([, rule]) => rule && rule.meta && rule.meta.fixable)
  .map(([name]) => name)
  .sort();

const suggestionRules = Object.entries(plugin.rules)
  .filter(([, rule]) => rule && rule.meta && rule.meta.hasSuggestions)
  .map(([name]) => name)
  .sort();

type RuleResult = {
  cases: number;
  probed: number;
  reported: number;
  /** Probes where a fix existed, which is the only non-vacuous count here. */
  checked: number;
  findings: Finding[];
};

const results = new Map<string, RuleResult>();

for (const rule of fixableRules) {
  const cases = corpus.byRule.get(rule) || [];
  const result: RuleResult = {
    cases: cases.length,
    probed: 0,
    reported: 0,
    checked: 0,
    findings: [],
  };

  const probe = (testCase: FixtureCase, filename: string) => {
    result.probed++;
    const outcome = checkCase(rule, testCase, filename);
    if (outcome.reported) result.reported++;
    if (outcome.checked) result.checked++;
    if (outcome.finding) result.findings.push(outcome.finding);
  };

  for (const testCase of cases) probe(testCase, defaultFilenameFor(testCase));
  // Second chance for a rule that nothing exercised: only then is re-probing
  // under invented paths worth its cost (see FALLBACK_FILENAMES).
  if (result.checked === 0) {
    for (const testCase of cases) {
      if (testCase.filename) continue;
      for (const filename of fallbackFilenamesFor(testCase)) {
        probe(testCase, filename);
      }
    }
  }

  results.set(rule, result);
}

const totalProbed = [...results.values()].reduce((a, r) => a + r.probed, 0);
const totalChecked = [...results.values()].reduce((a, r) => a + r.checked, 0);
const rulesChecked = [...results.values()].filter((r) => r.checked > 0).length;

/**
 * Why a rule's fixer was never exercised. Derived from the run rather than
 * asserted by hand, so an entry cannot claim a reason the corpus contradicts.
 */
const REASONS = {
  noFixtures: 'declares no fixture this TypeScript harness can lint',
  // Held for a rule that measurably produces nothing here. The old wording
  // ("is type-aware, and a bare Linter has no program") was a premise, not a
  // measurement, and a false one: the parser builds an isolated program and all
  // 16 checker-touching rules report over their own fixtures (#1859).
  undrivable:
    'is measurably silent under this harness, so its fixer is unreachable here',
  neverReports: 'never reports on any of its own fixtures',
  reportsWithoutFix: 'reports on its own fixtures but never offers a fix',
} as const;

type Reason = typeof REASONS[keyof typeof REASONS];

const reasonFor = (rule: string): Reason => {
  const result = results.get(rule)!;
  if (result.cases === 0) return REASONS.noFixtures;
  if (silentWithoutProgramRuleNames.has(rule)) return REASONS.undrivable;
  if (result.reported === 0) return REASONS.neverReports;
  return REASONS.reportsWithoutFix;
};

/**
 * Every fixable rule whose fixer this corpus cannot reach, with the reason the
 * run itself produces.
 *
 * Enforced BOTH ways below. A rule that stops being exercised must be added
 * here consciously, and an entry that stops reproducing must be deleted — a
 * one-way list would let a rule go dark under an entry written for a reason
 * that no longer holds, which is the failure mode #1732 records: a floor of
 * "70 of 84 probed" tolerated twelve more rules falling silent, and for a
 * zero-probed rule the per-rule assertion below reduces to `expect('')
 * .toBe('')`.
 *
 * EMPTY BY DESIGN: every fixable rule's fixer is reachable from its own
 * fixtures. The last entry — `no-usememo-for-pass-by-value`, whose type-aware
 * classification is `indeterminate` under the lib-less isolated program this
 * harness leaves behind when it strips `parserOptions.project` — was retired by
 * fixtures whose memoized value is `undefined`/`null`, the classification that
 * survives that degradation (#1871).
 */
const UNREACHED_FIXERS: Record<string, Reason> = {};

const observedUnreached = Object.fromEntries(
  fixableRules
    .filter((rule) => results.get(rule)!.checked === 0)
    .map((rule) => [rule, reasonFor(rule)]),
);

/**
 * Kept in its own map rather than merged into `results`: a rule can declare
 * both, and folding its suggestion findings into its fixer's bucket would let
 * one dimension's silence read as the other's health.
 */
const suggestionResults = new Map<
  string,
  { applied: number; findings: Finding[] }
>();

for (const rule of suggestionRules) {
  const cases = corpus.byRule.get(rule) || [];
  const findings: Finding[] = [];
  let applied = 0;
  const probe = (testCase: FixtureCase, filename: string) => {
    const result = checkSuggestions(rule, testCase, filename);
    applied += result.applied;
    findings.push(...result.findings);
  };
  for (const testCase of cases) probe(testCase, defaultFilenameFor(testCase));
  // Same second chance the fix channel gets, and for the same reason.
  if (applied === 0) {
    for (const testCase of cases) {
      if (testCase.filename) continue;
      for (const filename of fallbackFilenamesFor(testCase)) {
        probe(testCase, filename);
      }
    }
  }
  suggestionResults.set(rule, { applied, findings });
}

const totalSuggestionsApplied = [...suggestionResults.values()].reduce(
  (total, entry) => total + entry.applied,
  0,
);

const reportOf = (findings: Finding[]) =>
  findings
    .map(
      (f) =>
        `[${f.kind}] ${f.detail}\nsrc/tests/${f.origin} as ${
          f.filename
        }\noptions: ${JSON.stringify(f.options)}\n--- input ---\n${
          f.code
        }\n--- after ---\n${f.output}`,
    )
    .join('\n\n');

/**
 * Printed per rule with its reason, not merely asserted: a rule that lands in
 * an unlabelled bucket reads as "this rule has no fixable trigger" when the
 * truth may be that the harness dropped it (#1526, #1732).
 */
console.log(
  [
    `[fixer-convergence] ${rulesChecked} of ${fixableRules.length} fixable ` +
      `rules exercised; ${totalChecked} of ${totalProbed} probes offered a fix`,
    `  corpus: ${corpus.totalCases} cases from ${corpus.suitesUsed} suites, ` +
      `${corpus.filesLoaded} files loaded, ${corpus.failures.length} failed`,
    `  unreached (${
      Object.keys(observedUnreached).length
    }), each with its reason:`,
    ...Object.entries(observedUnreached).map(
      ([rule, reason]) => `    ${rule}: ${reason}`,
    ),
    `  suggestion channel: ${totalSuggestionsApplied} suggestion(s) applied ` +
      `across ${suggestionRules.length} rule(s)`,
  ].join('\n'),
);

describe('fixers must converge under the multi-pass fix loop', () => {
  /**
   * Coverage floor. The assertions below pass trivially if harvesting breaks,
   * so the corpus size is asserted rather than assumed.
   */
  it('probes a meaningful share of the fixable rules', () => {
    expect(fixableRules.length).toBeGreaterThan(70);
    // Exact, not a floor: the accounting test names every rule below this
    // count, so slack here would just re-open the hole #1732 describes.
    expect(rulesChecked).toBe(
      fixableRules.length - Object.keys(UNREACHED_FIXERS).length,
    );
    expect(totalProbed).toBeGreaterThanOrEqual(7500);
    expect(totalChecked).toBeGreaterThanOrEqual(2500);
    expect(corpus.failures).toEqual([]);
  });

  it('accounts for every fixable rule, unreached ones by reason', () => {
    expect(observedUnreached).toEqual(UNREACHED_FIXERS);
  });

  it.each(fixableRules)('%s', (rule) => {
    const { checked, findings } = results.get(rule)!;
    const problems: string[] = [];
    // Without this, a rule the corpus stopped reaching asserts nothing at all.
    if (checked === 0 && !(rule in UNREACHED_FIXERS)) {
      problems.push(
        `no fixture of this rule offered a fix, so convergence was never ` +
          `exercised (${reasonFor(rule)}). Restore a triggering fixture, or ` +
          `add the rule to UNREACHED_FIXERS with that reason.`,
      );
    }
    // A finding means the fix must decline instead; see #1461.
    if (findings.length) problems.push(reportOf(findings));
    expect(problems.join('\n\n')).toBe('');
  });
});

/** A planted control is not a harvested fixture, but it is probed as one. */
const plantedCase = (code: string): FixtureCase => ({
  code,
  tester: 'ruleTesterTs',
  origin: 'planted control',
  bucket: 'valid',
});

/**
 * Planted suggestion rules, run through the same `checkSuggestions` the real
 * rules go through. A zero over the real rules means nothing unless a
 * known-broken suggestion is caught by the same code path, and the convergent
 * control pins the polarity so a future loosening cannot make the check inert.
 */
const CONTROLS: Array<{
  name: string;
  code: string;
  expectFindings: Finding['kind'][];
  rule: Record<string, any>;
}> = [
  {
    name: 'control-suggestion-nonconvergent',
    // Edits the initializer but leaves the trigger — the declarator's name —
    // untouched, so the rule reports the same messageId on its own output.
    code: 'const bad = 1;\n',
    expectFindings: ['suggestion-non-convergent'],
    rule: {
      meta: {
        type: 'suggestion',
        hasSuggestions: true,
        schema: [],
        messages: { m: 'x', s: 'bump the initializer' },
      },
      create(context: any) {
        return {
          VariableDeclarator(node: any) {
            if (node.id.name !== 'bad') return;
            context.report({
              node,
              messageId: 'm',
              suggest: [
                {
                  messageId: 's',
                  fix: (f: any) => f.replaceText(node.init, '99'),
                },
              ],
            });
          },
        };
      },
    },
  },
  {
    name: 'control-suggestion-breaks-parse',
    code: 'const bad = 1;\n',
    expectFindings: ['suggestion-breaks-parse'],
    rule: {
      meta: {
        type: 'suggestion',
        hasSuggestions: true,
        schema: [],
        messages: { m: 'x', s: 'corrupt the initializer' },
      },
      create(context: any) {
        return {
          VariableDeclarator(node: any) {
            if (node.id.name !== 'bad') return;
            context.report({
              node,
              messageId: 'm',
              suggest: [
                {
                  messageId: 's',
                  fix: (f: any) => f.replaceText(node.init, '1 +'),
                },
              ],
            });
          },
        };
      },
    },
  },
  {
    name: 'control-suggestion-convergent',
    // Renames the trigger, so the report is gone from the output. Must produce
    // NO finding, or the check would flag every suggestion in the plugin.
    code: 'const bad = 1;\n',
    expectFindings: [],
    rule: {
      meta: {
        type: 'suggestion',
        hasSuggestions: true,
        schema: [],
        messages: { m: 'x', s: 'rename the binding' },
      },
      create(context: any) {
        return {
          VariableDeclarator(node: any) {
            if (node.id.name !== 'bad') return;
            context.report({
              node,
              messageId: 'm',
              suggest: [
                {
                  messageId: 's',
                  fix: (f: any) => f.replaceText(node.id, 'good'),
                },
              ],
            });
          },
        };
      },
    },
  },
];

for (const control of CONTROLS) {
  linter.defineRule(PREFIX + control.name, control.rule as never);
}

/**
 * A planted NON-CONVERGENT fixer, run through `checkCase` itself. The fix
 * channel's real rules are all convergent, so without this the fix-side
 * detector is only ever observed returning null and a regression that broke it
 * would read as a clean sweep.
 */
const FIX_CONTROLS: Array<{
  name: string;
  code: string;
  expectKinds: Finding['kind'][];
  rule: Record<string, any>;
}> = [
  {
    name: 'control-fix-nonconvergent',
    // Re-wraps its own output, so every pass of the loop finds the trigger again.
    code: 'const value = compute();\n',
    expectKinds: ['non-convergent'],
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: any) {
        return {
          CallExpression(node: any) {
            if (node.callee.name !== 'compute') return;
            context.report({
              node,
              messageId: 'm',
              fix: (f: any) => f.replaceText(node, `wrap(${'compute()'})`),
            });
          },
        };
      },
    },
  },
  {
    name: 'control-fix-breaks-parse',
    code: 'const value = compute();\n',
    expectKinds: ['fix-breaks-parse'],
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: any) {
        return {
          CallExpression(node: any) {
            if (node.callee.name !== 'compute') return;
            context.report({
              node,
              messageId: 'm',
              fix: (f: any) => f.replaceText(node, 'compute( ,'),
            });
          },
        };
      },
    },
  },
  {
    name: 'control-fix-convergent',
    // Clears its own trigger on the first pass: must produce NO finding.
    code: 'const value = compute();\n',
    expectKinds: [],
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: any) {
        return {
          CallExpression(node: any) {
            if (node.callee.name !== 'compute') return;
            context.report({
              node,
              messageId: 'm',
              fix: (f: any) => f.replaceText(node.callee, 'computed'),
            });
          },
        };
      },
    },
  },
];

for (const control of FIX_CONTROLS) {
  linter.defineRule(PREFIX + control.name, control.rule as never);
}

describe('the convergence detector is load-bearing', () => {
  it.each(FIX_CONTROLS.map((c) => [c.name, c.expectKinds] as const))(
    'control %s yields %s',
    (name, expectKinds) => {
      const control = FIX_CONTROLS.find((c) => c.name === name)!;
      const outcome = checkCase(name, plantedCase(control.code), 'file.ts');
      // A control whose fix never reached the harness would prove nothing.
      expect(outcome.checked).toBe(true);
      expect(outcome.finding ? [outcome.finding.kind] : []).toEqual(
        expectKinds,
      );
    },
  );

  /**
   * The corpus must carry the configuration each case was written for. A
   * fixture whose fix only exists under its own options is the shape #1461
   * lived in, and a corpus of bare snippets cannot reach it.
   */
  it('carries options and filenames from the fixtures themselves', () => {
    const cases = [...corpus.byRule.values()].flat();
    expect(cases.filter((c) => c.options).length).toBeGreaterThanOrEqual(250);
    expect(cases.filter((c) => c.filename).length).toBeGreaterThanOrEqual(3690);
    // Interpolated fixtures are the ones the text harvest could not see at all.
    expect(
      (corpus.byRule.get('no-usememo-for-pass-by-value') || []).length,
    ).toBeGreaterThanOrEqual(198);
  });
});

describe('suggestions must clear the trigger they are offered for', () => {
  it.each(CONTROLS.map((c) => [c.name, c.expectFindings] as const))(
    'control %s yields %s',
    (name, expectFindings) => {
      const control = CONTROLS.find((c) => c.name === name)!;
      const { applied, findings } = checkSuggestions(
        name,
        plantedCase(control.code),
        '/repo/src/util/helper.ts',
      );
      // A control whose suggestion never reached the harness would prove
      // nothing about either polarity.
      expect(applied).toBe(1);
      expect(findings.map((f) => f.kind)).toEqual(expectFindings);
    },
  );

  /**
   * Non-vacuity floor, per rule. A suggestion the harness never applies asserts
   * nothing, and a total would let one prolific rule hide another that stopped
   * emitting entirely.
   */
  it('applies at least one suggestion from every suggestion-emitting rule', () => {
    expect(suggestionRules.length).toBeGreaterThanOrEqual(7);
    expect(
      Object.fromEntries(
        suggestionRules.map((rule) => [
          rule,
          suggestionResults.get(rule)!.applied > 0,
        ]),
      ),
    ).toEqual(Object.fromEntries(suggestionRules.map((rule) => [rule, true])));
    expect(totalSuggestionsApplied).toBeGreaterThanOrEqual(250);
  });

  it.each(suggestionRules)('%s', (rule) => {
    const { applied, findings } = suggestionResults.get(rule)!;
    // The row asserts it did work before it asserts a zero. The check above
    // covers the same ground in aggregate, but a green row named after a rule
    // whose suggestions were never applied reads as evidence that rule was
    // checked (#1861), so the row states it for itself.
    expect(applied).toBeGreaterThan(0);
    // A finding means the suggestion must clear its own trigger, or decline.
    expect(findings.length === 0 ? '' : reportOf(findings)).toBe('');
  });
});

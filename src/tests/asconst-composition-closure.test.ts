import { Linter } from 'eslint';
import {
  FixtureCase,
  defaultFilenameFor,
  harvestFixtureCorpus,
  parserOptionsFor,
  severityWithOptions,
  silentWithoutProgramRuleNames,
} from '../utils/fixtureCorpus';

/**
 * A sibling rule's `as const` must not silence another rule.
 *
 * Three rules in `configs.recommended` append `as const` with `--fix`, so the
 * wrapper arrives on code the author never wrapped. A rule that classifies its
 * subject with a bare `node.type === ObjectExpression` / `=== Literal` test
 * goes blind the moment one does, which means `eslint --fix` can silence a rule
 * on the very code it just rewrote.
 *
 * This is the DELETION direction of fix closure. `recommended-config-fix-closure`
 * counts reports a fix INTRODUCES, so it is structurally blind to a fix that
 * removes one — the gap that let #1805, #1806 and #1807 ship.
 *
 * The causal isolation below is load-bearing rather than incidental.
 * `global-const-style` both renames a constant and appends the assertion in one
 * rewrite, and the rename accounts for half the raw signal: of the 8 rules the
 * first sweep flagged, only 4 lost their report to the assertion. Comparing the
 * fixed output against the same output with ONLY ` as const` removed is what
 * separates them, so without it this guard would fail four rules that are
 * behaving correctly.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as { rules: Record<string, any> };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tsParser = require('@typescript-eslint/parser');

const PREFIX = '@blumintinc/blumint/';

const linter = new Linter();
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}
linter.defineParser('ts', tsParser);

/** Recommended rules whose fixer appends an `as const`. */
const CULPRITS = [
  'enforce-object-literal-as-const',
  'global-const-style',
  'prefer-union-from-const-array',
];

const configWith = (
  testCase: FixtureCase,
  rules: Record<string, unknown>,
): Linter.Config =>
  ({
    parser: 'ts',
    parserOptions: parserOptionsFor(testCase),
    rules,
  } as Linter.Config);

const reportsOf = (
  rule: string,
  code: string,
  testCase: FixtureCase,
  filename: string,
): Set<string> | null => {
  const id = PREFIX + rule;
  let messages: Linter.LintMessage[];
  try {
    messages = linter.verify(
      code,
      configWith(testCase, { [id]: severityWithOptions(testCase) }),
      { filename },
    );
  } catch {
    return null;
  }
  // A fatal parse reports nothing else, so it would read as rule silence.
  if (messages.some((m) => m.fatal)) return null;
  return new Set(
    messages
      .filter((m) => m.ruleId === id)
      .map((m) => m.messageId || m.message),
  );
};

const culpritRules = () => {
  const rules: Record<string, string> = {};
  for (const culprit of CULPRITS) rules[PREFIX + culprit] = 'error';
  return rules;
};

/** The culprits' combined `--fix` output, or null if they changed nothing. */
const afterCulpritFix = (
  testCase: FixtureCase,
  filename: string,
): string | null => {
  try {
    const result = linter.verifyAndFix(
      testCase.code,
      configWith(testCase, culpritRules()),
      { filename },
    );
    if (!result.fixed || result.output === testCase.code) return null;
    return result.output;
  } catch {
    return null;
  }
};

type Finding = {
  rule: string;
  messageId: string;
  origin: string;
  filename: string;
  before: string;
  after: string;
};

type ProbeResult = {
  findings: Finding[];
  /** Cases a culprit actually rewrote — the only number that can assert. */
  rewritten: number;
};

const probeCase = (rule: string, testCase: FixtureCase): ProbeResult => {
  const filename = defaultFilenameFor(testCase);
  const before = reportsOf(rule, testCase.code, testCase, filename);
  if (!before || before.size === 0) return { findings: [], rewritten: 0 };

  const rewritten = afterCulpritFix(testCase, filename);
  if (!rewritten || !/\bas const\b/.test(rewritten)) {
    return { findings: [], rewritten: 0 };
  }

  const after = reportsOf(rule, rewritten, testCase, filename);
  if (!after) return { findings: [], rewritten: 0 };

  const lost = [...before].filter((id) => !after.has(id));
  if (!lost.length) return { findings: [], rewritten: 1 };

  /**
   * The isolation: the SAME rewrite with only the assertion removed. A report
   * that stays missing here was lost to something else the fixer did (the
   * rename), and is not this guard's subject.
   */
  const stripped = rewritten.replace(/ as const\b/g, '');
  const restored = reportsOf(rule, stripped, testCase, filename);
  if (!restored) return { findings: [], rewritten: 1 };

  return {
    rewritten: 1,
    findings: lost
      .filter((messageId) => restored.has(messageId))
      .map((messageId) => ({
        rule,
        messageId,
        origin: testCase.origin,
        filename,
        before: testCase.code,
        after: rewritten,
      })),
  };
};

const corpus = harvestFixtureCorpus();

/**
 * Only rules that measurably cannot be driven here are excluded — that set is
 * currently empty. The wider "mentions the type checker" set used to be dropped
 * instead, on the theory that a bare `Linter` builds no program; it does build
 * one (an isolated single-file program), and all 16 of those rules report over
 * their own fixtures, so excluding them removed live coverage rather than
 * preventing a false clean (#1859). A culprit cannot be its own victim.
 */
const victims = Object.keys(plugin.rules)
  .filter((name) => !silentWithoutProgramRuleNames.has(name))
  .filter((name) => !CULPRITS.includes(name))
  .sort();

const findings: Finding[] = [];
let casesRewritten = 0;

for (const victim of victims) {
  for (const testCase of corpus.byRule.get(victim) || []) {
    const result = probeCase(victim, testCase);
    casesRewritten += result.rewritten;
    findings.push(...result.findings);
  }
}

const flaggedRules = [...new Set(findings.map((f) => f.rule))].sort();

/**
 * Rules whose silence under an assertion is correct, not a defect.
 *
 * Asserted in BOTH directions below: a rule that stops appearing must be
 * removed, and a new one must be added consciously. A one-way list would let a
 * fresh defect hide under an entry written for something else.
 */
const EXEMPT: Record<string, string> = {
  // `as const` and `satisfies T` are CHECKED assertions — TypeScript still
  // validates the literal against the declared return type — so no hazard is
  // hidden and the rule is right to stay silent. It still reports the unchecked
  // `as T` cast, which is what it exists to catch. Whether `useExplicitVariable`
  // should fire anyway is the human-labelled design call #1615; see #1808.
  'no-type-assertion-returns': 'checked assertion, tracked as #1615/#1808',
};

/**
 * Rules whose silence under an assertion is a real DEFECT, recorded so the
 * suite stays actionable while each one is filed and fixed. Distinct from
 * `EXEMPT` on purpose: an entry here is a bug with an owner, not a design call,
 * and merging the two would let a defect retire quietly under a "correct
 * silence" label.
 *
 * Surfaced by the #1859 widening — these rules were never probed because the
 * type-aware exclusion dropped them wholesale.
 */
const KNOWN_DEFECTS: Record<string, string> = {
  /**
   * TODO(#NNNN — filed from the #1859 widening): the member-expression branch
   * tests `defNode.init.type !== ObjectExpression` directly
   * (`no-inline-component-prop.ts`) instead of going through the file's own
   * `unwrapExpression`, so `global-const-style`'s `as const` hides the object.
   * `allowModuleScopeFactories: false` then silently stops enforcing:
   *
   *   const wrappers = {
   *     CatalogWrapper: (p: { children: JSX.Element }) => <div>{p.children}</div>,
   *   } as const;
   *   function Page() {
   *     return <AlgoliaLayout CatalogWrapper={wrappers.CatalogWrapper} />;
   *   }
   *
   * Reports `inlineComponentProp` without the assertion, nothing with it.
   */
  'no-inline-component-prop': 'as const hides the object; TODO(#NNNN)',
};

/** Both lists at once: the suite flags exactly the rules recorded here. */
const ACCEPTED: Record<string, string> = { ...EXEMPT, ...KNOWN_DEFECTS };

const reportOf = (rule: string) =>
  findings
    .filter((f) => f.rule === rule)
    .map(
      (f) =>
        `${f.messageId} lost to an assertion a sibling fixer added\n` +
        `src/tests/${f.origin} as ${f.filename}\n` +
        `--- before --fix ---\n${f.before}\n--- after --fix ---\n${f.after}`,
    )
    .join('\n\n');

// ---------------------------------------------------------------------------
// Controls. A zero over the real rules asserts nothing without these.
// ---------------------------------------------------------------------------

const CONTROLS = [
  {
    // Classifies on a bare node type, so the assertion hides the literal.
    name: 'control-asconst-blind',
    expect: true,
    rule: {
      meta: { type: 'problem', schema: [], messages: { m: 'no margin' } },
      create(context: any) {
        return {
          VariableDeclarator(node: any) {
            if (node.init?.type !== 'ObjectExpression') return;
            context.report({ node, messageId: 'm' });
          },
        };
      },
    },
  },
  {
    // Sees through the assertion, so it must NOT be flagged — without this the
    // guard would pass while flagging every rule that merely reports twice.
    name: 'control-asconst-transparent',
    expect: false,
    rule: {
      meta: { type: 'problem', schema: [], messages: { m: 'no margin' } },
      create(context: any) {
        const unwrap = (node: any) => {
          let current = node;
          while (
            current &&
            (current.type === 'TSAsExpression' ||
              current.type === 'TSSatisfiesExpression' ||
              current.type === 'TSNonNullExpression' ||
              current.type === 'TSTypeAssertion')
          ) {
            current = current.expression;
          }
          return current;
        };
        return {
          VariableDeclarator(node: any) {
            if (unwrap(node.init)?.type !== 'ObjectExpression') return;
            context.report({ node, messageId: 'm' });
          },
        };
      },
    },
  },
] as const;

for (const control of CONTROLS) {
  linter.defineRule(PREFIX + control.name, control.rule as never);
}

/** A module-scope object constant, which `global-const-style` rewrites. */
const CONTROL_CODE = 'export const styles = { margin: 8 };\n';

const controlCase: FixtureCase = {
  code: CONTROL_CODE,
  tester: 'ruleTesterTs',
  origin: 'planted control',
  bucket: 'invalid',
};

console.log(
  [
    `[asconst-composition] ${victims.length} victims, ` +
      `${casesRewritten} cases rewritten by a culprit --fix`,
    `  ${findings.length} finding(s) across ${flaggedRules.length} rule(s)`,
  ].join('\n'),
);

describe("a sibling fixer's assertion must not silence a rule", () => {
  it('rewrites enough cases to make a zero mean something', () => {
    expect(corpus.failures).toEqual([]);
    expect(victims.length).toBeGreaterThan(150);
    /**
     * The floor sits on cases a culprit ACTUALLY rewrote, not on cases
     * considered. Only a rewrite can produce a finding, so a collapse here —
     * a culprit losing its fixer, say — would make every assertion below pass
     * while examining nothing.
     */
    expect(casesRewritten).toBeGreaterThan(200);
  });

  it('flags exactly the rules whose silence is a filed decision', () => {
    expect(flaggedRules).toEqual(Object.keys(ACCEPTED).sort());
  });

  it.each(victims.filter((rule) => !(rule in ACCEPTED)))('%s', (rule) => {
    expect(reportOf(rule)).toBe('');
  });
});

describe('the detector is load-bearing', () => {
  it.each(CONTROLS.map((c) => [c.name, c.expect] as const))(
    'control %s yields %s',
    (name, expected) => {
      const result = probeCase(name, controlCase);
      // A control the probe never actually rewrote would prove nothing.
      expect(result.rewritten).toBe(1);
      expect(result.findings.length > 0).toBe(expected);
    },
  );
});

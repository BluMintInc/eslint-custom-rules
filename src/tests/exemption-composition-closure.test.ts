/**
 * The recommended config's `--fix` must not destroy a rule's own EXEMPTION.
 *
 * Generalizes #1562: `enforce-memoize-async` exempted a `Promise<void>` method,
 * `no-explicit-return-type` — enabled in the same config and fixable — stripped
 * the annotation that carried the exemption, and the next `--fix` pass saw no
 * exemption and decorated the method anyway. Neither rule is wrong alone; the
 * config is wrong composed.
 *
 * The rest of the suite is structurally blind to this. Every other test is a
 * `RuleTester` run or a `Linter` with ONE rule id registered, so nothing lints a
 * fixture through more than one rule at a time.
 * `recommended-config-fix-closure.test.ts` does compose the whole config, but
 * over docs fenced blocks, and it asks the opposite question (did a fix INTRODUCE
 * a violation). Its corpus never reached this class: #1595-#1599 all shipped
 * while it was green.
 *
 * Method, per valid case:
 *   1. CONTROL — the rule alone must be SILENT on the input. A case that already
 *      reports has no exemption to destroy, and skipping this control is how the
 *      probe fakes a result.
 *   2. Run the input through the FULL recommended config with fixing on, so
 *      ESLint's own multi-pass composition applies.
 *   3. Re-lint the output with that rule ALONE. A report that exists only after
 *      the config's autofixes is an exemption the config destroyed.
 *
 * Corpus: the suite's own `valid` fixtures, harvested without executing them
 * (see `harvestRuleTesterCases`). They are the right corpus precisely because a
 * `valid` list is written to sit on the rule's carve-out boundaries — which is
 * where a sibling fixer strips a carrier. The docs blocks do not go there.
 */
import fs from 'fs';
import path from 'path';
import { Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import { harvestRuleTesterCases } from '../utils/harvestRuleTesterCases';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as {
  rules: Record<string, unknown>;
  configs: { recommended: { rules: Record<string, unknown> } };
};
/* eslint-enable @typescript-eslint/no-var-requires */

const PREFIX = '@blumintinc/blumint/';
const RULES_DIR = path.join(__dirname, '..', 'rules');

/**
 * Type-aware rules are excluded, matching `fix-closure-core-rules.test.ts`:
 * this harness has no `parserOptions.project`, so without a program they report
 * nothing and would manufacture a false clean rather than a finding.
 *
 * Detected by reading the rule sources rather than `String(rule.create)`, since
 * `createRule` wraps `create` and stringifying it matches nothing.
 */
const typeAwareNames = new Set(
  fs
    .readdirSync(RULES_DIR)
    .filter((file) => file.endsWith('.ts'))
    .filter((file) =>
      /getParserServices|getTypeChecker/.test(
        fs.readFileSync(path.join(RULES_DIR, file), 'utf8'),
      ),
    )
    .map((file) => path.basename(file, '.ts')),
);

/** The rule set whose composed `--fix` is under test. */
const FIX_CONFIG: Record<string, unknown> = {};
for (const [id, severity] of Object.entries(plugin.configs.recommended.rules)) {
  if (!id.startsWith(PREFIX)) continue;
  const name = id.slice(PREFIX.length);
  if (!plugin.rules[name] || typeAwareNames.has(name)) continue;
  FIX_CONFIG[id] = severity;
}

const linter = new Linter();
linter.defineParser('ts', tsParser as never);
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}

const configFor = (
  rules: Record<string, unknown>,
  parserOptions: unknown,
): Linter.Config =>
  ({
    parser: 'ts',
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
      ...(parserOptions as object | null),
    },
    rules,
  } as unknown as Linter.Config);

type ValidCase = {
  code: string;
  filename: string;
  options?: readonly unknown[];
  parserOptions?: unknown;
  /** Declaring suite, so a finding is reproducible by hand. */
  origin: string;
};

/**
 * Rule name resolved by OBJECT IDENTITY, never by the display name `run`
 * received: 100 of the 311 suites pass a name that is not a rule name
 * (`requireMemo`, `prefer-next-dynamic (JSX scenarios)`), and name-keyed
 * matching drops every case they declare. Identity holds because the suites and
 * `../index` resolve to the same module instance under jest.
 */
const ruleNameByIdentity = new Map<unknown, string>();
for (const [name, rule] of Object.entries(plugin.rules)) {
  ruleNameByIdentity.set(rule, name);
}

const harvested = harvestRuleTesterCases();

/**
 * The JSON and markdown testers parse a different language entirely, so their
 * fixtures cannot be linted by the TypeScript parser this config uses.
 */
const TS_TESTERS = new Set(['ruleTesterTs', 'ruleTesterJsx']);

const casesByRule = new Map<string, ValidCase[]>();
const suitesDropped: string[] = [];

for (const suite of harvested.suites) {
  const name = ruleNameByIdentity.get(suite.rule);
  if (!name) {
    suitesDropped.push(`${suite.file}::${suite.name}`);
    continue;
  }
  if (!TS_TESTERS.has(suite.tester)) continue;
  if (typeAwareNames.has(name)) continue;
  // A rule absent from the recommended config is never composed with the others.
  if (!(PREFIX + name in FIX_CONFIG)) continue;

  const bucket = casesByRule.get(name) || [];
  for (const raw of suite.valid) {
    const testCase = (typeof raw === 'string' ? { code: raw } : raw) as
      | Partial<ValidCase>
      | null
      | undefined;
    if (!testCase || typeof testCase.code !== 'string') continue;
    bucket.push({
      code: testCase.code,
      filename:
        testCase.filename ||
        (suite.tester === 'ruleTesterJsx' ? 'x.tsx' : 'x.ts'),
      options: testCase.options,
      parserOptions: testCase.parserOptions,
      origin: `src/tests/${suite.file}`,
    });
  }
  casesByRule.set(name, bucket);
}

type Finding = {
  /** The rule whose exemption was destroyed. */
  victim: string;
  /** Rules individually sufficient to destroy it, or [] if none is alone. */
  culprits: string[];
  messageIds: string[];
  filename: string;
  origin: string;
  before: string;
  after: string;
};

/** Non-vacuity accounting; a zero finding count means nothing without these. */
const stats = {
  considered: 0,
  controlSilent: 0,
  rewritten: 0,
  skippedFatal: 0,
};

const verify = (
  code: string,
  rules: Record<string, unknown>,
  testCase: ValidCase,
) => {
  try {
    return linter.verify(code, configFor(rules, testCase.parserOptions), {
      filename: testCase.filename,
    });
  } catch {
    // Rule crashes are a separate, already-guarded axis.
    return null;
  }
};

const soloRules = (name: string, testCase: ValidCase) => ({
  [PREFIX + name]: testCase.options
    ? ['error', ...testCase.options]
    : ('error' as unknown),
});

/**
 * Which single rule, applied alone, reproduces the destruction.
 *
 * Co-occurrence is not attribution: a dozen fixers may rewrite a snippet while
 * only one strips the carrier. Replaying each candidate alone is what makes the
 * baseline key (`<culprit> -> <victim>`) mean something, and it only runs for
 * the handful of cases that already came back as findings.
 */
function attributeCulprits(
  victim: string,
  testCase: ValidCase,
  victimSolo: Record<string, unknown>,
): string[] {
  const culprits: string[] = [];
  for (const [candidateId, severity] of Object.entries(FIX_CONFIG)) {
    if (candidateId === PREFIX + victim) continue;
    let fixedAlone;
    try {
      fixedAlone = linter.verifyAndFix(
        testCase.code,
        configFor({ [candidateId]: severity }, testCase.parserOptions),
        { filename: testCase.filename },
      );
    } catch {
      continue;
    }
    if (!fixedAlone.fixed || fixedAlone.output === testCase.code) continue;
    const after = verify(fixedAlone.output, victimSolo, testCase);
    if (!after || after.some((message) => message.fatal)) continue;
    if (after.length > 0) culprits.push(candidateId.slice(PREFIX.length));
  }
  return culprits;
}

function collectFindings(): Finding[] {
  const findings: Finding[] = [];

  for (const [name, cases] of casesByRule) {
    for (const testCase of cases) {
      stats.considered++;
      const victimSolo = soloRules(name, testCase);

      const before = verify(testCase.code, victimSolo, testCase);
      if (!before) continue;
      if (before.some((message) => message.fatal)) {
        stats.skippedFatal++;
        continue;
      }
      // Only a case the rule is genuinely silent on has an exemption to destroy.
      if (before.length > 0) continue;
      stats.controlSilent++;

      /**
       * A case's options must reach the FIX pass too. Applying them only to the
       * control and the re-lint makes the fixer and the reporter disagree, which
       * manufactures findings no single real config can produce.
       */
      const fixRules = testCase.options
        ? { ...FIX_CONFIG, ...victimSolo }
        : FIX_CONFIG;

      let fixed;
      try {
        fixed = linter.verifyAndFix(
          testCase.code,
          configFor(fixRules, testCase.parserOptions),
          { filename: testCase.filename },
        );
      } catch {
        continue;
      }
      if (!fixed.fixed || fixed.output === testCase.code) continue;
      stats.rewritten++;

      const after = verify(fixed.output, victimSolo, testCase);
      if (!after || after.some((message) => message.fatal)) continue;
      if (after.length === 0) continue;

      findings.push({
        victim: name,
        culprits: attributeCulprits(name, testCase, victimSolo),
        messageIds: [
          ...new Set(after.map((message) => message.messageId ?? '?')),
        ],
        filename: testCase.filename,
        origin: testCase.origin,
        before: testCase.code,
        after: fixed.output,
      });
    }
  }
  return findings;
}

const findings = collectFindings();

/** `<culprit> -> <victim>`, matching `FIX_INDUCED_BASELINE`'s key shape. */
const pairKey = (finding: Finding) =>
  finding.culprits.length === 1
    ? `${finding.culprits[0]} -> ${finding.victim}`
    : `(unattributed) -> ${finding.victim}`;

/**
 * Exemptions the shipped config destroys today, keyed
 * `<culprit fixer> -> <rule whose exemption it destroyed>`.
 *
 * MOST ENTRIES ARE OPEN DEFECTS WITH A FILED ISSUE, NOT ACCEPTED BEHAVIOUR.
 * Every entry must carry the issue that accepted it, so an entry is a record of
 * a triaged, tracked contradiction rather than a way to make a build green.
 * Anything unlisted fails, and a listed pair that stops reproducing also fails,
 * so the exemption cannot rot into a shield for the next regression.
 */
export const EXEMPTION_DESTROYED_BASELINE: Record<string, string> = {
  // Resolved by design, not deferred — the one entry here that is NOT a defect.
  // `global-const-style` renames the camelCase module-scope const to UPPER_SNAKE
  // and stamps `as const`, which is what makes it visible to
  // `no-static-constants-in-dynamic-files` — and that rule's verdict on the
  // result is correct: an `as const` literal in a `.dynamic` file IS static
  // configuration. Its documented remedy (move the constant to a non-dynamic
  // module and import it) is a stable fixed point under both rules, pinned by
  // the fixed-point test in `no-static-constants-in-dynamic-files.test.ts`.
  'global-const-style -> no-static-constants-in-dynamic-files':
    'the rename makes a genuinely-static const in a .dynamic file visible; the second verdict is correct and its remedy converges (#1599)',

  // --- `no-explicit-return-type` deletes the return annotation that another
  // rule reads as its exemption carrier. The dominant shape on this axis: 6 of
  // the 12 findings that opened it (#1595, #1596) were this, and both below are
  // further instances. Open question is the same each time: should the fixer
  // decline when the annotation is load-bearing for another rule, or should the
  // reader infer from the body instead of falling back to a name heuristic?
  'no-explicit-return-type -> enforce-boolean-naming-prefixes':
    "stripping a callee's non-boolean return annotation collapses the callee-return-type exemption, so a boolean-ish callee name drives a missingBooleanPrefix report on the assigned variable (#1691)",
  'no-explicit-return-type -> enforce-positive-naming':
    "stripping a validator's `string | true` return annotation leaves an opaque body, so the negatively-named validator is read as a boolean predicate and reported (#1692)",
};

const observedPairs = new Set(findings.map(pairKey));

describe('the recommended config is closed under its own exemptions', () => {
  it('destroys no exemption outside the documented baseline', () => {
    const unlisted = findings.filter(
      (finding) => !(pairKey(finding) in EXEMPTION_DESTROYED_BASELINE),
    );

    if (unlisted.length > 0) {
      const byPair = new Map<string, Finding[]>();
      for (const finding of unlisted) {
        const key = pairKey(finding);
        byPair.set(key, [...(byPair.get(key) || []), finding]);
      }
      throw new Error(
        [
          `${byPair.size} composition(s) destroy an exemption the rule promises:`,
          ...[...byPair.entries()].map(([key, hits]) =>
            [
              `  ${key} (${
                hits.length
              } fixture(s), e.g. ${hits[0].messageIds.join(',')})`,
              `    ${hits[0].origin} as ${hits[0].filename}`,
              `    --- valid fixture (the rule is silent on this) ---`,
              hits[0].before.replace(/^/gm, '      '),
              `    --- after the config's own --fix (the rule now reports) ---`,
              hits[0].after.replace(/^/gm, '      '),
            ].join('\n'),
          ),
          '',
          'A sibling fixer rewrote away the carrier this rule keys its exemption',
          'off, so `eslint --fix` turns code the rule promises silence on into a',
          'violation. Make the fixer preserve the carrier, teach the rule to see',
          'the rewritten shape, or — if the contradiction needs a product call —',
          'add the pair to EXEMPTION_DESTROYED_BASELINE with the reason and its',
          'issue link, referencing #1562.',
        ].join('\n'),
      );
    }
    expect(unlisted).toEqual([]);
  });

  it('carries no stale baseline entry', () => {
    const stale = Object.keys(EXEMPTION_DESTROYED_BASELINE).filter(
      (pair) => !observedPairs.has(pair),
    );
    if (stale.length > 0) {
      throw new Error(
        [
          'EXEMPTION_DESTROYED_BASELINE lists pair(s) this corpus no longer',
          'reproduces:',
          ...stale.map(
            (pair) => `  ${pair} — ${EXEMPTION_DESTROYED_BASELINE[pair]}`,
          ),
          '',
          'Either the contradiction was resolved (delete the entry) or the',
          'fixture that reached it was edited away (restore coverage).',
          'A stale entry silently absorbs the next real regression.',
        ].join('\n'),
      );
    }
    expect(stale).toEqual([]);
  });
});

/**
 * Anti-vacuity controls. A composition guard whose corpus trips no fixer passes
 * forever while asserting nothing, so the corpus, the harvest, the control step
 * and the detector are each measured independently.
 */
describe('the exemption closure guard is load-bearing', () => {
  it('harvests the suite without executing or losing it', () => {
    expect(harvested.failures).toEqual([]);
    expect(harvested.filesLoaded).toBeGreaterThanOrEqual(250);
    // Every suite must resolve to a rule except the handful that legitimately
    // test no rule (`rule-tester-parse-mode`'s parser assertions) or a core one.
    expect(suitesDropped.length).toBeLessThanOrEqual(8);
  });

  it('exercises nearly every composable rule in the config', () => {
    // Guards the denominator: a high ratio over a collapsed rule set would
    // still look healthy.
    expect(Object.keys(FIX_CONFIG).length).toBeGreaterThan(100);
    expect(typeAwareNames.size).toBeGreaterThan(5);
    // 172 of the composable rules contribute at least one fixture.
    expect(casesByRule.size).toBeGreaterThanOrEqual(165);
  });

  it('reaches enough silent fixtures, and actually rewrites them', () => {
    // 5,954 at the time of writing.
    expect(stats.considered).toBeGreaterThanOrEqual(5500);
    // A case the rule already reports on cannot lose an exemption, so the
    // silent subset is the real corpus (5,856).
    expect(stats.controlSilent).toBeGreaterThanOrEqual(5400);
    // And the config's `--fix` must actually rewrite a large share of them
    // (1,728), or step 2 is a no-op and every result is vacuous.
    expect(stats.rewritten).toBeGreaterThanOrEqual(1500);
  });

  it('detects a destroyed exemption (positive control)', () => {
    // The #1599 shape, hard-coded so the detector stays proven even if the
    // fixture that produces it organically is edited away.
    const planted: ValidCase = {
      code: "export const apiUrl = 'https://api.example.com';\n",
      filename: 'src/config/settings.dynamic.ts',
      origin: 'planted control',
    };
    const victim = 'no-static-constants-in-dynamic-files';
    const solo = soloRules(victim, planted);

    expect(verify(planted.code, solo, planted)).toEqual([]);
    const fixed = linter.verifyAndFix(
      planted.code,
      configFor(FIX_CONFIG, planted.parserOptions),
      { filename: planted.filename },
    );
    expect(fixed.output).not.toBe(planted.code);
    expect((verify(fixed.output, solo, planted) || []).length).toBeGreaterThan(
      0,
    );
    expect(attributeCulprits(victim, planted, solo)).toContain(
      'global-const-style',
    );
  });

  it('stays silent when the fix preserves the exemption (negative control)', () => {
    // The same pipeline over a snippet the config rewrites WITHOUT destroying
    // anything, so a green run means the corpus is clean and not that the
    // detector never fires.
    const inert: ValidCase = {
      code: 'export const alreadyFine = 1;\n',
      filename: 'src/util/helper.ts',
      origin: 'planted control',
    };
    const victim = 'no-static-constants-in-dynamic-files';
    const solo = soloRules(victim, inert);
    const fixed = linter.verifyAndFix(
      inert.code,
      configFor(FIX_CONFIG, inert.parserOptions),
      { filename: inert.filename },
    );
    expect((verify(fixed.output, solo, inert) || []).length).toBe(0);
  });
});

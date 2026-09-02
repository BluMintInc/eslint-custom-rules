/**
 * A fixer must not emit a LineTerminator where the grammar forbids one.
 *
 * `@typescript-eslint/parser` accepts two restricted-production breaches that no
 * engine will run: a line terminator between an arrow's signature and its `=>`,
 * and one after `throw`. Because that parser is the one every parse-based guard
 * shares, all of them certify the broken text as clean —
 * `fixture-corpus-parsability`, `fix-fixpoint-closure`'s fatal check,
 * `fix-orphan-binding-closure`'s `message.fatal` gate, and the agora `fix: true`
 * sweep. #1964 shipped through every one of them and was found by hand.
 *
 * A block comment containing a line terminator IS a LineTerminator to the
 * syntactic grammar, which is what makes this reachable by ordinary fixers: any
 * transform that deletes the text separating a comment from an arrow strands it
 * in the gap. Two rules have done exactly that (#1964, #1969).
 *
 * WHY THIS IS NOT `fixer-type-safety` (which owns the compiler oracle and would
 * surface the same TS1200). That guard has the instrument but could not reach
 * the shape, for two independent reasons, and #1969 was live underneath both:
 *
 *   - Its corpus is CAPPED at 30 fix pairs per rule, and it holds out any pair
 *     whose input does not type-check.
 *   - Nothing in the corpus places a line terminator where a fixer can strand
 *     one. The fixture that finally caught #1964 was added BY the #1964 fix, so
 *     the guard only ever saw the shape after someone already knew about it.
 *
 * So the two halves here are a cheap structural oracle — no `ts.Program`, which
 * is what lets it run uncapped over the whole corpus — and a PERTURBATION that
 * manufactures the shape the corpus does not contain. The checker is calibrated
 * against `ts.Program` (TS1200 / TS1142) and `node --check`: 26 shapes including
 * nested arrows, generics, JSX, type-level `=>` and legal annotation breaks, 0
 * disagreements.
 *
 * COVERAGE BOUND, stated plainly: the plant only reaches a rule that has a
 * fixture carrying an arrow with a return annotation AND fixes it. 25 rules meet
 * that today. A rule that strips annotations but has no such fixture is
 * unreached here — that residue is covered by a standing census over every
 * fixable rule, which found #1969 to be the only live instance.
 */
import { Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import {
  FixtureCase,
  defaultFilenameFor,
  harvestFixtureCorpus,
  parserOptionsFor,
  severityWithOptions,
  silentWithoutProgramRuleNames,
  suggestionEditsOf,
} from '../utils/fixtureCorpus';
import {
  RestrictedBreach,
  RestrictedProduction,
  restrictedProductionBreaches,
  tokenSignatureOf,
} from '../utils/restrictedProductions';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as {
  rules: Record<
    string,
    { meta?: { fixable?: string; hasSuggestions?: boolean } }
  >;
};
/* eslint-enable @typescript-eslint/no-var-requires */

const PREFIX = '@blumintinc/blumint/';

const linter = new Linter();
linter.defineParser('ts', tsParser as never);
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}

/**
 * Only a rule that rewrites text can strand a comment. The exclusion is
 * `silentWithoutProgramRuleNames` — rules MEASURED to report nothing under a
 * bare `Linter` — and deliberately not "every rule that mentions
 * `getParserServices`": that premise is measured false, and dropping those 16
 * is what hid a whole family of shipping fixers (#1859, #1877).
 */
const REWRITING_RULES = Object.entries(plugin.rules)
  .filter(
    ([name, rule]) =>
      (rule.meta?.fixable || rule.meta?.hasSuggestions) &&
      !silentWithoutProgramRuleNames.has(name),
  )
  .map(([name]) => name);

const RECOMMENDED_RULES: Record<string, unknown> = Object.fromEntries(
  Object.keys(plugin.rules).map((name) => [PREFIX + name, 'error']),
);

const configFor = (
  rules: Record<string, unknown>,
  testCase: FixtureCase,
): Linter.Config =>
  ({
    parser: 'ts',
    parserOptions: parserOptionsFor(testCase),
    rules,
  } as unknown as Linter.Config);

const fixOf = (
  code: string,
  rules: Record<string, unknown>,
  testCase: FixtureCase,
) => {
  try {
    return linter.verifyAndFix(code, configFor(rules, testCase), {
      filename: defaultFilenameFor(testCase),
    });
  } catch {
    return null;
  }
};

const verifyOf = (
  code: string,
  rules: Record<string, unknown>,
  testCase: FixtureCase,
) => {
  try {
    return linter.verify(code, configFor(rules, testCase), {
      filename: defaultFilenameFor(testCase),
    });
  } catch {
    return null;
  }
};

type Channel =
  | 'FIXTURE_AS_WRITTEN'
  | 'SOLO_FIX'
  | 'FULL_CONFIG_FIX'
  | 'PLANTED_COMMENT'
  | 'SUGGESTION';

type Finding = {
  rule: string;
  channel: Channel;
  plantKind?: string;
  origin: string;
  breaches: RestrictedBreach[];
  before: string;
  after: string;
};

const stats = {
  fixturesScanned: 0,
  soloFixes: 0,
  soloRulesFixed: new Set<string>(),
  fullFixes: 0,
  plantsBuilt: 0,
  plantsRejected: 0,
  plantFixes: 0,
  rulesPerturbed: new Set<string>(),
  // Per-arm, because a single total cannot distinguish "both arms exercised"
  // from "the arrow arm carried everything and `throw` planted nothing".
  plantsBuiltByProduction: { arrow: 0, throw: 0 } as Record<
    RestrictedProduction,
    number
  >,
  plantFixesByProduction: { arrow: 0, throw: 0 } as Record<
    RestrictedProduction,
    number
  >,
  rulesPerturbedByProduction: {
    arrow: new Set<string>(),
    throw: new Set<string>(),
  } as Record<RestrictedProduction, Set<string>>,
  suggestionsChecked: 0,
};

const breachesIn = (code: string): RestrictedBreach[] =>
  restrictedProductionBreaches(code) || [];

const corpus = harvestFixtureCorpus();

/** The JSON and Markdown parsers have no arrow or `throw` to breach. */
const tsCasesByRule = new Map<string, FixtureCase[]>();
for (const [rule, cases] of corpus.byRule) {
  const kept = cases.filter((testCase) => testCase.language === 'ts');
  if (kept.length) tsCasesByRule.set(rule, kept);
}

const MULTILINE_BLOCK = '/*\n * planted\n */';

type Plant = { kind: string; text: string; production: RestrictedProduction };

/**
 * Comment positions that are LEGAL in the input and sit one deletion away from a
 * restricted gap.
 *
 * Planting inside the gap itself would be pointless — that input is already
 * illegal, so no fixer could be blamed for its output. What makes an annotation
 * the right anchor is that it is the only thing separating the comment from the
 * arrow, so the rules that remove one are exactly the rules that can strand it.
 *
 * Both productions the detector knows are planted. The `throw` arm anchors on
 * the statement instead: its restricted gap sits between `throw` and its
 * argument, so the positions one relocation away are before the statement,
 * inside the thrown expression, and after it. Without it the `throw` detector
 * is calibrated over an empty corpus — it can only ever return a false clean.
 */
export function plantsFor(code: string): Plant[] {
  if (breachesIn(code).length) return [];
  const plants: Plant[] = [];
  let ast: Record<string, unknown>;
  try {
    ast = tsParser.parse(code, {
      ecmaVersion: 2022,
      sourceType: 'module',
      range: true,
      loc: true,
      comment: true,
      tokens: true,
      ecmaFeatures: { jsx: true },
    } as never) as unknown as Record<string, unknown>;
  } catch {
    return [];
  }

  const insert = (
    kind: string,
    at: number,
    production: RestrictedProduction,
  ) => {
    plants.push({
      kind,
      production,
      text: `${code.slice(0, at)} ${MULTILINE_BLOCK} ${code.slice(at)}`,
    });
  };

  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const value = node as Record<string, unknown> & {
      type?: string;
      range?: [number, number];
      argument?: { range: [number, number] } | null;
      returnType?: { range: [number, number] };
    };
    if (
      (value.type === 'ArrowFunctionExpression' ||
        value.type === 'FunctionExpression' ||
        value.type === 'FunctionDeclaration') &&
      value.returnType
    ) {
      insert('BEFORE_ANNOTATION', value.returnType.range[0], 'arrow');
      // Inside the annotation, which a carrier may re-emit anywhere it likes.
      insert('INSIDE_ANNOTATION', value.returnType.range[0] + 1, 'arrow');
    }
    if (value.type === 'ThrowStatement' && value.range && value.argument) {
      insert('BEFORE_THROW', value.range[0], 'throw');
      // Inside the thrown expression: legal, and a rebuild may re-host it.
      insert('INSIDE_ARGUMENT', value.argument.range[0] + 1, 'throw');
      insert('AFTER_ARGUMENT', value.argument.range[1], 'throw');
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'parent') continue;
      if (Array.isArray(child)) child.forEach(walk);
      else if (child && typeof child === 'object') walk(child);
    }
  };
  walk(ast);
  return plants;
}

/** One case through the plant channel, reused by the controls. */
export function perturbCase(
  rule: string,
  testCase: FixtureCase,
  into: Finding[],
): void {
  const plants = plantsFor(testCase.code);
  if (!plants.length) return;
  const signature = tokenSignatureOf(testCase.code);
  if (signature === null) return;

  const rules = { [PREFIX + rule]: severityWithOptions(testCase) };
  // Capped per case, not per rule: one fixture dense in annotations would
  // otherwise dominate the run without covering another rule. The cap is taken
  // per PRODUCTION rather than over the flat list — an annotation-dense fixture
  // would otherwise fill all six slots with `arrow` plants and starve the
  // `throw` arm back to the empty corpus this plant exists to end.
  const capped = (['arrow', 'throw'] as RestrictedProduction[]).flatMap(
    (production) =>
      plants.filter((plant) => plant.production === production).slice(0, 6),
  );
  for (const plant of capped) {
    stats.plantsBuilt++;
    stats.plantsBuiltByProduction[plant.production]++;
    /**
     * Neutrality is PROVEN, not assumed. A marker landing inside a template
     * literal or JSX text is code, not a comment, and would manufacture a
     * finding; a plant that itself breaches would blame a fixer for its input.
     */
    if (tokenSignatureOf(plant.text) !== signature) {
      stats.plantsRejected++;
      continue;
    }
    if (breachesIn(plant.text).length) {
      stats.plantsRejected++;
      continue;
    }
    const fixed = fixOf(plant.text, rules, testCase);
    if (!fixed || !fixed.fixed) continue;
    stats.plantFixes++;
    stats.plantFixesByProduction[plant.production]++;
    stats.rulesPerturbed.add(rule);
    stats.rulesPerturbedByProduction[plant.production].add(rule);
    const breaches = breachesIn(fixed.output);
    if (breaches.length) {
      into.push({
        rule,
        channel: 'PLANTED_COMMENT',
        plantKind: plant.kind,
        origin: testCase.origin,
        breaches,
        before: plant.text,
        after: fixed.output,
      });
    }
  }
}

function collectFindings(): Finding[] {
  const findings: Finding[] = [];
  const record = (
    rule: string,
    channel: Channel,
    testCase: FixtureCase,
    before: string,
    after: string,
    breaches: RestrictedBreach[],
  ) =>
    findings.push({
      rule,
      channel,
      origin: testCase.origin,
      breaches,
      before,
      after,
    });

  // The corpus as written. A fixture that already breaches would otherwise be
  // reported by every downstream arm as though a fixer had produced it.
  for (const [rule, cases] of tsCasesByRule) {
    for (const testCase of cases) {
      stats.fixturesScanned++;
      const breaches = breachesIn(testCase.code);
      if (breaches.length) {
        record(
          rule,
          'FIXTURE_AS_WRITTEN',
          testCase,
          testCase.code,
          testCase.code,
          breaches,
        );
      }
    }
  }

  // Solo `--fix`, uncapped — the channel `fixer-type-safety` caps at 30/rule.
  for (const rule of REWRITING_RULES) {
    for (const testCase of tsCasesByRule.get(rule) || []) {
      if (breachesIn(testCase.code).length) continue;
      const rules = { [PREFIX + rule]: severityWithOptions(testCase) };
      const fixed = fixOf(testCase.code, rules, testCase);
      if (!fixed) continue;
      stats.soloFixes++;
      if (!fixed.fixed) continue;
      stats.soloRulesFixed.add(rule);
      const breaches = breachesIn(fixed.output);
      if (breaches.length) {
        record(
          rule,
          'SOLO_FIX',
          testCase,
          testCase.code,
          fixed.output,
          breaches,
        );
      }
    }
  }

  // The whole recommended config, where one rule's output is another's input.
  // A breach can belong to the PAIR without either rule producing one alone.
  for (const [rule, cases] of tsCasesByRule) {
    for (const testCase of cases) {
      if (breachesIn(testCase.code).length) continue;
      const fixed = fixOf(testCase.code, RECOMMENDED_RULES, testCase);
      if (!fixed || !fixed.fixed) continue;
      stats.fullFixes++;
      const breaches = breachesIn(fixed.output);
      if (breaches.length) {
        record(
          rule,
          'FULL_CONFIG_FIX',
          testCase,
          testCase.code,
          fixed.output,
          breaches,
        );
      }
    }
  }

  // The shape the corpus does not contain.
  for (const rule of REWRITING_RULES) {
    for (const testCase of tsCasesByRule.get(rule) || []) {
      perturbCase(rule, testCase, findings);
    }
  }

  // Suggestions, which `--fix` never applies and which a human accepts blind.
  for (const rule of REWRITING_RULES) {
    if (!plugin.rules[rule]?.meta?.hasSuggestions) continue;
    for (const testCase of tsCasesByRule.get(rule) || []) {
      if (breachesIn(testCase.code).length) continue;
      const rules = { [PREFIX + rule]: severityWithOptions(testCase) };
      const messages = verifyOf(testCase.code, rules, testCase);
      if (!messages) continue;
      for (const edit of suggestionEditsOf(
        testCase.code,
        messages,
        PREFIX + rule,
      )) {
        stats.suggestionsChecked++;
        const breaches = breachesIn(edit.output);
        if (breaches.length) {
          record(
            rule,
            'SUGGESTION',
            testCase,
            testCase.code,
            edit.output,
            breaches,
          );
        }
      }
    }
  }

  return findings;
}

const findings = collectFindings();

/**
 * Fixtures that breach as written, and why each is legitimate.
 *
 * Keyed by the EXACT snippet rather than by rule, because a rule-keyed entry
 * would un-gate every other fixture that rule declares on this arm — the
 * granularity mistake that cost #1839. An entry that stops reproducing fails as
 * stale, so it cannot rot into a shield for the next one.
 */
const FIXTURES_ALLOWED_TO_BREACH: Record<string, string> = {
  [`export const readCount = (): number /**
 * doc
 */ => 1;
`]:
    'no-explicit-return-type: an INPUT that is already in breach, pinning that the fixer repairs the gap rather than preserving it. ESLint runs on files that do not compile, so this state is reachable by hand-editing even though tsc rejects it (#1964).',
  [`
type User = { id: string };
declare function fetchUser(): User;
const getUser = (): User /**
 * doc
 */ => fetchUser() as User;
`]:
    'no-redundant-annotation-assertion: the same already-in-breach input, pinning the same repair for the second rule to hit this class (#1969).',
};

const describeFinding = (finding: Finding) =>
  [
    `  ${finding.rule} :: ${finding.channel}${
      finding.plantKind ? `:${finding.plantKind}` : ''
    } (${finding.breaches.map((breach) => breach.production).join(', ')})`,
    `    ${finding.origin}`,
    '    --- before ---',
    finding.before.replace(/^/gm, '      '),
    '    --- after ---',
    finding.after.replace(/^/gm, '      '),
  ].join('\n');

const REMEDY = [
  '',
  'A LineTerminator — including one inside a block comment — is forbidden',
  'between an arrow signature and its `=>`, and after `throw`.',
  '@typescript-eslint/parser accepts the breach, so no parse-based guard can',
  'see it; the compiler reports TS1200/TS1142 and V8 refuses to run it.',
  'Carry the comment somewhere legal (past the `=>`) rather than deleting it',
  'or declining — see src/utils/arrowAnnotationGap.ts, the remedy shared by',
  '#1964 and #1969.',
].join('\n');

describe('a fixer emits no restricted-production breach', () => {
  it('carries no fixture that breaches as written', () => {
    const unlisted = findings.filter(
      (finding) =>
        finding.channel === 'FIXTURE_AS_WRITTEN' &&
        !(finding.before in FIXTURES_ALLOWED_TO_BREACH),
    );
    if (unlisted.length) {
      throw new Error(
        [
          `${unlisted.length} fixture(s) contain a restricted-production breach as written:`,
          ...unlisted.map(describeFinding),
          REMEDY,
        ].join('\n'),
      );
    }
    expect(unlisted).toEqual([]);
  });

  it('carries no stale fixture exemption', () => {
    const observed = new Set(
      findings
        .filter((finding) => finding.channel === 'FIXTURE_AS_WRITTEN')
        .map((finding) => finding.before),
    );
    const stale = Object.keys(FIXTURES_ALLOWED_TO_BREACH).filter(
      (code) => !observed.has(code),
    );
    expect(stale).toEqual([]);
  });

  it.each([
    ['solo --fix', 'SOLO_FIX'],
    ['the full recommended config', 'FULL_CONFIG_FIX'],
    ['a planted comment', 'PLANTED_COMMENT'],
    ['a suggestion', 'SUGGESTION'],
  ] as const)('emits none under %s', (_label, channel) => {
    const hits = findings.filter((finding) => finding.channel === channel);
    if (hits.length) {
      throw new Error(
        [
          `${hits.length} breach(es) produced by ${_label}:`,
          ...hits.slice(0, 8).map(describeFinding),
          REMEDY,
        ].join('\n'),
      );
    }
    expect(hits).toEqual([]);
  });
});

/**
 * A guard that asserts an absence is worthless without proof it could have
 * found something. Every floor below is a population that, if it collapsed,
 * would leave this file green while checking nothing.
 */
describe('the restricted-production guard is load-bearing', () => {
  it('harvests the suite without losing it', () => {
    // eslint-disable-next-line no-console
    console.log(
      `[restricted-production] suites=${corpus.suitesUsed} ` +
        `scanned=${stats.fixturesScanned} rewritingRules=${REWRITING_RULES.length} ` +
        `soloFixes=${stats.soloFixes} soloRules=${stats.soloRulesFixed.size} ` +
        `fullFixes=${stats.fullFixes} suggestions=${stats.suggestionsChecked} ` +
        `plants=${stats.plantsBuilt} plantFixes=${stats.plantFixes} ` +
        `plantsRejected=${stats.plantsRejected} ` +
        `rulesPerturbed=${stats.rulesPerturbed.size} ` +
        `throw=${stats.plantsBuiltByProduction.throw}/${stats.plantFixesByProduction.throw}/${stats.rulesPerturbedByProduction.throw.size} ` +
        `arrow=${stats.plantsBuiltByProduction.arrow}/${stats.plantFixesByProduction.arrow}/${stats.rulesPerturbedByProduction.arrow.size}`,
    );
    expect(corpus.failures).toEqual([]);
    expect(corpus.suitesUsed).toBeGreaterThan(360); // measured 367
    expect(stats.fixturesScanned).toBeGreaterThan(23400); // measured 23,824
  });

  it('drives every channel over a real population', () => {
    expect(REWRITING_RULES.length).toBeGreaterThanOrEqual(88); // measured 90
    expect(stats.soloFixes).toBeGreaterThanOrEqual(14500); // measured 14,919
    expect(stats.soloRulesFixed.size).toBeGreaterThanOrEqual(80); // measured 82
    expect(stats.fullFixes).toBeGreaterThanOrEqual(11500); // measured 11,893
    expect(stats.suggestionsChecked).toBeGreaterThanOrEqual(360); // measured 368
  });

  /**
   * The plant is the only arm that reaches the shape the corpus lacks, so its
   * own floor is the one that matters most: a change that stopped generating
   * plants would silently retire the arm that found #1969.
   */
  it('plants the shape the corpus does not contain', () => {
    expect(stats.plantsBuilt).toBeGreaterThanOrEqual(2350); // measured 2,435
    expect(stats.plantFixes).toBeGreaterThanOrEqual(880); // measured 910
    expect(stats.rulesPerturbed.size).toBeGreaterThanOrEqual(26); // measured 28
    /**
     * And what the plant arm THROWS AWAY, capped just above its measured 55.
     * A rejected plant never reaches the detector, so if rejection ever
     * approached the built total this arm would be back to the empty corpus it
     * was created to escape — reporting exactly the green it reports here. The
     * counter was incremented and read by nothing.
     */
    expect(stats.plantsRejected).toBeLessThanOrEqual(65);
  });

  /**
   * Per-arm floors. The totals above are dominated by `arrow`, so they stay
   * green even if the `throw` arm plants nothing at all — which is precisely
   * the state this arm was in before it was planted: a detector unit-tested
   * against hand-written strings and never run over a fixture, able to return
   * only a false clean. Each floor sits just under its measured value.
   */
  it('drives BOTH restricted productions over a real population', () => {
    // Measured 177 / 22 / 4 and 2258 / 888 / 25 respectively; each floor sits
    // just under, so a collapse is caught while ordinary corpus drift is not.
    expect(stats.plantsBuiltByProduction.throw).toBeGreaterThanOrEqual(150); // measured 177
    expect(stats.plantFixesByProduction.throw).toBeGreaterThanOrEqual(18); // measured 22
    expect(stats.rulesPerturbedByProduction.throw.size).toBeGreaterThanOrEqual(
      3, // measured 4
    );
    expect(stats.plantsBuiltByProduction.arrow).toBeGreaterThanOrEqual(2200); // measured 2,270
    expect(stats.plantFixesByProduction.arrow).toBeGreaterThanOrEqual(870); // measured 892
    expect(stats.rulesPerturbedByProduction.arrow.size).toBeGreaterThanOrEqual(
      24, // measured 25
    );
  });

  /**
   * The scope of the checker, re-measured rather than trusted. Five of the seven
   * restricted productions are omitted because the PARSER already rejects them
   * (so every parse-based guard sees them) or applies ASI exactly as V8 does. A
   * parser upgrade that relaxed any of these would open a hole this file claims
   * to cover, so the claim is re-derived on every run.
   */
  it('omits only the productions the parser already handles', () => {
    const parses = (code: string) => {
      try {
        tsParser.parse(code, {
          ecmaVersion: 2022,
          sourceType: 'module',
          range: true,
          loc: true,
        } as never);
        return true;
      } catch {
        return false;
      }
    };

    // Rejected by the parser, so already fatal to every parse-based guard.
    // The gap here is `async` … parameters, NOT the arrow gap: an async arrow
    // broken at its `=>` is the arrow production above, and the parser accepts
    // that one.
    expect(parses('const f = async\n() => 1;')).toBe(false);
    expect(parses('const o = { async\nm() {} };')).toBe(false);
    expect(parses('function* g() { yield\n* h(); }')).toBe(false);
    expect(parses('function g(a) { a\n++; return a; }')).toBe(false);

    // Accepted by BOTH, with automatic semicolon insertion applied identically,
    // so there is no divergence to detect.
    const asi = tsParser.parse('function g() { return\n1; }', {
      ecmaVersion: 2022,
      sourceType: 'module',
      range: true,
      loc: true,
    } as never) as unknown as {
      body: { body: { body: { argument: unknown }[] } }[];
    };
    expect(asi.body[0].body.body[0].argument).toBeNull();
  });

  it('answers a question the parser cannot', () => {
    // The premise of the whole file: the breach is invisible to a reparse.
    const broken = 'export const f = () /*\n*/ => 1;\n';
    expect(() =>
      tsParser.parse(broken, {
        ecmaVersion: 2022,
        sourceType: 'module',
        range: true,
        loc: true,
      } as never),
    ).not.toThrow();
    expect(breachesIn(broken)).toHaveLength(1);
    expect(breachesIn(broken)[0].production).toBe('arrow');
    expect(breachesIn('function g() { throw\nnew Error("x"); }')).toHaveLength(
      1,
    );
  });

  it('stays silent on the legal shapes a text scan would confuse', () => {
    // Each of these carries a line terminator NEAR a restricted gap without
    // being in one; a checker that flagged them would be unusable.
    expect(breachesIn('const f = ()\n: number => 1;\n')).toEqual([]);
    expect(breachesIn('const f = (\n  a,\n  b,\n) => a + b;\n')).toEqual([]);
    expect(breachesIn('const f = () =>\n  1;\n')).toEqual([]);
    expect(breachesIn('type F = (\n  a: string\n)\n=> void;\n')).toEqual([]);
    expect(breachesIn('const f = (a = () => 1) => a;\n')).toEqual([]);
    expect(breachesIn('function g() { throw new Error(\n"x"); }\n')).toEqual(
      [],
    );
  });

  /**
   * The detector, proven on a fixer that is guaranteed to exhibit the defect.
   * It cannot be keyed to a shipped rule: every live instance of this class is
   * something the suite exists to eliminate, so a control tied to one goes
   * vacuous exactly when the plugin is healthiest.
   */
  const CONTROL_STRIPPER = 'control-annotation-stripper';
  const CONTROL_INPLACE = 'control-inplace-renamer';
  const CONTROL_THROW_HOISTER = 'control-throw-comment-hoister';

  linter.defineRule(PREFIX + CONTROL_STRIPPER, {
    meta: {
      type: 'problem',
      fixable: 'code',
      schema: [],
      messages: { m: 'x' },
    },
    create(context: never) {
      const ctx = context as unknown as { report: (d: unknown) => void };
      return {
        ArrowFunctionExpression(node: never) {
          const arrow = node as unknown as {
            returnType?: { range: [number, number] };
          };
          if (!arrow.returnType) return;
          const range = arrow.returnType.range;
          ctx.report({
            node,
            messageId: 'm',
            // The pre-#1964 shape: delete the annotation, strand whatever the
            // deletion leaves between the parameters and the arrow.
            fix: (fixer: { removeRange: (r: unknown) => unknown }) =>
              fixer.removeRange(range),
          });
        },
      };
    },
  } as never);

  linter.defineRule(PREFIX + CONTROL_INPLACE, {
    meta: {
      type: 'problem',
      fixable: 'code',
      schema: [],
      messages: { m: 'x' },
    },
    create(context: never) {
      const ctx = context as unknown as { report: (d: unknown) => void };
      return {
        Identifier(node: never) {
          if ((node as unknown as { name: string }).name !== 'renameMe') return;
          ctx.report({
            node,
            messageId: 'm',
            fix: (fixer: { replaceText: (n: unknown, t: string) => unknown }) =>
              fixer.replaceText(node, 'renamed'),
          });
        },
      };
    },
  } as never);

  /**
   * The `throw` arm's own stranding fixer. The arrow control cannot stand in
   * for it: `arrow` and `throw` are separate detector branches over separate
   * gaps, so a green arrow control says nothing about whether a `throw` breach
   * would be seen. This one re-emits the statement with a planted leading
   * comment hoisted into the gap between `throw` and its argument.
   */
  linter.defineRule(PREFIX + CONTROL_THROW_HOISTER, {
    meta: {
      type: 'problem',
      fixable: 'code',
      schema: [],
      messages: { m: 'x' },
    },
    create(context: never) {
      const ctx = context as unknown as {
        report: (d: unknown) => void;
        getSourceCode: () => {
          getText: (n?: unknown) => string;
          getCommentsBefore: (n: unknown) => { type: string; value: string }[];
        };
      };
      const sourceCode = ctx.getSourceCode();
      return {
        ThrowStatement(node: never) {
          const statement = node as unknown as {
            range: [number, number];
            argument?: { range: [number, number] } | null;
          };
          const argument = statement.argument;
          if (!argument) return;
          // Fire only on the still-legal shape, so the FIX creates the breach
          // rather than the input arriving with one.
          const gap = sourceCode
            .getText()
            .slice(statement.range[0] + 'throw'.length, argument.range[0]);
          if (gap.includes('\n')) return;
          const hoistable = sourceCode
            .getCommentsBefore(node)
            .find(
              (comment) =>
                comment.type === 'Block' && comment.value.includes('\n'),
            );
          if (!hoistable) return;
          const argumentText = sourceCode.getText(argument);
          ctx.report({
            node,
            messageId: 'm',
            fix: (fixer: {
              replaceTextRange: (r: unknown, t: string) => unknown;
            }) =>
              fixer.replaceTextRange(
                [statement.range[0], argument.range[1]],
                `throw /*${hoistable.value}*/ ${argumentText}`,
              ),
          });
        },
      };
    },
  } as never);

  const plantedCase = (code: string): FixtureCase =>
    ({
      code,
      tester: 'ruleTesterTs',
      language: 'ts',
      origin: 'planted control',
      bucket: 'invalid',
    } as FixtureCase);

  it('detects a fixer that strands a comment in the gap (positive control)', () => {
    const found: Finding[] = [];
    perturbCase(
      CONTROL_STRIPPER,
      plantedCase('const readCount = (): number => 1;\n'),
      found,
    );
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].breaches[0].production).toBe('arrow');
  });

  it('stays silent on a fixer that edits in place (negative control)', () => {
    const found: Finding[] = [];
    const before = stats.plantFixes;
    perturbCase(
      CONTROL_INPLACE,
      plantedCase('const renameMe = (): number => 1;\n'),
      found,
    );
    // A control whose plant never reached a fix would prove nothing.
    expect(stats.plantFixes).toBeGreaterThan(before);
    expect(found).toEqual([]);
  });

  it('detects a fixer that strands a comment in the THROW gap (positive control)', () => {
    const found: Finding[] = [];
    perturbCase(
      CONTROL_THROW_HOISTER,
      plantedCase('function g() {\n  throw new Error("x");\n}\n'),
      found,
    );
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].breaches[0].production).toBe('throw');
    // The plant that reached it must be a `throw` plant, not an arrow one that
    // happened to sit in the same fixture.
    expect(found[0].plantKind).toBe('BEFORE_THROW');
  });

  it('stays silent on a throw fixer that edits in place (negative control)', () => {
    const found: Finding[] = [];
    const before = stats.plantFixesByProduction.throw;
    perturbCase(
      CONTROL_INPLACE,
      plantedCase('function g() {\n  throw new Error(renameMe);\n}\n'),
      found,
    );
    // Same site set as the positive control, opposite verdict — and it must
    // actually have reached a fix through the THROW arm specifically.
    expect(stats.plantFixesByProduction.throw).toBeGreaterThan(before);
    expect(found).toEqual([]);
  });

  /**
   * The neutrality gate, which the corpus never exercises: every plant it builds
   * happens to be legal, so without this the rejection path could be broken and
   * nothing would say so.
   */
  it('rejects a plant that is not comment-only', () => {
    const inTemplate = 'const s = `hello`;\nconst f = (): number => 1;\n';
    const signature = tokenSignatureOf(inTemplate);
    const insideTemplate = `const s = \`he${MULTILINE_BLOCK}llo\`;\nconst f = (): number => 1;\n`;
    expect(tokenSignatureOf(insideTemplate)).not.toBe(signature);

    // And a plant landing in the gap itself is rejected as already-breaching,
    // so no fixer is ever blamed for an input it did not create.
    expect(breachesIn(`const f = () ${MULTILINE_BLOCK} => 1;\n`)).toHaveLength(
      1,
    );
  });
});

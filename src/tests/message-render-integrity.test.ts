/**
 * What a rule actually SHOWS a developer, asserted over real fixtures.
 *
 * Every other guard reads `message.message` as a diagnostic label only —
 * `docs-examples-conformance` prints it in a failure, `fixer-convergence` keys
 * an identity on it — and `message-negative-example` inspects `meta.messages`,
 * which is the template rather than the text. Nothing asserted anything about
 * the rendered result, so two defects were structurally invisible:
 *
 *   1. An UNSUBSTITUTED placeholder. ESLint's `interpolate()` replaces `{{term}}`
 *      only when `term in data`; otherwise it leaves the braces in place. A
 *      `context.report` that omits a key its template references therefore ships
 *      a raw mustache to the editor, and every existing check reads it as prose.
 *
 *   2. A DEAD messageId — declared in `meta.messages` but rendered by no
 *      fixture. Four such declarations shipped undeliverable (#1752), each
 *      describing import work the fixer already does atomically. The fifth,
 *      `enforce-serializable-params::nonSerializableParam`, was not dead at all
 *      but a live branch no test reached, and it was hiding nine missed shapes
 *      (#1750, #1751). That asymmetry is the point of gating this: a declared
 *      message nothing renders is either dead code or an untested branch, and
 *      the second kind hides bugs.
 *
 * Corpus: each rule's own harvested fixtures, which are the one input set
 * guaranteed to trigger it — `agora` cannot reach a rule it never fires on.
 *
 * WHICH RULES WERE PROBED IS ITSELF ASSERTED (#1863). `rulesProbed` used to rest
 * on a floor of 170 against an actual 194, so 24 rules could leave the probe
 * entirely — taking every messageId they declare out of both arms — without
 * moving a number anyone reads. A floor answers "did the probe do some work";
 * the question is "did it do work for THIS rule", and the two differ exactly
 * when a subset regresses. The probed set is now closed against `plugin.rules`
 * in both directions, with any absence named and its cause measured.
 */
import { Linter } from 'eslint';
import {
  harvestFixtureCorpus,
  silentWithoutProgramRuleNames,
  defaultFilenameFor,
  defineCorpusParsers,
  parserKeyFor,
  parserOptionsFor,
  severityWithOptions,
} from '../utils/fixtureCorpus';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as {
  rules: Record<string, { meta?: { messages?: Record<string, string> } }>;
};
/* eslint-enable @typescript-eslint/no-var-requires */

const PREFIX = '@blumintinc/blumint/';

/** Mirrors ESLint's own interpolation pattern, so what it would leave, this finds. */
const MUSTACHE = /\{\{([^{}]+?)\}\}/gu;

const mustachesIn = (text: string): string[] =>
  [...text.matchAll(MUSTACHE)].map((match) => match[1].trim());

const linter = new Linter();
defineCorpusParsers(linter);
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}

type Leftover = {
  rule: string;
  messageId: string;
  missing: string[];
  rendered: string;
  origin: string;
};

const leftovers: Leftover[] = [];
/** `rule::messageId` pairs some fixture actually rendered. */
const renderedIds = new Set<string>();

const stats = {
  rulesProbed: new Set<string>(),
  rulesSilent: [] as string[],
  casesProbed: 0,
  reportsRendered: 0,
  suggestionsRendered: 0,
  /** Reports whose template holds ≥1 placeholder — the only ones check 1 can fail on. */
  reportsWithTemplateVars: 0,
  crashes: [] as string[],
};

/**
 * A mustache in rendered text is a defect only when the rule's OWN template
 * declares that term. One arriving through an interpolated data VALUE — a rule
 * quoting source that itself contains `{{` — is faithful output, not a missing
 * key.
 */
const inspect = (
  ruleName: string,
  messageId: string,
  rendered: string,
  origin: string,
) => {
  renderedIds.add(`${ruleName}::${messageId}`);
  const template = plugin.rules[ruleName]?.meta?.messages?.[messageId] ?? '';
  const declared = mustachesIn(template);
  if (!declared.length) return;
  stats.reportsWithTemplateVars++;
  const missing = [
    ...new Set(mustachesIn(rendered).filter((term) => declared.includes(term))),
  ];
  if (!missing.length) return;
  leftovers.push({ rule: ruleName, messageId, missing, rendered, origin });
};

const corpus = harvestFixtureCorpus();

for (const [ruleName, cases] of corpus.byRule) {
  /**
   * Only rules that measurably report NOTHING under this harness are skipped —
   * currently none. The wider "mentions the type checker" set was skipped
   * before, on the theory that a bare `Linter` has no program; it has one (an
   * isolated single-file program), and all 16 of those rules render messages
   * over their own fixtures, so the skip withheld 22 declared messageIds — 21
   * of them placeholder-bearing — from both arms below (#1859).
   */
  if (silentWithoutProgramRuleNames.has(ruleName)) continue;
  stats.rulesProbed.add(ruleName);
  const ruleId = PREFIX + ruleName;
  let reportsForRule = 0;

  for (const testCase of cases) {
    stats.casesProbed++;
    let messages: Linter.LintMessage[];
    try {
      messages = linter.verify(
        testCase.code,
        {
          // A JSON or Markdown fixture read by the TypeScript parser is a fatal
          // carrying no `ruleId`, which this loop skips as if the rule had
          // stayed silent — so its messages would read as dead (#1860).
          parser: parserKeyFor(testCase),
          parserOptions: parserOptionsFor(testCase),
          rules: { [ruleId]: severityWithOptions(testCase) as never },
        },
        { filename: defaultFilenameFor(testCase) },
      );
    } catch (error) {
      stats.crashes.push(`${ruleName}: ${(error as Error).message}`);
      continue;
    }
    for (const message of messages) {
      if (message.ruleId !== ruleId || message.fatal) continue;
      reportsForRule++;
      stats.reportsRendered++;
      inspect(
        ruleName,
        message.messageId || '',
        message.message || '',
        testCase.origin,
      );
      for (const suggestion of message.suggestions || []) {
        stats.suggestionsRendered++;
        inspect(
          ruleName,
          (suggestion as { messageId?: string }).messageId || '',
          suggestion.desc || '',
          testCase.origin,
        );
      }
    }
  }
  if (!reportsForRule) stats.rulesSilent.push(ruleName);
}

/**
 * Messages whose branch this harness genuinely cannot reach, keyed
 * `rule::messageId` rather than by rule — a rule-keyed entry would un-gate the
 * rule's OTHER messages, which is the #1839 mistake.
 *
 * Not a decision and not a defect: an ARTIFACT of the harness. Both the reason
 * and the evidence must be recorded, so an entry can be retired the moment its
 * premise stops holding.
 */
const PROGRAM_ONLY_MESSAGE_IDS: Record<string, string> = {
  /**
   * Emitted only when `classifyUseMemoReturnType` gets a DETERMINATE type for
   * the `useMemo(...)` call, via `checker.getTypeAtLocation`. Its 40-odd
   * fixtures declare `parserOptions.project` against the repo tsconfig, which
   * `harvestFixtureCorpus` strips; the isolated single-file program that
   * remains resolves `slug.toUpperCase()` and the ambient `react` shim to
   * `any`, so every case classifies as indeterminate and returns before the
   * report. The message is live under the configuration its suite declares —
   * `no-usememo-for-pass-by-value.test.ts` asserts it 40 times — so a dead-code
   * finding here would be about the probe, not the rule.
   */
  'no-usememo-for-pass-by-value::primitiveMemo':
    'needs a real program to classify the return type',
};

/**
 * Why a registered rule could be absent from the probe, read off the corpus and
 * the drivability measurement rather than asserted by hand.
 *
 * Both causes are DERIVED — one from the corpus, one from the measured
 * `silentWithoutProgramRuleNames` set — so a rule that falls into either enters
 * the accounting on its own. Naming them is what turns "170 of them ran" into
 * "these ran and these did not, for this reason".
 */
const UNPROBED_CAUSES = {
  noCorpus:
    'the harvest holds no fixture for it, so there is no input on which it could render anything',
  undrivableWithoutProgram:
    'measurably reports nothing under a bare Linter, so probing it would manufacture a dead-message finding about the harness',
} as const;
type UnprobedCause = keyof typeof UNPROBED_CAUSES;

const unprobedCauseOf = (rule: string): UnprobedCause | null => {
  if (stats.rulesProbed.has(rule)) return null;
  if (silentWithoutProgramRuleNames.has(rule)) {
    return 'undrivableWithoutProgram';
  }
  return 'noCorpus';
};

const registeredRules = Object.keys(plugin.rules).sort();
const measuredUnprobed: Record<string, UnprobedCause> = Object.fromEntries(
  registeredRules
    .map((rule) => [rule, unprobedCauseOf(rule)] as const)
    .filter((entry): entry is readonly [string, UnprobedCause] => !!entry[1]),
);

/**
 * Registered rules this probe never drove, each with the measured cause.
 *
 * SHIPS EMPTY: every registered rule has a corpus (#1860) and every type-aware
 * rule is drivable without a program (#1859), so all 194 are probed. It is the
 * place an absence must be written down, because a rule that quietly leaves the
 * probe takes every messageId it declares out of BOTH arms below — the
 * unsubstituted-placeholder sweep and the dead-messageId closure — while each
 * still renders green (#1863).
 */
const UNPROBED_RULES: Record<string, UnprobedCause> = {};

const declaredIds: string[] = [];
const deadIds: string[] = [];
/** Asserted below, so a stale artifact entry fails instead of holding open. */
const unusedProgramOnly: string[] = [];
/** Which rules reached the dead-message closure, asserted against the probe. */
const rulesWithDeclaredIds = new Set<string>();
for (const [ruleName, rule] of Object.entries(plugin.rules)) {
  if (silentWithoutProgramRuleNames.has(ruleName)) continue;
  /**
   * A rule with no corpus at all cannot be judged on one.
   * `src/tests/fixture-corpus-accounting.test.ts` asserts there is none, so
   * this skip is a guard against a future hole rather than a live exclusion.
   */
  if (!corpus.byRule.has(ruleName)) continue;
  rulesWithDeclaredIds.add(ruleName);
  for (const messageId of Object.keys(rule.meta?.messages ?? {})) {
    const key = `${ruleName}::${messageId}`;
    declaredIds.push(key);
    if (renderedIds.has(key)) {
      if (key in PROGRAM_ONLY_MESSAGE_IDS) unusedProgramOnly.push(key);
      continue;
    }
    if (key in PROGRAM_ONLY_MESSAGE_IDS) continue;
    deadIds.push(key);
  }
}

/* ------------------------------- CONTROLS ------------------------------- */

/**
 * Stand-in culprits. A control keyed to a shipped rule would go vacuous exactly
 * when the plugin is healthiest, which is the state this guard is meant to hold.
 */
const controlRule = (
  data: Record<string, unknown>,
  messages: Record<string, string>,
) => ({
  meta: {
    type: 'problem' as const,
    schema: [],
    messages,
  },
  create(context: { report: (descriptor: unknown) => void }) {
    return {
      Identifier(node: unknown) {
        context.report({ node, messageId: 'primary', data });
      },
    };
  },
});

const renderControl = (
  id: string,
  data: Record<string, unknown>,
  messages: Record<string, string>,
) => {
  linter.defineRule(PREFIX + id, controlRule(data, messages) as never);
  (plugin.rules as Record<string, unknown>)[id] = controlRule(data, messages);
  const before = leftovers.length;
  const rendered = linter
    .verify(
      'const alpha = 1;',
      {
        parser: 'ts',
        parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: { [PREFIX + id]: 'error' as never },
      },
      { filename: 'file.ts' },
    )
    .filter((message) => message.ruleId === PREFIX + id);
  for (const message of rendered) {
    inspect(id, message.messageId || '', message.message || '', 'control');
  }
  delete (plugin.rules as Record<string, unknown>)[id];
  return {
    text: rendered.map((message) => message.message),
    flagged: leftovers.length > before,
    renderedIdSeen: renderedIds.has(`${id}::primary`),
  };
};

const PRIMARY = 'Rename {{culprit}} to {{suggested}} here.';

const positive = renderControl(
  'control-missing-data',
  { suggested: 'BETA' },
  { primary: PRIMARY },
);
const negative = renderControl(
  'control-complete-data',
  { culprit: 'alpha', suggested: 'BETA' },
  { primary: PRIMARY },
);
/** A value that merely CONTAINS braces must not be mistaken for a missing key. */
const braceValue = renderControl(
  'control-brace-valued-data',
  { culprit: '{{notAKey}}', suggested: 'BETA' },
  { primary: PRIMARY },
);

/** The dead-message detector, exercised on a rule that declares one it never emits. */
const deadControl = renderControl(
  'control-dead-message',
  { culprit: 'alpha', suggested: 'BETA' },
  {
    primary: PRIMARY,
    neverEmitted: 'This message is declared but never sent.',
  },
);
const deadControlDetected =
  deadControl.renderedIdSeen &&
  !renderedIds.has('control-dead-message::neverEmitted');

const realLeftovers = leftovers.filter(
  (finding) => !finding.rule.startsWith('control-'),
);

describe('message render integrity', () => {
  describe('the probe is live', () => {
    it('reaches the fixture corpus', () => {
      expect(corpus.failures).toEqual([]);
      expect(stats.crashes).toEqual([]);
      expect(corpus.suitesUsed).toBeGreaterThanOrEqual(280);
      expect(stats.casesProbed).toBeGreaterThanOrEqual(13000);
    });

    /**
     * Every non-type-aware rule with a corpus firing at least once is what makes
     * a clean sweep meaningful; a rule that stayed silent contributed nothing and
     * must be named rather than counted as passing.
     */
    it('makes every probed rule report', () => {
      expect(stats.rulesSilent).toEqual([]);
      expect(stats.rulesProbed.size).toBeGreaterThanOrEqual(170);
    });

    /**
     * The other half of that row, and the one a floor cannot state: WHICH rules
     * ran. `rulesSilent` only speaks about rules the loop reached, so a rule
     * that left the corpus is silent about its own silence — it is absent from
     * `rulesProbed` and from `rulesSilent` alike, and both assertions above
     * stay green. Closed against `plugin.rules`, which is not derived from the
     * corpus, so a corpus that collapsed cannot satisfy it by shrinking both
     * sides at once.
     */
    it('accounts for every registered rule: it was probed, or its absence is named', () => {
      expect(measuredUnprobed).toEqual(UNPROBED_RULES);
      expect(
        Object.values(UNPROBED_RULES).filter(
          (cause) => !UNPROBED_CAUSES[cause],
        ),
      ).toEqual([]);
      // An entry naming a rule that is not registered is an exemption nothing
      // can retire, so it would absorb the next absence forever.
      expect(
        Object.keys(UNPROBED_RULES).filter(
          (rule) => !registeredRules.includes(rule),
        ),
      ).toEqual([]);
      expect(registeredRules.length).toBeGreaterThan(150);
    });

    /**
     * Three floors that can genuinely diverge: reports rendered, the strictly
     * smaller subset whose template can actually fail check 1, and the distinct
     * message identities behind them. Flooring only the largest would let the
     * asserted population collapse while the number still looked big (#1749).
     */
    it('asserts on a population large enough to matter', () => {
      expect(stats.reportsRendered).toBeGreaterThanOrEqual(6000);
      expect(stats.reportsWithTemplateVars).toBeGreaterThanOrEqual(5000);
      expect(stats.reportsWithTemplateVars).toBeLessThan(stats.reportsRendered);
      expect(renderedIds.size).toBeGreaterThanOrEqual(200);
      expect(renderedIds.size).toBeLessThan(stats.reportsRendered);
    });

    it('detects a missing data key, and only a missing one', () => {
      expect(positive.text).toEqual(['Rename {{culprit}} to BETA here.']);
      expect(positive.flagged).toBe(true);
      expect(negative.text).toEqual(['Rename alpha to BETA here.']);
      expect(negative.flagged).toBe(false);
      expect(braceValue.text).toEqual(['Rename {{notAKey}} to BETA here.']);
      expect(braceValue.flagged).toBe(false);
    });

    it('detects a declared-but-unrendered messageId', () => {
      expect(deadControlDetected).toBe(true);
    });
  });

  it('renders no message with an unsubstituted placeholder', () => {
    expect(
      realLeftovers.map(
        (finding) =>
          `${finding.rule}::${finding.messageId} left ${finding.missing.join(
            ', ',
          )} unsubstituted (${finding.origin}): ${finding.rendered}`,
      ),
    ).toEqual([]);
  });

  it('emits every message it declares', () => {
    expect(declaredIds.length).toBeGreaterThanOrEqual(200);
    expect(deadIds).toEqual([]);
    // The dead-message closure runs its own skip list, so it can go dark for a
    // rule the render sweep still probes. Pinned equal, since a rule missing
    // here contributes no declared id and the `deadIds` assertion above then
    // says nothing about it.
    expect([...rulesWithDeclaredIds].sort()).toEqual(
      [...stats.rulesProbed].sort(),
    );
  });

  /**
   * The artifact list, asserted in the other direction: a message that starts
   * rendering here must lose its entry, or the exemption outlives its reason.
   */
  it('holds no stale program-only exemption', () => {
    expect(unusedProgramOnly).toEqual([]);
    // Each entry must still name a declared message, or it exempts nothing.
    expect(
      Object.keys(PROGRAM_ONLY_MESSAGE_IDS).filter(
        (key) => !declaredIds.includes(key),
      ),
    ).toEqual([]);
  });
});

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
 */
import { Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import {
  harvestFixtureCorpus,
  typeAwareRuleNames,
  defaultFilenameFor,
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
linter.defineParser('ts', tsParser as never);
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
  rulesProbed: 0,
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
   * Type-aware rules have no program under a bare `Linter`, so they report
   * nothing and would contribute a false clean rather than a finding.
   */
  if (typeAwareRuleNames.has(ruleName)) continue;
  stats.rulesProbed++;
  const ruleId = PREFIX + ruleName;
  let reportsForRule = 0;

  for (const testCase of cases) {
    stats.casesProbed++;
    let messages: Linter.LintMessage[];
    try {
      messages = linter.verify(
        testCase.code,
        {
          parser: 'ts',
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

const declaredIds: string[] = [];
const deadIds: string[] = [];
for (const [ruleName, rule] of Object.entries(plugin.rules)) {
  if (typeAwareRuleNames.has(ruleName)) continue;
  /**
   * A rule whose suite declares under `ruleTesterJson`/`Markdown` never reaches
   * `byRule`, so it has no corpus here and cannot be judged on one.
   */
  if (!corpus.byRule.has(ruleName)) continue;
  for (const messageId of Object.keys(rule.meta?.messages ?? {})) {
    declaredIds.push(`${ruleName}::${messageId}`);
    if (!renderedIds.has(`${ruleName}::${messageId}`)) {
      deadIds.push(`${ruleName}::${messageId}`);
    }
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
      expect(stats.rulesProbed).toBeGreaterThanOrEqual(170);
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
  });
});

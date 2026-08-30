import { Linter, Rule } from 'eslint';
import {
  defaultFilenameFor,
  defineCorpusParsers,
  harvestFixtureCorpus,
  parserKeyFor,
  parserOptionsFor,
  ruleNameByIdentity,
  severityWithOptions,
  suggestionEditsOf,
  suggestionRuleNames,
} from '../utils/fixtureCorpus';

const PREFIX = '@blumintinc/blumint/';

/**
 * A SUGGESTION must not hand the developer code that a core ESLint rule
 * rejects — measured over the whole harvested corpus, not just each rule's own
 * fixtures.
 *
 * The three corpus-wide core-rule oracles all drive `verifyAndFix`
 * (`fix-core-violation-closure`, `fix-orphan-binding-closure`,
 * `composed-fix-core-violation-closure`), and `--fix` never applies a
 * suggestion. `composed-fix-core-violation-closure` states the consequence in
 * its own header: every transform a suggestion-only rule offers is outside that
 * sweep (#1733). Eleven guards DO apply suggestion edits — comment fidelity,
 * cjs emission, export surface, restricted production, degenerate identifier,
 * directive prologue, exemption composition, shadow capture, tsc type safety —
 * but the intersection of {applies suggestions} and {core-rule oracle} was
 * empty, so this file is that intersection.
 *
 * The hole was not theoretical. #2026 lived in it: `no-excessive-parent-chain`
 * replaced a whole parent-hop chain with `<event>.params`, deleting the sole
 * reference to the destructured binding that walked it and leaving
 * `const { data: change } = event;` behind as dead code. 54 suggestion edits
 * across 41 fixtures did this, 3 of them reached only through
 * `prefer-params-over-parent-id`'s suite.
 *
 * Six of the seven suggestion rules declare no `meta.fixable`, so they are also
 * excluded outright from `cross-fixture-fixer-type-safety` by its `isFixable`
 * gate — this is the only corpus-wide instrument that sees them at all.
 */

/** `fix-core-violation-closure`'s set, for the same reasons it gives. */
const CORE_RULES = {
  'no-dupe-keys': 'error',
  'no-unreachable': 'error',
  'no-const-assign': 'error',
  'no-self-assign': 'error',
};

/**
 * `fix-orphan-binding-closure`'s instrument, configured identically. `no-undef`
 * stays out for the reason that guard gives: with no `env` every ambient global
 * reads as undefined, which is an artefact rather than a finding.
 */
const UNUSED_RULES = {
  'no-unused-vars': ['error', { args: 'none', ignoreRestSiblings: true }],
};

const linter = new Linter();
defineCorpusParsers(linter);
for (const [rule, name] of ruleNameByIdentity) {
  linter.defineRule(`${PREFIX}${name}`, rule as never);
}

/**
 * Rules measured to offer a suggestion that trips an oracle, each pinned to the
 * issue tracking it. An entry is asserted in BOTH directions below, so a fix
 * that lands without clearing its entry fails as stale.
 */
const SUGGESTION_BASELINE = new Map<string, string>([]);

const unusedNames = (messages: Linter.LintMessage[]) => {
  const names: string[] = [];
  for (const message of messages) {
    if (message.ruleId !== 'no-unused-vars') continue;
    const match = /^'([^']+)'/.exec(message.message);
    if (match) names.push(match[1]);
  }
  return names;
};

/**
 * Names unused AFTER that were not unused BEFORE, but only once the COUNT has
 * risen. The count gate is what makes this rename-immune: a suggestion that
 * renames an already-unused binding changes the name in the message without
 * stranding anything new.
 */
export const newlyOrphaned = (before: string[], after: string[]) => {
  if (after.length <= before.length) return [];
  const pool = [...before];
  const orphaned: string[] = [];
  for (const name of after) {
    const at = pool.indexOf(name);
    if (at === -1) orphaned.push(name);
    else pool.splice(at, 1);
  }
  return orphaned;
};

const countCore = (messages: Linter.LintMessage[]) => {
  const counts = new Map<string, number>();
  for (const message of messages) {
    if (!message.ruleId || !(message.ruleId in CORE_RULES)) continue;
    counts.set(message.ruleId, (counts.get(message.ruleId) || 0) + 1);
  }
  return counts;
};

type Verdict = {
  fatal: boolean;
  /** Bindings the edit stranded. */
  orphaned: string[];
  /** Core rule ids whose count the edit raised. */
  raised: string[];
};

/**
 * The classification, in one function so the planted controls exercise the REAL
 * code path rather than a copy of it.
 */
export function classifySuggestion(
  before: string,
  after: string,
  filename: string,
  parsing: Record<string, unknown>,
): Verdict {
  const coreBefore = linter.verify(
    before,
    { ...parsing, rules: CORE_RULES } as unknown as Linter.Config,
    filename,
  );
  const coreAfter = linter.verify(
    after,
    { ...parsing, rules: CORE_RULES } as unknown as Linter.Config,
    filename,
  );
  if (coreAfter.some((message) => message.fatal)) {
    // An output that no longer parses is `comment-fix-fidelity`'s
    // SUGGESTION_PARSE_BREAK finding, not this one. Counted so it cannot read
    // as silence here.
    return { fatal: true, orphaned: [], raised: [] };
  }
  const baseCounts = countCore(coreBefore);
  const raised: string[] = [];
  for (const [id, count] of countCore(coreAfter)) {
    if (count > (baseCounts.get(id) || 0)) raised.push(id);
  }
  const orphaned = newlyOrphaned(
    unusedNames(
      linter.verify(
        before,
        { ...parsing, rules: UNUSED_RULES } as unknown as Linter.Config,
        filename,
      ),
    ),
    unusedNames(
      linter.verify(
        after,
        { ...parsing, rules: UNUSED_RULES } as unknown as Linter.Config,
        filename,
      ),
    ),
  );
  return { fatal: false, orphaned, raised };
}

type Finding = {
  fixer: string;
  owner: string;
  origin: string;
  messageId: string;
  orphaned: string[];
  raised: string[];
  before: string;
  after: string;
};

const corpus = harvestFixtureCorpus();

/**
 * Every skip is counted and every counter is read by an `expect` below. A skip
 * counter nothing asserts discards cases in silence, which is how 106 fatal
 * parses went unnoticed in #1984.
 */
const stats = {
  considered: 0,
  nonTypeScriptDropped: 0,
  inputFatalDropped: 0,
  outputFatal: 0,
  edits: 0,
  crossEdits: 0,
  threw: [] as string[],
  suggesters: new Set<string>(),
  crossOwners: new Set<string>(),
};

const findings: Finding[] = [];

for (const [owner, cases] of corpus.byRule) {
  for (const testCase of cases) {
    /**
     * A `package.json` body or a `.md` fence has no bindings for
     * `no-unused-vars` to count, so a pair built from one could only
     * manufacture noise.
     */
    if (testCase.language !== 'ts') {
      stats.nonTypeScriptDropped++;
      continue;
    }
    stats.considered++;

    const filename = defaultFilenameFor(testCase);
    const parsing = {
      parser: parserKeyFor(testCase),
      parserOptions: parserOptionsFor(testCase),
    };
    /**
     * The owner's own entry carries the OPTIONS its author declared; every
     * other suggester runs bare, since a fixture's options belong to its owner
     * and handing them to a different rule configures it with a schema it never
     * declared.
     */
    const rules: Record<string, unknown> = {};
    for (const name of suggestionRuleNames) {
      rules[PREFIX + name] =
        name === owner ? severityWithOptions(testCase) : 'error';
    }

    try {
      const messages = linter.verify(
        testCase.code,
        { ...parsing, rules } as unknown as Linter.Config,
        filename,
      );
      /**
       * A fatal parse produces no `ruleId`, so it is indistinguishable from
       * every rule staying silent — counted, then asserted, never dropped.
       */
      if (messages.some((message) => message.fatal)) {
        stats.inputFatalDropped++;
        continue;
      }

      for (const name of suggestionRuleNames) {
        const edits = suggestionEditsOf(testCase.code, messages, PREFIX + name);
        if (!edits.length) continue;
        stats.suggesters.add(name);
        for (const edit of edits) {
          stats.edits++;
          if (name !== owner) {
            stats.crossEdits++;
            stats.crossOwners.add(owner);
          }
          const verdict = classifySuggestion(
            testCase.code,
            edit.output,
            filename,
            parsing,
          );
          if (verdict.fatal) {
            stats.outputFatal++;
            continue;
          }
          if (!verdict.orphaned.length && !verdict.raised.length) continue;
          findings.push({
            fixer: name,
            owner,
            origin: testCase.origin,
            messageId: edit.messageId,
            orphaned: verdict.orphaned,
            raised: verdict.raised,
            before: testCase.code,
            after: edit.output,
          });
        }
      }
    } catch (error) {
      stats.threw.push(`${owner}: ${(error as Error).message}`);
    }
  }
}

const offenders = new Map<string, Finding[]>();
for (const finding of findings) {
  const list = offenders.get(finding.fixer) || [];
  list.push(finding);
  offenders.set(finding.fixer, list);
}

const REGRESSIONS = [...offenders.keys()]
  .filter((rule) => !SUGGESTION_BASELINE.has(rule))
  .sort();

const STALE = [...SUGGESTION_BASELINE.keys()]
  .filter((rule) => !offenders.has(rule))
  .sort();

const describeFinding = (finding: Finding) =>
  [
    `${finding.fixer} <- ${finding.owner} (${finding.origin})`,
    `  messageId: ${finding.messageId}`,
    finding.orphaned.length ? `  orphaned: ${finding.orphaned.join(', ')}` : '',
    finding.raised.length ? `  raised: ${finding.raised.join(', ')}` : '',
    `  before: ${JSON.stringify(finding.before.slice(0, 200))}`,
    `  after:  ${JSON.stringify(finding.after.slice(0, 200))}`,
  ]
    .filter(Boolean)
    .join('\n');

describe('a suggestion must not hand the developer a core-rule violation', () => {
  it('introduces no orphaned binding or core violation outside the baseline', () => {
    if (REGRESSIONS.length) {
      // eslint-disable-next-line no-console
      console.error(
        REGRESSIONS.flatMap((rule) =>
          (offenders.get(rule) || []).slice(0, 3).map(describeFinding),
        ).join('\n'),
      );
    }
    expect(REGRESSIONS).toEqual([]);
  });

  it('has no stale baseline entry', () => {
    expect(STALE).toEqual([]);
  });

  it('never let a probe throw instead of producing a verdict', () => {
    expect(stats.threw).toEqual([]);
    expect(corpus.failures).toEqual([]);
  });

  /**
   * Non-vacuity. Every floor sits just under a MEASURED value, so the sweep
   * cannot quietly stop doing work and keep passing. The floors that hid #1984
   * sat at 5,500 against an actual 8,141 — cut close enough that a real loss
   * trips them.
   */
  it('actually swept the corpus it claims to', () => {
    expect(stats.considered).toBeGreaterThan(19500); // measured 20363
    expect(stats.edits).toBeGreaterThan(550); // measured 610
    expect(stats.crossEdits).toBeGreaterThan(280); // measured 302
    expect(stats.crossOwners.size).toBeGreaterThan(40); // measured 45
    /**
     * Every rule declaring `hasSuggestions` must actually place a suggestion
     * somewhere in the corpus, or its arm of this guard is present but never
     * fires — indistinguishable from absent.
     */
    expect([...stats.suggesters].sort()).toEqual([...suggestionRuleNames]);
  });

  /**
   * The skips, asserted rather than merely counted. A non-TS fixture is
   * expected and bounded; a fatal INPUT is not, and a ceiling cut close is what
   * stops one from readmitting #1984's 106 silently dropped cases. The bound
   * moved 60 -> 130 with #2213's CommonMark fence fixtures (measured 40 -> 95);
   * `lang-fix-closure` is the instrument that judges that population.
   */
  it('accounts for every fixture it did not probe', () => {
    expect(stats.nonTypeScriptDropped).toBeLessThan(130); // measured 95
    expect(stats.inputFatalDropped).toEqual(0);
    expect(stats.outputFatal).toEqual(0);
  });

  it('still measures every baselined rule as offending', () => {
    for (const [rule, issue] of SUGGESTION_BASELINE) {
      expect({
        rule,
        issue,
        findings: (offenders.get(rule) || []).length,
      }).toEqual({ rule, issue, findings: expect.any(Number) });
      expect((offenders.get(rule) || []).length).toBeGreaterThan(0);
    }
  });

  /**
   * Planted controls, run through `classifySuggestion` itself. Without them a
   * predicate that silently stopped detecting anything would pass this file
   * forever — and the baseline assertions above would fail as "stale", which
   * reads as good news.
   */
  const controlParsing = {
    parser: 'ts',
    parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  };

  it('detects a suggestion that strands a binding (positive control)', () => {
    const verdict = classifySuggestion(
      'const { data: change } = event;\nexport const k = change.after.ref.parent.parent.parent.key;\n',
      'const { data: change } = event;\nexport const k = event.params.key;\n',
      'control.ts',
      controlParsing,
    );
    expect(verdict).toEqual({
      fatal: false,
      orphaned: ['change'],
      raised: [],
    });
  });

  it('detects a suggestion that raises a core violation (positive control)', () => {
    const verdict = classifySuggestion(
      'export const o = { a: 1 };\n',
      'export const o = { a: 1, a: 2 };\n',
      'control.ts',
      controlParsing,
    );
    expect(verdict).toEqual({
      fatal: false,
      orphaned: [],
      raised: ['no-dupe-keys'],
    });
  });

  it('stays silent on a suggestion that strands nothing (negative control)', () => {
    const verdict = classifySuggestion(
      'const { data: change } = event;\nexport const k = change.after.ref.parent.parent.parent.key;\n',
      'export const k = event.params.key;\n',
      'control.ts',
      controlParsing,
    );
    expect(verdict).toEqual({ fatal: false, orphaned: [], raised: [] });
  });

  it('does not count a binding that was ALREADY unused (negative control)', () => {
    const verdict = classifySuggestion(
      'const { data: change } = event;\nconst spare = 1;\nexport const k = change.after.ref.parent.parent.key;\n',
      'const { data: change } = event;\nconst spare = 1;\nexport const k = change.after.id;\n',
      'control.ts',
      controlParsing,
    );
    expect(verdict.orphaned).toEqual([]);
  });

  it('reports a non-parsing output as fatal rather than as a clean pair', () => {
    const verdict = classifySuggestion(
      'export const x = 1;\n',
      'export const x = ;\n',
      'control.ts',
      controlParsing,
    );
    expect(verdict.fatal).toBe(true);
  });

  it('reads neither artefact as an orphan (oracle controls)', () => {
    // Message text changed, name did not.
    expect(newlyOrphaned(['foo'], ['foo'])).toEqual([]);
    // Name changed by a rename, count did not.
    expect(newlyOrphaned(['foo'], ['FOO'])).toEqual([]);
    // A rename that ALSO strands is still caught.
    expect(newlyOrphaned(['foo'], ['FOO', 'change'])).toEqual([
      'FOO',
      'change',
    ]);
    // And the plain case.
    expect(newlyOrphaned([], ['change'])).toEqual(['change']);
  });

  /**
   * The guard's own reach, asserted against a planted rule rather than assumed:
   * a suggestion offered by a rule this sweep drives must actually be applied
   * and judged. `suggestionEditsOf` returning nothing would otherwise reduce
   * the whole file to its controls.
   */
  it('applies a planted suggestion through the real corpus path', () => {
    const planted: Rule.RuleModule = {
      meta: {
        hasSuggestions: true,
        schema: [],
        type: 'problem',
        messages: { m: 'planted' },
      },
      create(context) {
        return {
          Identifier(node: never) {
            const id = node as unknown as {
              name: string;
              parent?: { type: string };
            };
            if (id.name !== 'plantedTarget') return;
            // The import specifier binds the same name; rewriting it would
            // produce `import { 0 }` and measure a parse break instead.
            if (id.parent?.type !== 'VariableDeclarator') return;
            context.report({
              node: node as never,
              messageId: 'm',
              suggest: [
                {
                  messageId: 'm',
                  fix: (fixer) => fixer.replaceText(node as never, '0'),
                },
              ],
            });
          },
        };
      },
    };
    linter.defineRule('control/planted', planted);
    const source =
      "import { plantedTarget } from 'm';\nexport const v = plantedTarget;\n";
    const messages = linter.verify(
      source,
      {
        ...controlParsing,
        rules: { 'control/planted': 'error' },
      } as unknown as Linter.Config,
      'control.ts',
    );
    const edits = suggestionEditsOf(source, messages, 'control/planted');
    expect(edits.length).toBeGreaterThan(0);
    expect(
      classifySuggestion(source, edits[0].output, 'control.ts', controlParsing)
        .orphaned,
    ).toEqual(['plantedTarget']);
  });
});

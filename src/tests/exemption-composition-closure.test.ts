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
 * And, for the channel `--fix` never touches (#1733), the same three steps with
 * step 2 replaced by ONE accepted suggestion. A suggestion strips a carrier as
 * effectively as a fixer does, with less recourse: nothing re-runs afterwards,
 * so the consumer is left holding the destroyed exemption.
 *
 * Corpus: the suite's own `valid` fixtures, harvested without executing them
 * (see `harvestRuleTesterCases`). They are the right corpus precisely because a
 * `valid` list is written to sit on the rule's carve-out boundaries — which is
 * where a sibling fixer strips a carrier. The docs blocks do not go there.
 */
import { Linter, Rule } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import {
  harvestOnce,
  silentWithoutProgramRuleNames,
  suggestionEditsOf,
  suggestionRuleNames,
  typeAwareRuleNames,
} from '../utils/fixtureCorpus';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as {
  rules: Record<string, unknown>;
  configs: { recommended: { rules: Record<string, unknown> } };
};
/* eslint-enable @typescript-eslint/no-var-requires */

const PREFIX = '@blumintinc/blumint/';

/**
 * The only exclusion is `silentWithoutProgramRuleNames` — rules MEASURED to
 * report nothing under this harness, and so able to contribute only a false
 * clean. It is deliberately not "every rule that mentions `getParserServices`":
 * that premise was measured false (all 16 report — #1859), because
 * `@typescript-eslint/parser` returns an isolated single-file program even with
 * no `project`, so the `if (!services?.program) return;` guard rules use never
 * fires. What is missing is cross-FILE resolution, which changes an answer
 * rather than withholding it. Dropping all 16 left their carve-outs unprobed
 * against the composed `--fix`, the same blind spot that hid two comment-
 * destroying fixers in #1877.
 */

/** The rule set whose composed `--fix` is under test. */
const FIX_CONFIG: Record<string, unknown> = {};
for (const [id, severity] of Object.entries(plugin.configs.recommended.rules)) {
  if (!id.startsWith(PREFIX)) continue;
  const name = id.slice(PREFIX.length);
  if (!plugin.rules[name] || silentWithoutProgramRuleNames.has(name)) continue;
  FIX_CONFIG[id] = severity;
}

const linter = new Linter();
linter.defineParser('ts', tsParser as never);
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}

/**
 * Stand-in culprit for the positive control: renames a camelCase module-scope
 * `export const` to SCREAMING_SNAKE, destroying
 * `no-static-constants-in-dynamic-files`'s silence on the camelCase spelling.
 *
 * The control needs a fixer that provably destroys a REAL rule's exemption. A
 * shipped rule cannot supply one and should not have to: every live destruction
 * being fixed is the goal of this suite, so keying the control to one would make
 * the detector go vacuous exactly when the config is healthiest. This double is
 * registered on the linter but stays out of `FIX_CONFIG`, so it is invisible to
 * the corpus scan and reachable only where a test opts into it.
 */
const CONTROL_RENAMER_ID = `${PREFIX}control-screaming-renamer`;
const controlScreamingRenamer: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    schema: [],
    messages: { rename: 'Rename "{{name}}" to SCREAMING_SNAKE_CASE.' },
  },
  create(context) {
    return {
      VariableDeclarator(node) {
        const declaration = node.parent;
        if (
          declaration.type !== 'VariableDeclaration' ||
          declaration.kind !== 'const' ||
          declaration.parent.type !== 'ExportNamedDeclaration' ||
          node.id.type !== 'Identifier' ||
          !/^[a-z][A-Za-z0-9]*$/.test(node.id.name)
        ) {
          return;
        }
        const id = node.id;
        // Converging on the first pass matters: `verifyAndFix` re-lints its own
        // output, and a double that kept reporting would spin the control.
        const renamed = id.name
          .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
          .toUpperCase();
        context.report({
          node: id,
          messageId: 'rename',
          data: { name: id.name },
          fix: (fixer) => fixer.replaceText(id, renamed),
        });
      },
    };
  },
};
linter.defineRule(CONTROL_RENAMER_ID, controlScreamingRenamer);

/**
 * The same double offered through `suggest`, and its opposite.
 *
 * `verifyAndFix` never applies either, so they are reachable only through the
 * suggestion channel — which is what makes them a statement about that channel
 * rather than about the fix loop. Both stay out of `FIX_CONFIG` and
 * `CULPRIT_SUGGESTERS`, so the corpus scan cannot see them.
 */
const CONTROL_SUGGESTER_ID = `${PREFIX}control-screaming-suggester`;
const CONTROL_SAFE_SUGGESTER_ID = `${PREFIX}control-initializer-suggester`;

const suggestingDouble = (
  edit: (node: any, fixer: any) => unknown,
): Rule.RuleModule => ({
  meta: {
    type: 'suggestion',
    hasSuggestions: true,
    schema: [],
    messages: { report: 'Rewrite "{{name}}".', suggest: 'Rewrite it.' },
  },
  create(context) {
    return {
      VariableDeclarator(node) {
        const declaration = node.parent;
        if (
          declaration.type !== 'VariableDeclaration' ||
          declaration.kind !== 'const' ||
          declaration.parent.type !== 'ExportNamedDeclaration' ||
          node.id.type !== 'Identifier' ||
          !/^[a-z][A-Za-z0-9]*$/.test(node.id.name)
        ) {
          return;
        }
        context.report({
          node: node.id,
          messageId: 'report',
          data: { name: node.id.name },
          suggest: [
            {
              messageId: 'suggest',
              fix: (fixer) => edit(node, fixer) as never,
            },
          ],
        });
      },
    };
  },
});

linter.defineRule(
  CONTROL_SUGGESTER_ID,
  suggestingDouble((node, fixer) =>
    fixer.replaceText(
      node.id,
      (node.id.name as string)
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .toUpperCase(),
    ),
  ),
);
linter.defineRule(
  CONTROL_SAFE_SUGGESTER_ID,
  suggestingDouble((node, fixer) =>
    fixer.replaceText(node.init, "'https://api.example.test'"),
  ),
);

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

const harvested = harvestOnce();

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
  if (silentWithoutProgramRuleNames.has(name)) continue;
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
  /** Which transform destroyed it; a suggestion is never applied by `--fix`. */
  channel: 'fix' | 'suggestion';
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
  suggestionsApplied: 0,
};

/**
 * The suggestion-bearing rules, offered as culprits.
 *
 * Not filtered to `FIX_CONFIG`: two of the seven ship outside the recommended
 * config, and an editor offers a suggestion from whichever rules the consumer
 * enabled. Excluding them would leave their transforms unexamined for the sake
 * of a distinction that does not hold on a consumer's machine.
 */
const CULPRIT_SUGGESTERS: Record<string, unknown> = Object.fromEntries(
  suggestionRuleNames.map((rule) => [PREFIX + rule, 'error']),
);

/** Per-rule non-vacuity for the suggestion channel; a total would hide a zero. */
const suggestionApplied = new Map<string, number>(
  suggestionRuleNames.map((rule) => [rule, 0]),
);
/** Separated from `applied`, so "never fired" and "fired, declined" stay apart. */
const suggestionReported = new Map<string, number>(
  suggestionRuleNames.map((rule) => [rule, 0]),
);

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
 *
 * `candidates` is the set replayed; it widens past the shipped config only for
 * the positive control, which supplies its own culprit.
 */
function attributeCulprits(
  victim: string,
  testCase: ValidCase,
  victimSolo: Record<string, unknown>,
  candidates: Record<string, unknown> = FIX_CONFIG,
): string[] {
  const culprits: string[] = [];
  for (const [candidateId, severity] of Object.entries(candidates)) {
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

/**
 * The suggestion channel, for one case the victim is silent on.
 *
 * Each suggestion is applied ALONE to the untouched fixture: never composed
 * with a sibling suggestion, and never fed back through `verifyAndFix`. Both
 * would judge the rule against a state no editor can produce — ESLint hands a
 * consumer one suggestion at a time and applies none of them itself — and
 * composing them would also make it impossible to say which one stripped the
 * carrier. That single application is the whole probe: one step, not a fixed
 * point.
 */
function suggestionFindingsFor(
  victim: string,
  testCase: ValidCase,
  victimSolo: Record<string, unknown>,
  /** Widened past the shipped rules only by a control, which plants its own. */
  culprits: Record<string, unknown> = CULPRIT_SUGGESTERS,
): Finding[] {
  const offered = verify(testCase.code, culprits, testCase);
  if (!offered || offered.some((message) => message.fatal)) return [];
  for (const message of offered) {
    const rule = (message.ruleId || '').slice(PREFIX.length);
    if (suggestionReported.has(rule)) {
      suggestionReported.set(rule, (suggestionReported.get(rule) || 0) + 1);
    }
  }

  const findings: Finding[] = [];
  for (const edit of suggestionEditsOf(testCase.code, offered)) {
    const culprit = edit.ruleId.slice(PREFIX.length);
    suggestionApplied.set(culprit, (suggestionApplied.get(culprit) || 0) + 1);
    stats.suggestionsApplied++;
    // A rule reporting on its own suggestion's output is convergence, which
    // `fixer-convergence` owns; this axis is about the OTHER rule's silence.
    if (culprit === victim) continue;

    const after = verify(edit.output, victimSolo, testCase);
    if (!after || after.some((message) => message.fatal)) continue;
    if (after.length === 0) continue;
    findings.push({
      victim,
      // Attribution is direct: exactly one suggestion, from one rule, applied.
      culprits: [culprit],
      channel: 'suggestion',
      messageIds: [
        ...new Set(after.map((message) => message.messageId ?? '?')),
      ],
      filename: testCase.filename,
      origin: testCase.origin,
      before: testCase.code,
      after: edit.output,
    });
  }
  return findings;
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

      findings.push(...suggestionFindingsFor(name, testCase, victimSolo));

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
        channel: 'fix',
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

/**
 * Why a rule's suggestions never entered this corpus, derived from the run
 * rather than asserted by hand so an entry cannot claim a reason the corpus
 * contradicts.
 */
const SUGGESTION_REASONS = {
  neverReports:
    'reports on no valid fixture in this corpus, so it offers no suggestion to accept',
  reportsWithoutSuggestion:
    'reports on valid fixtures here but attaches no suggestion to those reports',
} as const;

/**
 * Suggestion-bearing rules this corpus cannot reach, with the reason the run
 * itself produces.
 *
 * Enforced BOTH ways below: a rule that stops being exercised must be added
 * here consciously, and an entry that stops reproducing must be deleted. A
 * one-way list would let a rule go dark under a reason that no longer holds,
 * which is the hole #1732 records and #1733 repeats for this channel.
 *
 * A rule lands here because the substrate is the OTHER rules' `valid` fixtures
 * — the code a rule promises silence on — and nothing stops these two rules
 * being exercised elsewhere: `comment-fix-fidelity`, `export-surface-integrity`
 * and `cjs-emission-closure` all probe their suggestions over their own
 * fixtures.
 */
const UNREACHED_SUGGESTION_CULPRITS: Record<string, string> = {
  'enforce-dynamic-firebase-imports': SUGGESTION_REASONS.neverReports,
  'no-excessive-parent-chain': SUGGESTION_REASONS.neverReports,
};

const observedUnreachedCulprits = Object.fromEntries(
  suggestionRuleNames
    .filter((rule) => (suggestionApplied.get(rule) || 0) === 0)
    .map((rule) => [
      rule,
      (suggestionReported.get(rule) || 0) === 0
        ? SUGGESTION_REASONS.neverReports
        : SUGGESTION_REASONS.reportsWithoutSuggestion,
    ]),
);

/**
 * Printed per rule with its reason, not merely asserted in aggregate: a rule
 * contributing nothing reads as "this channel is clean" when the truth may be
 * that the corpus never reached it.
 */
console.log(
  [
    `[exemption-composition] suggestion channel: ${stats.suggestionsApplied} ` +
      `suggestion(s) applied over ${stats.controlSilent} silent fixture(s)`,
    ...suggestionRuleNames.map(
      (rule) =>
        `    ${rule}: ${suggestionApplied.get(rule) || 0} applied, ` +
        `${suggestionReported.get(rule) || 0} report(s) offered`,
    ),
  ].join('\n'),
);

/**
 * `<culprit> -> <victim>`, matching `FIX_INDUCED_BASELINE`'s key shape, with the
 * channel spelled out for a suggestion so one channel's justification can never
 * be read as covering the other's regression.
 */
const pairKey = (finding: Finding) => {
  const culprit =
    finding.culprits.length === 1 ? finding.culprits[0] : '(unattributed)';
  return finding.channel === 'suggestion'
    ? `${culprit} (suggestion) -> ${finding.victim}`
    : `${culprit} -> ${finding.victim}`;
};

/**
 * Exemptions the shipped config destroys today, keyed
 * `<culprit fixer> -> <rule whose exemption it destroyed>`.
 *
 * AN ENTRY IS NOT A WAY TO MAKE A BUILD GREEN. It records either a
 * contradiction someone verified is acceptable, or an open defect that is
 * tracked — and every entry carries the issue that settled it, so which of the
 * two it is stays legible. Anything unlisted fails, and a listed pair that stops
 * reproducing also fails, so an exemption cannot rot into a shield for the next
 * regression.
 *
 * Prefer fixing over listing. Most destructions this gate has found were fixed
 * rather than baselined (#1690, #1691, #1692), and the lone entry it once
 * carried — `global-const-style -> no-static-constants-in-dynamic-files`, the
 * #1599 pair — stopped reproducing when the renamer began withholding the
 * rename for every exported declaration (#1700).
 *
 * The entries below arrived together when #1878 lifted this guard's blanket
 * exclusion of the 16 type-aware rules, so their fixers compose here for the
 * first time. Each is a defect in the CULPRIT, tracked by its own issue and
 * scoped to one rule so it lands as one commit; listing them is what lets the
 * lift — the forcing function that found them — land without the guard going
 * red. Anything unlisted fails, and a listed pair that stops reproducing also
 * fails, so none of these can rot into a shield for the next regression.
 *
 * The dominant shape on this axis — `no-explicit-return-type` deleting the
 * return annotation another rule reads as its exemption carrier (6 of the 12
 * findings that opened it, #1595/#1596, then #1691 and #1692) — is answered on
 * the READER side each time: the rule classifies the body's returns and
 * declines when they yield no verdict, so no annotation has to survive for its
 * exemption to hold. Reach for that before making a fixer decline.
 */
export const EXEMPTION_DESTROYED_BASELINE: Record<string, string> = {
  /**
   * The suggestion is deliberately incomplete: it injects a
   * `__TODO_MEMOIZATION_DEPENDENCIES__` placeholder precisely so a developer
   * cannot ship an accidental empty dependency array — and a comment-only array
   * is syntactically empty, which is what `enforce-global-constants` rejects.
   * The report lives exactly as long as the placeholder does.
   *
   * Verified on the fixture that reaches it here
   * (`enforce-global-constants.test.ts`'s `const { a: a1, b: b1 } = { a, b }`):
   * with the placeholder, `useGlobalConstant` is reported once; with the real
   * dependencies `[a, b]` written in, the rule is silent again, as it is on the
   * untouched fixture. The same contradiction is adjudicated for the same
   * reason in `recommended-config-fix-closure`'s SUGGESTION_INDUCED_BASELINE
   * (#1600, #1601); this corpus reaches it from the victim's own carve-out.
   */
  'react-memoize-literals (suggestion) -> enforce-global-constants':
    "the emitted `[/* __TODO_MEMOIZATION_DEPENDENCIES__ */]` is a syntactically empty dependency array until the developer fills it in, which is the suggestion's stated contract; with real dependencies the report disappears (#1601)",

  /**
   * The ONLY entry here that is a harness artifact rather than a defect, and it
   * is named at the (guard, rule) level for exactly the reason
   * `silentWithoutProgramRuleNames` refuses to hold it: a rule-global exemption
   * would un-gate every other arm these two participate in (#1839).
   *
   * `require-memo` emits `import { memo } from 'src/util/memo'`. This harness has
   * no `parserOptions.project`, so that specifier does not resolve, `memo` is
   * `any`, and therefore `Child` is `any` — measured: the binding goes from
   * `(props: ChildProps) => any` to `any`. Every type-driven carve-out in the
   * victim collapses at once because `checker.getContextualType` returns
   * undefined, while the positive test still passes because it reads the VALUE.
   *
   * Re-measured under a real program (`parserOptions.project`, with
   * `src/util/memo` typed as React's `memo`, which is what agora ships): the
   * memo wrap PRESERVES the contextual type (`NamedExoticComponent<ChildProps>`)
   * and the victim stays silent. So the destruction does not exist in
   * production, and there is nothing on either side to fix — the culprit is
   * inside its documented remit and the victim already handles the rewritten
   * shape the moment the module resolves.
   */
  'require-memo -> consistent-callback-naming':
    'an artifact of this harness having no `parserOptions.project`: the emitted `src/util/memo` specifier does not resolve, so `memo` is `any` and the victim loses the contextual type it reads. Re-measured under a real program with a props-preserving memo, the victim is silent (#1878)',

  /**
   * Both rules are inside their documented remit — the culprit's own docs carry
   * this removal as an example, and the victim's post-fix report is true of the
   * code as rewritten — so this is a product call, not a bug. Production-
   * reachable: agora sets `parserOptions.project`, so the culprit is fully live
   * there.
   */
  'no-entire-object-hook-deps -> enforce-global-constants':
    'the culprit deletes an unread `useMemo` dependency (its documented behaviour), emptying the array, which is precisely the shape the victim exists to report; neither rule is outside its remit, so the composition needs a product decision (#1884)',

  /**
   * Culprit-side defect: `no-redundant-annotation-assertion`'s structural key
   * omits `readonly`, so an `as const` type compares equal to a mutable
   * annotation it does not actually match, and deleting that annotation orphans
   * the type — the output emits TS6196 under this repo's own `noUnusedLocals`.
   * Keyed `(unattributed)` because a second, inert transform
   * (`prefer-type-over-interface`) rewrites the same region, so the guard sees
   * more than one culprit; run alone, only this rule reproduces the harm.
   */
  '(unattributed) -> no-unnecessary-verb-suffix':
    "`no-redundant-annotation-assertion`'s readonly-blind structural key deletes an annotation that is not in fact redundant, orphaning the type; the victim's signal-D carve-out reads that annotation and reports once it is gone (#1883)",

  /**
   * Same culprit, second arm: for a self-referential type the redundancy is
   * circular — the equality that proves it holds only while the annotation
   * exists. Measured: deleting it yields TS7023 for the angle-bracket spelling,
   * and a silent `FakeQuery` -> `{ readonly orderBy: () => any }` leak for the
   * `as const` ones.
   *
   * One of the six fixtures (`const chain: QueryLike = {...} as const as
   * QueryLike`) is NOT the culprit's fault and will keep this pair reproducing
   * after #1883 lands: there the removal is type-preserving and the victim's
   * report is wrong on its own terms, tracked as #1885.
   */
  'no-redundant-annotation-assertion -> no-unnecessary-verb-suffix':
    'the culprit strips a return annotation that is load-bearing for a self-referential type, emitting code that fails TS7023 or silently leaks `any`; the victim reads that annotation as its exemption carrier. One fixture is a separate victim-side gap (#1883, #1885)',
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
          'A sibling transform rewrote away the carrier this rule keys its',
          'exemption off, so `eslint --fix` — or a single accepted suggestion,',
          'after which nothing re-runs at all — turns code the rule promises',
          'silence on into a violation. Make the transform preserve the carrier,',
          'teach the rule to see the rewritten shape, or — if the contradiction',
          'needs a product call — add the pair to EXEMPTION_DESTROYED_BASELINE',
          'with the reason and its issue link, referencing #1562.',
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
    // The type-aware rules this guard once dropped wholesale must now COMPOSE
    // like any other. Asserting their presence — rather than that some
    // exclusion set is populated — is what keeps the #1877 blind spot from
    // being reintroduced silently.
    const typeAwareInConfig = [...typeAwareRuleNames].filter(
      (name) => PREFIX + name in plugin.configs.recommended.rules,
    );
    expect(typeAwareInConfig.length).toBeGreaterThan(5);
    expect(
      typeAwareInConfig.filter((name) => !(PREFIX + name in FIX_CONFIG)),
    ).toEqual([]);
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

  /**
   * Per-rule floor for the suggestion channel. An aggregate would let one
   * prolific rule stand in for a rule that stopped emitting entirely, and a
   * rule with zero applied suggestions was not tested on this channel at all —
   * which is the state #1733 records for all seven of them.
   */
  it('accounts for every suggestion-bearing rule, unreached ones by reason', () => {
    expect(suggestionRuleNames.length).toBeGreaterThanOrEqual(7);
    expect(observedUnreachedCulprits).toEqual(UNREACHED_SUGGESTION_CULPRITS);
    expect(stats.suggestionsApplied).toBeGreaterThanOrEqual(40);
  });

  it('detects a destroyed exemption (positive control)', () => {
    // The #1599 shape — a camelCase constant a `.dynamic` module exports, which
    // the victim rule is silent on until something SCREAMS the name. Its
    // culprit is the planted double rather than `global-const-style`, which
    // withholds the rename for exported declarations (#1700): the detector must
    // stay proven when no shipped rule destroys anything.
    const planted: ValidCase = {
      code: "export const apiUrl = 'https://api.example.com';\n",
      filename: 'src/config/settings.dynamic.ts',
      origin: 'planted control',
    };
    const victim = 'no-static-constants-in-dynamic-files';
    const solo = soloRules(victim, planted);
    const withCulprit = { ...FIX_CONFIG, [CONTROL_RENAMER_ID]: 'error' };

    expect(verify(planted.code, solo, planted)).toEqual([]);
    const fixed = linter.verifyAndFix(
      planted.code,
      configFor(withCulprit, planted.parserOptions),
      { filename: planted.filename },
    );
    expect(fixed.output).not.toBe(planted.code);
    expect((verify(fixed.output, solo, planted) || []).length).toBeGreaterThan(
      0,
    );
    expect(attributeCulprits(victim, planted, solo, withCulprit)).toEqual([
      CONTROL_RENAMER_ID.slice(PREFIX.length),
    ]);
  });

  it('holds the shipped config responsible for the same shape (control)', () => {
    // The other half of the control: with only the shipped rules, that same
    // snippet must come out of `--fix` still exporting `apiUrl`. This is what
    // turns the planted culprit above into a statement about the detector
    // rather than a way to skip testing the config.
    const planted: ValidCase = {
      code: "export const apiUrl = 'https://api.example.com';\n",
      filename: 'src/config/settings.dynamic.ts',
      origin: 'planted control',
    };
    const victim = 'no-static-constants-in-dynamic-files';
    const solo = soloRules(victim, planted);

    const fixed = linter.verifyAndFix(
      planted.code,
      configFor(FIX_CONFIG, planted.parserOptions),
      { filename: planted.filename },
    );
    expect(fixed.output).toContain('apiUrl');
    expect((verify(fixed.output, solo, planted) || []).length).toBe(0);
  });

  it('detects an exemption destroyed by a SUGGESTION (positive control)', () => {
    // The same #1599 shape, reached through the channel `--fix` never touches:
    // the control offers the rename as a suggestion, so `verifyAndFix` leaves
    // the file untouched and only an accepting consumer sees the destruction.
    const planted: ValidCase = {
      code: "export const apiUrl = 'https://api.example.com';\n",
      filename: 'src/config/settings.dynamic.ts',
      origin: 'planted control',
    };
    const victim = 'no-static-constants-in-dynamic-files';
    const solo = soloRules(victim, planted);

    expect(verify(planted.code, solo, planted)).toEqual([]);
    // The fix channel must stay blind to it, or the control proves nothing
    // about the suggestion channel specifically.
    const fixed = linter.verifyAndFix(
      planted.code,
      configFor({ [CONTROL_SUGGESTER_ID]: 'error' }, planted.parserOptions),
      { filename: planted.filename },
    );
    expect(fixed.output).toBe(planted.code);

    const found = suggestionFindingsFor(victim, planted, solo, {
      [CONTROL_SUGGESTER_ID]: 'error',
    });
    expect(found.map((finding) => pairKey(finding))).toEqual([
      `${CONTROL_SUGGESTER_ID.slice(PREFIX.length)} (suggestion) -> ${victim}`,
    ]);
  });

  it('stays silent when an accepted suggestion preserves it (negative control)', () => {
    // Same pipeline, same trigger, a suggestion that rewrites the INITIALIZER
    // and leaves the name alone. A green corpus means nothing if the detector
    // fires on every rewrite it is handed.
    const planted: ValidCase = {
      code: "export const apiUrl = 'https://api.example.com';\n",
      filename: 'src/config/settings.dynamic.ts',
      origin: 'planted control',
    };
    const victim = 'no-static-constants-in-dynamic-files';
    const solo = soloRules(victim, planted);
    const before = stats.suggestionsApplied;

    const found = suggestionFindingsFor(victim, planted, solo, {
      [CONTROL_SAFE_SUGGESTER_ID]: 'error',
    });
    // A control whose suggestion never reached the detector would prove nothing
    // about either polarity.
    expect(stats.suggestionsApplied).toBe(before + 1);
    expect(found).toEqual([]);
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

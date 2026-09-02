import { Linter } from 'eslint';
import {
  FALLBACK_FILENAMES,
  FixtureCase,
  defaultFilenameFor,
  harvestFixtureCorpus,
  parserOptionsFor,
  severityWithOptions,
  silentWithoutProgramRuleNames,
} from '../utils/fixtureCorpus';
import {
  DECLARES_INTO_SHARED_SCOPE,
  MODES,
  ModeKey,
  compileCorpus,
  introducedDiagnosticsIgnoringUnused,
  isFragmentArtifact,
} from '../utils/fixtureTypeProgram';

// Using require to avoid test build-time ESM interop issues; the test runner
// only needs the plugin object shape (rules), not types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as {
  rules: Record<string, { meta?: Record<string, unknown> }>;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tsParser = require('@typescript-eslint/parser');

const PREFIX = '@blumintinc/blumint/';

/**
 * An autofix must not turn compiling code into non-compiling code.
 *
 * Every other fixer guard reads ESLint-level signals only — reports, scope
 * bindings, re-parse — so a fix that emits parseable-but-type-broken code is
 * invisible to all of them, and to `RuleTester`, which never type-checks. One
 * pass of this check found four defects at once: #1521 (a `Timestamp.now()`
 * fix emitted with no `Timestamp` in scope), #1522 (a prop rename applied to
 * one side of the contract only), #1523 (a synthesized `= {}` default on a
 * nested object pattern) and #1524 (a destructure that dropped the receiver of
 * a method).
 *
 * The assertion is a differential, never an absolute diagnostic count: the
 * corpus is made of test snippets, which are fragments full of identifiers no
 * program defines. What must hold is that the fixed text carries no diagnostic
 * the input did not already carry.
 *
 * That differential is run under TWO compilers, `strict: false` and
 * `strict: true` (see `MODES`). The single loose program this used to run was
 * blind to everything `strictNullChecks` decides, which is a large share of
 * what a fixer can break — #1985 is a fixer hoisting a guard-protected
 * dereference out of its guard, and the guard was green throughout. Findings
 * are unioned across modes and each pair is asserted under whichever modes
 * accept its own input.
 *
 * A SUGGESTION emits code into the same file under the same compiler, so it can
 * break the build in exactly the same way; `meta.fixable` alone made every
 * suggestion-only rule invisible here (#1601). The one difference is how the
 * text under test is produced: `--fix` never applies a suggestion, so each is
 * applied ALONE to the untouched snippet rather than run through
 * `verifyAndFix`. Composing two suggestions from one report would compile a
 * file no consumer can produce.
 *
 * The corpus is the suite's OWN `RuleTester` cases, captured by
 * `harvestFixtureCorpus` with their `options`, `filename` and `parserOptions`
 * attached. Text-parsing the test files for string literals — what this guard
 * did until #1732 — reported `310 case(s) unharvestable (interpolated)` in its
 * own accounting: a suite that assembles every case from a shared prelude
 * (`no-usememo-for-pass-by-value`) yielded ONE snippet where it declares 105
 * cases, and the snippets that did survive arrived stripped of the options
 * their fixer is gated on.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const VIRTUAL_DIR = '/virtual-fixer-corpus';

const linter = new Linter();
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}
linter.defineParser('ts', tsParser);

/**
 * The case's own options reach the fix pass. An option-gated fixer is
 * unreachable on defaults — #1461's autofix only exists once `headerTemplate`
 * is set — so a corpus that dropped them could not reach it at all, and a
 * corpus that applied them to only one side would manufacture findings.
 */
const configFor = (ruleId: string, testCase: FixtureCase): Linter.Config =>
  ({
    parser: 'ts',
    parserOptions: parserOptionsFor(testCase),
    rules: { [ruleId]: severityWithOptions(testCase) },
  } as Linter.Config);

/**
 * `verifyAndFix`, not a single fix application: what a developer runs is the
 * fix loop, and that is the text that has to compile.
 */
const fixWith = (
  ruleId: string,
  testCase: FixtureCase,
  filenames: string[],
) => {
  for (const filename of filenames) {
    let result;
    try {
      result = linter.verifyAndFix(testCase.code, configFor(ruleId, testCase), {
        filename,
      });
    } catch {
      continue;
    }
    if (result && result.output && result.output !== testCase.code) {
      return { output: result.output, filename };
    }
  }
  return null;
};

const applyEdit = (
  text: string,
  fix: { range: readonly number[]; text: string },
) => text.slice(0, fix.range[0]) + fix.text + text.slice(fix.range[1]);

/**
 * One output per emitted suggestion, each applied alone to `snippet`.
 *
 * Deliberately NOT `verifyAndFix`: that loop never sees a suggestion, and
 * stacking two of them — or re-running the rule on a suggestion's output —
 * would compile a state no editor can produce, so a diagnostic found there
 * would be unactionable.
 */
const suggestWith = (
  ruleId: string,
  testCase: FixtureCase,
  filenames: string[],
) => {
  for (const filename of filenames) {
    let messages;
    try {
      messages = linter.verify(testCase.code, configFor(ruleId, testCase), {
        filename,
      });
    } catch {
      continue;
    }
    if (messages.some((message) => message.fatal)) continue;
    const outputs: string[] = [];
    for (const message of messages) {
      if (message.ruleId !== ruleId) continue;
      for (const suggestion of message.suggestions || []) {
        if (!suggestion.fix) continue;
        const output = applyEdit(testCase.code, suggestion.fix);
        if (output !== testCase.code) outputs.push(output);
      }
    }
    if (outputs.length) return { outputs, filename };
  }
  return null;
};

type Pair = {
  rule: string;
  name: string;
  before: string;
  after: string;
  /** Declaring suite and probed path, so a finding is reproducible by hand. */
  origin: string;
  filename: string;
};

/**
 * Planted defects, run through the exact pipeline the guard uses. A zero on the
 * real rules only means something if the same corpus, the same programs and the
 * same diff flag code that is known-broken.
 *
 * `expectFlagged: false` is as important as the true cases — it pins the
 * artifact filter's polarity so a future widening cannot quietly swallow the
 * #1521 defect shape along with the duplicate-reference noise.
 */
const CONTROLS: Array<{
  name: string;
  code: string;
  expectFlagged: boolean;
  /** Which transform channel the control's text comes out of. */
  kind?: 'fix' | 'suggestion';
  rule: Record<string, any>;
}> = [
  {
    name: 'control-type-break',
    // Retypes a string to a number: parses fine, fails tsc (TS2322).
    code: 'export const v: string = "hello";\n',
    expectFlagged: true,
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: any) {
        return {
          Literal(node: any) {
            if (node.value !== 'hello') return;
            context.report({
              node,
              messageId: 'm',
              fix: (f: any) => f.replaceText(node, '42'),
            });
          },
        };
      },
    },
  },
  {
    name: 'control-syntax-break',
    // Sits in the same program as the real corpus to keep proving that one
    // unparseable file does not zero out everybody else's diagnostics.
    code: 'export const fn = (a: number) => { return a + 1; };\n',
    expectFlagged: true,
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: any) {
        return {
          ReturnStatement(node: any) {
            context.report({
              node,
              messageId: 'm',
              fix: (f: any) => f.replaceText(node, 'return a +;'),
            });
          },
        };
      },
    },
  },
  {
    name: 'control-unbound-reference',
    // The #1521 shape, in a file that ALREADY has an unresolved name: the fix
    // emits `Timestamp.now()` with no `Timestamp` in scope. Must survive the
    // artifact filter.
    code: 'const missing = ghost;\nexport const at = new Date();\n',
    expectFlagged: true,
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: any) {
        return {
          NewExpression(node: any) {
            if (node.callee.name !== 'Date') return;
            context.report({
              node,
              messageId: 'm',
              fix: (f: any) => f.replaceText(node, 'Timestamp.now()'),
            });
          },
        };
      },
    },
  },
  {
    name: 'control-duplicate-reference',
    // The artifact: one more mention of a name that was already unresolvable.
    // Must NOT be flagged.
    code: 'export const flag = !ghost;\n',
    expectFlagged: false,
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: any) {
        return {
          UnaryExpression(node: any) {
            if (node.operator !== '!') return;
            if (node.argument.name !== 'ghost') return;
            context.report({
              node,
              messageId: 'm',
              fix: (f: any) =>
                f.replaceText(
                  node,
                  '(!ghost || Object.keys(ghost).length === 0)',
                ),
            });
          },
        };
      },
    },
  },
  {
    name: 'control-stub-beats-wildcard-firestore',
    /**
     * Pins the #1529 repair itself. Both of these are silent when the imported
     * binding is `any`, which is what `declare module '*'` alone gave and why
     * this guard could not see #1528 — so each is flagged if and only if the
     * specific `declare module` really does win over the wildcard. Deleting or
     * mistyping a stub therefore fails a control instead of quietly restoring
     * the blind spot.
     */
    code:
      "import { Timestamp } from 'firebase-admin/firestore';\n" +
      'export const at = Timestamp.now().toMillis();\n',
    expectFlagged: true,
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: any) {
        return {
          MemberExpression(node: any) {
            if (node.property.name !== 'toMillis') return;
            context.report({
              node: node.property,
              messageId: 'm',
              // A `Date` member `Timestamp` lacks: the #1528 shape exactly.
              fix: (f: any) =>
                f.replaceText(node.property, 'toLocaleDateString'),
            });
          },
        };
      },
    },
  },
  {
    name: 'control-stub-beats-wildcard-react',
    // `useCallback` returns the callback where `useMemo` returns what it
    // produced, so this swap is a type error under React's real signatures and
    // invisible under the wildcard's `any`.
    code:
      "import { useCallback, useMemo } from 'react';\n" +
      'export const useTotal = (): number => useMemo(() => 1, []);\n',
    expectFlagged: true,
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
            if (node.callee.name !== 'useMemo') return;
            context.report({
              node,
              messageId: 'm',
              fix: (f: any) => f.replaceText(node.callee, 'useCallback'),
            });
          },
        };
      },
    },
  },
  {
    name: 'control-strict-null-break',
    /**
     * The non-vacuity assertion for the strict mode, and the reason this pair
     * of controls exists at all: `s.length` on a `string | null` is a diagnostic
     * ONLY under `strictNullChecks`, so nothing but a live strict program can
     * flag it. Drop the strict mode — or let `strict` drift back to `false` —
     * and this control fails instead of the guard quietly returning to the blind
     * spot that let #1985 through.
     */
    code: 'export const len = (s: string | null) => (s === null ? 0 : s.length);\n',
    expectFlagged: true,
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: any) {
        return {
          ConditionalExpression(node: any) {
            context.report({
              node,
              messageId: 'm',
              fix: (f: any) => f.replaceText(node, 's.length'),
            });
          },
        };
      },
    },
  },
  {
    name: 'control-strict-null-safe',
    // Polarity for the mode above. Strict adds a whole diagnostic class, so it
    // needs its own proof that it does not simply flag every fix it sees.
    code: 'export const size = (s: string | null) => (s === null ? 0 : s.length);\n',
    expectFlagged: false,
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: any) {
        return {
          ConditionalExpression(node: any) {
            context.report({
              node,
              messageId: 'm',
              fix: (f: any) => f.replaceText(node, "(s ?? '').length"),
            });
          },
        };
      },
    },
  },
  {
    name: 'control-suggestion-type-break',
    /**
     * The suggestion channel needs its own planted defect: `verifyAndFix`
     * returns this snippet untouched, so a harness that only knows about fixes
     * builds an empty suggestion corpus and every per-rule assertion below
     * degrades to a vacuous pass.
     */
    code: 'export const label: string = "hello";\n',
    expectFlagged: true,
    kind: 'suggestion',
    rule: {
      meta: {
        type: 'suggestion',
        hasSuggestions: true,
        schema: [],
        messages: { m: 'x', s: 'retype it' },
      },
      create(context: any) {
        return {
          Literal(node: any) {
            if (node.value !== 'hello') return;
            context.report({
              node,
              messageId: 'm',
              suggest: [
                { messageId: 's', fix: (f: any) => f.replaceText(node, '42') },
              ],
            });
          },
        };
      },
    },
  },
  {
    name: 'control-suggestion-type-safe',
    // Pins the polarity: a well-typed suggestion must NOT be flagged, or the
    // suggestion assertions below would fire on everything and mean nothing.
    code: 'export const label: string = "hello";\n',
    expectFlagged: false,
    kind: 'suggestion',
    rule: {
      meta: {
        type: 'suggestion',
        hasSuggestions: true,
        schema: [],
        messages: { m: 'x', s: 'reword it' },
      },
      create(context: any) {
        return {
          Literal(node: any) {
            if (node.value !== 'hello') return;
            context.report({
              node,
              messageId: 'm',
              suggest: [
                {
                  messageId: 's',
                  fix: (f: any) => f.replaceText(node, '"goodbye"'),
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
  linter.defineRule(`control/${control.name}`, control.rule as never);
}

/**
 * The cap counts *fix pairs*, not harvested cases, and every case a rule offers
 * is scanned until that many pairs exist.
 *
 * Capping the harvest instead silently excluded rules (#1527). Cases come out
 * in test-file order, `valid` cases first, and a rule with more than the cap's
 * worth of them spent its whole budget before reaching a single trigger — so it
 * contributed nothing and was listed as a rule with no fixable trigger,
 * indistinguishable from one that genuinely has none. `enforce-object-literal-
 * as-const` was the proof: 122 snippets, the first 30 all `valid`, and its
 * TS4104 defect (#1526) sat outside the window the guard could ever see.
 *
 * At 30 the cap was still dropping a tail — its own accounting printed `1,999 of
 * 8,069 harvested snippets unscanned` across 37 rules (#1732). What paid for
 * lifting it is probing each case under the filename it was WRITTEN for instead
 * of re-probing every one under seven invented paths: measured over the same
 * corpus, the fan-out yields 8,433 fix pairs across 81 rules where the authentic
 * filename yields 2,652 across the same 81, so the fan-out was spending 3.2x the
 * budget to compile near-duplicates of pairs it already had. The largest rule
 * contributes 117 pairs, so this bound is slack today and exists only to keep a
 * future fixture explosion from turning two TypeScript programs into an
 * unbounded cost — and if it ever binds, exactly what it dropped is printed
 * below and asserted, never silently discarded.
 */
const MAX_PAIRS_PER_RULE = 150;

/**
 * `DECLARES_INTO_SHARED_SCOPE` is imported from `fixtureTypeProgram` rather than
 * respelled here: a local copy shadows the shared one, and a widening of the
 * shared pattern would then never reach this guard while reading as if it had.
 *
 * The damage the exclusion prevents is not hypothetical: one
 * `prefer-map-over-conditional-dispatch` fixture declares `namespace JSX {
 * interface Element { readonly _brand: unique symbol } }` globally, which brands
 * `JSX.Element` for the whole corpus and makes every component whose return type
 * is concrete a TS2786 — in whichever of the two corpora happens to have the
 * concrete type. Such snippets are dropped, and counted below.
 */
const fixableRules = Object.entries(plugin.rules)
  .filter(([, rule]) => rule && rule.meta && rule.meta.fixable)
  .map(([name]) => name)
  .sort();

const suggestionRules = Object.entries(plugin.rules)
  .filter(([, rule]) => rule && rule.meta && rule.meta.hasSuggestions)
  .map(([name]) => name)
  .sort();

const corpus = harvestFixtureCorpus();

/**
 * The type-checkable subset of a rule's fixtures, plus what each exclusion cost.
 *
 * Two exclusions, different in kind. A `declare module` fixture is dropped to
 * protect the SHARED program — it would retype every other rule's pairs. A JSON
 * or Markdown fixture is dropped because the question does not apply to it:
 * `tsc` has nothing to say about a `package.json` body or a `.md` file, so a
 * pair built from one could only manufacture noise. Counted separately so the
 * reason a rule ends up uncovered names which exclusion did it (#1860).
 */
const casesFor = (rule: string) => {
  const all = corpus.byRule.get(rule) || [];
  const typescript = all.filter((testCase) => testCase.language === 'ts');
  const usable = typescript.filter(
    (testCase) => !DECLARES_INTO_SHARED_SCOPE.test(testCase.code),
  );
  return {
    total: all.length,
    nonTypeScript: all.length - typescript.length,
    usable,
    dropped: typescript.length - usable.length,
  };
};

/**
 * Reasons a rule contributes no asserted pair, each established by the run
 * itself. Which one holds is information: a rule that never reports on its own
 * fixtures is a different (and more surprising) fact than one that reports and
 * declines to fix, and both differ from one whose every fixture is already
 * ill-typed before anything touches it.
 */
const REASONS = {
  noFixtures: 'declares no fixture this TypeScript harness can lint',
  sharedScope: 'every one of its fixtures declares into the shared scope',
  nonTypeScript:
    'every one of its fixtures is JSON or Markdown, which tsc cannot type-check',
  // Held for a rule that measurably produces nothing here. The old wording
  // ("is type-aware, and a bare Linter has no program") was a premise, not a
  // measurement, and a false one: the parser builds an isolated program and all
  // 16 checker-touching rules report over their own fixtures (#1859).
  undrivable:
    'is measurably silent under this harness, so its fixer is unreachable here',
  neverReports: 'never reports on any of its own fixtures',
  reportsWithoutFix: 'reports on its own fixtures but never offers a fix',
  fixDiscarded: 'offers a fix that the fix loop then discards',
  illTypedInput: 'every one of its pairs starts from an input that fails tsc',
} as const;

type Reason = typeof REASONS[keyof typeof REASONS];

const filenamesFor = (testCase: FixtureCase) => [defaultFilenameFor(testCase)];

/**
 * Second-chance filenames, for a case whose author declared none. Running this
 * for every case is what the fan-out did; running it only where the rule is
 * otherwise unreached keeps the reason honest without paying for the rest.
 */
const fallbackFilenamesFor = (testCase: FixtureCase) =>
  testCase.filename ? [] : FALLBACK_FILENAMES;

const noFixReasonFor = (rule: string, cases: FixtureCase[]): Reason => {
  const ruleId = PREFIX + rule;
  let reported = false;
  let offeredFix = false;
  for (const testCase of cases) {
    for (const filename of [
      ...filenamesFor(testCase),
      ...fallbackFilenamesFor(testCase),
    ]) {
      let messages;
      try {
        messages = linter.verify(testCase.code, configFor(ruleId, testCase), {
          filename,
        });
      } catch {
        continue;
      }
      for (const message of messages) {
        // A parse failure surfaces as a message with no rule attached.
        if (message.ruleId !== ruleId) continue;
        reported = true;
        if (message.fix) offeredFix = true;
      }
    }
  }
  if (offeredFix) return REASONS.fixDiscarded;
  if (silentWithoutProgramRuleNames.has(rule)) return REASONS.undrivable;
  if (reported) return REASONS.reportsWithoutFix;
  return REASONS.neverReports;
};

const coverage = {
  noFixtures: [] as string[],
  neverFixed: [] as string[],
  illTypedInput: [] as string[],
  covered: [] as string[],
  cappedTail: [] as string[],
  suggestionCappedTail: [] as string[],
};
const explanation = new Map<string, Reason>();
const detail = new Map<string, string>();

const pairs: Pair[] = [];
let harvested = 0;
let capped = 0;
let sharedScopeDropped = 0;
let nonTypeScriptDropped = 0;

for (const rule of fixableRules) {
  const { total, nonTypeScript, usable, dropped } = casesFor(rule);
  sharedScopeDropped += dropped;
  nonTypeScriptDropped += nonTypeScript;
  if (!usable.length) {
    coverage.noFixtures.push(rule);
    explanation.set(
      rule,
      total === 0
        ? REASONS.noFixtures
        : nonTypeScript === total
        ? REASONS.nonTypeScript
        : REASONS.sharedScope,
    );
    detail.set(
      rule,
      `${total} case(s) harvested, ${nonTypeScript} non-TypeScript, ` +
        `${dropped} declaring into the shared scope`,
    );
    continue;
  }
  harvested += usable.length;

  let fixed = 0;
  let skipped = 0;
  const collect = (testCase: FixtureCase, filenames: string[]) => {
    if (!filenames.length) return;
    if (fixed >= MAX_PAIRS_PER_RULE) {
      skipped++;
      return;
    }
    const result = fixWith(PREFIX + rule, testCase, filenames);
    if (!result) return;
    pairs.push({
      rule,
      name: `${rule}__${fixed}.${
        result.filename.endsWith('.tsx') ? 'tsx' : 'ts'
      }`,
      before: testCase.code,
      after: result.output,
      origin: testCase.origin,
      filename: result.filename,
    });
    fixed++;
  };

  for (const testCase of usable) collect(testCase, filenamesFor(testCase));
  if (!fixed) {
    for (const testCase of usable) {
      collect(testCase, fallbackFilenamesFor(testCase));
    }
  }

  if (skipped) {
    coverage.cappedTail.push(`${rule} ${skipped}`);
    capped += skipped;
  }
  if (!fixed) {
    coverage.neverFixed.push(rule);
    explanation.set(rule, noFixReasonFor(rule, usable));
    detail.set(rule, `${usable.length} case(s) scanned`);
  }
}

/**
 * The suggestion corpus, built from the same harvest under the same cap. Each
 * emitted suggestion becomes its own pair against the untouched snippet, so a
 * rule offering three suggestions on one report contributes three independent
 * compilations rather than one impossible composite.
 */
const suggestionPairs: Pair[] = [];
const suggestionExplanation = new Map<string, Reason>();
/**
 * Cases the per-rule pair cap discarded on the SUGGESTION channel.
 *
 * The fix channel has counted this since it grew a cap; the suggestion channel
 * applied the same `MAX_PAIRS_PER_RULE` and counted nothing at all, so its
 * discards were invisible even to the diagnostic — a tier below the six
 * printed-but-unasserted counters #2225 set out to fix.
 */
let cappedSuggestions = 0;

for (const rule of suggestionRules) {
  const { usable } = casesFor(rule);
  if (!usable.length) {
    suggestionExplanation.set(rule, REASONS.noFixtures);
    continue;
  }
  let emitted = 0;
  let suggestionSkipped = 0;
  const collect = (testCase: FixtureCase, filenames: string[]) => {
    if (!filenames.length) return;
    if (emitted >= MAX_PAIRS_PER_RULE) {
      suggestionSkipped++;
      return;
    }
    const result = suggestWith(PREFIX + rule, testCase, filenames);
    if (!result) return;
    for (const output of result.outputs) {
      if (emitted >= MAX_PAIRS_PER_RULE) break;
      suggestionPairs.push({
        rule,
        name: `${rule}__s${emitted}.${
          result.filename.endsWith('.tsx') ? 'tsx' : 'ts'
        }`,
        before: testCase.code,
        after: output,
        origin: testCase.origin,
        filename: result.filename,
      });
      emitted++;
    }
  };
  for (const testCase of usable) collect(testCase, filenamesFor(testCase));
  if (!emitted) {
    for (const testCase of usable) {
      collect(testCase, fallbackFilenamesFor(testCase));
    }
  }
  if (!emitted) {
    suggestionExplanation.set(
      rule,
      silentWithoutProgramRuleNames.has(rule)
        ? REASONS.undrivable
        : REASONS.neverReports,
    );
  }
  if (suggestionSkipped) {
    coverage.suggestionCappedTail.push(`${rule} ${suggestionSkipped}`);
    cappedSuggestions += suggestionSkipped;
  }
}

/** A planted control is not a harvested fixture, but it is probed as one. */
const plantedCase = (code: string): FixtureCase => ({
  code,
  tester: 'ruleTesterTs',
  origin: 'planted control',
  bucket: 'valid',
});

const controlPairs: Pair[] = [];
for (const control of CONTROLS) {
  const id = `control/${control.name}`;
  const testCase = plantedCase(control.code);
  const output =
    control.kind === 'suggestion'
      ? (suggestWith(id, testCase, FALLBACK_FILENAMES)?.outputs || [])[0]
      : fixWith(id, testCase, FALLBACK_FILENAMES)?.output;
  // A control whose transform never fires would make its assertion vacuous, so
  // it is carried through as an empty pair and fails loudly below.
  controlPairs.push({
    rule: control.name,
    name: `${control.name}.ts`,
    before: control.code,
    after: output ?? control.code,
    origin: 'planted control',
    filename: FALLBACK_FILENAMES[1],
  });
}

const allPairs = [...pairs, ...suggestionPairs, ...controlPairs];
const diagnosticsByMode = new Map<
  ModeKey,
  { before: Map<string, string[]>; after: Map<string, string[]> }
>();
for (const mode of MODES) {
  diagnosticsByMode.set(mode.key, {
    before: compileCorpus(
      allPairs.map((p) => ({ name: p.name, text: p.before })),
      mode.strict,
      VIRTUAL_DIR,
    ),
    after: compileCorpus(
      allPairs.map((p) => ({ name: p.name, text: p.after })),
      mode.strict,
      VIRTUAL_DIR,
    ),
  });
}

const diagnosticsIn = (mode: ModeKey) => diagnosticsByMode.get(mode)!;

/**
 * The unused-declaration channel belongs to `composed-fix-type-safety-closure`,
 * not here: the programs run with `noUnusedLocals` (matching `tsconfig.json`),
 * and a fragment corpus makes a RENAME or a destructuring EXPANSION look like a
 * newly stranded binding to a SOLO oracle. That guard drops what a single rule
 * reproduces alone, which is exactly what those artifacts are; this one cannot,
 * so it reads the same differential with the channel removed. Measured
 * counterfactual on `fixer-type-safety`: 19 arms, then 11 after a count
 * discount, every one of them an artifact (#2234).
 */
/**
 * Per mode, never pooled: `introducedDiagnostics`' artifact filter is anchored
 * to the start of a diagnostic string, so a mode label may not be prefixed
 * before that filter runs, and a diagnostic the loose mode never emits must not
 * cancel one the strict mode does.
 */
const introducedByMode = (pair: Pair) =>
  MODES.filter((mode) => baselineCompilesIn(pair, mode.key)).map((mode) => ({
    mode: mode.key,
    added: introducedDiagnosticsIgnoringUnused(
      diagnosticsIn(mode.key).before.get(pair.name) || [],
      diagnosticsIn(mode.key).after.get(pair.name) || [],
    ),
  }));

/**
 * Deduped across modes: the same defect surfaces under both whenever the input
 * compiles under both, and counting it twice would double every baseline.
 */
const introducedFor = (pair: Pair) => [
  ...new Set(introducedByMode(pair).flatMap((entry) => entry.added)),
];

/** The modes that actually witnessed a finding, for the failure message. */
const witnessesFor = (pair: Pair) =>
  introducedByMode(pair)
    .filter((entry) => entry.added.length)
    .map((entry) => entry.mode);

/**
 * The claim being tested is that an autofix does not turn *compiling* code into
 * non-compiling code, so a snippet that does not compile is no baseline at all.
 * Against a broken input the differential reports re-wordings rather than
 * defects, and every one of them costs a maintainer a full investigation:
 *
 *   before: TS2739: Type 'any[]' is missing ... from type 'Promise<[A, B]>'
 *   after:  TS2322: Type 'readonly [any, any]' is not assignable to 'Promise<[A, B]>'
 *
 * That pair (a non-`async` function annotated `Promise<...>` returning an array
 * literal) is not valid TypeScript with or without the fix, and the same shape
 * written `async` — the one that does compile — is already left alone. A pair
 * whose input carries a real type error is therefore excluded and reported,
 * never silently dropped.
 *
 * Unresolved *names* are the deliberate exception. The corpus is test fragments
 * full of identifiers no program defines; excluding those would leave nearly
 * nothing, and the artifact filter above already handles them in the diff.
 */
const baselineCompilesIn = (pair: Pair, mode: ModeKey) =>
  (diagnosticsIn(mode).before.get(pair.name) || []).every(isFragmentArtifact);

/**
 * Asserted where SOME mode has a compiling input. A pair whose input is
 * ill-typed under strict but fine under the loose mode is still a real baseline
 * for the loose mode, and vice versa; requiring both would discard the 36 pairs
 * that only the loose mode can carry, and requiring only strict would discard
 * them too. `introducedByMode` re-checks per mode, so a mode whose baseline is
 * broken never contributes a diagnostic.
 */
const baselineCompiles = (pair: Pair) =>
  MODES.some((mode) => baselineCompilesIn(pair, mode.key));

/**
 * Why a rule ended up uncovered. Reported with the mode that produced it: "held
 * out for an ill-typed input" reads as a fixture problem, and under two modes
 * the reader's next question is always which compiler rejected it.
 */
const exampleIllTypedDiagnostic = (rulePairs: Pair[]) => {
  for (const mode of MODES) {
    for (const pair of rulePairs) {
      const found = (diagnosticsIn(mode.key).before.get(pair.name) || []).find(
        (diagnostic) => !isFragmentArtifact(diagnostic),
      );
      if (found) return `[${mode.key}] ${found}`;
    }
  }
  return null;
};

const assertedPairs = pairs.filter(baselineCompiles);
const assertedByRule = new Set(assertedPairs.map((pair) => pair.rule));
for (const rule of fixableRules) {
  if (assertedByRule.has(rule)) {
    coverage.covered.push(rule);
    continue;
  }
  if (explanation.has(rule)) continue;
  const rulePairs = pairs.filter((pair) => pair.rule === rule);
  coverage.illTypedInput.push(rule);
  explanation.set(rule, REASONS.illTypedInput);
  detail.set(
    rule,
    `all ${rulePairs.length} fix pairs, e.g. ${
      exampleIllTypedDiagnostic(rulePairs) || 'unknown'
    }`,
  );
}

const findingsByRule = new Map<string, Array<Pair & { added: string[] }>>();
for (const rule of fixableRules) findingsByRule.set(rule, []);
for (const pair of assertedPairs) {
  const added = introducedFor(pair);
  if (added.length) findingsByRule.get(pair.rule)!.push({ ...pair, added });
}

/** `<rule> <the TS codes the fix introduced>`, one key per defect shape. */
const findingKey = (finding: Pair & { added: string[] }) =>
  `${finding.rule} ${[
    ...new Set(finding.added.map((d) => d.slice(0, d.indexOf(':')))),
  ]
    .sort()
    .join('+')}`;

/**
 * Type-unsafe fixes the corpus reaches today, keyed `<rule> <TS code>` with the
 * number of pairs that reproduce it.
 *
 * AN ENTRY IS NOT A WAY TO MAKE A BUILD GREEN. It records a defect that is
 * tracked elsewhere, and the count is part of the key's meaning: a second pair
 * reaching the same shape is a new instance and fails here, exactly as an
 * unlisted shape does. A listed shape that stops reproducing fails too, so the
 * entry cannot rot into a shield for the next regression.
 *
 * Prefer fixing over listing.
 */
const TYPE_UNSAFE_BASELINE: Record<string, { pairs: number; note: string }> = {
  'enforce-microdiff TS2345': {
    pairs: 4,
    note:
      '#2219. The callee substitution is type-NARROWING: microdiff declares ' +
      '`TData extends Record<string, unknown> | unknown[]`, while the ' +
      'libraries it replaces accept `object`, so `diff(a: object, b: object)` ' +
      'is TS2345. Telling a satisfying operand from an unsatisfying one needs ' +
      'the checker, which is unavailable without parserOptions.project, so ' +
      'the remedy is a scope call on how much of the fix to withhold. ' +
      'Invisible until the stale `microdiff` stub exclusion was removed ' +
      '(#2215) — every fixed snippet had been type-checking as `any`. ' +
      'Pinned at 4 so a fifth instance still fails.',
  },
  'prefer-spread-over-reassembly TS2698': {
    pairs: 2,
    note:
      "#1986. Both pairs are the rule's own #1642 regressions, whose receiver " +
      'is an empty array literal — `never[]` under strictNullChecks, and ' +
      '`{ ...props }` on `never` is TS2698. The rule fires here by design: it ' +
      'reports exactly when the element type is UNRESOLVABLE, and telling ' +
      '"unresolvable" apart from "resolvably never" needs the checker, which ' +
      'is unavailable without parserOptions.project. Awaiting the design call ' +
      'on the issue; pinned at 2 so a third instance still fails.',
  },
};

const baselinedCounts = new Map<string, number>();
for (const findings of findingsByRule.values()) {
  for (const finding of findings) {
    if (!(findingKey(finding) in TYPE_UNSAFE_BASELINE)) continue;
    const key = findingKey(finding);
    baselinedCounts.set(key, (baselinedCounts.get(key) || 0) + 1);
  }
}

const assertedSuggestionPairs = suggestionPairs.filter(baselineCompiles);
const assertedSuggestionRules = new Set(
  assertedSuggestionPairs.map((pair) => pair.rule),
);
for (const rule of suggestionRules) {
  if (assertedSuggestionRules.has(rule) || suggestionExplanation.has(rule)) {
    continue;
  }
  const rulePairs = suggestionPairs.filter((pair) => pair.rule === rule);
  suggestionExplanation.set(rule, REASONS.illTypedInput);
  detail.set(
    `suggestion:${rule}`,
    `all ${rulePairs.length} suggestion pairs, e.g. ${
      exampleIllTypedDiagnostic(rulePairs) || 'unknown'
    }`,
  );
}

const suggestionFindingsByRule = new Map<
  string,
  Array<Pair & { added: string[] }>
>();
for (const rule of suggestionRules) suggestionFindingsByRule.set(rule, []);
for (const pair of assertedSuggestionPairs) {
  const added = introducedFor(pair);
  if (added.length) {
    suggestionFindingsByRule.get(pair.rule)!.push({ ...pair, added });
  }
}

const controlOutcomes = controlPairs.map((pair) => ({
  name: pair.rule,
  fired: pair.after !== pair.before,
  flagged: introducedFor(pair).length > 0,
  baselineCompiles: baselineCompiles(pair),
}));

const report = (finding: Pair & { added: string[] }, channel = 'after --fix') =>
  [
    `introduced: ${finding.added.join(' | ')}`,
    // Which compiler saw it: a strict-only finding is triaged differently from
    // one both modes agree on, and the reader cannot tell them apart otherwise.
    `witnessed under: ${witnessesFor(finding).join(', ')}`,
    `src/tests/${finding.origin} as ${finding.filename}`,
    '--- input (compiles) ---',
    finding.before,
    `--- ${channel} (does not) ---`,
    finding.after,
  ].join('\n');

const uncovered = [
  ...coverage.noFixtures,
  ...coverage.neverFixed,
  ...coverage.illTypedInput,
].sort();

/**
 * Every fixable rule this corpus cannot type-check a fix for, with the reason
 * the run itself produces.
 *
 * Enforced BOTH ways below, which a partition test alone is not: a rule that
 * goes dark must be added here consciously, and an entry that stops reproducing
 * must be deleted, since a stale one would silently absorb the next rule to
 * fall out of the corpus.
 */
const UNCOVERED_FIXERS: Record<string, Reason> = {
  /**
   * Its only fixtures are Markdown documents (`ruleTesterMarkdown`). `tsc`
   * cannot type-check a `.md` file, so "does the fix still compile" is not a
   * question about this rule — a pair built from one would compare diagnostics
   * of a file that was never TypeScript. Its fix loop IS exercised, by
   * `fixer-convergence`, which re-parses the output with the Markdown parser.
   */
  'enforce-typescript-markdown-code-blocks': REASONS.nonTypeScript,
  /** Its only fixtures are `package.json` bodies (`ruleTesterJson`); same. */
  'no-unpinned-dependencies': REASONS.nonTypeScript,
};

/**
 * Same contract on the suggestion channel. Empty by achievement, not omission:
 * `enforce-snapshot-state-narrowing` was here while the corpus was text-harvested
 * (every pair started from a fragment whose shorthand properties had no binding,
 * TS18004) and its real fixtures compile.
 */
const UNCOVERED_SUGGESTIONS: Record<string, Reason> = {};

const observedUncovered = Object.fromEntries(
  uncovered.map((rule) => [rule, explanation.get(rule)!]),
);

const observedUncoveredSuggestions = Object.fromEntries(
  suggestionRules
    .filter((rule) => !assertedSuggestionRules.has(rule))
    .map((rule) => [rule, suggestionExplanation.get(rule)!]),
);

const heldOutByRule = coverage.covered
  .map((rule) => {
    const total = pairs.filter((pair) => pair.rule === rule).length;
    const asserted = assertedPairs.filter((pair) => pair.rule === rule).length;
    return { rule, held: total - asserted, total };
  })
  .filter((entry) => entry.held > 0)
  .map((entry) => `${entry.rule} ${entry.held}/${entry.total}`);

/**
 * Printed, not merely asserted, and printed *per rule with its reason*: an
 * uncovered rule that lands in an unlabelled bucket reads as "this rule has no
 * fixable trigger" when the truth may be that the harness dropped it, which is
 * how #1526's defect stayed invisible under a rule the guard listed as swept.
 */
console.log(
  [
    `[fixer-type-safety] asserted ${assertedPairs.length} of ${pairs.length} ` +
      `fix pairs across ${coverage.covered.length} of ${fixableRules.length} ` +
      `fixable rules`,
    `  corpus: ${corpus.totalCases} cases from ${corpus.suitesUsed} suites, ` +
      `${corpus.filesLoaded} files loaded, ${corpus.failures.length} failed`,
    `  uncovered (${uncovered.length}), each with its reason:`,
    ...uncovered.map(
      (rule) =>
        `    ${rule}: ${explanation.get(rule)} [${detail.get(rule) || ''}]`,
    ),
    `  pair cap ${MAX_PAIRS_PER_RULE}/rule dropped ${capped} of ${harvested} ` +
      `harvested cases, in ${coverage.cappedTail.length} rule(s) [dropped]: ${
        coverage.cappedTail.join(', ') || 'none'
      }`,
    `  suggestion pair cap dropped ${cappedSuggestions} case(s), in ${
      coverage.suggestionCappedTail.length
    } rule(s) [dropped]: ${coverage.suggestionCappedTail.join(', ') || 'none'}`,
    `  ${sharedScopeDropped} case(s) dropped for declaring into the shared scope`,
    `  ${nonTypeScriptDropped} case(s) dropped for not being TypeScript`,
    `  ${
      pairs.length - assertedPairs.length
    } pair(s) held out for an input that does not type-check under ANY mode, in ${
      heldOutByRule.length
    } covered rule(s) [held/total]: ${heldOutByRule.join(', ') || 'none'}`,
    // Per mode, so the cost of running both is visible rather than asserted.
    // A mode that stopped contributing baselines would show up here as a
    // collapsed count long before it showed up as a missing finding.
    ...MODES.map((mode) => {
      const held = pairs.filter(
        (pair) => !baselineCompilesIn(pair, mode.key),
      ).length;
      return `    mode ${mode.key} (strict: ${mode.strict}): ${
        pairs.length - held
      } of ${pairs.length} fix pairs have a compiling input`;
    }),
    `  suggestion channel: asserted ${assertedSuggestionPairs.length} of ${suggestionPairs.length} pairs across ${assertedSuggestionRules.size} of ${suggestionRules.length} suggestion-emitting rules`,
    ...Object.entries(observedUncoveredSuggestions).map(
      ([rule, reason]) =>
        `    ${rule}: ${reason} [${detail.get(`suggestion:${rule}`) || ''}]`,
    ),
  ].join('\n'),
);

describe('an autofix must not turn compiling code into non-compiling code', () => {
  /**
   * Non-vacuity. Planted defects go through the same harvest, the same two
   * programs and the same diff as every rule below, so a broken harness cannot
   * degrade the assertions into a clean sweep.
   */
  it.each(CONTROLS.map((c) => [c.name, c.expectFlagged] as const))(
    'control %s is flagged: %s',
    (name, expectFlagged) => {
      const outcome = controlOutcomes.find((o) => o.name === name)!;
      expect(outcome.fired).toBe(true);
      // A control whose own input stopped type-checking would be held out by
      // the baseline gate and prove nothing about the gate's other side.
      expect(outcome.baselineCompiles).toBe(true);
      expect(outcome.flagged).toBe(expectFlagged);
    },
  );

  /**
   * Coverage floor. The per-rule assertions pass trivially if harvesting or
   * fixing breaks, so the corpus size is asserted rather than assumed.
   */
  it('compiles a meaningful share of the fixable rules', () => {
    expect(fixableRules.length).toBeGreaterThan(70); // measured 84
    // Exact, not a floor: every rule below the count is named in
    // UNCOVERED_FIXERS, so slack here would only re-open the hole it closes.
    expect(coverage.covered.length).toBe(
      fixableRules.length - Object.keys(UNCOVERED_FIXERS).length,
    );
    expect(assertedPairs.length).toBeGreaterThanOrEqual(3800); // measured 4,257
    expect(corpus.failures).toEqual([]);
    // The cap's DENOMINATOR. Without it the ceilings below read as healthy on a
    // corpus that collapsed to nothing. 14,004 when measured.
    expect(harvested).toBeGreaterThanOrEqual(13000); // measured 14,124
  });

  /**
   * The three discard channels, asserted rather than merely printed into the
   * diagnostic above (#2225). Each silently removes cases from the corpus this
   * guard exists to drive, and a number interpolated into a console line is not
   * a gate — if it moves, the build stays green.
   *
   * `capped` is the one that is corpus-growth-SENSITIVE, which is why it gets a
   * named rule list and not just a ceiling. `MAX_PAIRS_PER_RULE` is a deliberate
   * performance trade-off, so its cost is allowed — but the harvest grows, and
   * as it does the cap eats an increasing share of every hot rule. That is the
   * shape of a drifted floor with no floor at all: pinning the RULES that hit
   * the cap makes a fifth one a conscious edit rather than a silent loss.
   */
  it('accounts for every case it discards before compiling', () => {
    // 387 of 14,004 harvested, in exactly these four rules
    // (enforce-assert-safe-object-key 223, no-explicit-return-type 153,
    // enforce-memoize-async 6, parallelize-async-operations 5). The COUNTS are
    // left out of the pin because they move with every fixture added to a
    // capped rule; the membership is what carries the meaning.
    expect(
      coverage.cappedTail.map((entry) => entry.split(' ')[0]).sort(),
    ).toEqual([
      'enforce-assert-safe-object-key',
      'enforce-memoize-async',
      'no-explicit-return-type',
      'parallelize-async-operations',
    ]);
    // A ceiling just above the measurement, per the floor-drift discipline in
    // reverse: a rise is a conscious edit, not something to discover later.
    expect(capped).toBeLessThanOrEqual(450);
    // ...and a floor, so a cap that stopped applying at all — which would make
    // the rule list above stale rather than green — cannot pass quietly.
    expect(capped).toBeGreaterThan(0);

    // 23 when measured: fixtures that declare into the shared scope, which the
    // single-program harness cannot compile side by side.
    expect(sharedScopeDropped).toBeLessThanOrEqual(40);

    // Pinned to the corpus property it should equal rather than to a ceiling:
    // every non-TypeScript case among the fixable rules is dropped and no
    // TypeScript one is. Dropping the non-TS testers wholesale is what hid
    // #1860 — two rules shipping `recommended: 'error'` with a fixer, with zero
    // fixtures, while every harvest-based guard iterated over them and passed.
    const nonTypeScriptAvailable = fixableRules.reduce(
      (count, rule) => count + casesFor(rule).nonTypeScript,
      0,
    );
    expect(nonTypeScriptDropped).toBe(nonTypeScriptAvailable);
    // 108 when measured. Floors the equality so it cannot be satisfied by a
    // corpus that stopped carrying non-TypeScript fixtures at all.
    expect(nonTypeScriptDropped).toBeGreaterThanOrEqual(100); // measured 108
  });

  /**
   * "Uncovered" must never be a silent bucket (#1527). Every fixable rule lands
   * in exactly one bucket, every rule outside `covered` carries a reason, and
   * the reason it carries is the one recorded for it — so a rule the harness
   * drops can never again read as a rule with no fixable trigger, and an
   * exemption cannot outlive the fact that justified it (#1732).
   */
  it('accounts for every fixable rule, uncovered ones by reason', () => {
    expect([...coverage.covered, ...uncovered].sort()).toEqual(fixableRules);
    expect(observedUncovered).toEqual(UNCOVERED_FIXERS);
  });

  /**
   * A baselined defect must stay exactly as large as it was recorded, and a
   * baseline that stops reproducing must be deleted — either half left
   * unenforced would let the entry absorb the next regression silently.
   */
  it('reproduces every baselined type-unsafe fix, and no more of it', () => {
    expect(Object.fromEntries(baselinedCounts)).toEqual(
      Object.fromEntries(
        Object.entries(TYPE_UNSAFE_BASELINE).map(([key, { pairs }]) => [
          key,
          pairs,
        ]),
      ),
    );
  });

  it.each(fixableRules)('%s', (rule) => {
    const findings = findingsByRule
      .get(rule)!
      .filter((finding) => !(findingKey(finding) in TYPE_UNSAFE_BASELINE));
    const problems: string[] = [];
    // Without this, a rule that stopped contributing a pair asserts nothing.
    if (!assertedByRule.has(rule) && !(rule in UNCOVERED_FIXERS)) {
      problems.push(
        `no fix of this rule was type-checked (${explanation.get(rule)}). ` +
          `Restore a triggering fixture, or add the rule to UNCOVERED_FIXERS ` +
          `with that reason.`,
      );
    }
    // A finding means the fix must decline instead; see #1521, #1522, #1523.
    if (findings.length) {
      problems.push(findings.map((f) => report(f)).join('\n\n'));
    }
    expect(problems.join('\n\n')).toBe('');
  });
});

describe('a suggestion must not turn compiling code into non-compiling code', () => {
  /**
   * Non-vacuity, per rule. A suggestion the harness never applies compiles
   * nothing, and a corpus total would let one prolific rule hold the floor up
   * while another stopped emitting entirely. `control-suggestion-type-break`
   * above proves the same pipeline flags a planted defect on this channel.
   */
  it('compiles at least one suggestion from every suggestion-emitting rule', () => {
    expect(suggestionRules.length).toBeGreaterThanOrEqual(7); // measured 7
    expect(
      Object.fromEntries(
        suggestionRules.map((rule) => [
          rule,
          suggestionPairs.some((pair) => pair.rule === rule),
        ]),
      ),
    ).toEqual(Object.fromEntries(suggestionRules.map((rule) => [rule, true])));
    expect(assertedSuggestionPairs.length).toBeGreaterThanOrEqual(270); // measured 297

    // The suggestion channel applies the same MAX_PAIRS_PER_RULE as the fix
    // channel, but counted its discards nowhere at all — not even in the
    // diagnostic, which put it a tier below the printed-but-unasserted counters
    // #2225 set out to fix. Measured at ZERO: no suggestion-emitting rule comes
    // within reach of the cap, where the fix channel is capped in FOUR rules.
    // So this is a regression detector, vacuous by design — it catches the
    // first rule that does reach it, rather than describing a standing discard.
    expect(cappedSuggestions).toBe(0);
    expect(coverage.suggestionCappedTail).toEqual([]);
  });

  /**
   * A rule with no ASSERTED pair is not a failure — every one of its inputs may
   * be ill-typed to begin with — but it must never be a silent bucket, for the
   * same reason #1527 gave on the fix channel, and the reason it carries has to
   * be the one recorded for it or the exemption outlives its justification.
   */
  it('accounts for every suggestion-emitting rule, unasserted ones by reason', () => {
    expect(observedUncoveredSuggestions).toEqual(UNCOVERED_SUGGESTIONS);
  });

  it.each(suggestionRules)('%s', (rule) => {
    const findings = suggestionFindingsByRule.get(rule)!;
    const problems: string[] = [];
    // Without this, a rule whose suggestions stopped compiling asserts nothing.
    if (
      !assertedSuggestionRules.has(rule) &&
      !(rule in UNCOVERED_SUGGESTIONS)
    ) {
      problems.push(
        `no suggestion of this rule was type-checked ` +
          `(${suggestionExplanation.get(rule)}). Restore a triggering ` +
          `fixture, or add the rule to UNCOVERED_SUGGESTIONS with that reason.`,
      );
    }
    // A finding means the suggestion must decline instead; see #1521.
    if (findings.length) {
      problems.push(
        findings.map((f) => report(f, 'after the suggestion')).join('\n\n'),
      );
    }
    expect(problems.join('\n\n')).toBe('');
  });
});

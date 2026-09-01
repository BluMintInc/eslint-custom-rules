/**
 * The COMPOSED `--fix` must not turn compiling code into non-compiling code.
 *
 * Three guards already type-check a `--fix` output, and all three are SOLO by
 * design. `fixer-type-safety` pairs a rule's fixer with that rule's own
 * fixtures; `cross-fixture-fixer-type-safety` pairs it with EVERY rule's
 * fixtures; `cross-suggestion-type-safety` does the same for suggestions. Each
 * runs one rule at a time on purpose — "a diagnostic has to be attributable to
 * it" — which is right for attribution and leaves the rule-PAIR interaction
 * unchecked in every one of them.
 *
 * Nothing else covered it either. Censused before this file existed:
 * `composed-fix-core-violation-closure` composes the whole config but relints
 * with five CORE eslint rules; `fix-fixpoint-closure` composes and asks only
 * whether the fix loop converged; `fix-closure-core-rules` runs three
 * hand-written fixtures; `recommended-config-fix-closure` drops every non-plugin
 * message before counting; the comment/as-const/exemption closures ask their own
 * questions. None of them imports `typescript`.
 *
 * METHOD, per harvested TypeScript fixture:
 *
 *   1. `--fix` with the FULL recommended config, exactly as
 *      `composed-fix-core-violation-closure` builds it (shipped severities,
 *      `off` skipped, the owner's own OPTIONS) — the shared
 *      `composedRulesFor` in `src/utils/composedFixConfig.ts`.
 *   2. Compile the input and the composed output with
 *      `src/utils/fixtureTypeProgram.ts`: the same stubs, the same two
 *      strictness modes, the same multiset differential and the same
 *      mode-intersection discount the solo guards run.
 *   3. A FINDING is a diagnostic the composed output carries that its input did
 *      not, in EVERY mode whose input compiles.
 *   4. Attribute it by greedy ablation over the composed config in CONFIG
 *      ORDER, and drop it if any single rule reproduces its diagnostic codes
 *      alone — that one belongs to the solo guards' baselines, not here.
 *
 * SCOPE — what this does NOT see:
 *
 *   - The corpus is fragments, so the differential is the only usable framing
 *     and its artifact filter (a fix that merely re-mentions an
 *     already-unresolvable name) costs real detection. Both are documented on
 *     `introducedDiagnostics`.
 *   - Cross-FILE type resolution is absent under a bare `Linter`, so a rule
 *     whose fix depends on an imported symbol's real type composes here against
 *     the stub's shape or the wildcard's `any`. That changes an answer rather
 *     than withholding one.
 *   - `--fix` never applies a SUGGESTION, so a suggestion-only transform is
 *     outside this sweep (#1733); `cross-suggestion-type-safety` owns those,
 *     solo.
 *   - JSON and Markdown fixtures are excluded: `tsc` has nothing to say about a
 *     `package.json` body or a `.md` file.
 *   - Attribution names a MINIMAL culprit set, not the only one, and a rule that
 *     reports only on an intermediate pass state falls out of the candidate set;
 *     the ablation then falls back to the whole config, so the finding still
 *     stands but its naming is coarser.
 *   - A HOLE this file opens and does not close: the programs run with
 *     `noUnusedLocals`/`noUnusedParameters` (#2234) and the solo guards read the
 *     same differential with that channel REMOVED, because over a fragment
 *     corpus a rename or a destructuring expansion looks to a solo oracle like a
 *     newly stranded binding. So a SOLO fix that really does strand a binding is
 *     seen by nobody, and the solo-explained partition is where it hides: being
 *     reproducible alone explains a finding's ATTRIBUTION, it is not a verdict
 *     that the diagnostic is acceptable.
 *
 *     Three of that pile have been adjudicated rather than merely filtered.
 *     `use-custom-memo` (28, splitting one all-unused import into two) and
 *     `no-class-instance-destructuring` (11, one TS6198 becoming N TS6133s) are
 *     collapse/expansion artifacts: the diagnostic changes shape rather than
 *     appearing. `no-entire-object-hook-deps` (21 findings over 13 distinct
 *     fixture shapes) was NOT — it removed the last use of a destructured prop
 *     and stranded it — and that one was a real defect, fixed under #2236 by
 *     declining the rewrite. Its exemption had been keyed on `noUnusedLocals`,
 *     which does not cover a parameter; `noUnusedParameters` does, and the
 *     consumer sets it. That took the sweep from 85 findings to 65 and left
 *     that rule with ONE, which is the control fixture the fix planted to keep
 *     its remaining residue — the positional parameter, still exempt — visible
 *     here rather than merely asserted in the rule.
 *
 *     The rest of the pile is still unadjudicated, and a solo oracle for this
 *     channel still needs its own discount and its own issue.
 */
import fs from 'fs';
import path from 'path';
import { Linter } from 'eslint';
import {
  FixtureBucket,
  FixtureCase,
  defaultFilenameFor,
  defineCorpusParsers,
  harvestFixtureCorpus,
  parserKeyFor,
  parserOptionsFor,
  ruleNameByIdentity,
  silentWithoutProgramRuleNames,
} from '../utils/fixtureCorpus';
import {
  DECLARES_INTO_SHARED_SCOPE,
  DiagnosticsFn,
  MODES,
  ModeKey,
  compileCorpus,
  intersectDiagnostics,
  introducedDiagnostics,
  isFragmentArtifact,
  withSuffix,
} from '../utils/fixtureTypeProgram';
import {
  PLUGIN_PREFIX as PREFIX,
  composedRulesFor as composedRulesWith,
  recommendedRulesExcluding,
  subsetInConfigOrder,
} from '../utils/composedFixConfig';

const VIRTUAL_DIR = '/virtual-composed-fixer-corpus';

/**
 * EMPTY, and kept as the place an exclusion must be written.
 *
 * An entry here is one NAME, never all 16 rules mentioning `getParserServices`
 * — discounting one measured divergence never justified unprobing fifteen
 * others (#1879) — and never belongs in `silentWithoutProgramRuleNames`, which
 * means "reports nothing here", nor at rule-global scope, which un-gates every
 * other arm at once (#1839).
 */
const DIVERGENT_WITHOUT_PROGRAM = new Set([]);

const EXCLUDED = new Set([
  ...silentWithoutProgramRuleNames,
  ...DIVERGENT_WITHOUT_PROGRAM,
]);

const linter = new Linter();
defineCorpusParsers(linter);
for (const [rule, name] of ruleNameByIdentity) {
  linter.defineRule(`${PREFIX}${name}`, rule as never);
}

const RECOMMENDED = recommendedRulesExcluding(EXCLUDED);
const composedRulesFor = (owner: string, testCase: FixtureCase) =>
  composedRulesWith(RECOMMENDED, EXCLUDED, owner, testCase);

const BUCKETS = new Set<FixtureBucket>(['valid', 'output', 'invalid']);

/**
 * Fixtures carry bare `eslint-disable-next-line rule-name` comments, because
 * `RuleTester` registers the rule under its bare name. Under a `Linter` the
 * rules are registered PREFIXED, so an unprefixed directive silences nothing —
 * and a fixture written to suppress a rule would instead be fixed by it.
 *
 * Longest name first, so a shorter rule name that prefixes a longer one cannot
 * rewrite half of it.
 */
const BARE_RULE_NAMES = [...ruleNameByIdentity.values()].sort(
  (a, b) => b.length - a.length,
);
const DIRECTIVE =
  /(eslint-disable(?:-next-line|-line)?|eslint-enable)([^\n*]*)/g;
const prefixDirectives = (code: string) =>
  code.replace(DIRECTIVE, (_whole, keyword: string, tail: string) => {
    let rewritten = tail;
    for (const name of BARE_RULE_NAMES) {
      rewritten = rewritten.replace(
        new RegExp(`(^|[\\s,])${name}(?![\\w/-])`, 'g'),
        `$1${PREFIX}${name}`,
      );
    }
    return `${keyword}${rewritten}`;
  });

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Planted defects, driven through the exact pipeline the corpus goes through:
 * the same `verifyAndFix`, the same two programs, the same differential, the
 * same mode discount and the same solo filter. A green sweep over the real
 * rules means nothing unless known-broken compositions still come out red.
 *
 * Registered under a `control/` id, which is neither the plugin PREFIX nor in
 * the recommended config, so no corpus fixture can reach one and no control can
 * inflate a corpus counter.
 *
 * `expectSoloFlagged` is what pins the SOLO FILTER's polarity, and it is the
 * reason this array is not a copy of `cross-fixture-fixer-type-safety`'s: a
 * composition whose damage one rule reproduces alone is that guard's finding,
 * and dropping it here is the whole reason this file can run beside it without
 * double-reporting. A filter that dropped everything would satisfy
 * `composition-only-redeclare` too, so both directions are named.
 */
const CONTROL_RULES: Record<string, Record<string, any>> = {};

const identifierRenamer = (from: string, to: string) => ({
  meta: {
    type: 'problem',
    fixable: 'code',
    schema: [],
    messages: { m: 'x' },
  },
  create(context: any) {
    return {
      Identifier(node: any) {
        if (node.name !== from) return;
        context.report({
          node,
          messageId: 'm',
          fix: (fixer: any) => fixer.replaceText(node, to),
        });
      },
    };
  },
});

CONTROL_RULES['control/rename-aa'] = identifierRenamer('aa', 'zz');
CONTROL_RULES['control/rename-ab'] = identifierRenamer('ab', 'zz');
CONTROL_RULES['control/rename-ab-safe'] = identifierRenamer('ab', 'yy');

CONTROL_RULES['control/rename-stale'] = identifierRenamer('stale', 'fresh');

/** Replaces the initialiser of `const <name> = shared;` with a literal. */
const referenceDropper = (name: string, literal: string) => ({
  meta: {
    type: 'problem',
    fixable: 'code',
    schema: [],
    messages: { m: 'x' },
  },
  create(context: any) {
    return {
      VariableDeclarator(node: any) {
        if (node.id?.name !== name) return;
        if (node.init?.type !== 'Identifier') return;
        if (node.init.name !== 'shared') return;
        context.report({
          node: node.init,
          messageId: 'm',
          fix: (fixer: any) => fixer.replaceText(node.init, literal),
        });
      },
    };
  },
});

CONTROL_RULES['control/drop-first-reference'] = referenceDropper('first', '1');
CONTROL_RULES['control/drop-second-reference'] = referenceDropper(
  'second',
  '2',
);

CONTROL_RULES['control/retype-literal'] = {
  meta: { type: 'problem', fixable: 'code', schema: [], messages: { m: 'x' } },
  create(context: any) {
    return {
      Literal(node: any) {
        if (node.value !== 'seed') return;
        context.report({
          node,
          messageId: 'm',
          fix: (fixer: any) => fixer.replaceText(node, '42'),
        });
      },
    };
  },
};

CONTROL_RULES['control/strict-only-break'] = {
  meta: { type: 'problem', fixable: 'code', schema: [], messages: { m: 'x' } },
  create(context: any) {
    return {
      ConditionalExpression(node: any) {
        context.report({
          node,
          messageId: 'm',
          fix: (fixer: any) => fixer.replaceText(node, 's.length'),
        });
      },
    };
  },
};

CONTROL_RULES['control/both-modes-break'] = {
  meta: { type: 'problem', fixable: 'code', schema: [], messages: { m: 'x' } },
  create(context: any) {
    return {
      ArrowFunctionExpression(node: any) {
        context.report({
          node,
          messageId: 'm',
          fix: (fixer: any) => fixer.replaceText(node.body, "'text'"),
        });
      },
    };
  },
};

CONTROL_RULES['control/unbound-reference'] = {
  meta: { type: 'problem', fixable: 'code', schema: [], messages: { m: 'x' } },
  create(context: any) {
    return {
      NewExpression(node: any) {
        if (node.callee.name !== 'Date') return;
        context.report({
          node,
          messageId: 'm',
          fix: (fixer: any) => fixer.replaceText(node, 'Timestamp.now()'),
        });
      },
    };
  },
};

CONTROL_RULES['control/duplicate-reference'] = {
  meta: { type: 'problem', fixable: 'code', schema: [], messages: { m: 'x' } },
  create(context: any) {
    return {
      UnaryExpression(node: any) {
        if (node.operator !== '!') return;
        if (node.argument.name !== 'ghost') return;
        context.report({
          node,
          messageId: 'm',
          fix: (fixer: any) =>
            fixer.replaceText(
              node,
              '(!ghost || Object.keys(ghost).length === 0)',
            ),
        });
      },
    };
  },
};

CONTROL_RULES['control/stub-beats-wildcard-firestore'] = {
  meta: { type: 'problem', fixable: 'code', schema: [], messages: { m: 'x' } },
  create(context: any) {
    return {
      MemberExpression(node: any) {
        if (node.property.name !== 'toMillis') return;
        context.report({
          node: node.property,
          messageId: 'm',
          fix: (fixer: any) =>
            fixer.replaceText(node.property, 'toLocaleDateString'),
        });
      },
    };
  },
};

CONTROL_RULES['control/stub-beats-wildcard-assertsafe'] = {
  meta: { type: 'problem', fixable: 'code', schema: [], messages: { m: 'x' } },
  create(context: any) {
    return {
      CallExpression(node: any) {
        if (node.callee.name !== 'assertSafe') return;
        const [argument] = node.arguments;
        // Only an identifier argument, so the rewritten call cannot re-fire.
        if (!argument || argument.type !== 'Identifier') return;
        context.report({
          node: argument,
          messageId: 'm',
          fix: (fixer: any) =>
            fixer.replaceText(argument, `{ ${argument.name} }`),
        });
      },
    };
  },
};

CONTROL_RULES['control/stub-beats-wildcard-react'] = {
  meta: { type: 'problem', fixable: 'code', schema: [], messages: { m: 'x' } },
  create(context: any) {
    return {
      CallExpression(node: any) {
        if (node.callee.name !== 'useMemo') return;
        context.report({
          node,
          messageId: 'm',
          fix: (fixer: any) => fixer.replaceText(node.callee, 'useCallback'),
        });
      },
    };
  },
};

for (const [id, rule] of Object.entries(CONTROL_RULES)) {
  linter.defineRule(id, rule as never);
}

/* eslint-enable @typescript-eslint/no-explicit-any */

type Control = {
  name: string;
  code: string;
  /** The composed control config, in the order a consumer would run it. */
  ids: string[];
  /** Under the intersection oracle plus the solo filter this guard ships. */
  expectReported: boolean;
  /** Under the intersection oracle alone, before the solo filter. */
  expectFlagged: boolean;
  /** Which baseline-clean modes see an introduced diagnostic at all. */
  expectModesFlagged: ModeKey[];
  /** Which of `ids` reproduce the composed diagnostic codes ALONE. */
  expectSoloFlagged: string[];
};

const CONTROLS: Control[] = [
  {
    /**
     * The shape this whole file exists for. Each rename alone leaves a
     * well-typed program; together they collapse two bindings onto one name,
     * which is TS2451 and which no single rule can produce.
     */
    name: 'composition-only-redeclare',
    code: [
      'const aa = 1;',
      "const ab = 'two';",
      'export const n: number = aa;',
      'export const s: string = ab;',
      '',
    ].join('\n'),
    ids: ['control/rename-aa', 'control/rename-ab'],
    expectReported: true,
    expectFlagged: true,
    expectModesFlagged: ['default', 'strict'],
    expectSoloFlagged: [],
  },
  {
    /**
     * The #1994 shape, in the channel `noUnusedLocals` opens: each fixer
     * removes a DIFFERENT reference to the same binding, each sees the other's
     * reference surviving its own edit, and only the composed pass strands it.
     * Solo, neither leaves an unused binding at all — so without the flags
     * (which no `ts.Program` guard in this repo set before #2234) this whole
     * class was invisible to every type oracle here.
     */
    name: 'composition-only-stranded-binding',
    code: [
      'const shared = 1;',
      'export const first = shared;',
      'export const second = shared;',
      '',
    ].join('\n'),
    ids: ['control/drop-first-reference', 'control/drop-second-reference'],
    expectReported: true,
    expectFlagged: true,
    expectModesFlagged: ['default', 'strict'],
    expectSoloFlagged: [],
  },
  {
    /**
     * The other side of the unused-declaration discount. Renaming a binding
     * that was ALREADY unused trades one TS6133 message for another, which a
     * message-keyed differential reads as introduced — 19 of
     * `fixer-type-safety`'s arms failed on exactly this before the count-based
     * discount landed. The count does not move, so this must stay silent.
     */
    name: 'unused-rename-strands-nothing',
    code: 'const stale = 1;\nexport const other = 2;\n',
    ids: ['control/rename-stale'],
    expectReported: false,
    expectFlagged: false,
    expectModesFlagged: [],
    expectSoloFlagged: [],
  },
  {
    // The same two fixers onto DISTINCT names. Both rewrite; nothing breaks.
    name: 'composition-harmless',
    code: [
      'const aa = 1;',
      "const ab = 'two';",
      'export const n: number = aa;',
      'export const s: string = ab;',
      '',
    ].join('\n'),
    ids: ['control/rename-aa', 'control/rename-ab-safe'],
    expectReported: false,
    expectFlagged: false,
    expectModesFlagged: [],
    expectSoloFlagged: [],
  },
  {
    /**
     * The solo filter's polarity. `retype-literal` breaks the file by itself,
     * so the composed finding is `fixer-type-safety`'s and must be dropped
     * here — while still being FLAGGED by the oracle, which is what separates
     * "filtered" from "never detected".
     */
    name: 'solo-explained-break',
    code: [
      "export const v: string = 'seed';",
      'const aa = 1;',
      'export const n: number = aa;',
      '',
    ].join('\n'),
    ids: ['control/retype-literal', 'control/rename-aa'],
    expectReported: false,
    expectFlagged: true,
    expectModesFlagged: ['default', 'strict'],
    expectSoloFlagged: ['control/retype-literal'],
  },
  {
    /**
     * The mode discount, kept from `cross-fixture-fixer-type-safety`: dropping
     * the null narrowing is a diagnostic under `strictNullChecks` and nothing
     * at all without it, while the input compiles under both. Widen the
     * discount back to a union and this control fails.
     */
    name: 'strict-only-break',
    code: 'export const len = (s: string | null) => (s === null ? 0 : s.length);\n',
    ids: ['control/strict-only-break'],
    expectReported: false,
    expectFlagged: false,
    expectModesFlagged: ['strict'],
    expectSoloFlagged: [],
  },
  {
    // The other half of the polarity: broken under both modes, so the
    // intersection keeps it. Without this, a discount that rejected every
    // finding would still satisfy the control above.
    name: 'both-modes-break',
    code: 'export const total = (n: number): number => n;\n',
    ids: ['control/both-modes-break'],
    expectReported: false,
    expectFlagged: true,
    expectModesFlagged: ['default', 'strict'],
    expectSoloFlagged: ['control/both-modes-break'],
  },
  {
    // The #1521 shape in a file that ALREADY has an unresolved name: the fix
    // emits `Timestamp.now()` with no `Timestamp` in scope. Must survive the
    // artifact filter inside `introducedDiagnostics`.
    name: 'unbound-reference',
    // `missing` is EXPORTED rather than local: the programs run with
    // `noUnusedLocals`, under which a stranded local is itself a diagnostic and
    // would make this control's own input fail the baseline-compiles gate.
    code: 'export const missing = ghost;\nexport const at = new Date();\n',
    ids: ['control/unbound-reference'],
    expectReported: false,
    expectFlagged: true,
    expectModesFlagged: ['default', 'strict'],
    expectSoloFlagged: ['control/unbound-reference'],
  },
  {
    // The artifact `introducedDiagnostics` exists to absorb: one more mention
    // of a name that was already unresolvable. Must NOT be flagged at all.
    name: 'duplicate-reference',
    code: 'export const flag = !ghost;\n',
    ids: ['control/duplicate-reference'],
    expectReported: false,
    expectFlagged: false,
    expectModesFlagged: [],
    expectSoloFlagged: [],
  },
  {
    /**
     * The stubs are a copy of shipped typings, and a copy rots. Both of these
     * are silent when the imported binding is `any` — which is all `declare
     * module '*'` gives — so each is flagged if and only if the specific
     * `declare module` really does win over the wildcard. Deleting or mistyping
     * a stub therefore fails a control here too, rather than quietly widening
     * this guard's blind spot along with the solo guards'.
     */
    name: 'stub-beats-wildcard-firestore',
    code:
      "import { Timestamp } from 'firebase-admin/firestore';\n" +
      'export const at = Timestamp.now().toMillis();\n',
    ids: ['control/stub-beats-wildcard-firestore'],
    expectReported: false,
    expectFlagged: true,
    expectModesFlagged: ['default', 'strict'],
    expectSoloFlagged: ['control/stub-beats-wildcard-firestore'],
  },
  {
    /**
     * The `assertSafe` stub, which is here because the wildcard did not merely
     * withhold detection across it — it MANUFACTURED a TS2538 in a composed
     * output (#2234). Substituting an object for the key is a type error under
     * the shipped identity signature and silent under the wildcard's `any`, so
     * this control fails the moment that stub is dropped or its specifier stops
     * matching what the fixer emits.
     */
    name: 'stub-beats-wildcard-assertsafe',
    code:
      "import { assertSafe } from 'functions/src/util/assertSafe';\n" +
      'const record: Record<string, number> = {};\n' +
      'export const read = (key: string) => record[assertSafe(key)];\n',
    ids: ['control/stub-beats-wildcard-assertsafe'],
    expectReported: false,
    expectFlagged: true,
    expectModesFlagged: ['default', 'strict'],
    expectSoloFlagged: ['control/stub-beats-wildcard-assertsafe'],
  },
  {
    // `useCallback` returns the callback where `useMemo` returns what it
    // produced, so this swap is a type error under React's real signatures and
    // invisible under the wildcard's `any`.
    name: 'stub-beats-wildcard-react',
    code:
      "import { useCallback, useMemo } from 'react';\n" +
      'export const useTotal = (): number => useMemo(() => 1, []);\n',
    ids: ['control/stub-beats-wildcard-react'],
    expectReported: false,
    expectFlagged: true,
    expectModesFlagged: ['default', 'strict'],
    expectSoloFlagged: ['control/stub-beats-wildcard-react'],
  },
];

const CONTROL_PARSING = {
  parser: 'ts',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
};

type Parsing = { parser: string; parserOptions: unknown };

/**
 * One program entry per distinct TEXT. The two sides of ~11k pairs are ~22k
 * texts but far fewer distinct ones — a fixture reached from two owners
 * contributes the same input twice, and an `output`-bucket case is frequently
 * some other pair's composed output — so keying the programs by pair side
 * re-compiles a large share of the corpus for nothing.
 *
 * `files` grows during ATTRIBUTION too, which is why the compiled prefix is
 * tracked rather than assumed: an ablation trial produces a text no sweep pass
 * has seen, and reading an uncompiled name would return an empty diagnostic
 * list — indistinguishable from "compiles clean".
 */
const nameByText = new Map<string, string>();
const files: Array<{ name: string; text: string }> = [];
const diagnosticsByMode = new Map<ModeKey, Map<string, string[]>>(
  MODES.map((mode) => [mode.key, new Map<string, string[]>()]),
);
let compiledPrefix = 0;
const TEXT_CHUNK = 2500;
let compileSeconds = 0;
let compilePasses = 0;

const nameForText = (text: string, isTsx: boolean) => {
  const key = `${isTsx ? 'tsx' : 'ts'} ${text}`;
  const known = nameByText.get(key);
  if (known) return known;
  const name = withSuffix(
    isTsx ? 'corpus.tsx' : 'corpus.ts',
    `-${files.length}`,
  );
  nameByText.set(key, name);
  files.push({ name, text });
  return name;
};

/**
 * Chunked so one program never holds the whole corpus. Every file is its own
 * module and the shared-scope declarers are excluded from the sweep, so a
 * file's diagnostics do not depend on which chunk it lands in.
 */
const compilePending = () => {
  if (compiledPrefix >= files.length) return;
  const started = Date.now();
  const pending = files.slice(compiledPrefix);
  compiledPrefix = files.length;
  compilePasses++;
  for (const mode of MODES) {
    const accumulated = diagnosticsByMode.get(mode.key)!;
    for (let index = 0; index < pending.length; index += TEXT_CHUNK) {
      const compiled = compileCorpus(
        pending.slice(index, index + TEXT_CHUNK),
        mode.strict,
        VIRTUAL_DIR,
      );
      for (const [name, diagnostics] of compiled) {
        accumulated.set(name, diagnostics);
      }
    }
  }
  compileSeconds += (Date.now() - started) / 1000;
};

const diagnosticsOf = (mode: ModeKey, name: string) =>
  diagnosticsByMode.get(mode)?.get(name) || [];

/**
 * The claim is that a fix does not turn COMPILING code into non-compiling code,
 * so a snippet that does not compile is no baseline. Unresolved names are the
 * deliberate exception — the corpus is fragments, excluding those would leave
 * almost nothing, and the artifact filter inside `introducedDiagnostics`
 * already handles them in the diff.
 */
const compilesIn = (beforeName: string, mode: ModeKey) =>
  diagnosticsOf(mode, beforeName).every(isFragmentArtifact);

const cleanModesFor = (beforeName: string) =>
  MODES.filter((mode) => compilesIn(beforeName, mode.key));

const introducedPerMode = (
  beforeName: string,
  afterName: string,
  diagnosticsFn: DiagnosticsFn,
) =>
  cleanModesFor(beforeName).map((mode) => ({
    mode: mode.key,
    added: diagnosticsFn(
      diagnosticsOf(mode.key, beforeName),
      diagnosticsOf(mode.key, afterName),
    ),
  }));

/** The shipped oracle: introduced in EVERY mode whose input could judge it. */
const introducedWith = (
  beforeName: string,
  afterName: string,
  diagnosticsFn: DiagnosticsFn,
) =>
  intersectDiagnostics(
    introducedPerMode(beforeName, afterName, diagnosticsFn).map(
      (entry) => entry.added,
    ),
  ).common;

const introducedFor = (beforeName: string, afterName: string) =>
  introducedWith(beforeName, afterName, introducedDiagnostics);

/** The rejected union oracle, computed only so a control can pin the difference. */
const introducedUnionFor = (beforeName: string, afterName: string) => [
  ...new Set(
    introducedPerMode(beforeName, afterName, introducedDiagnostics).flatMap(
      (entry) => entry.added,
    ),
  ),
];

const modesFlagging = (beforeName: string, afterName: string) =>
  introducedPerMode(beforeName, afterName, introducedDiagnostics)
    .filter((entry) => entry.added.length)
    .map((entry) => entry.mode);

const codesOf = (diagnostics: string[]) =>
  new Set(
    diagnostics.map((diagnostic) =>
      diagnostic.slice(0, diagnostic.indexOf(':')),
    ),
  );

type Pair = {
  /** Every rule whose suite supplied a fixture this exact rewrite came out of. */
  owners: Set<string>;
  /** One witness, carried by reference so attribution re-fixes it as declared. */
  testCase: FixtureCase;
  witnessOwner: string;
  before: string;
  after: string;
  isTsx: boolean;
  origin: string;
  bucket: FixtureBucket;
  filename: string;
  beforeName: string;
  afterName: string;
};

const corpus = harvestFixtureCorpus();

/**
 * Every skip is counted and every counter is read by an `expect` below. A skip
 * counter nothing asserts discards cases in silence, which is exactly how 106
 * fatal parses went unnoticed in #1984.
 */
const stats = {
  considered: 0,
  nonTsSkipped: 0,
  sharedScopeSkipped: 0,
  skippedFatalInput: 0,
  skippedFatalOutput: 0,
  rewritten: 0,
  threw: [] as string[],
  owners: new Set<string>(),
  attributionFixes: 0,
};

const pairsByKey = new Map<string, Pair>();
const composeStarted = Date.now();

for (const [owner, cases] of corpus.byRule) {
  for (const testCase of cases) {
    if (!BUCKETS.has(testCase.bucket)) continue;
    if (testCase.language !== 'ts') {
      stats.nonTsSkipped++;
      continue;
    }
    /**
     * A snippet that declares into the SHARED scope retypes every other file in
     * the corpus, because one program compiles them all.
     */
    if (DECLARES_INTO_SHARED_SCOPE.test(testCase.code)) {
      stats.sharedScopeSkipped++;
      continue;
    }
    stats.considered++;

    const filename = defaultFilenameFor(testCase);
    const isTsx = filename.endsWith('.tsx');
    const source = prefixDirectives(testCase.code);
    const parsing = {
      parser: parserKeyFor(testCase),
      parserOptions: parserOptionsFor(testCase),
    };
    const config = {
      ...parsing,
      rules: composedRulesFor(owner, testCase),
    } as unknown as Linter.Config;

    try {
      const screened = linter.verify(source, config, filename);
      /**
       * A fatal parse produces no `ruleId`, so it is indistinguishable from
       * every rule staying silent — counted, then asserted, never dropped.
       */
      if (screened.some((message) => message.fatal)) {
        stats.skippedFatalInput++;
        continue;
      }
      stats.owners.add(owner);

      const fixed = linter.verifyAndFix(source, config, filename);
      if (
        !fixed ||
        typeof fixed.output !== 'string' ||
        fixed.output === source
      ) {
        continue;
      }
      const after = linter.verify(fixed.output, config, filename);
      if (after.some((message) => message.fatal)) {
        // A composed output that no longer parses is `fix-fixpoint-closure`'s
        // finding, not this one. Counted so it cannot read as silence here.
        stats.skippedFatalOutput++;
        continue;
      }
      stats.rewritten++;

      const key = JSON.stringify([isTsx, source, fixed.output]);
      const known = pairsByKey.get(key);
      if (known) {
        known.owners.add(owner);
        continue;
      }
      pairsByKey.set(key, {
        owners: new Set([owner]),
        testCase,
        witnessOwner: owner,
        before: source,
        after: fixed.output,
        isTsx,
        origin: testCase.origin,
        bucket: testCase.bucket,
        filename,
        beforeName: '',
        afterName: '',
      });
    } catch (error) {
      stats.threw.push(`${owner} ${testCase.origin}: ${String(error)}`);
    }
  }
}

const composeSeconds = (Date.now() - composeStarted) / 1000;
const corpusPairs = [...pairsByKey.values()];

for (const pair of corpusPairs) {
  pair.beforeName = nameForText(pair.before, pair.isTsx);
  pair.afterName = nameForText(pair.after, pair.isTsx);
}

/**
 * The control pairs join the SAME programs as the corpus, which is what keeps
 * proving that one unparseable or one shared-scope file cannot zero out
 * everybody else's diagnostics.
 */
const fixWith = (
  source: string,
  filename: string,
  parsing: Parsing,
  ids: string[],
  rules: Record<string, unknown>,
) => {
  const output = linter.verifyAndFix(
    source,
    {
      ...parsing,
      rules: Object.fromEntries(ids.map((id) => [id, rules[id] ?? 'error'])),
    } as unknown as Linter.Config,
    filename,
  );
  return output && typeof output.output === 'string' ? output.output : source;
};

type ControlOutcome = {
  name: string;
  fired: boolean;
  cleanModes: ModeKey[];
  flagged: boolean;
  unionFlagged: boolean;
  modesFlagged: ModeKey[];
  soloFlagged: string[];
  reported: boolean;
};

const controlOutcomes: ControlOutcome[] = [];
{
  const prepared = CONTROLS.map((control) => {
    const composed = fixWith(
      control.code,
      'control.ts',
      CONTROL_PARSING,
      control.ids,
      {},
    );
    const solos = control.ids.map((id) => ({
      id,
      output: fixWith(control.code, 'control.ts', CONTROL_PARSING, [id], {}),
    }));
    return {
      control,
      beforeName: nameForText(control.code, false),
      afterName: nameForText(composed, false),
      fired: composed !== control.code,
      solos: solos.map((solo) => ({
        id: solo.id,
        name: nameForText(solo.output, false),
      })),
    };
  });
  compilePending();
  for (const entry of prepared) {
    const added = introducedFor(entry.beforeName, entry.afterName);
    const wanted = codesOf(added);
    const soloFlagged = entry.solos
      .filter((solo) => {
        const soloAdded = introducedFor(entry.beforeName, solo.name);
        if (!soloAdded.length) return false;
        const soloCodes = codesOf(soloAdded);
        return [...wanted].every((code) => soloCodes.has(code));
      })
      .map((solo) => solo.id);
    controlOutcomes.push({
      name: entry.control.name,
      fired: entry.fired,
      cleanModes: cleanModesFor(entry.beforeName).map((mode) => mode.key),
      flagged: added.length > 0,
      unionFlagged:
        introducedUnionFor(entry.beforeName, entry.afterName).length > 0,
      modesFlagged: modesFlagging(entry.beforeName, entry.afterName),
      soloFlagged,
      reported: added.length > 0 && soloFlagged.length === 0,
    });
  }
}

compilePending();

const assertedPairs = corpusPairs.filter(
  (pair) => cleanModesFor(pair.beforeName).length > 0,
);

/**
 * What the mode discount SILENCED, counted rather than discarded.
 *
 * The intersection produces a clean by DROPPING, so a drop no `expect` reads is
 * a false clean nothing can see. `codeMatchedDrops` isolates the failure that
 * actually happened (#2235): the TS code was present under every mode with the
 * multiplicity to match and only the printed message diverged, so the
 * diagnostic was real under both and the oracle discarded it as strict-only.
 * A genuinely mode-specific diagnostic - the artifact class this discount
 * exists FOR - lands in `dropped` and not in `codeMatchedDrops`, which is why
 * the two counters are asserted in opposite directions.
 */
const intersectionAccounts = assertedPairs.map((pair) => ({
  pair,
  ...intersectDiagnostics(
    introducedPerMode(
      pair.beforeName,
      pair.afterName,
      introducedDiagnostics,
    ).map((entry) => entry.added),
  ),
}));
const discountDrops = intersectionAccounts.filter(
  (account) => account.dropped.length > 0,
);
const codeMatchedDrops = intersectionAccounts.filter(
  (account) => account.codeMatchedDrops.length > 0,
);

type Finding = {
  pair: Pair;
  added: string[];
  codes: string[];
  /** Filled by the attribution pass. */
  soloReproducers: string[];
  culprits: string[];
  candidatesSufficed: boolean;
  fullReproduces: boolean;
};

const findingsWith = (diagnosticsFn: DiagnosticsFn): Finding[] =>
  assertedPairs
    .map((pair) => ({
      pair,
      added: introducedWith(pair.beforeName, pair.afterName, diagnosticsFn),
    }))
    .filter((entry) => entry.added.length > 0)
    .map((entry) => ({
      ...entry,
      codes: [...codesOf(entry.added)].sort(),
      soloReproducers: [],
      culprits: [],
      candidatesSufficed: true,
      fullReproduces: false,
    }));

const findings = findingsWith(introducedDiagnostics);

/**
 * The mutation control. Every assertion below is a differential, so a harness
 * whose diff had degenerated would report zero and read exactly like a healthy
 * one. Blinding the oracle must take the findings to zero, and nothing else in
 * the pipeline may be able to produce one.
 */
const mutantFindings = findingsWith(() => []);

/**
 * ATTRIBUTION, findings only.
 *
 * "Nothing else composes here, so it must be the pair" is an inference, and
 * inferences are how a guard reports the wrong rule. Each finding is re-fixed
 * with every candidate rule ALONE — a rule that reproduces the finding's
 * diagnostic CODES by itself belongs to `fixer-type-safety` /
 * `cross-fixture-fixer-type-safety`, not here — and then the candidate set is
 * ablated greedily down to a minimal one that still reproduces.
 *
 * The predicate is on diagnostic CODES rather than on message text because a
 * subset config reaches the same defect through a different intermediate state:
 * the message quotes identifiers and types the other fixers would have
 * rewritten, so an exact-text predicate makes every ablation step fail and
 * names the whole config as the culprit.
 *
 * The candidate set is the rules reporting on the INPUT plus those reporting on
 * the composed OUTPUT — a superset of the rules that can have fixed anything at
 * either end, but not of those reporting only mid-loop. When the candidates fail
 * to reproduce, the ablation falls back to the whole composed config; the
 * finding is unaffected and only the naming is coarser.
 *
 * Every subset is built by FILTERING the composed config's own key order, never
 * by sorting: two rules whose fixes compete for the same range are resolved by
 * the order their messages arrive.
 */
const attribute = (finding: Finding): void => {
  const { pair } = finding;
  const composed = composedRulesFor(pair.witnessOwner, pair.testCase);
  const order = Object.keys(composed);
  const parsing = {
    parser: parserKeyFor(pair.testCase),
    parserOptions: parserOptionsFor(pair.testCase),
  };

  const outputFor = (ids: string[]) => {
    stats.attributionFixes++;
    return fixWith(pair.before, pair.filename, parsing, ids, composed);
  };

  const reproducesOutput = (output: string) => {
    if (output === pair.before) return false;
    const afterName = nameForText(output, pair.isTsx);
    compilePending();
    const added = introducedFor(pair.beforeName, afterName);
    if (!added.length) return false;
    const codes = codesOf(added);
    return finding.codes.every((code) => codes.has(code));
  };

  const reproduces = (ids: string[]) => reproducesOutput(outputFor(ids));

  const reportingIn = (code: string) =>
    linter
      .verify(
        code,
        { ...parsing, rules: composed } as unknown as Linter.Config,
        pair.filename,
      )
      .map((message) => message.ruleId)
      .filter((id): id is string => Boolean(id) && String(id) in composed);

  const candidates = subsetInConfigOrder(order, [
    ...reportingIn(pair.before),
    ...reportingIn(pair.after),
  ]);

  // Batched: every one of these outputs is independent, so registering them all
  // before compiling turns |candidates| + 2 programs into one pass.
  const fullOutput = outputFor(order);
  const candidateOutput = candidates.length ? outputFor(candidates) : null;
  const soloOutputs = candidates.map((id) => ({ id, output: outputFor([id]) }));
  nameForText(fullOutput, pair.isTsx);
  if (candidateOutput !== null) nameForText(candidateOutput, pair.isTsx);
  for (const solo of soloOutputs) nameForText(solo.output, pair.isTsx);
  compilePending();

  finding.fullReproduces = reproducesOutput(fullOutput);
  finding.soloReproducers = soloOutputs
    .filter((solo) => reproducesOutput(solo.output))
    .map((solo) => solo.id.slice(PREFIX.length));

  const sufficed =
    candidateOutput !== null && reproducesOutput(candidateOutput);
  finding.candidatesSufficed = sufficed;
  let current = sufficed ? candidates : order;
  for (const id of [...current]) {
    const trial = current.filter((entry) => entry !== id);
    if (trial.length && reproduces(trial)) current = trial;
  }
  // Sorted for the baseline KEY only; the probing above never sorts.
  finding.culprits = current.map((id) => id.slice(PREFIX.length)).sort();
};

/**
 * Findings are few by construction; if that ever stops being true the cap keeps
 * the run bounded and the assertion under it fails, rather than the sweep
 * quietly attributing a prefix of its own findings.
 */
const ATTRIBUTION_CAP = 250;
const attributionStarted = Date.now();
const attributed = findings.slice(0, ATTRIBUTION_CAP);
for (const finding of attributed) {
  try {
    attribute(finding);
  } catch (error) {
    stats.threw.push(`attribution ${finding.pair.origin}: ${String(error)}`);
  }
}
const attributionSeconds = (Date.now() - attributionStarted) / 1000;

/** A finding a single rule reproduces is the SOLO guards', not this one's. */
const composition = attributed.filter(
  (finding) => finding.soloReproducers.length === 0,
);
const soloExplained = attributed.filter(
  (finding) => finding.soloReproducers.length > 0,
);

const signatureOf = (finding: Finding) =>
  `${finding.culprits.join('+')} -> ${finding.codes.join('+')}`;

const bySignature = new Map<string, Finding[]>();
for (const finding of composition) {
  const list = bySignature.get(signatureOf(finding)) || [];
  list.push(finding);
  bySignature.set(signatureOf(finding), list);
}

/**
 * Compositions MEASURED to introduce a type error today, keyed
 * `culprits -> TS codes`, each with the issue that tracks it.
 *
 * AN ENTRY IS NOT A WAY TO MAKE A BUILD GREEN. Asserted EXACTLY, in both
 * directions: a new signature fails as a regression, and one that stops
 * reproducing fails as a fix nobody deleted the baseline for. Keyed on the
 * culprit SET rather than on a rule name, because a rule-keyed entry would
 * un-gate every other composition that rule takes part in (#1839).
 */
const COMPOSITION_BASELINE = new Map<string, string>([
  /**
   * The type-level shadow of #1994, and the same two culprit SETS
   * `composed-fix-core-violation-closure` already baselines against
   * `no-unused-vars`. Each fixer removes a DIFFERENT reference to the same
   * import, each sees the other's reference surviving its own edit, so neither
   * deletes the import and the composed pass strands it — `orphanedBindings`'
   * stated conservatism, which no rule can escape alone.
   *
   * Measured 7 pairs and 2 pairs respectively. The third #1994 signature
   * (`no-explicit-return-type+no-redundant-param-types`) does NOT reproduce
   * here: its rise is visible to `no-unused-vars` and not to `tsc`, which is
   * why both oracles are worth running.
   */
  [
    'no-empty-dependency-use-callbacks+no-redundant-usecallback-wrapper -> TS6133',
    '#1994',
  ],
  [
    'no-empty-dependency-use-callbacks+no-redundant-usecallback-wrapper+use-latest-callback -> TS6133',
    '#1994',
  ],
]);

const REGRESSIONS = [...bySignature.keys()]
  .filter((signature) => !COMPOSITION_BASELINE.has(signature))
  .sort();

const STALE = [...COMPOSITION_BASELINE.keys()]
  .filter((signature) => !bySignature.has(signature))
  .sort();

const snippet = (code: string) =>
  code.length > 600 ? `${code.slice(0, 600)}...` : code;

const describeFinding = (finding: Finding) =>
  [
    `  ${signatureOf(finding)}`,
    `    introduced: ${finding.added.join(' | ')}`,
    `    fixture: ${finding.pair.origin} [${finding.pair.bucket}, owned by ${[
      ...finding.pair.owners,
    ].join(', ')}, as ${finding.pair.filename}]`,
    `    solo reproducers: ${
      finding.soloReproducers.join(', ') || '(none)'
    }; candidates sufficed: ${finding.candidatesSufficed}`,
    '    --- input (compiles) ---',
    snippet(finding.pair.before).replace(/^/gm, '      '),
    '    --- after the composed --fix (does not) ---',
    snippet(finding.pair.after).replace(/^/gm, '      '),
  ].join('\n');

/**
 * The raw findings, for a reader who has to reproduce one by hand. Written
 * best-effort: a guard that fails because a scratch directory is missing is
 * reporting on the filesystem, not on the plugin.
 */
try {
  const dump = path.join(__dirname, '..', '..', '.claude', 'tmp');
  fs.mkdirSync(dump, { recursive: true });
  fs.writeFileSync(
    path.join(dump, 'composed-type-safety-findings.json'),
    JSON.stringify(
      {
        stats: {
          ...stats,
          owners: stats.owners.size,
          threw: stats.threw.length,
        },
        pairs: corpusPairs.length,
        asserted: assertedPairs.length,
        findings: attributed.map((finding) => ({
          added: finding.added,
          codes: finding.codes,
          culprits: finding.culprits,
          soloReproducers: finding.soloReproducers,
          candidatesSufficed: finding.candidatesSufficed,
          fullReproduces: finding.fullReproduces,
          owners: [...finding.pair.owners],
          origin: finding.pair.origin,
          bucket: finding.pair.bucket,
          filename: finding.pair.filename,
          input: finding.pair.before,
          composedOutput: finding.pair.after,
        })),
      },
      null,
      2,
    ),
  );
} catch {
  // A dump is a convenience; the assertions below are the guard.
}

/**
 * Floors sit JUST UNDER what this harness measures, so ordinary corpus churn
 * does not move them while a harness that lost most of the corpus does. The
 * floors that hid #1984 sat at 5,500 against an actual 8,141; measure first,
 * then floor, and move a floor only WITH its new measurement.
 */
const CORPUS_FILES_FLOOR = 275; // measured 282
const CORPUS_CASES_FLOOR = 23300; // measured 23926
const CONSIDERED_FLOOR = 23200; // measured 23785
const REWRITTEN_FLOOR = 11300; // measured 11772
const PAIR_FLOOR = 11200; // measured 11644
const ASSERTED_FLOOR = 10200; // measured 10590
const TEXT_FLOOR = 20800; // measured 21452
const OWNER_FLOOR = 188; // measured 192 (the 2 rules with only JSON/Markdown)
/**
 * The ablation's own work. Every culprit set the baseline is keyed on comes out
 * of these fix passes, so an attribution loop that stopped running would leave
 * the baseline matched by findings nobody located — the culprit names in each
 * entry would be whatever the previous run wrote there.
 */
const ATTRIBUTION_FIX_FLOOR = 480; // measured 543
/**
 * Ceilings, not floors: each is a case this guard does NOT judge, so a harness
 * regression shows up as a jump rather than a dip. Cut CLOSE deliberately — a
 * ceiling far above its measurement is the #1984 failure verbatim.
 */
const SHARED_SCOPE_CEILING = 45; // measured 33
/**
 * The mode discount's own non-vacuity: without it the same-code zero beside it
 * would be satisfied for free by a discount that had stopped discounting, and
 * that zero would then be measuring nothing. Floored just under the
 * measurement, like every other floor here.
 */
const DISCOUNT_DROP_FLOOR = 1; // measured 2

// eslint-disable-next-line no-console
console.log(
  [
    'composed --fix type safety: the whole recommended config over every fixture',
    `  corpus: ${corpus.totalCases} cases across ${corpus.byRule.size} rules from ${corpus.filesLoaded} suite files`,
    `  fixtures: ${stats.considered} considered, ${stats.nonTsSkipped} non-TypeScript, ${stats.sharedScopeSkipped} shared-scope declarers, ${stats.skippedFatalInput} fatal inputs, ${stats.skippedFatalOutput} fatal outputs, ${stats.threw.length} threw`,
    `  composed: ${stats.rewritten} fixtures rewritten across ${stats.owners.size} owners, ${corpusPairs.length} distinct pairs`,
    `  asserted (input compiles): ${assertedPairs.length} pairs`,
    ...MODES.map((mode) => {
      const clean = corpusPairs.filter((pair) =>
        compilesIn(pair.beforeName, mode.key),
      ).length;
      return `    mode ${mode.key} (strict: ${mode.strict}): ${clean} of ${corpusPairs.length} pairs have a compiling input`;
    }),
    `  programs: ${files.length} distinct texts, ${MODES.length} modes, ${compilePasses} passes, chunked at ${TEXT_CHUNK}`,
    `  findings: ${findings.length} (${composition.length} composition-only, ${
      soloExplained.length
    } solo-explained); the rejected union oracle would report ${
      assertedPairs.filter(
        (pair) => introducedUnionFor(pair.beforeName, pair.afterName).length,
      ).length
    }`,
    `  mode discount: ${discountDrops.length} pair(s) lost a diagnostic to the intersection, ${codeMatchedDrops.length} of them same-code (must be 0)`,
    `  signatures: ${[...bySignature.keys()].sort().join(' ; ') || '(none)'}`,
    `  attribution: ${stats.attributionFixes} fix passes over ${attributed.length} finding(s)`,
    `  timing: composing ${composeSeconds.toFixed(
      1,
    )}s, programs ${compileSeconds.toFixed(
      1,
    )}s, attribution ${attributionSeconds.toFixed(1)}s`,
  ].join('\n'),
);

describe('the composed --fix must not introduce a type error', () => {
  /**
   * Non-vacuity first. Planted compositions go through the same fix loop, the
   * same two programs, the same discount and the same solo filter as every
   * corpus pair, so a harness that had quietly broken cannot report a clean
   * sweep.
   */
  it.each(CONTROLS.map((control) => [control.name] as const))(
    'control %s behaves as planted',
    (name) => {
      const control = CONTROLS.find((entry) => entry.name === name)!;
      const outcome = controlOutcomes.find((entry) => entry.name === name)!;
      expect(outcome.fired).toBe(true);
      // Held out by the baseline gate, a control proves nothing about the
      // gate's other side.
      expect(outcome.cleanModes).toEqual(MODES.map((mode) => mode.key));
      expect({
        modesFlagged: outcome.modesFlagged,
        flagged: outcome.flagged,
        soloFlagged: outcome.soloFlagged,
        reported: outcome.reported,
      }).toEqual({
        modesFlagged: control.expectModesFlagged,
        flagged: control.expectFlagged,
        soloFlagged: control.expectSoloFlagged,
        reported: control.expectReported,
      });
    },
  );

  /**
   * The mode discount's polarity, stated as a difference rather than as two
   * unrelated outcomes: the union oracle and the shipped one must DISAGREE on
   * the strict-only control and AGREE on the both-modes one.
   */
  it('discounts a strict-only diagnostic and keeps a both-mode one', () => {
    const strictOnly = controlOutcomes.find(
      (outcome) => outcome.name === 'strict-only-break',
    )!;
    expect([strictOnly.unionFlagged, strictOnly.flagged]).toEqual([
      true,
      false,
    ]);
    const bothModes = controlOutcomes.find(
      (outcome) => outcome.name === 'both-modes-break',
    )!;
    expect([bothModes.unionFlagged, bothModes.flagged]).toEqual([true, true]);
  });

  /**
   * The solo filter, stated as a difference too. Without this the filter could
   * silently widen into "drop everything" and every other control would still
   * pass — the composition control would simply stop being reported and the
   * baseline would read as clean.
   */
  it('drops a solo-reproducible break and keeps a composition-only one', () => {
    const soloExplainedControl = controlOutcomes.find(
      (outcome) => outcome.name === 'solo-explained-break',
    )!;
    expect([
      soloExplainedControl.flagged,
      soloExplainedControl.reported,
    ]).toEqual([true, false]);
    const compositionOnly = controlOutcomes.find(
      (outcome) => outcome.name === 'composition-only-redeclare',
    )!;
    expect([compositionOnly.flagged, compositionOnly.reported]).toEqual([
      true,
      true,
    ]);
  });

  it('introduces no type error outside the tracked baseline', () => {
    if (REGRESSIONS.length) {
      throw new Error(
        [
          `${REGRESSIONS.length} composition(s) of the recommended config's`,
          '`--fix` introduce a TYPE error that no single rule introduces alone.',
          "Each is source damage `--fix` would write to a consumer's file, and",
          "it belongs to the PAIR, so no rule's own suite can see it.",
          '',
          ...REGRESSIONS.flatMap((signature) =>
            (bySignature.get(signature) || []).slice(0, 2).map(describeFinding),
          ),
        ].join('\n'),
      );
    }
    expect(REGRESSIONS).toEqual([]);
  });

  it('has no stale baseline entry', () => {
    expect(STALE).toEqual([]);
  });

  it('still measures every baselined composition as offending', () => {
    for (const signature of COMPOSITION_BASELINE.keys()) {
      expect((bySignature.get(signature) || []).length).toBeGreaterThan(0);
    }
  });

  /**
   * The oracle is the differential and nothing else. Blinded, the corpus must
   * produce no finding at all — otherwise some other part of the pipeline is
   * manufacturing them and the assertions above measure that instead.
   */
  it('produces findings only through the diagnostic differential', () => {
    expect(mutantFindings).toEqual([]);
  });

  it('attributed every finding it recorded', () => {
    // A cap that silently truncates would attribute a prefix and report the
    // rest as composition findings with an empty culprit set.
    expect(findings.length).toBeLessThanOrEqual(ATTRIBUTION_CAP);
    // The passes those attributions cost, floored and bounded below by the
    // findings themselves: `attribute` opens with one full-config reproduction
    // per finding, so fewer passes than findings means the loop skipped some.
    expect(stats.attributionFixes).toBeGreaterThanOrEqual(
      ATTRIBUTION_FIX_FLOOR,
    );
    expect(stats.attributionFixes).toBeGreaterThanOrEqual(attributed.length);
    expect(
      composition.filter((finding) => finding.culprits.length === 0),
    ).toEqual([]);
    /**
     * The ablation is only meaningful if its STARTING point reproduces. When it
     * does not, every removal fails, nothing shrinks, and the guard names every
     * enabled rule as a culprit.
     */
    expect(
      attributed
        .filter((finding) => !finding.fullReproduces)
        .map(
          (finding) => `${finding.codes.join('+')} <- ${finding.pair.origin}`,
        ),
    ).toEqual([]);
    // And the culprit set must be a real minimisation, not the whole config
    // wearing the word "culprit".
    expect(
      composition
        .filter((finding) => finding.culprits.length > 12)
        .map((finding) => `${finding.pair.origin}: ${finding.culprits.length}`),
    ).toEqual([]);
  });

  it('never let a probe throw instead of producing a verdict', () => {
    expect(stats.threw).toEqual([]);
    expect(corpus.failures).toEqual([]);
  });

  /**
   * The mode discount's drop channel, read rather than assumed. A drop is how
   * this oracle manufactures a clean, so the #2235 shape - same TS code under
   * every mode, different printed message - must FAIL here rather than quietly
   * subtract a finding. The floor beneath it keeps the counter honest the other
   * way: a discount that had stopped discounting anything would satisfy the
   * zero above on its own, and then the zero would be measuring nothing.
   */
  it('accounts for every diagnostic the mode discount dropped', () => {
    expect(
      codeMatchedDrops
        .map(
          (account) =>
            `${account.pair.witnessOwner}: ${account.codeMatchedDrops.join(
              ' | ',
            )}`,
        )
        .join('\n'),
    ).toBe('');
    expect(discountDrops.length).toBeGreaterThanOrEqual(DISCOUNT_DROP_FLOOR);
  });

  /**
   * Corpus reach. Every one of these would read as a healthy zero if the
   * harvest, the compose pass or the programs broke, so each is floored rather
   * than assumed.
   */
  it('actually composed and compiled the corpus it claims to', () => {
    expect(corpus.filesLoaded).toBeGreaterThanOrEqual(CORPUS_FILES_FLOOR);
    expect(corpus.totalCases).toBeGreaterThanOrEqual(CORPUS_CASES_FLOOR);
    expect(stats.considered).toBeGreaterThanOrEqual(CONSIDERED_FLOOR);
    expect(stats.rewritten).toBeGreaterThanOrEqual(REWRITTEN_FLOOR);
    expect(corpusPairs.length).toBeGreaterThanOrEqual(PAIR_FLOOR);
    expect(assertedPairs.length).toBeGreaterThanOrEqual(ASSERTED_FLOOR);
    expect(stats.owners.size).toBeGreaterThanOrEqual(OWNER_FLOOR);
    // Every distinct text really reached a program: an uncompiled name returns
    // an empty diagnostic list, which reads exactly like "compiles clean".
    expect(compiledPrefix).toBe(files.length);
    expect(files.length).toBeGreaterThanOrEqual(TEXT_FLOOR);
  });

  /**
   * The skip counters, read by real `expect`s. A fatal-parse counter nothing
   * asserts discards cases in silence (#1984): every consumer filters messages
   * by `ruleId`, so a fatal parse is indistinguishable from a silent rule.
   */
  it('accounts for every case it skipped', () => {
    // ZERO, not a threshold. Every TypeScript fixture parses under the parser,
    // filename and options its author declared, and every composed output still
    // parses — an output fatal is `fix-fixpoint-closure`'s finding, an input
    // fatal means the filename or parser plumbing regressed.
    expect({
      input: stats.skippedFatalInput,
      output: stats.skippedFatalOutput,
    }).toEqual({ input: 0, output: 0 });

    expect(stats.sharedScopeSkipped).toBeLessThanOrEqual(SHARED_SCOPE_CEILING);
    expect(stats.sharedScopeSkipped).toBeGreaterThan(0);

    /**
     * The non-TypeScript exclusion, closed rather than floored: it must equal
     * the corpus's own count of JSON and Markdown cases in the swept buckets,
     * so a TypeScript fixture cannot quietly join them.
     */
    let nonTs = 0;
    for (const cases of corpus.byRule.values()) {
      for (const testCase of cases) {
        if (!BUCKETS.has(testCase.bucket)) continue;
        if (testCase.language !== 'ts') nonTs++;
      }
    }
    expect(stats.nonTsSkipped).toBe(nonTs);
    expect(nonTs).toBeGreaterThan(0);
  });

  /**
   * The rule dimension, closed rather than floored (#1863). A floor is exactly
   * how much coverage can vanish before anyone hears, and because it is a
   * global sum the loss concentrates in whatever regressed.
   */
  it('composes over every rule with a usable TypeScript corpus', () => {
    const expected = new Set<string>();
    for (const [owner, cases] of corpus.byRule) {
      for (const testCase of cases) {
        if (!BUCKETS.has(testCase.bucket)) continue;
        if (testCase.language !== 'ts') continue;
        if (DECLARES_INTO_SHARED_SCOPE.test(testCase.code)) continue;
        expected.add(owner);
      }
    }
    expect([...stats.owners].sort()).toEqual([...expected].sort());
  });

  it('swept the buckets it claims to and no others', () => {
    const byBucket = new Map<FixtureBucket, number>();
    for (const cases of corpus.byRule.values()) {
      for (const testCase of cases) {
        if (testCase.language !== 'ts') continue;
        byBucket.set(testCase.bucket, (byBucket.get(testCase.bucket) || 0) + 1);
      }
    }
    const skipped = [...byBucket]
      .filter(([bucket]) => !BUCKETS.has(bucket))
      .map(([bucket, count]) => `${bucket}=${count}`)
      .sort();
    expect(skipped).toEqual([]);
    // An empty `skipped` is also what a bucket VANISHING from the harvest looks
    // like, so name each one and floor it.
    expect([...byBucket.keys()].sort()).toEqual(['invalid', 'output', 'valid']);
    expect(byBucket.get('valid')).toBeGreaterThan(5000);
    expect(byBucket.get('invalid')).toBeGreaterThan(5000);
    expect(byBucket.get('output')).toBeGreaterThan(1000);
    expect(stats.considered + stats.sharedScopeSkipped).toBe(
      [...byBucket.values()].reduce((total, count) => total + count, 0),
    );
  });
});

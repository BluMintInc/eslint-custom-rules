import { Linter } from 'eslint';
import {
  FixtureBucket,
  defaultFilenameFor,
  defineCorpusParsers,
  harvestFixtureCorpus,
  parserKeyFor,
  parserOptionsFor,
  ruleNameByIdentity,
  severityWithOptions,
  silentWithoutProgramRuleNames,
} from '../utils/fixtureCorpus';
import {
  DECLARES_INTO_SHARED_SCOPE,
  DiagnosticsFn,
  MODES,
  ModeKey,
  compileCorpus,
  intersectDiagnostics,
  introducedDiagnosticsIgnoringUnused,
  isFragmentArtifact,
  withSuffix,
} from '../utils/fixtureTypeProgram';
import {
  OptionCarriage,
  composedRulesFor,
  noteOptionCarriage,
} from '../utils/composedFixConfig';

// Using require to avoid test build-time ESM interop issues; the test runner
// only needs the plugin object shape (rules, recommended config), not types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as {
  rules: Record<string, { meta?: Record<string, unknown> }>;
  configs: { recommended: { rules: Record<string, unknown> } };
};

const PREFIX = '@blumintinc/blumint/';

/**
 * A rule's `--fix` output must not carry a type diagnostic its input lacked —
 * over the WHOLE harvested fixture corpus, not just that rule's own fixtures.
 *
 * `fixer-type-safety.test.ts` asserts the first half of that sentence and stops
 * at the comma: it pairs each rule's fixer with THAT RULE'S OWN fixtures, so a
 * fixer is only ever type-checked against inputs its author already had in
 * mind. Nothing in the build ever handed rule A's fixer a fixture written for
 * rule B — and a rule's own suite is by construction the shapes its author
 * anticipated, which is precisely where a type-safety defect is NOT.
 *
 * The blind spot is measured, not theoretical. Three real bugs lived in it:
 * #2013 (`global-const-style`), #2014 (`no-explicit-return-type`) and #2015
 * (`enforce-object-literal-as-const`), 75 pairs between them, and EVERY one of
 * those pairs had `owner != fixer`. `fixer-type-safety` was green through all
 * three.
 *
 * The pairing is therefore driven by what actually REPORTS on a fixture rather
 * than by who owns it: every fixture is screened once under the recommended
 * config, and each rule that reports gets its fixer run alone on that fixture.
 * A cross pair is the product, and the count of cross pairs asserted is the
 * headline non-vacuity number below — without it this guard silently
 * degenerates into a second copy of `fixer-type-safety`.
 */

/**
 * The stub/compile/diff machinery lives in `src/utils/fixtureTypeProgram.ts` —
 * read that module's doc comments for why each piece is load-bearing (which
 * modules earn a shape and why, why the wildcard stays, why the diff is a
 * multiset differential rather than an absolute count, why both strictness
 * modes run). This guard changes only which (fixer, fixture) pairs are built
 * and which introduced diagnostics survive the mode discount.
 */
const VIRTUAL_DIR = '/virtual-cross-fixer-corpus';

const linter = new Linter();
defineCorpusParsers(linter);
for (const [rule, name] of ruleNameByIdentity) {
  linter.defineRule(`${PREFIX}${name}`, rule as never);
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Planted defects, driven through the exact pipeline the corpus goes through:
 * the same `verifyAndFix`, the same two programs, the same diff, the same
 * discount. A green sweep over the real rules means nothing unless known-broken
 * transforms still come out red here.
 *
 * Registered on the linter under a `control/` id, which is neither the plugin
 * PREFIX nor in the recommended config, so no corpus fixture can reach one and
 * no control can inflate a corpus counter.
 *
 * `expectModesFlagged` is what pins the discount's POLARITY, and it is the
 * reason this array is not merely a copy of `fixer-type-safety`'s:
 *
 *   - `control-strict-only-break` introduces its diagnostic under `strict`
 *     ALONE while its input compiles under both, so the union oracle flags it
 *     and the intersection must not. Widen the discount back to a union and
 *     this control fails, instead of the corpus quietly regaining two artifact
 *     findings.
 *   - `control-both-modes-break` is its mirror: a fix broken under both modes
 *     must survive, so the discount cannot be "satisfied" by rejecting
 *     everything.
 */
const CONTROLS: Array<{
  name: string;
  code: string;
  /** Under the intersection oracle this guard ships. */
  expectFlagged: boolean;
  /** Which baseline-clean modes see an introduced diagnostic at all. */
  expectModesFlagged: ModeKey[];
  rule: Record<string, any>;
}> = [
  {
    name: 'control-type-break',
    // Retypes a string to a number: parses fine, fails tsc (TS2322).
    code: 'export const v: string = "hello";\n',
    expectFlagged: true,
    expectModesFlagged: ['default', 'strict'],
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
    // Sits in the same programs as the real corpus, so it keeps proving that
    // one unparseable file does not zero out everybody else's diagnostics.
    code: 'export const fn = (a: number) => { return a + 1; };\n',
    expectFlagged: true,
    expectModesFlagged: ['default', 'strict'],
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
    // artifact filter inside `introducedDiagnostics`.
    code: 'const missing = ghost;\nexport const at = new Date();\n',
    expectFlagged: true,
    expectModesFlagged: ['default', 'strict'],
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
    // The artifact `introducedDiagnostics` exists to absorb: one more mention
    // of a name that was already unresolvable. Must NOT be flagged.
    code: 'export const flag = !ghost;\n',
    expectFlagged: false,
    expectModesFlagged: [],
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
    name: 'control-strict-only-break',
    /**
     * The discount's polarity. Dropping the null narrowing is a diagnostic
     * under `strictNullChecks` and nothing at all without it, while the input
     * compiles under both - so this is the exact shape the mode intersection
     * exists to discount, and the exact shape a union oracle would report.
     */
    code: 'export const len = (s: string | null) => (s === null ? 0 : s.length);\n',
    expectFlagged: false,
    expectModesFlagged: ['strict'],
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
    name: 'control-both-modes-break',
    // The other half of the polarity: broken under both modes, so the
    // intersection keeps it. Without this, a discount that rejected every
    // finding would still satisfy every other control here.
    code: 'export const total = (n: number): number => n;\n',
    expectFlagged: true,
    expectModesFlagged: ['default', 'strict'],
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: any) {
        return {
          ArrowFunctionExpression(node: any) {
            context.report({
              node,
              messageId: 'm',
              fix: (f: any) => f.replaceText(node.body, "'text'"),
            });
          },
        };
      },
    },
  },
  {
    name: 'control-stub-beats-wildcard-firestore',
    /**
     * The stubs above are a verbatim copy, and a copy rots. Both of these are
     * silent when the imported binding is `any` - which is all `declare module
     * '*'` gives - so each is flagged if and only if the specific `declare
     * module` really does win over the wildcard. Deleting or mistyping a stub
     * therefore fails a control instead of quietly widening the blind spot.
     */
    code:
      "import { Timestamp } from 'firebase-admin/firestore';\n" +
      'export const at = Timestamp.now().toMillis();\n',
    expectFlagged: true,
    expectModesFlagged: ['default', 'strict'],
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
    expectModesFlagged: ['default', 'strict'],
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
];

for (const control of CONTROLS) {
  linter.defineRule(`control/${control.name}`, control.rule as never);
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * EMPTY, and kept as the place an exclusion must be written.
 *
 * Its one entry was `no-entire-object-hook-deps`, discounted because with no
 * program every dependency reads as `unknown`-typed, so the rule reports and
 * deletes deps a consumer's CI would leave alone (#1621). That rationale is
 * about which dependencies get REPORTED. What this guard asks is what the fixer
 * then WRITES, which is range arithmetic and entirely syntactic — so the
 * exclusion was broader than its own reason, and no oracle had ever been
 * pointed at the hole it left. Three defects came out of it once one was:
 * #2208, a removal span anchored on a neighbouring element that swallowed the
 * comment between them; #2209 and #2210, a removal that stranded its binding.
 *
 * Dropping the name is MEASURED, not asserted: with the rule composed here the
 * suite is green, and it is driven non-vacuously rather than merely admitted.
 * The #1621 divergence itself is untouched and still real; it simply never
 * showed up as the thing this guard asks about.
 *
 * An entry here is one NAME rather than all 16 rules mentioning
 * `getParserServices` — discounting one measured divergence never justified
 * unprobing fifteen others (#1879) — and never belongs in
 * `silentWithoutProgramRuleNames`, which means "reports nothing here", nor at
 * rule-global scope, which un-gates every other arm at once (#1839).
 */
const DIVERGENT_WITHOUT_PROGRAM = new Set([]);

const EXCLUDED = new Set<string>([
  ...silentWithoutProgramRuleNames,
  ...DIVERGENT_WITHOUT_PROGRAM,
]);

/**
 * The screening config: the shipped recommended set. Screening with it, rather
 * than enumerating every fixable rule against every fixture, is what makes the
 * corpus-wide pairing affordable - 190 rules against ~20k fixtures is millions
 * of fix passes, while "which rules report here" is one lint per fixture and a
 * handful of fixes.
 */
const RECOMMENDED: Record<string, unknown> = {};
for (const [id, severity] of Object.entries(plugin.configs.recommended.rules)) {
  if (!id.startsWith(PREFIX)) continue;
  if (severity === 'off' || severity === 0) continue;
  const name = id.slice(PREFIX.length);
  if (silentWithoutProgramRuleNames.has(name)) continue;
  if (DIVERGENT_WITHOUT_PROGRAM.has(name)) continue;
  RECOMMENDED[id] = severity;
}

/**
 * Fixtures carry bare `eslint-disable-next-line rule-name` comments, because
 * `RuleTester` registers the rule under its bare name. Under a `Linter` the
 * rules are registered PREFIXED, so an unprefixed directive silences nothing -
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

const isFixable = (name: string) =>
  Boolean(plugin.rules[name] && plugin.rules[name].meta?.fixable);

type Pair = {
  /** The rule whose fixer produced `after`. */
  fixer: string;
  /** Every rule that owns a fixture this exact rewrite came out of. */
  owners: Set<string>;
  before: string;
  after: string;
  isTsx: boolean;
  /** One witness's declaring suite and probed path, to reproduce by hand. */
  origin: string;
  bucket: FixtureBucket | 'control';
  filename: string;
  /** The synthetic program filename of each side; assigned once per TEXT. */
  beforeName: string;
  afterName: string;
};

/**
 * The pair this guard exists for: a rewrite reached through a fixture its
 * fixer's author never wrote. Classified on the whole owner SET, since one
 * rewrite can be reached from several rules' suites and collapsing it onto the
 * first witness would understate the reach.
 */
const isCross = (pair: Pair) =>
  [...pair.owners].some((owner) => owner !== pair.fixer);

const corpus = harvestFixtureCorpus();

/**
 * Every skip is counted and every counter is read by an `expect` below. A skip
 * counter nothing asserts discards cases in silence, which is exactly how 106
 * fatal parses went unnoticed in #1984.
 */
const stats = {
  fixturesConsidered: 0,
  nonTypeScriptDropped: 0,
  sharedScopeDropped: 0,
  inputFatalDropped: 0,
  threw: 0,
  soloFixAttempts: 0,
  rewrites: 0,
  crossRewrites: 0,
};

const carriage: OptionCarriage = { carried: 0, witness: null };

const pairsByKey = new Map<string, Pair>();
const pairingStarted = Date.now();

for (const [owner, cases] of corpus.byRule) {
  for (const testCase of cases) {
    /**
     * `tsc` has nothing to say about a `package.json` body or a `.md` file, so
     * a pair built from one could only manufacture noise.
     */
    if (testCase.language !== 'ts') {
      stats.nonTypeScriptDropped++;
      continue;
    }
    if (DECLARES_INTO_SHARED_SCOPE.test(testCase.code)) {
      stats.sharedScopeDropped++;
      continue;
    }
    stats.fixturesConsidered++;

    const filename = defaultFilenameFor(testCase);
    const isTsx = filename.endsWith('.tsx');
    const source = prefixDirectives(testCase.code);
    const parsing = {
      parser: parserKeyFor(testCase),
      parserOptions: parserOptionsFor(testCase),
    };

    try {
      /**
       * The owner's own entry carries the OPTIONS its author declared,
       * overriding the recommended severity that carries none. Without them an
       * option-gated fixer is unreachable and an option-gated report arrives
       * under a configuration nobody wrote (#1732, #2244).
       */
      const screenConfig = {
        ...parsing,
        rules: composedRulesFor(RECOMMENDED, EXCLUDED, owner, testCase),
      } as unknown as Linter.Config;
      const screened = linter.verify(source, screenConfig, filename);
      /**
       * A fatal parse produces no `ruleId`, so it is indistinguishable from
       * every rule staying silent - counted, then asserted, never dropped.
       */
      if (screened.some((message) => message.fatal)) {
        stats.inputFatalDropped++;
        continue;
      }
      const ownerId = `${PREFIX}${owner}`;
      /**
       * Read back out of the config that was LINTED, not out of a second call to
       * the builder: a screen rewritten to drop the owner's options would
       * otherwise leave this counter reading a configuration nobody ran.
       */
      noteOptionCarriage(
        carriage,
        screenConfig.rules as Record<string, unknown>,
        owner,
        testCase,
        screened.some((message) => message.ruleId === ownerId),
        () =>
          linter
            .verify(
              source,
              {
                ...parsing,
                rules: { [ownerId]: 'error' },
              } as unknown as Linter.Config,
              filename,
            )
            .some((message) => message.ruleId === ownerId),
      );

      const reporting = new Set(
        screened
          .map((message) => message.ruleId)
          .filter((id): id is string => id !== null && id.startsWith(PREFIX)),
      );

      for (const id of reporting) {
        const name = id.slice(PREFIX.length);
        if (DIVERGENT_WITHOUT_PROGRAM.has(name)) continue;
        if (!isFixable(name)) continue;
        stats.soloFixAttempts++;
        /**
         * SOLO, not composed: the claim under test is about ONE rule's fixer,
         * so a diagnostic has to be attributable to it. What two fixers do in
         * combination is a different question with a different oracle.
         */
        const fixed = linter.verifyAndFix(
          source,
          {
            ...parsing,
            rules: {
              [id]: name === owner ? severityWithOptions(testCase) : 'error',
            },
          } as unknown as Linter.Config,
          filename,
        );
        if (
          !fixed ||
          typeof fixed.output !== 'string' ||
          fixed.output === source
        ) {
          continue;
        }
        stats.rewrites++;
        if (name !== owner) stats.crossRewrites++;

        const key = JSON.stringify([isTsx, name, source, fixed.output]);
        const known = pairsByKey.get(key);
        if (known) {
          known.owners.add(owner);
          continue;
        }
        pairsByKey.set(key, {
          fixer: name,
          owners: new Set([owner]),
          before: source,
          after: fixed.output,
          isTsx,
          origin: testCase.origin,
          bucket: testCase.bucket,
          filename,
          beforeName: '',
          afterName: '',
        });
      }
    } catch {
      stats.threw++;
    }
  }
}

const pairingSeconds = (Date.now() - pairingStarted) / 1000;

const controlPairs: Pair[] = [];
for (const control of CONTROLS) {
  const id = `control/${control.name}`;
  let output = control.code;
  try {
    const fixed = linter.verifyAndFix(
      control.code,
      {
        parser: 'ts',
        parserOptions: {
          ecmaVersion: 2022,
          sourceType: 'module',
          ecmaFeatures: { jsx: true },
        },
        rules: { [id]: 'error' },
      } as unknown as Linter.Config,
      'control.ts',
    );
    if (fixed && typeof fixed.output === 'string') output = fixed.output;
  } catch {
    // A control whose transform never fires stays an identity pair and fails
    // its own `fired` assertion below rather than passing vacuously.
  }
  controlPairs.push({
    fixer: control.name,
    owners: new Set([control.name]),
    before: control.code,
    after: output,
    isTsx: false,
    origin: 'planted control',
    bucket: 'control',
    filename: 'control.ts',
    beforeName: '',
    afterName: '',
  });
}

const corpusPairs = [...pairsByKey.values()];
const allPairs = [...corpusPairs, ...controlPairs];

/**
 * One program entry per distinct TEXT, not per pair side.
 *
 * The two sides of ~12k pairs are ~25k texts but only ~20k distinct ones - a
 * fixture reached by two fixers contributes the same `before` twice, and an
 * `output`-bucket case is frequently some other pair's `after` - so keying the
 * programs by pair side re-compiles a fifth of the corpus for nothing.
 */
const nameByText = new Map<string, string>();
const files: Array<{ name: string; text: string }> = [];
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
for (const pair of allPairs) {
  pair.beforeName = nameForText(pair.before, pair.isTsx);
  pair.afterName = nameForText(pair.after, pair.isTsx);
}

/**
 * Chunked so one program never holds the whole corpus. Every file is its own
 * module and the shared-scope declarers are excluded above, so a file's
 * diagnostics do not depend on which chunk it lands in.
 */
const TEXT_CHUNK = 2500;
const compileStarted = Date.now();
const diagnosticsByMode = new Map<ModeKey, Map<string, string[]>>();
for (const mode of MODES) {
  const accumulated = new Map<string, string[]>();
  for (let index = 0; index < files.length; index += TEXT_CHUNK) {
    const compiled = compileCorpus(
      files.slice(index, index + TEXT_CHUNK),
      mode.strict,
      VIRTUAL_DIR,
    );
    for (const [name, diagnostics] of compiled) {
      accumulated.set(name, diagnostics);
    }
  }
  diagnosticsByMode.set(mode.key, accumulated);
}
const compileSeconds = (Date.now() - compileStarted) / 1000;

const diagnosticsOf = (mode: ModeKey, name: string) =>
  diagnosticsByMode.get(mode)?.get(name) || [];

/**
 * The claim is that a fix does not turn COMPILING code into non-compiling code,
 * so a snippet that does not compile is no baseline: against a broken input the
 * differential reports re-wordings rather than defects. Unresolved names are
 * the deliberate exception - the corpus is fragments, excluding those would
 * leave almost nothing, and the artifact filter inside `introducedDiagnostics`
 * already handles them in the diff.
 */
const baselineCompilesIn = (pair: Pair, mode: ModeKey) =>
  diagnosticsOf(mode, pair.beforeName).every(isFragmentArtifact);

const cleanModesFor = (pair: Pair) =>
  MODES.filter((mode) => baselineCompilesIn(pair, mode.key));

const introducedPerMode = (pair: Pair, diagnosticsFn: DiagnosticsFn) =>
  cleanModesFor(pair).map((mode) => ({
    mode: mode.key,
    added: diagnosticsFn(
      diagnosticsOf(mode.key, pair.beforeName),
      diagnosticsOf(mode.key, pair.afterName),
    ),
  }));

/** The shipped oracle: introduced in EVERY mode whose input could judge it. */
const introducedWith = (pair: Pair, diagnosticsFn: DiagnosticsFn) =>
  intersectDiagnostics(
    introducedPerMode(pair, diagnosticsFn).map((entry) => entry.added),
  ).common;

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
const introducedFor = (pair: Pair) =>
  introducedWith(pair, introducedDiagnosticsIgnoringUnused);

/** The rejected oracle, computed only so a control can pin the difference. */
const introducedUnionFor = (pair: Pair) => [
  ...new Set(
    introducedPerMode(pair, introducedDiagnosticsIgnoringUnused).flatMap(
      (entry) => entry.added,
    ),
  ),
];

const modesFlaggingFor = (pair: Pair) =>
  introducedPerMode(pair, introducedDiagnosticsIgnoringUnused)
    .filter((entry) => entry.added.length)
    .map((entry) => entry.mode);

const assertedPairs = corpusPairs.filter(
  (pair) => cleanModesFor(pair).length > 0,
);
const assertedCrossPairs = assertedPairs.filter(isCross);
const assertedFixers = [
  ...new Set(assertedPairs.map((pair) => pair.fixer)),
].sort();

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
    introducedPerMode(pair, introducedDiagnosticsIgnoringUnused).map(
      (entry) => entry.added,
    ),
  ),
}));
const discountDrops = intersectionAccounts.filter(
  (account) => account.dropped.length > 0,
);
const codeMatchedDrops = intersectionAccounts.filter(
  (account) => account.codeMatchedDrops.length > 0,
);

type Finding = { pair: Pair; added: string[] };

const findingsWith = (diagnosticsFn: DiagnosticsFn): Finding[] =>
  assertedPairs
    .map((pair) => ({ pair, added: introducedWith(pair, diagnosticsFn) }))
    .filter((finding) => finding.added.length > 0);

const findings = findingsWith(introducedDiagnosticsIgnoringUnused);

/**
 * The mutation control. Every assertion below is a differential, so a harness
 * whose diff had degenerated would report zero and read exactly like a healthy
 * one. Blinding the oracle must take the findings to zero, and nothing else in
 * the pipeline may be able to produce one.
 */
const mutantFindings = findingsWith(() => []);

/** `<fixer> <the TS codes it introduced>`, one key per defect shape. */
const findingKey = (finding: Finding) =>
  `${finding.pair.fixer} ${[
    ...new Set(
      finding.added.map((diagnostic) =>
        diagnostic.slice(0, diagnostic.indexOf(':')),
      ),
    ),
  ]
    .sort()
    .join('+')}`;

/**
 * Cross-fixture type-unsafe fixes the corpus reaches, keyed `<fixer> <TS code>`
 * with the number of pairs that reproduce each shape.
 *
 * AN ENTRY IS NOT A WAY TO MAKE A BUILD GREEN. It records a defect tracked
 * elsewhere, and the count is part of the key's meaning: a second pair reaching
 * the same shape is a new instance and fails here, exactly as an unlisted shape
 * does. A listed shape that STOPS reproducing fails too, so an entry cannot rot
 * into a shield for the next regression.
 *
 * Prefer fixing over listing. Each entry here is listed rather than fixed for
 * one reason only: a fix belongs in its own branch, since one rule per commit
 * is a hard repo invariant and each already carries an issue.
 */
const TYPE_UNSAFE_BASELINE: Record<string, { pairs: number; note: string }> = {
  'enforce-microdiff TS2345': {
    pairs: 4,
    note:
      '#2219, and the same 4 pairs `fixer-type-safety` baselines. The callee ' +
      'substitution is type-NARROWING: microdiff declares ' +
      '`TData extends Record<string, unknown> | unknown[]`, while the ' +
      'libraries it replaces accept `object`, so `diff(a: object, b: object)` ' +
      'is TS2345. Telling a satisfying operand from an unsatisfying one needs ' +
      'the checker, which is unavailable without parserOptions.project, so ' +
      'the remedy is a scope call on how much of the fix to withhold. ' +
      'Every pair is own-corpus rather than cross-rule: the fixer needs an ' +
      'import of a library it replaces, which only its own fixtures carry. ' +
      'Invisible here until #2235 - the mode discount compared whole message ' +
      'strings, and the union `Record<string, unknown> | unknown[]` printed ' +
      'in the opposite member order under the two modes, so a diagnostic ' +
      'present in BOTH was discarded as strict-only. Pinned at 4 so a fifth ' +
      'instance still fails.',
  },
};

const baselinedCounts = new Map<string, number>();
for (const finding of findings) {
  const key = findingKey(finding);
  if (!(key in TYPE_UNSAFE_BASELINE)) continue;
  baselinedCounts.set(key, (baselinedCounts.get(key) || 0) + 1);
}

const unbaselinedByFixer = new Map<string, Finding[]>();
for (const fixer of assertedFixers) unbaselinedByFixer.set(fixer, []);
for (const finding of findings) {
  if (findingKey(finding) in TYPE_UNSAFE_BASELINE) continue;
  unbaselinedByFixer.get(finding.pair.fixer)?.push(finding);
}

const controlOutcomes = controlPairs.map((pair) => ({
  name: pair.fixer,
  fired: pair.after !== pair.before,
  cleanModes: cleanModesFor(pair).map((mode) => mode.key),
  flagged: introducedFor(pair).length > 0,
  unionFlagged: introducedUnionFor(pair).length > 0,
  modesFlagged: modesFlaggingFor(pair),
}));

const report = (finding: Finding) =>
  [
    `introduced: ${finding.added.join(' | ')}`,
    `fixer: ${finding.pair.fixer}`,
    `reached from fixture(s) owned by: ${[...finding.pair.owners].join(', ')}`,
    `src/tests/${finding.pair.origin} (${finding.pair.bucket}) as ${finding.pair.filename}`,
    '--- input (compiles) ---',
    finding.pair.before,
    '--- after --fix (does not) ---',
    finding.pair.after,
  ].join('\n');

/**
 * Floors sit JUST UNDER what this harness measures, so ordinary corpus churn
 * does not move them while a harness that lost most of the corpus does. The
 * floors that hid #1984 sat at 5,500 against an actual 8,141; measure first,
 * then floor.
 *
 * The measurement each is cut from is recorded beside it, so a future change
 * can tell "the corpus grew" from "the harness started dropping work" without
 * re-deriving the whole run. Re-measure from the console block below after any
 * change to the pairing, and move a floor only WITH its measurement.
 */
const CORPUS_FILES_FLOOR = 274; // measured 282
const CORPUS_CASES_FLOOR = 23000; // measured 23932
const FIXTURES_CONSIDERED_FLOOR = 23000; // measured 23791
const SOLO_ATTEMPT_FLOOR = 41000; // measured 42193
const REWRITE_FLOOR = 15000; // measured 15319
/**
 * The cross-rule half of `REWRITE_FLOOR`. Floored separately because the total
 * can hold while the CROSS population collapses, and cross pairs are the whole
 * reason this file exists beside the own-corpus guard.
 */
const CROSS_REWRITE_FLOOR = 10000; // measured 10645
const ASSERTED_FLOOR = 13300; // measured 13770
const CROSS_GENERATED_FLOOR = 10200; // measured 10512
const CROSS_FLOOR = 9200; // measured 9524
const CROSS_FIXER_FLOOR = 52; // measured 58
const FIXER_FLOOR = 80; // measured 82
/**
 * Fixtures screened under an entry carrying their author's OPTIONS. One
 * recommended entry ships options, so at defaults this population is 1 rather
 * than the whole optioned corpus — the shape #2244 corrected.
 */
const OPTION_CARRIAGE_FLOOR = 750; // measured 783
/**
 * Ceilings, not floors: each is a case this guard does NOT judge, so a harness
 * regression shows up as a jump rather than a dip.
 *
 * These are cut CLOSE deliberately. A ceiling far above its measurement is the
 * #1984 failure verbatim: 106 fixtures became a fatal parse there and nothing
 * noticed, so a fatal-parse ceiling of 200 against a measured 0 would readmit
 * that exact defect while still reading as an assertion.
 */
/**
 * The non-TypeScript population, floored rather than capped. It is the whole
 * corpus of two registered, `error`-severity, autofixing rules plus the
 * CommonMark fence fixtures `enforce-typescript-markdown-code-blocks` carries
 * (#2213), and it is judged by `lang-fix-closure`, the core-equivalent oracle
 * for those languages. A cap on it measures nothing this file decides; what
 * matters is that the skip still equals the population and the population is
 * still there.
 */
const NON_TS_FLOOR = 100; // measured 108
const SHARED_SCOPE_CEILING = 40; // measured 33
const INPUT_FATAL_CEILING = 10; // measured 0
/**
 * The mode discount's own non-vacuity. Measured 2 - the two
 * `prefer-spread-over-reassembly` TS2698 pairs whose `never[]` receiver only
 * exists under `strictNullChecks`, which is the artifact class the discount was
 * adopted FOR. Floored just under, like every other floor here: a discount that
 * had stopped discounting anything would satisfy the same-code zero beside it
 * for free, and that zero would then be measuring nothing.
 */
const DISCOUNT_DROP_FLOOR = 1; // measured 2

console.log(
  [
    "cross-fixture fixer type safety: each rule's --fix over EVERY rule's fixtures",
    `  corpus: ${corpus.totalCases} cases across ${corpus.byRule.size} rules from ${corpus.filesLoaded} suite files`,
    `  fixtures: ${stats.fixturesConsidered} considered, ${stats.nonTypeScriptDropped} non-TypeScript, ${stats.sharedScopeDropped} shared-scope declarers, ${stats.inputFatalDropped} fatal parses, ${stats.threw} threw, ${carriage.carried} screened with their author's options`,
    `  fixes: ${stats.soloFixAttempts} solo attempts, ${stats.rewrites} rewrote (${stats.crossRewrites} of them cross-rule)`,
    `  pairs: ${corpusPairs.length} unique, ${
      corpusPairs.filter(isCross).length
    } cross-rule, from ${
      new Set(corpusPairs.map((pair) => pair.fixer)).size
    } distinct fixers`,
    `  asserted (input compiles): ${assertedPairs.length} pairs, ${assertedCrossPairs.length} cross-rule, ${assertedFixers.length} fixers`,
    ...MODES.map((mode) => {
      const clean = corpusPairs.filter((pair) =>
        baselineCompilesIn(pair, mode.key),
      ).length;
      return `    mode ${mode.key} (strict: ${mode.strict}): ${clean} of ${corpusPairs.length} pairs have a compiling input`;
    }),
    `  programs: ${files.length} distinct texts, ${MODES.length} modes, chunked at ${TEXT_CHUNK}`,
    `  findings: ${findings.length} (${
      findings.filter((finding) => isCross(finding.pair)).length
    } cross-rule); the rejected union oracle would report ${
      assertedPairs.filter((pair) => introducedUnionFor(pair).length).length
    }`,
    `  mode discount: ${discountDrops.length} pair(s) lost a diagnostic to the intersection, ${codeMatchedDrops.length} of them same-code (must be 0)`,
    `  timing: pairing ${pairingSeconds.toFixed(
      1,
    )}s, programs ${compileSeconds.toFixed(1)}s`,
  ].join('\n'),
);

describe("a rule's --fix must not introduce a type error on ANY rule's fixture", () => {
  /**
   * Non-vacuity first. Planted defects go through the same fix loop, the same
   * two programs and the same discount as every corpus pair, so a harness that
   * had quietly broken cannot report a clean sweep.
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
      expect(outcome.modesFlagged).toEqual(control.expectModesFlagged);
      expect(outcome.flagged).toBe(control.expectFlagged);
    },
  );

  /**
   * The mode discount's polarity, stated as a difference rather than as two
   * unrelated outcomes: the union oracle and the shipped one must DISAGREE on
   * the strict-only control and AGREE on the both-modes one. Widening the
   * discount back to a union, or narrowing it until it rejects everything,
   * breaks exactly one of these.
   */
  it('discounts a strict-only diagnostic and keeps a both-mode one', () => {
    const strictOnly = controlOutcomes.find(
      (outcome) => outcome.name === 'control-strict-only-break',
    )!;
    expect([strictOnly.unionFlagged, strictOnly.flagged]).toEqual([
      true,
      false,
    ]);
    const bothModes = controlOutcomes.find(
      (outcome) => outcome.name === 'control-both-modes-break',
    )!;
    expect([bothModes.unionFlagged, bothModes.flagged]).toEqual([true, true]);
  });

  /**
   * The whole point of this guard. `fixer-type-safety` pairs a fixer only with
   * its own suite's fixtures; if the cross-rule count here ever collapses, this
   * file has silently become a second copy of that one - green, and asserting
   * nothing new.
   */
  it('pairs fixers with OTHER rules fixtures, at scale', () => {
    expect(assertedCrossPairs.length).toBeGreaterThanOrEqual(CROSS_FLOOR);
    expect(corpusPairs.filter(isCross).length).toBeGreaterThanOrEqual(
      CROSS_GENERATED_FLOOR,
    );
    // A single prolific fixer must not be able to hold the floor up alone.
    expect(
      new Set(assertedCrossPairs.map((pair) => pair.fixer)).size,
    ).toBeGreaterThanOrEqual(CROSS_FIXER_FLOOR);
    expect(assertedFixers.length).toBeGreaterThanOrEqual(FIXER_FLOOR);
  });

  /**
   * Corpus reach. Every one of these would read as a healthy zero if the
   * harvest, the screen or the fix loop broke, so each is floored rather than
   * assumed - and every skip counter is read here, because a skip nothing
   * asserts is a silent discard (#1984).
   */
  it('accounts for every fixture it did not pair', () => {
    expect(corpus.failures).toEqual([]);
    expect(corpus.filesLoaded).toBeGreaterThanOrEqual(CORPUS_FILES_FLOOR);
    expect(corpus.totalCases).toBeGreaterThanOrEqual(CORPUS_CASES_FLOOR);
    expect(stats.fixturesConsidered).toBeGreaterThanOrEqual(
      FIXTURES_CONSIDERED_FLOOR,
    );
    expect(stats.soloFixAttempts).toBeGreaterThanOrEqual(SOLO_ATTEMPT_FLOOR);
    expect(stats.rewrites).toBeGreaterThanOrEqual(REWRITE_FLOOR);
    expect(stats.crossRewrites).toBeGreaterThanOrEqual(CROSS_REWRITE_FLOOR);
    expect(assertedPairs.length).toBeGreaterThanOrEqual(ASSERTED_FLOOR);
    // Skips are bounded from ABOVE: each is a case this guard does not judge,
    // so a harness regression shows up as a jump, not as a dip. The
    // non-TypeScript skip is the exception, because it is not a judgement at
    // all but a PROPERTY of the corpus — every case whose language is not `ts`
    // — and pinning it to that population is the one bound that cannot drift
    // out from under its measurement.
    const nonTypeScriptCases = [...corpus.byRule.values()]
      .flat()
      .filter((testCase) => testCase.language !== 'ts').length;
    expect(stats.nonTypeScriptDropped).toBe(nonTypeScriptCases);
    expect(nonTypeScriptCases).toBeGreaterThanOrEqual(NON_TS_FLOOR);
    expect(stats.sharedScopeDropped).toBeLessThanOrEqual(SHARED_SCOPE_CEILING);
    expect(stats.inputFatalDropped).toBeLessThanOrEqual(INPUT_FATAL_CEILING);
    expect(stats.threw).toBe(0);
  });

  /**
   * The screen runs each fixture under the configuration its AUTHOR declared.
   *
   * Both halves are needed. The population says the composed config keeps
   * carrying options at all; the witness says those options still decide an
   * answer. A screen that reverted to defaults would pair the same corpus and
   * report the same clean result, because an option-gated report never arrives
   * and reads as a silent rule (#1732, #2244).
   */
  it('screens every fixture under the options its author declared', () => {
    expect(carriage.carried).toBeGreaterThanOrEqual(OPTION_CARRIAGE_FLOOR);
    const witness = carriage.witness;
    expect(witness).not.toBeNull();
    expect(witness?.ownerEntry).toEqual(['error', ...(witness?.options || [])]);
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
            `${account.pair.fixer}: ${account.codeMatchedDrops.join(' | ')}`,
        )
        .join('\n'),
    ).toBe('');
    expect(discountDrops.length).toBeGreaterThanOrEqual(DISCOUNT_DROP_FLOOR);
  });

  /**
   * The oracle is the differential and nothing else. Blinded, the corpus must
   * produce no finding at all - otherwise some other part of the pipeline is
   * manufacturing them and the assertions below measure that instead.
   */
  it('produces findings only through the diagnostic differential', () => {
    expect(mutantFindings).toEqual([]);
  });

  /**
   * A baselined defect must stay exactly as large as recorded, and one that
   * stops reproducing must be deleted. Either half left unenforced lets the
   * entry absorb the next regression silently.
   */
  it('reproduces every baselined cross-fixture unsafe fix, and no more', () => {
    expect(Object.fromEntries(baselinedCounts)).toEqual(
      Object.fromEntries(
        Object.entries(TYPE_UNSAFE_BASELINE).map(([key, { pairs }]) => [
          key,
          pairs,
        ]),
      ),
    );
  });

  it.each(assertedFixers)('%s', (fixer) => {
    const problems = unbaselinedByFixer.get(fixer) || [];
    expect(problems.map((finding) => report(finding)).join('\n\n')).toBe('');
  });
});

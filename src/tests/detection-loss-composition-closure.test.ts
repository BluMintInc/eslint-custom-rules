/**
 * The recommended config's `--fix` must not DESTROY another rule's report.
 *
 * Every other closure guard in this suite asks what a transform INTRODUCES —
 * `composed-fix-core-violation-closure` counts core violations a fix creates,
 * `recommended-config-fix-closure` counts plugin ones, `fix-fixpoint-closure`
 * asks whether a fixer converges. Nothing asked what a transform REMOVES. A
 * fixer that deletes the syntactic carrier another rule keys its detection off
 * makes that rule go blind: silently, permanently, and at exit 0, because a
 * rule that stops reporting is indistinguishable from a clean file.
 *
 * `exemption-composition-closure` is the mirror of this suite and not a
 * substitute for it. It sweeps `valid` fixtures and asks whether a sibling's
 * fix made a silent rule START reporting — an exemption destroyed. This one
 * sweeps `invalid` fixtures and asks whether a sibling's fix made a reporting
 * rule GO SILENT — a detection destroyed. The two directions share a corpus and
 * an attribution method and nothing else; a defect in one is invisible to the
 * other.
 *
 * Method, per INVALID fixture of rule R:
 *   1. CONTROL — R alone, under the fixture's own options, must REPORT on the
 *      input. A fixture R is already silent on has no detection to lose, and
 *      skipping this control is how the probe fakes a result.
 *   2. Run the input through the full recommended config with fixing on, MINUS
 *      R. Excluding R is load-bearing: R repairing its own violation is correct
 *      behaviour, not a finding, and leaving it in would make every fixable
 *      rule its own culprit.
 *   3. Re-lint the output with R ALONE. A report that existed before the
 *      config's autofixes and does not exist after is a detection the config
 *      destroyed.
 *
 * A candidate is not yet a defect, and most are not one. Of the 540 losses this
 * corpus reaches, 460 are the CORRECT outcome — the culprit genuinely repaired
 * the violation, which is exactly what a composed `--fix` is for. What separates
 * the two is whether the thing the victim exists to prevent SURVIVES the
 * rewrite, and that is a semantic question no oracle here can decide. So the
 * residue is carried in `DETECTION_DESTROYED_BASELINE`, one entry per
 * `culprit -> victim` pair, each annotated with the measured reason it is a
 * repair rather than a blinding — exactly as `EXEMPTION_DESTROYED_BASELINE`
 * carries the inverse direction. Of its 47 entries, 32 record a genuine repair,
 * one records an artifact the re-judge below could not settle either way, and 14
 * are open defects, each carrying the issue tracking it.
 *
 * Two traps are built into the instrument, each of which produced a wrong
 * number before it was:
 *
 *   - A bare `Linter` loads no lib files, so a type a checker-driven victim
 *     reads can degenerate to `any` and the victim goes quiet for a reason that
 *     does not exist on a consumer's machine. `(typeof X)[number]` is the
 *     measured instance: the numeric index signature of a readonly tuple comes
 *     from `lib.es5.d.ts`, and without it 161 of 701 candidates were phantoms on
 *     two pairs alone. Every candidate whose victim consults the checker is
 *     therefore RE-JUDGED under a real `parserOptions.project` before it counts.
 *   - "Some rule in the config blinded R" is not actionable, so each candidate
 *     is replayed against single-rule configs to name the culprit. The baseline
 *     key means nothing without it: a dozen fixers may rewrite a snippet while
 *     only one strips the carrier.
 *
 * Corpus: the suite's own `invalid` fixtures, harvested without executing them,
 * and built through `fixtureCorpus` so the filename comes from the CODE and
 * every tester's language is carried (#1984, #1860).
 */
import * as fs from 'fs';
import * as path from 'path';
import { Linter, Rule } from 'eslint';
import {
  defaultFilenameFor,
  defineCorpusParsers,
  FixtureCase,
  harvestFixtureCorpus,
  parserKeyFor,
  parserOptionsFor,
  ruleNameByIdentity,
  severityWithOptions,
  silentWithoutProgramRuleNames,
  typeAwareRuleNames,
} from '../utils/fixtureCorpus';
import {
  PLUGIN_PREFIX,
  overrideRulesFor,
  recommendedRulesExcluding,
} from '../utils/composedFixConfig';
import { createTempFixtureDir } from '../utils/tempFixtureDir';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as {
  rules: Record<string, unknown>;
};
/* eslint-enable @typescript-eslint/no-var-requires */

const PREFIX = PLUGIN_PREFIX;

/**
 * The only exclusion. `silentWithoutProgramRuleNames` is MEASURED to report
 * nothing under a bare `Linter`, so it can contribute only a false clean.
 *
 * `typeAwareRuleNames` is deliberately NOT excluded. That premise is measured
 * false: all 16 report here, because `@typescript-eslint/parser` returns an
 * isolated single-file program even with no `project`, so the
 * `if (!services?.program) return;` guard those rules carry never fires. What is
 * missing is cross-FILE resolution, which changes an answer rather than
 * withholding it — and the answer it changes is handled below by re-judging
 * their candidates under a real program, not by dropping them (#1859, #1877).
 */
const EXCLUDED: ReadonlySet<string> = new Set<string>([
  ...silentWithoutProgramRuleNames,
]);

const linter = new Linter();
defineCorpusParsers(linter);
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}

/** recommended-minus-R, cached per victim. Key ORDER is load-bearing. */
const minusRuleCache = new Map<string, Record<string, unknown>>();
const recommendedMinus = (victim: string) => {
  const cached = minusRuleCache.get(victim);
  if (cached) return cached;
  const rules = recommendedRulesExcluding(new Set([...EXCLUDED, victim]));
  minusRuleCache.set(victim, rules);
  return rules;
};

/**
 * `configs.recommended` is not the flat `rules` map alone: `enforce-date-ttime`
 * is enabled only through an `overrides` entry, so a guard that reads `rules`
 * by itself never composes it as a sibling (#1734).
 */
const overrideCache = new Map<string, Record<string, unknown>>();
const overridesFor = (victim: string, filename: string) => {
  const key = `${victim} ${filename}`;
  const cached = overrideCache.get(key);
  if (cached) return cached;
  const rules = overrideRulesFor(filename, new Set([...EXCLUDED, victim]));
  overrideCache.set(key, rules);
  return rules;
};

const configFor = (
  rules: Record<string, unknown>,
  testCase: FixtureCase,
): Linter.Config =>
  ({
    parser: parserKeyFor(testCase),
    parserOptions: parserOptionsFor(testCase),
    rules,
  } as unknown as Linter.Config);

/**
 * Fixtures write `eslint-disable-next-line <rule>` with a BARE name, which is
 * what `RuleTester` registers. Under the real prefixed ids that directive
 * matches nothing and the rule fires anyway, so the snippet would be probed in
 * a state its author explicitly suppressed.
 */
const BARE_NAMES = [...ruleNameByIdentity.values()].sort(
  (a, b) => b.length - a.length,
);
const DIRECTIVE =
  /(eslint-disable(?:-next-line|-line)?|eslint-enable)([^\n*]*)/g;
const prefixDirectives = (code: string) =>
  code.replace(DIRECTIVE, (_whole, keyword: string, tail: string) => {
    let out = tail;
    for (const name of BARE_NAMES) {
      out = out.replace(
        new RegExp(`(^|[\\s,])${name}(?![\\w/-])`, 'g'),
        `$1${PREFIX}${name}`,
      );
    }
    return `${keyword}${out}`;
  });

type LintOutcome =
  | { kind: 'unusable' }
  | { kind: 'ok'; messages: Linter.LintMessage[] };

/**
 * `fatal` is screened BEFORE the `ruleId` filter. A fatal message carries
 * `ruleId: null`, so filtering first would drop it and a parse failure would
 * read as the rule staying silent — which is precisely the false clean this
 * axis exists to notice.
 */
const verifyFor = (
  code: string,
  rules: Record<string, unknown>,
  testCase: FixtureCase,
  filename: string,
  ruleId?: string,
): LintOutcome => {
  let messages: Linter.LintMessage[];
  try {
    messages = linter.verify(code, configFor(rules, testCase), { filename });
  } catch {
    return { kind: 'unusable' };
  }
  if (messages.some((message) => message.fatal)) return { kind: 'unusable' };
  return {
    kind: 'ok',
    messages: ruleId
      ? messages.filter((message) => message.ruleId === ruleId)
      : messages,
  };
};

// ---------------------------------------------------------------------------
// The corpus: every rule's INVALID fixtures.
// ---------------------------------------------------------------------------
const corpus = harvestFixtureCorpus();

/** The shipped severities, computed once; the per-victim sets filter THIS. */
const RECOMMENDED = recommendedRulesExcluding(EXCLUDED);

const casesByRule = new Map<string, FixtureCase[]>();
for (const [name, cases] of corpus.byRule) {
  if (EXCLUDED.has(name)) continue;
  /**
   * A rule outside the recommended config cannot lose a detection TO it: a
   * consumer running that config never has the rule enabled, so there is no
   * report for a sibling's `--fix` to destroy. It drops five registered rules
   * here, one of them (`prefer-fragment-component`) shipped explicitly `off`.
   *
   * Those rules are still worth probing for a consumer that enables one by hand
   * — the sweep behind #2318 found a real blinding on `no-restricted-properties-fix`
   * that way — but that is a different configuration and belongs to whoever
   * enables it, not to this guard's claim about the shipped one.
   */
  if (!(PREFIX + name in RECOMMENDED)) continue;
  const invalid = cases.filter((testCase) => testCase.bucket === 'invalid');
  if (invalid.length) casesByRule.set(name, invalid);
}

type Finding = {
  victim: string;
  /** Rules individually sufficient to reproduce the loss, sorted for the key. */
  culprits: string[];
  messageIds: string[];
  filename: string;
  origin: string;
  before: string;
  after: string;
};

/** Non-vacuity accounting. A zero finding count means nothing without these. */
const stats = {
  considered: 0,
  /** The rule was already silent, so there was no detection to destroy. */
  preImageSilent: 0,
  /** The composed `--fix` left the text alone, so nothing could be destroyed. */
  textUnchanged: 0,
  rewritten: 0,
  /** Rewritten, and the victim still reports — the healthy outcome. */
  stillReports: 0,
  candidates: 0,
  /**
   * Candidates a real `parserOptions.project` overturned. Counted and asserted:
   * a discount nobody can see is a way to make the guard green.
   */
  discountedAsHarness: 0,
  /** Candidates the project re-judge could not speak about; KEPT, not dropped. */
  projectInconclusive: 0,
  /** Read by an `expect`; an uncounted fatal parse fakes a silent rule. */
  fatalInput: 0,
  fatalOutput: 0,
  attributionReplays: 0,
  rulesCovered: new Set<string>(),
  languages: new Set<string>(),
};

/**
 * Which single rule, applied ALONE, reproduces the loss.
 *
 * The replay set is narrowed to the rules that REPORTED on the pre-image, and
 * the narrowing is exact rather than a heuristic: `linter.verify` runs every
 * configured rule independently over the same AST, so a rule's messages under
 * the composed config are exactly its messages alone, and a rule with no message
 * produces no fix. Narrowing therefore cannot lose a culprit — confirmed by
 * replaying a 15-rule pilot against the unnarrowed set, which named the same six
 * pairs with the same counts.
 *
 * Filtered IN CONFIG ORDER. Two rules whose fixes compete for the same range are
 * resolved by the order their messages arrive, which follows the order the rules
 * sit in the config object, so a re-ordered subset is a configuration no
 * consumer has.
 */
const attributeCulprits = (
  testCase: FixtureCase,
  filename: string,
  source: string,
  victimSolo: Record<string, unknown>,
  fixRules: Record<string, unknown>,
): string[] => {
  const reporting = verifyFor(source, fixRules, testCase, filename);
  const replaySet =
    reporting.kind === 'ok'
      ? Object.fromEntries(
          Object.entries(fixRules).filter(([id]) =>
            reporting.messages.some((message) => message.ruleId === id),
          ),
        )
      : fixRules;

  const victimId = Object.keys(victimSolo)[0];
  const culprits: string[] = [];
  for (const [candidateId, severity] of Object.entries(replaySet)) {
    if (candidateId === victimId) continue;
    stats.attributionReplays++;
    let fixedAlone;
    try {
      fixedAlone = linter.verifyAndFix(
        source,
        configFor({ [candidateId]: severity }, testCase),
        { filename },
      );
    } catch {
      continue;
    }
    if (!fixedAlone.fixed || fixedAlone.output === source) continue;
    const after = verifyFor(
      fixedAlone.output,
      victimSolo,
      testCase,
      filename,
      victimId,
    );
    if (after.kind !== 'ok') continue;
    if (after.messages.length === 0) {
      culprits.push(candidateId.slice(PREFIX.length));
    }
  }
  return culprits;
};

// ---------------------------------------------------------------------------
// The checker-driven re-judge.
//
// A candidate whose victim consults the type checker is not a finding until a
// real program says so. Only ONE fixture file is ever present in that program:
// a snippet with no import or export is a SCRIPT, so several of them at once
// share one global scope, their top-level declarations collide, and the checker
// hands back error types — which reads as the victim going silent for the very
// reason this re-judge exists to rule out.
// ---------------------------------------------------------------------------
const PROJECT_ROOT = createTempFixtureDir('blumint-detection-loss-');
const TSCONFIG = path.join(PROJECT_ROOT, 'tsconfig.json');
fs.writeFileSync(
  TSCONFIG,
  JSON.stringify({
    compilerOptions: {
      target: 'es2020',
      lib: ['es2020', 'dom', 'dom.iterable'],
      strict: true,
      jsx: 'react-jsx',
      module: 'esnext',
      moduleResolution: 'node',
      noEmit: true,
      skipLibCheck: true,
      esModuleInterop: true,
    },
    include: ['**/*.ts', '**/*.tsx'],
  }),
);

let liveProjectFile: string | null = null;
const withProject = (
  code: string,
  filename: string,
  victim: string,
  severity: unknown,
): LintOutcome => {
  if (liveProjectFile) {
    try {
      fs.rmSync(liveProjectFile);
    } catch {
      /* already gone */
    }
  }
  // The path TAIL is preserved so a carve-out keyed on `src/…`, a `.tsx`
  // extension or a directory infix still reads what its author wrote.
  const relative = filename.replace(/^([A-Za-z]:)?[/\\]+/, '');
  const file = path.join(PROJECT_ROOT, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, code);
  liveProjectFile = file;

  let messages: Linter.LintMessage[];
  try {
    messages = linter.verify(
      code,
      {
        parser: 'ts',
        parserOptions: {
          project: TSCONFIG,
          tsconfigRootDir: PROJECT_ROOT,
          sourceType: 'module',
          ecmaVersion: 2020,
          ecmaFeatures: { jsx: true },
        },
        rules: { [PREFIX + victim]: severity },
      } as unknown as Linter.Config,
      { filename: file },
    );
  } catch {
    return { kind: 'unusable' };
  }
  if (messages.some((message) => message.fatal)) return { kind: 'unusable' };
  return {
    kind: 'ok',
    messages: messages.filter((message) => message.ruleId === PREFIX + victim),
  };
};

/**
 * Is this candidate's loss real, or an artifact of a program with no lib files?
 *
 * A DIFFERENTIAL, never an absolute read. The pre-image control has to hold
 * under the project too — if the victim does not report there, the instrument
 * has nothing to say about the post-image, and the candidate is KEPT. A discount
 * that fires when its own control failed would be a way to make the guard green.
 */
type Rejudge = 'artifact' | 'confirmed' | 'inconclusive';
const rejudgeUnderProject = (
  victim: string,
  testCase: FixtureCase,
  filename: string,
  before: string,
  after: string,
): Rejudge => {
  const severity = severityWithOptions(testCase);
  const pre = withProject(before, filename, victim, severity);
  if (pre.kind !== 'ok' || pre.messages.length === 0) return 'inconclusive';
  const post = withProject(after, filename, victim, severity);
  if (post.kind !== 'ok') return 'inconclusive';
  return post.messages.length > 0 ? 'artifact' : 'confirmed';
};

// ---------------------------------------------------------------------------
// One probe. The sweep and every control run through THIS function, so a
// control proves something about the detector rather than about a second copy
// of it.
// ---------------------------------------------------------------------------
type ProbeOutcome =
  | 'fatalInput'
  | 'preImageSilent'
  | 'textUnchanged'
  | 'fatalOutput'
  | 'stillReports'
  | 'harnessArtifact';

type ProbeResult =
  | { kind: ProbeOutcome }
  | { kind: 'finding'; finding: Finding; projectInconclusive: boolean };

const probeCase = (
  victim: string,
  testCase: FixtureCase,
  filename: string,
  fixRules: Record<string, unknown>,
): ProbeResult => {
  const victimId = PREFIX + victim;
  const source = prefixDirectives(testCase.code);
  const victimSolo = { [victimId]: severityWithOptions(testCase) };

  // 1. The pre-image control. A fixture the rule is already silent on has no
  //    detection to lose, and skipping this is how the probe fakes a result.
  const pre = verifyFor(source, victimSolo, testCase, filename, victimId);
  if (pre.kind !== 'ok') return { kind: 'fatalInput' };
  if (pre.messages.length === 0) return { kind: 'preImageSilent' };

  // 2. The composed `--fix`, MINUS the victim.
  let fixed;
  try {
    fixed = linter.verifyAndFix(source, configFor(fixRules, testCase), {
      filename,
    });
  } catch {
    return { kind: 'fatalInput' };
  }
  if (!fixed.fixed || fixed.output === source) return { kind: 'textUnchanged' };

  // 3. Re-lint the rewritten text with the victim ALONE.
  const post = verifyFor(
    fixed.output,
    victimSolo,
    testCase,
    filename,
    victimId,
  );
  if (post.kind !== 'ok') return { kind: 'fatalOutput' };
  if (post.messages.length > 0) return { kind: 'stillReports' };

  // 4. A checker-driven victim does not count until a real program agrees.
  let projectInconclusive = false;
  if (typeAwareRuleNames.has(victim)) {
    const verdict = rejudgeUnderProject(
      victim,
      testCase,
      filename,
      source,
      fixed.output,
    );
    if (verdict === 'artifact') return { kind: 'harnessArtifact' };
    projectInconclusive = verdict === 'inconclusive';
  }

  return {
    kind: 'finding',
    projectInconclusive,
    finding: {
      victim,
      culprits: attributeCulprits(
        testCase,
        filename,
        source,
        victimSolo,
        fixRules,
      ),
      messageIds: [
        ...new Set(pre.messages.map((message) => message.messageId ?? '?')),
      ],
      filename,
      origin: `src/tests/${testCase.origin}`,
      before: source,
      after: fixed.output,
    },
  };
};

const collectFindings = (): Finding[] => {
  const findings: Finding[] = [];

  for (const [victim, cases] of casesByRule) {
    const recommended = recommendedMinus(victim);
    stats.rulesCovered.add(victim);

    for (const testCase of cases) {
      stats.considered++;
      stats.languages.add(testCase.language);

      const filename = testCase.filename || defaultFilenameFor(testCase);
      const result = probeCase(victim, testCase, filename, {
        ...recommended,
        ...overridesFor(victim, filename),
      });

      switch (result.kind) {
        case 'fatalInput':
          stats.fatalInput++;
          break;
        case 'fatalOutput':
          // The text WAS rewritten, so it belongs in `rewritten` too; keeping
          // the decomposition exact is what lets a drift in either number be
          // read off the console line rather than inferred.
          stats.rewritten++;
          stats.fatalOutput++;
          break;
        case 'preImageSilent':
          stats.preImageSilent++;
          break;
        case 'textUnchanged':
          stats.textUnchanged++;
          break;
        case 'stillReports':
          stats.rewritten++;
          stats.stillReports++;
          break;
        case 'harnessArtifact':
          stats.rewritten++;
          stats.candidates++;
          stats.discountedAsHarness++;
          break;
        default:
          stats.rewritten++;
          stats.candidates++;
          if (result.projectInconclusive) stats.projectInconclusive++;
          findings.push(result.finding);
      }
    }
  }

  return findings;
};

const findings = collectFindings();

/**
 * `<culprit> -> <victim>`. Multiple sufficient culprits are joined and SORTED,
 * which is the only place order is normalised: the key has to be stable across
 * runs, while every probed rule SUBSET stays in config order.
 */
const pairKey = (finding: Finding) => {
  const culprit = finding.culprits.length
    ? [...finding.culprits].sort().join('+')
    : '(unattributed)';
  return `${culprit} -> ${finding.victim}`;
};

const observedPairs = new Map<string, Finding[]>();
for (const finding of findings) {
  const key = pairKey(finding);
  observedPairs.set(key, [...(observedPairs.get(key) || []), finding]);
}

console.log(
  [
    `[detection-loss] corpus: ${stats.considered} invalid fixture(s) over ` +
      `${stats.rulesCovered.size} rule(s); languages ` +
      `${[...stats.languages].sort().join('/')}`,
    `[detection-loss] ${stats.preImageSilent} pre-image silent, ` +
      `${stats.textUnchanged} unchanged, ${stats.rewritten} rewritten, ` +
      `${stats.stillReports} still reporting`,
    `[detection-loss] ${stats.candidates} candidate(s); ` +
      `${stats.discountedAsHarness} discounted under a real program, ` +
      `${stats.projectInconclusive} inconclusive and kept; ` +
      `${findings.length} finding(s) over ${observedPairs.size} pair(s)`,
    `[detection-loss] fatal: ${stats.fatalInput} input, ` +
      `${stats.fatalOutput} output; ${stats.attributionReplays} attribution replay(s)`,
  ].join('\n'),
);

/**
 * Stand-in culprits for the controls.
 *
 * They are defined AFTER the sweep has run, and are registered on the linter
 * but never enter `recommendedRulesExcluding`'s output, so the corpus scan
 * above cannot see them and they are reachable only where a control opts in.
 *
 * The detector needs a culprit that provably destroys a REAL rule's detection.
 * A shipped rule cannot supply one and should not have to: every live
 * destruction being fixed is the goal of this suite, so keying the control to
 * one would make the detector go vacuous exactly when the config is healthiest.
 */
const CONTROL_STRIPPER_ID = `${PREFIX}control-annotation-stripper`;
const CONTROL_BODY_ID = `${PREFIX}control-body-rewriter`;

/** The #1603 shape: deletes a function's explicit return-type annotation. */
const controlAnnotationStripper: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    schema: [],
    messages: { strip: 'Remove the explicit return type.' },
  },
  create(context) {
    return {
      FunctionDeclaration(node: never) {
        const declaration = node as unknown as {
          returnType?: { range: [number, number] };
        };
        if (!declaration.returnType) return;
        const range = declaration.returnType.range;
        context.report({
          node,
          messageId: 'strip',
          // Converging on the first pass matters: `verifyAndFix` re-lints its
          // own output, and a double that kept reporting would spin the control.
          fix: (fixer) => fixer.removeRange(range),
        });
      },
    };
  },
};

/**
 * The opposite: rewrites the RETURN EXPRESSION and leaves the annotation alone.
 * A green corpus means nothing if the detector fires on every rewrite it is
 * handed, so this control must reach the same pipeline and come back silent.
 */
const controlBodyRewriter: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    schema: [],
    messages: { rewrite: 'Rewrite the returned expression.' },
  },
  create(context) {
    return {
      ReturnStatement(node) {
        const argument = node.argument as { type?: string; value?: unknown };
        if (
          !argument ||
          argument.type !== 'Literal' ||
          argument.value !== true
        ) {
          return;
        }
        context.report({
          node,
          messageId: 'rewrite',
          fix: (fixer) =>
            fixer.replaceText(node.argument as never, 'Boolean(1)'),
        });
      },
    };
  },
};

linter.defineRule(CONTROL_STRIPPER_ID, controlAnnotationStripper);
linter.defineRule(CONTROL_BODY_ID, controlBodyRewriter);

/**
 * The composed config the controls run under: everything shipped EXCEPT the one
 * rule that already performs the rewrite the doubles model.
 *
 * Leaving `no-explicit-return-type` in would let it shadow both doubles — the
 * positive control would pass on the shipped rule's work rather than the
 * double's, and the negative control would report a finding it did not cause.
 * That is the failure mode `exemption-composition-closure` avoids by picking a
 * victim no shipped rule destroys; this axis has no such victim to pick, so the
 * shadowing rule is removed instead.
 */
const CONTROL_BASE = recommendedRulesExcluding(
  new Set([...EXCLUDED, 'no-explicit-return-type']),
);

/** The #1603 shape as a fixture: annotated, and the victim reports on it. */
const CONTROL_VICTIM = 'enforce-boolean-naming-prefixes';
const controlFixture = (): FixtureCase => ({
  code: 'function check(): boolean {\n  return true;\n}\n',
  filename: 'file.ts',
  options: undefined,
  parserOptions: undefined,
  tester: 'ruleTesterTs',
  language: 'ts',
  origin: 'planted control',
  bucket: 'invalid',
});

/**
 * Reports the shipped config's `--fix` destroys today, keyed
 * `<culprit fixer> -> <rule whose report it destroyed>`.
 *
 * AN ENTRY IS NOT A WAY TO MAKE A BUILD GREEN. Each records one of two things,
 * and which one it is stays legible because every entry carries the evidence:
 *
 *   - a REPAIR — the culprit's fix eliminated the violation, so the victim's
 *     silence is the correct outcome and the composition is healthy. This is the
 *     common case, and it is why the axis needs a baseline at all: a guard that
 *     failed on any disappearing report would be red from its first run.
 *   - a BLINDING — the thing the victim exists to prevent SURVIVES the rewrite
 *     and only the rule's sight is gone. Every one of those carries the issue
 *     tracking it, and is a defect waiting to be fixed rather than a decision.
 *
 * Each reason was settled the same way: read the victim's detection site, read
 * what the culprit's fixer rewrites, then ask whether the objectionable
 * construct is still in the output. Prefer fixing over listing — a blinding
 * entry should disappear when its issue is closed, and the staleness arm below
 * fails if one lingers after the pair stops reproducing.
 */
export const DETECTION_DESTROYED_BASELINE: Record<string, string> = {
  // ---------------------------------------------------------------------
  // REPAIRS. The violation is gone, not hidden. The last entry in this section
  // is the one exception: an artifact the project re-judge abstained on, kept
  // here rather than discounted, and labelled as such at its own definition.
  // ---------------------------------------------------------------------

  /**
   * The two query-key rules police the same `useRouterState({ key: … })` shape
   * from opposite sides and each fixes it into the other's accepted form, which
   * is why they appear here in both directions.
   */
  'prefer-global-router-state-key -> enforce-querykey-ts':
    'the culprit replaces the raw string key with a `QUERY_KEY_*` constant imported from `queryKeys.ts`, which is exactly the source `isValidQueryKeyUsage` requires (enforce-querykey-ts.ts:1118-1150), so the literal it reports on is genuinely gone',
  'enforce-querykey-ts -> prefer-global-router-state-key':
    'the mirror of the pair above: the culprit substitutes an imported `QUERY_KEY_*` identifier for the string literal, so `containsInvalidStringLiteral` no longer sees a `Literal` node (prefer-global-router-state-key.ts:594-600), which is the remedy this rule prescribes',

  'no-empty-dependency-use-callbacks -> use-latest-callback':
    'the culprit hoists a callback it proved reads no component state into a module-level function, deleting the `useCallback` call the victim keys on (use-latest-callback.ts:1174-1176); a module-scope function is permanently stable, which is stronger than the hook swap the victim would advise',

  'no-explicit-return-type -> no-redundant-annotation-assertion':
    'redundancy requires the type to be written twice, once as an annotation and once as an assertion; the culprit deletes the annotation, leaving one declaration, so the duplication the victim reports no longer exists (no-redundant-annotation-assertion.ts:1873)',

  'no-entire-object-hook-deps -> prefer-use-deep-compare-memo':
    'the culprit narrows the dependency array from the whole object to the primitive field the callback actually reads, so the array no longer carries a reference-unstable object for `isNonPrimitiveWithoutTypes` to classify (prefer-use-deep-compare-memo.ts:1261)',

  'no-useless-usememo-primitives -> no-usememo-for-pass-by-value':
    "the culprit inlines a `useMemo` returning a constant into a bare expression, which is the rewrite the victim's own message asks for; with no `CallExpression` left there is no pass-by-value memoization to report (no-usememo-for-pass-by-value.ts:1039-1040)",

  'no-useless-usememo-primitives -> prefer-use-deep-compare-memo':
    'the culprit collapses nested `useMemo` calls into the literal they always evaluate to, removing both object-literal dependency arrays along with the memoization, so the unstable dependency the victim reports is gone',

  /**
   * These two enforce the same convention — a lone `*Props`-typed parameter is
   * named `props` — from complementary code paths, and one documents itself as
   * the authority the other defers to (#2180). Either fixer alone produces the
   * name the other requires, so the mutual silence is convergence.
   */
  'enforce-props-naming-consistency -> enforce-props-argument-name':
    "the culprit renames the `*Props` parameter to `props`, which is exactly the `suggestedName` the victim's own algorithm computes for a single Props parameter (enforce-props-argument-name.ts:585), so the two rules converge rather than one blinding the other",
  'enforce-props-argument-name -> enforce-props-naming-consistency':
    "the mirror of the pair above: the culprit renames the parameter to `props`, so `isPropsNameWithPrefix` holds and the victim's guard stops firing (enforce-props-naming-consistency.ts:383-386)",

  'enforce-memoize-getters -> no-passthrough-getters':
    "the culprit adds `@Memoize()` to the getter, and the victim's message names memoization as an accepted justification for a getter; with a decorator present it is no longer a bare passthrough (no-passthrough-getters.ts:39)",

  'no-entire-object-hook-deps -> enforce-stable-hash-spread-props':
    'the culprit removes a dependency its own message reports as never read inside the hook body, emptying the array, so no unstable rest-props reference remains for the victim to find (enforce-stable-hash-spread-props.ts:826)',

  '(unattributed) -> no-redundant-usecallback-wrapper':
    "no single fixer reproduces it: `use-latest-callback` drops the dependency array, then `no-empty-dependency-use-callbacks` hoists the now dependency-free callbacks to module scope, leaving no memoization wrapper of any kind for the victim's callee check (no-redundant-usecallback-wrapper.ts:615)",

  'use-latest-callback -> enforce-transform-memoization':
    "the culprit rewrites `useCallback(fn, [])` to `useLatestCallback(fn)`, and the victim's own `stabilizingUtilities` set treats that hook as already render-stable (enforce-transform-memoization.ts:124,537), a carve-out its source documents for this exact composition",

  '(unattributed) -> enforce-transform-memoization':
    "a two-step rewrite no single fixer reproduces: `prefer-usecallback-over-usememo-for-functions` turns the deps-less `useMemo` into `useCallback(fn, [])`, then `use-latest-callback` turns that into `useLatestCallback`, which the victim's `stabilizingUtilities` carve-out accepts as render-stable",

  'no-useless-usememo-primitives -> optimize-object-boolean-conditions':
    "the culprit deletes a primitive-returning `useMemo` along with its dependency array, so there is no hook call left for the victim's `isHookCall` visitor to inspect and no dependency array left to churn (optimize-object-boolean-conditions.ts:664-673)",

  'no-useless-usememo-primitives -> no-entire-object-hook-deps':
    "the culprit unwraps a `useMemo` whose body only builds a template string from the object's fields — `useMemo(() => `${userData?.id}: ${userData?.name}`, [userData])` — into the bare expression, deleting the hook call and its dependency array together; with no array left there is no entire-object dependency for `avoidEntireObject` to narrow (measured: the culprit replayed alone unwraps all 3, and the victim is silent on every post-image). The pair surfaces with #2312, which taught the culprit the deep-compare spelling this corpus reaches under the composed fix",

  'no-explicit-return-type -> enforce-object-literal-as-const':
    'the culprit strips the return annotation, and the victim deliberately exempts an array literal returned from an unannotated function because freezing it would leak an inferred arity to every caller (enforce-object-literal-as-const.ts:241-267, #2015); the post-fix shape is that documented exemption',

  'prefer-union-from-const-array -> enforce-types-directory-placement':
    'the culprit adds a runtime `const` array for the union to derive from, so the file genuinely stops being type-only and `isTypeOnlyFile` is false for a real reason rather than a hidden one (enforce-types-directory-placement.ts:401)',

  'no-empty-dependency-use-callbacks -> no-redundant-usecallback-wrapper':
    'the culprit hoists the always-empty-deps `useCallback` out of the component into a module-level function and drops the import, so the wrapper the victim reports on no longer exists in any form (no-redundant-usecallback-wrapper.ts:615-623)',

  'no-useless-fragment -> prefer-fragment-shorthand':
    'the culprit unwraps a fragment holding a single child down to that child, so there is no `React.Fragment` element left in any spelling for the victim to ask about converting (prefer-fragment-shorthand.ts:15-21)',

  'no-useless-fragment -> key-only-outermost-element':
    "the culprit unwraps the shorthand fragment, promoting the keyed element to be the map callback's direct return value, which is precisely the arrangement the victim requires (key-only-outermost-element.ts:264)",

  'parallelize-async-operations -> logical-top-to-bottom-grouping':
    'the culprit merges two sequential awaits into one `Promise.all` declaration that depends on both prior variables and sits immediately after the later of them, so nothing unrelated separates it from its dependencies (logical-top-to-bottom-grouping.ts:1447)',

  'no-redundant-annotation-assertion -> no-explicit-return-type':
    "the culprit deletes the redundant return annotation and keeps the assertion as the single source of truth, and the annotation's presence IS the construct this victim polices, so its absence is the fix rather than a blind spot (no-explicit-return-type.ts:2313-2314)",

  'no-explicit-return-type -> no-type-assertion-returns':
    "the culprit deletes an inferable annotation on a function returning a plain object literal; with no declared type left there is nothing for TypeScript to trust over the literal's own inferred shape, which is the whole defect (no-type-assertion-returns.ts:423)",

  'enforce-object-literal-as-const+no-explicit-return-type -> no-type-assertion-returns':
    "one culprit deletes the declared return type so there is none left to mistrust, and the other adds `as const`, a narrowing assertion the victim's default `allowAsConst` option treats as safe (no-type-assertion-returns.ts:333,392)",

  'key-only-outermost-element -> no-uuidv4-base62-as-key':
    'the culprit deletes the redundant nested `key={uuidv4Base62()}` attribute and its now-orphaned import, so every call to the banned key generator is gone from the file rather than merely relocated (no-uuidv4-base62-as-key.ts:216-227)',

  '(unattributed) -> require-memoize-jsx-returners':
    "a two-step rewrite: `prefer-getter-over-parameterless-method` converts the parameterless `render()` to a getter, then `enforce-memoize-getters` decorates it with `@Memoize()` — which is literally the remedy the victim's message demands (require-memoize-jsx-returners.ts:1151-1156)",

  '(unattributed) -> use-latest-callback':
    'a two-step rewrite: `no-entire-object-hook-deps` removes the unread dependency, then `no-empty-dependency-use-callbacks` hoists the now-closure-free callback to module scope, deleting the `useCallback` the victim keys on (use-latest-callback.ts:1164-1176) in favour of a permanently stable function',

  /**
   * These two require the SAME `@Memoize()` decorator on the same private
   * getter from different premises — one because the member returns JSX, the
   * other because it is a private getter — so either fixer satisfies the other
   * and they appear here in both directions.
   */
  'enforce-memoize-getters -> require-memoize-jsx-returners':
    "the culprit adds `@Memoize()` and its import to the same getter, which is exactly the decorator the victim's `hasDecorator` check looks for (require-memoize-jsx-returners.ts:1151-1155), so the remedy the victim asks for has been applied",
  'require-memoize-jsx-returners -> enforce-memoize-getters':
    "the mirror of the pair above: the culprit adds the same `@Memoize()` decorator, satisfying the victim's own requirement (enforce-memoize-getters.ts:582-587)",

  'global-const-style -> consistent-callback-naming':
    "the culprit renames the module-scope binding to `HANDLE_CLICK`, a register the victim's `/^handle[A-Z]/` camelCase check does not describe (consistent-callback-naming.ts:17,1014); the action-phrase naming smell it polices is specific to the camelCase spelling",

  'global-const-style -> enforce-assert-safe-object-key':
    "the culprit adds `as const`, so `(typeof KINDS)[number]` provably matches the record's declared key domain and the lookup becomes compiler-bounded — an exemption the victim documents at its own `TSIndexedAccessType` branch (enforce-assert-safe-object-key.ts:1669-1698,2400)",

  'no-explicit-return-type -> enforce-exported-function-types':
    "the culprit strips the inferable annotation and removes the now-orphaned type alias, leaving no annotation that names an unexported type (enforce-exported-function-types.ts:918-923); relying on inference is a remedy the victim's own docs list",

  /**
   * The one pair the project re-judge could not settle either way, kept rather
   * than discounted. Its 160 siblings on this same pair WERE discounted as the
   * `(typeof X)[number]` artifact; these two carry a `declare module` block the
   * temp project does not resolve, so the victim is silent on the PRE-image
   * there and the instrument has nothing to say about the post-image. Kept
   * because a discount that fires when its own control failed would be a way to
   * make this guard green.
   */
  'prefer-union-from-const-array -> prefer-map-over-conditional-dispatch':
    'the same lib-file artifact as the 160 candidates discounted on this pair — without `lib.es5.d.ts` a readonly tuple has no numeric index signature, so the discriminant degenerates to `any` and `typeGate` finds no literal keys (prefer-map-over-conditional-dispatch.ts:3110). Measured on a clean reproduction under a real project with `lib: es2020`: the discriminant resolves to the literal union and the rule still reports. These two fixtures carry an ambient `declare module` the temp project cannot resolve, so the re-judge abstains rather than discounting them',

  // ---------------------------------------------------------------------
  // BLINDINGS. The construct survives; only the rule's sight is gone. Each is
  // an OPEN DEFECT with an issue, not an accepted contradiction.
  // ---------------------------------------------------------------------

  /**
   * The `no-explicit-return-type` family. Six victims read an explicit return
   * annotation as their only detector, and the culprit deletes it while the
   * shape each rule objects to stays in the output. #2003 is the census; #1603
   * is the same defect for the first of them. Both are deliberately deferred to
   * a human, because the only fixes are a product call: accept the loss, make
   * the culprit decline, or move all six to type-aware detection at a cost #1603
   * measured at 91 new consumer reports.
   */
  'no-explicit-return-type -> enforce-boolean-naming-prefixes':
    'the culprit strips the `: boolean` annotation the victim reads to know the function returns a boolean; the badly named boolean function survives untouched, so this is a blinding and not a repair (#1603)',
  'no-explicit-return-type -> no-jsx-in-hooks':
    'the culprit strips the annotation `isJsxReturnType` reads (no-jsx-in-hooks.ts:218,248); the hook still returns a node, so only the detection is gone (#2003)',
  'no-explicit-return-type -> no-hungarian':
    'the culprit strips the annotation `isSymbolTypeAnnotation` reads (no-hungarian.ts:508-525); the getter is still named `…Symbol`, so only the detection is gone (#2003)',
  'no-explicit-return-type -> no-misleading-boolean-prefixes':
    'the culprit strips the annotation the victim reads at no-misleading-boolean-prefixes.ts:201; the function still does not return a plain boolean, so only the detection is gone (#2003)',
  'no-explicit-return-type -> require-server-timestamp-for-firestore-dates':
    'the culprit strips the annotation `typeAnnotationReferencesFirestoreType` reads (require-server-timestamp-for-firestore-dates.ts:109-113); `new Date()` is still written to a Firestore document, so only the detection is gone (#2003)',
  'no-explicit-return-type -> react-memoize-literals':
    'the culprit strips the annotation read at react-memoize-literals.ts:1767; the function still returns a union, so only the detection is gone (#2003)',
  'no-explicit-return-type+no-redundant-annotation-assertion -> prefer-getter-over-parameterless-method':
    'either culprit alone strips the `: string` annotation `functionYieldsThenable` trusts over the body (prefer-getter-over-parameterless-method.ts:1035-1037); the coerced getter candidate is byte-for-byte unchanged, and body scanning then wrongly exempts it as async. A seventh instance of the #2003 class, and the first with a second culprit (#2003)',

  /**
   * The callee-spelling family. A fixer that swaps which hook wraps an
   * expression leaves the expression alone, and a victim whose visitor is gated
   * on a hard-coded hook name stops seeing it.
   */
  'no-redundant-annotation-assertion -> enforce-object-literal-as-const':
    "the culprit deletes the return annotation because the sole return statement's `as SomePair` already states the same type, but `declaredReturnTypeOf` reads only the function-level annotation (enforce-object-literal-as-const.ts:118,365-368), so a still-provably-safe freeze reads as unprovable. Confirmed under a real program: both spellings give callers the identical effective type (#2319)",
};

const UNLISTED = [...observedPairs.keys()]
  .filter((pair) => !(pair in DETECTION_DESTROYED_BASELINE))
  .sort();

const STALE = Object.keys(DETECTION_DESTROYED_BASELINE)
  .filter((pair) => !observedPairs.has(pair))
  .sort();

const snippet = (code: string) =>
  code.length > 500 ? `${code.slice(0, 500)}\n… [truncated]` : code;

describe('the recommended config is closed under its own detections', () => {
  it('destroys no report outside the documented baseline', () => {
    if (UNLISTED.length > 0) {
      throw new Error(
        [
          `${UNLISTED.length} composition(s) destroy a report the victim makes:`,
          ...UNLISTED.map((pair) => {
            const hits = observedPairs.get(pair) as Finding[];
            return [
              `  ${pair} (${
                hits.length
              } fixture(s), lost ${hits[0].messageIds.join(',')})`,
              `    ${hits[0].origin} as ${hits[0].filename}`,
              '    --- invalid fixture (the victim reports on this) ---',
              snippet(hits[0].before).replace(/^/gm, '      '),
              "    --- after the siblings' --fix (the victim is silent) ---",
              snippet(hits[0].after).replace(/^/gm, '      '),
            ].join('\n');
          }),
          '',
          'A sibling transform rewrote the code the victim reported on, and the',
          'victim no longer reports. That is CORRECT when the fix repaired the',
          'violation, and a defect when the thing the victim exists to prevent',
          'still sits in the output and only the rule has gone blind. Decide',
          'which by reading the AFTER text: if the objectionable construct',
          'survives, fix the victim to see the rewritten shape or make the',
          'culprit preserve the carrier. If it is a genuine repair, add the pair',
          'to DETECTION_DESTROYED_BASELINE with the measured reason.',
        ].join('\n'),
      );
    }
    expect(UNLISTED).toEqual([]);
  });

  it('carries no stale baseline entry', () => {
    if (STALE.length > 0) {
      throw new Error(
        [
          'DETECTION_DESTROYED_BASELINE lists pair(s) this corpus no longer',
          'reproduces:',
          ...STALE.map(
            (pair) => `  ${pair} — ${DETECTION_DESTROYED_BASELINE[pair]}`,
          ),
          '',
          'Either the composition was resolved (delete the entry) or the fixture',
          'that reached it was edited away (restore coverage). A stale entry',
          'silently absorbs the next real regression.',
        ].join('\n'),
      );
    }
    expect(STALE).toEqual([]);
  });

  it('still measures every baselined pair as losing a report', () => {
    // The other half of the staleness arm: an entry must not merely be
    // "not stale" by name, it must still be carrying fixtures.
    for (const pair of Object.keys(DETECTION_DESTROYED_BASELINE)) {
      expect((observedPairs.get(pair) || []).length).toBeGreaterThan(0);
    }
  });
});

/**
 * Anti-vacuity. A composition guard whose corpus trips no fixer passes forever
 * while asserting nothing, so the corpus, the control step, the rewrite step,
 * the discount and the detector are each measured independently.
 */
describe('the detection-loss guard is load-bearing', () => {
  it('harvests the suite without executing or losing it', () => {
    expect(corpus.failures).toEqual([]);
    expect(corpus.filesLoaded).toBeGreaterThanOrEqual(250); // measured 283
    // Every suite must resolve to a rule except the handful that legitimately
    // test no rule or a core one.
    expect(corpus.suitesDropped.length).toBeLessThanOrEqual(8); // measured 5
  });

  it('sweeps the invalid corpus it claims to', () => {
    expect(stats.considered).toBeGreaterThanOrEqual(9800); // measured 10,068
    expect(stats.rulesCovered.size).toBeGreaterThanOrEqual(180); // measured 189
    // The composed `--fix` must actually rewrite a large share of the corpus,
    // or step 2 is a no-op and every result is vacuous.
    expect(stats.rewritten).toBeGreaterThanOrEqual(3600); // measured 3,760
    // And most rewrites must leave the victim REPORTING, or the oracle is not
    // discriminating between a rewrite and a blinding at all.
    expect(stats.stillReports).toBeGreaterThanOrEqual(2900); // measured 3,059
  });

  it('keeps the decomposition exact, so no case is silently dropped', () => {
    expect(
      stats.fatalInput +
        stats.preImageSilent +
        stats.textUnchanged +
        stats.rewritten,
    ).toBe(stats.considered);
    expect(stats.stillReports + stats.candidates + stats.fatalOutput).toBe(
      stats.rewritten,
    );
    expect(stats.discountedAsHarness + findings.length).toBe(stats.candidates);
  });

  it('loses no case to a fatal parse on either side', () => {
    /**
     * A fatal parse is indistinguishable from silence once messages are
     * filtered by `ruleId`, so every case counted here would contribute a false
     * clean — on the INPUT side a fixture that never reached the control, on the
     * OUTPUT side a rewrite whose victim could not be re-asked. Asserting ZERO,
     * not a ceiling, is what makes the next such case a failure rather than a
     * rounding error (#1984, #1859).
     */
    expect(stats.fatalInput).toBe(0);
    expect(stats.fatalOutput).toBe(0);
  });

  it('reaches enough candidates, and attributes them', () => {
    expect(stats.candidates).toBeGreaterThanOrEqual(650); // measured 701
    // Attribution is what makes the baseline key mean anything; a run that
    // replayed nothing would name every pair `(unattributed)`.
    expect(stats.attributionReplays).toBeGreaterThanOrEqual(1750); // measured 1,909
    const unattributed = [...observedPairs.keys()].filter((pair) =>
      pair.startsWith('(unattributed)'),
    );
    // A few compositions genuinely need two fixers; most must name one rule.
    expect(unattributed.length).toBeLessThanOrEqual(8); // measured 4
  });

  it('discounts the harness artifacts it exists to discount', () => {
    /**
     * The `(typeof X)[number]` class. Without this arm the guard would bake 161
     * phantom pairs into its baseline and then defend them forever. Asserting
     * the population — rather than that some discount set is non-empty — is
     * what keeps the re-judge wired in: a run that stopped writing the temp
     * project would discount nothing and fail here instead of going quiet.
     */
    expect(stats.discountedAsHarness).toBeGreaterThanOrEqual(140); // measured 161
    // And the discount must not swallow the axis: most candidates survive it.
    expect(findings.length).toBeGreaterThanOrEqual(490); // measured 540
  });

  it('keeps a candidate the project re-judge could not speak about', () => {
    /**
     * A discount that fired when its own pre-image control failed would be a
     * way to make the guard green. Those cases are KEPT and counted instead, so
     * the number is small by construction and a rise in it is a signal that the
     * temp project has stopped resolving what the fixtures need.
     */
    expect(stats.projectInconclusive).toBeLessThanOrEqual(20); // measured 2
  });

  it("carries every tester's language the invalid corpus holds", () => {
    // Dropping the non-TS testers cost two registered rules their entire corpus
    // once; both ship `recommended: 'error'` with `fixable: 'code'` (#1860).
    expect([...stats.languages].sort()).toEqual(['json', 'markdown', 'ts']);
  });

  it('detects a destroyed detection (positive control)', () => {
    // The #1603 shape: a `: boolean` annotation is the victim's only carrier,
    // and a fixer that strips it takes the rule's sight with it.
    //
    // The culprit is a planted double, and the one shipped rule that reproduces
    // the same rewrite is REMOVED from the control's config. Both halves matter:
    // running the whole composed pipeline is what makes this a statement about
    // the detector rather than about a hand-built two-rule config, and dropping
    // `no-explicit-return-type` is what keeps the control proving something once
    // that pair is fixed — otherwise the double would be shadowed by a shipped
    // rule and the control would pass without the double ever firing.
    const planted = controlFixture();
    const result = probeCase(CONTROL_VICTIM, planted, planted.filename, {
      ...CONTROL_BASE,
      [CONTROL_STRIPPER_ID]: 'error',
    });

    expect(result.kind).toBe('finding');
    const finding = (result as { finding: Finding }).finding;
    expect(finding.messageIds).toEqual(['missingBooleanPrefix']);
    expect(finding.after).not.toContain(': boolean');
    // The name the rule objects to SURVIVES, which is what makes this shape a
    // blinding rather than a repair.
    expect(finding.after).toContain('function check(');
    expect(pairKey(finding)).toBe(
      `${CONTROL_STRIPPER_ID.slice(PREFIX.length)} -> ${CONTROL_VICTIM}`,
    );
  });

  it('stays silent when the rewrite preserves the carrier (negative control)', () => {
    // The same pipeline, the same victim, the same fixture, the same config —
    // and a double that rewrites the RETURN EXPRESSION instead of the
    // annotation. A green corpus means nothing if the detector fires on every
    // rewrite it is handed.
    const planted = controlFixture();
    const result = probeCase(CONTROL_VICTIM, planted, planted.filename, {
      ...CONTROL_BASE,
      [CONTROL_BODY_ID]: 'error',
    });

    // It must be the REWRITTEN-but-still-reporting outcome, not "nothing
    // happened": a control that never changed the text would prove nothing.
    expect(result.kind).toBe('stillReports');
  });

  it('holds the shipped config to the same fixture (control)', () => {
    // With only the shipped rules the annotation is stripped by the real
    // `no-explicit-return-type`, which is the #2003 pair. Pinning it here keeps
    // the planted double honest: the double reproduces a shape the config
    // genuinely produces, rather than one invented for the control.
    const planted = controlFixture();
    const result = probeCase(
      CONTROL_VICTIM,
      planted,
      planted.filename,
      RECOMMENDED,
    );
    expect(result.kind).toBe('finding');
    expect(pairKey((result as { finding: Finding }).finding)).toBe(
      `no-explicit-return-type -> ${CONTROL_VICTIM}`,
    );
  });

  it('requires the pre-image control, which is what makes silence mean loss', () => {
    // A fixture the victim is already silent on must be classified as such and
    // never reach the detector, however much the config rewrites it. Without
    // this step every rewritten valid fixture would read as a destroyed report.
    const silent: FixtureCase = {
      ...controlFixture(),
      code: 'function isCheck(): boolean {\n  return true;\n}\n',
    };
    const result = probeCase(CONTROL_VICTIM, silent, silent.filename, {
      ...RECOMMENDED,
      [CONTROL_STRIPPER_ID]: 'error',
    });
    expect(result.kind).toBe('preImageSilent');
  });
});

afterAll(() => {
  fs.rmSync(PROJECT_ROOT, { recursive: true, force: true });
});

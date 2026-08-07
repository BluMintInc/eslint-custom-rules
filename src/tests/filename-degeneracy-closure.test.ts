/**
 * A fixer may never build a name out of a degenerate FILE STEM.
 *
 * Third surface of the same defect family as `degenerate-identifier-closure`.
 * That file perturbs two inputs — a declared binding's name, and a string
 * literal's content — because a fixer that derives a replacement name from
 * either can emit text that is not an identifier (#1816) or that carries none
 * of the author's content (#1811, #1813).
 *
 * The FILENAME is a third source of the same derivation, and roughly 58 rules
 * read it. A stem of `_`, `2fa` or `---` normalizes to nothing or to a
 * digit-leading string exactly as a literal's value does, so a rule that names
 * a constant or builds an import specifier after the file is open to the same
 * two failures. Neither of the other two arms can express this input: renaming
 * a binding and rewriting a literal both leave the path untouched.
 *
 * The accounting rules are inherited from that file, and one is added:
 *
 * - The floor is on `derivationsObserved` — control runs where a benign stem
 *   made a fixer invent a name. `considered` stays high even if no rule reads
 *   the path at all, so it proves nothing on its own
 *   ([[floor-the-asserted-not-examined-count]]).
 * - Validity is `ts.createSourceFile(...).parseDiagnostics`, never a reparse.
 * - An unreadable baseline is COUNTED and asserted at zero rather than folded
 *   into "derived nothing" — the #1820 failure, where a counter placed past the
 *   skip it measured read 0 while 42% of a sweep went unscored.
 *
 * NON-VACUITY IS PER-RULE (#1863). `rewritten > 5000` against 11,312 and
 * `rulesDeriving.size >= 40` against 53 are global sums, so a rule's whole
 * contribution can vanish inside either. Both dimensions are closed per rule
 * below: every fixable rule must have rewritten under a degenerate stem, and
 * must either derive a name or be named with the measured cause it does not.
 *
 * Two things about the perturbation are load-bearing:
 *
 * - Only the LEADING dot-segment of the basename is replaced, so
 *   `useThing.test.tsx` becomes `_.test.tsx`. Replacing the whole basename
 *   drops the extension and any tester infix, which changes the parse dialect
 *   and makes fixtures read as fatal rather than as findings.
 * - Derived STRING literals are compared as well as derived identifiers. A
 *   filename-derived name usually reaches the output as an import specifier
 *   first, and an identifier-only diff is blind to the whole
 *   `import { X } from '...'` class.
 */
import { Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import * as ts from 'typescript';
import * as path from 'path';
import {
  harvestFixtureCorpus,
  defaultFilenameFor,
  parserOptionsFor,
  silentWithoutProgramRuleNames,
  ruleNameByIdentity,
  FixtureCase,
} from '../utils/fixtureCorpus';

const ruleByName = new Map<string, { meta?: { fixable?: unknown } }>(
  [...ruleNameByIdentity].map(([rule, name]) => [
    name,
    rule as { meta?: { fixable?: unknown } },
  ]),
);

const linter = new Linter();
linter.defineParser('ts', tsParser as never);
for (const [name, rule] of ruleByName) {
  linter.defineRule(`b/${name}`, rule as never);
}

/** A stem that survives every normalization with content left over. */
const CONTROL_STEM = 'ordinaryName';

/**
 * Stems that normalization folds away or that cannot start an identifier: `_`
 * empties a leading-underscore strip, `2fa` survives it but leads with a digit,
 * and `---` collapses to nothing once non-alphanumerics are dropped.
 */
const DEGENERATE_STEMS = ['_', '_1', '2fa', '---'] as const;

const parseErrorCount = (code: string, filename: string) => {
  const kind = filename.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    filename,
    code,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  return (sourceFile as unknown as { parseDiagnostics: unknown[] })
    .parseDiagnostics.length;
};

/**
 * Replace only the leading dot-segment, preserving the extension and any
 * `.test` / `.f` infix a rule keys on.
 */
const withStem = (filename: string, stem: string) => {
  const dir = path.dirname(filename);
  const parts = path.basename(filename).split('.');
  parts[0] = stem;
  const next = parts.join('.');
  return dir === '.' ? next : `${dir}/${next}`;
};

/**
 * `range: true` is load-bearing: without it `tsParser.parse` throws on ANY JSX
 * input, which a bare catch reports as unreadable and silently withholds from
 * the sweep (#1820).
 */
const astOf = (code: string, jsx: boolean): unknown | null => {
  try {
    return tsParser.parse(code, {
      range: true,
      loc: false,
      sourceType: 'module',
      ecmaFeatures: { jsx },
    });
  } catch {
    return null;
  }
};

const walk = (
  node: unknown,
  visit: (node: Record<string, unknown>) => void,
) => {
  if (!node || typeof node !== 'object') return;
  const candidate = node as Record<string, unknown>;
  visit(candidate);
  for (const key of Object.keys(candidate)) {
    if (key === 'parent') continue;
    const value = candidate[key];
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
};

const identifierNamesOf = (code: string, jsx: boolean): Set<string> | null => {
  const ast = astOf(code, jsx);
  if (!ast) return null;
  const names = new Set<string>();
  walk(ast, (node) => {
    if (node.type === 'Identifier' && typeof node.name === 'string') {
      names.add(node.name);
    }
  });
  return names;
};

const stringValuesOf = (code: string, jsx: boolean): Set<string> | null => {
  const ast = astOf(code, jsx);
  if (!ast) return null;
  const values = new Set<string>();
  walk(ast, (node) => {
    if (node.type === 'Literal' && typeof node.value === 'string') {
      values.add(node.value);
    }
  });
  return values;
};

/**
 * What a fix INVENTED: present in the output, absent from the input. Null when
 * either side is unreadable, so the caller can count that rather than score it.
 */
const invented = (
  reader: (code: string, jsx: boolean) => Set<string> | null,
  input: string,
  output: string | null,
  jsx: boolean,
): Set<string> | null => {
  if (!output) return new Set<string>();
  const before = reader(input, jsx);
  const after = reader(output, jsx);
  if (!before || !after) return null;
  return new Set([...after].filter((value) => !before.has(value)));
};

/**
 * Does `degenerate` carry nothing of the content that `control` carried?
 *
 * Differential rather than a naming predicate, so it needs no per-rule affix
 * list and stays silent for a fixer that declines. `degenerate` splits into
 * `head + tail` with `control === head + <something non-empty> + tail`, which
 * catches the collapse at whichever end the rule puts its constant part — a
 * `startsWith`-only test answers "clean" for every suffix builder (#1819).
 *
 * Names the two runs SHARE are dropped before pairing, and that is load-bearing
 * rather than an optimization. A name identical under both stems did not come
 * from the stem — it is invented from something else in the source, so it
 * belongs to neither side of the comparison. Left in, every short shared name
 * pairs with every longer shared one: `prefer-map-over-conditional-dispatch`
 * emits byte-identical output under both stems and was still flagged, because
 * `d` splits as `'' + 'd'` and `Record` both starts with `''` and ends with
 * `d`. The existing "identical derivation" control catches only the exact pair;
 * this is that rule applied to the whole set.
 */
const collapsedAgainst = (control: Set<string>, degenerate: Set<string>) => {
  const stemDerived = [...degenerate].filter((name) => !control.has(name));
  const stemDerivedControl = [...control].filter(
    (name) => !degenerate.has(name),
  );
  for (const derived of stemDerived) {
    for (const reference of stemDerivedControl) {
      if (reference.length <= derived.length) continue;
      for (let split = 0; split <= derived.length; split++) {
        const head = derived.slice(0, split);
        const tail = derived.slice(split);
        if (
          reference.startsWith(head) &&
          reference.endsWith(tail) &&
          reference.length > head.length + tail.length
        ) {
          return { derivedDegenerate: derived, derivedControl: reference };
        }
      }
    }
  }
  return null;
};

/**
 * Only rules that measurably report NOTHING under this harness are excluded —
 * currently none. The wider "mentions the type checker" set was excluded before
 * on the theory that a bare `Linter` has no program; it has one (isolated,
 * single-file), and all 16 of those rules report over their own fixtures, so the
 * exclusion was suppressing live coverage rather than a false clean (#1859).
 */
const fixableRuleNames = [...ruleByName]
  .filter(([, rule]) => rule.meta?.fixable)
  .map(([name]) => name)
  .filter((name) => !silentWithoutProgramRuleNames.has(name));

const corpus = harvestFixtureCorpus();

type Finding = {
  kind: 'parse' | 'collapsed-name' | 'collapsed-string';
  rule: string;
  origin: string;
  stem: string;
  filename: string;
  derivedControl: string;
  derivedDegenerate: string;
  input: string;
  output: string;
};

/**
 * Fixtures this guard's probe cannot be applied to, named per (guard, rule)
 * with the reason.
 *
 * The probe renames the FILE a fixture is linted as and asks what the fixer
 * derives from the new stem, comparing the two TypeScript outputs.
 * A `package.json` body and a Markdown document have neither, so a case in
 * either language cannot pose the question. Skipping by LANGUAGE rather than by
 * parse failure is what keeps the skip honest: a Markdown fence is an empty
 * template literal, so several of those fixtures do parse as TypeScript and
 * would otherwise answer a TypeScript question by accident (#1860).
 *
 * A rule-global exclusion would be the wrong instrument — it would un-gate every
 * other arm these rules participate in (#1839) — so the entry is scoped to this
 * guard and asserted in both directions below.
 */
const NON_TYPESCRIPT_FIXTURES: Record<string, string> = {
  'enforce-typescript-markdown-code-blocks':
    'declares only Markdown documents, under ruleTesterMarkdown',
  'no-unpinned-dependencies':
    'declares only package.json bodies, under ruleTesterJson',
  'prefer-nullish-coalescing-boolean-props':
    'declares one package.json body under ruleTesterJson alongside its TypeScript fixtures',
};

const findings: Finding[] = [];
let considered = 0;
let nonTypeScriptSkipped = 0;
const rulesWithNonTypeScriptFixtures = new Set<string>();
let rewritten = 0;
let derivationsObserved = 0;
let discardedUnparsable = 0;
let unreadableControl = 0;
let unreadableComparison = 0;
const rulesRewritten = new Set<string>();
const rulesDeriving = new Set<string>();

/**
 * The same counters, per rule. The aggregates above answer "did the sweep do
 * some work"; only these answer "did it do work for THIS rule", and the two
 * differ exactly when a subset regresses (#1863).
 */
type Drive = {
  /** TypeScript `invalid` fixtures reaching the probe. */
  tsCases: number;
  /** Those the harness could not parse under their own baseline filename. */
  unparsable: number;
  /** Fixtures the fixer rewrote under the benign CONTROL stem. */
  controlFixes: number;
  /** Control rewrites that INVENTED an identifier or a string literal. */
  derivations: number;
  /** Rewrites observed under a degenerate stem — the actual comparison. */
  degenerateRewrites: number;
};

const driveByRule = new Map<string, Drive>();
const driveOf = (rule: string): Drive => {
  const existing = driveByRule.get(rule);
  if (existing) return existing;
  const fresh: Drive = {
    tsCases: 0,
    unparsable: 0,
    controlFixes: 0,
    derivations: 0,
    degenerateRewrites: 0,
  };
  driveByRule.set(rule, fresh);
  return fresh;
};

for (const rule of fixableRuleNames) {
  const cases = (corpus.byRule.get(rule) || []).filter(
    (testCase: FixtureCase) => {
      if (testCase.language !== 'ts') {
        nonTypeScriptSkipped++;
        rulesWithNonTypeScriptFixtures.add(rule);
        return false;
      }
      return testCase.bucket === 'invalid';
    },
  );
  const drive = driveOf(rule);
  for (const testCase of cases) {
    const baseline = testCase.filename ?? defaultFilenameFor(testCase);
    const jsx = baseline.endsWith('x');
    drive.tsCases++;

    if (parseErrorCount(testCase.code, baseline) > 0) {
      discardedUnparsable++;
      drive.unparsable++;
      continue;
    }

    const config = {
      parser: 'ts',
      parserOptions: parserOptionsFor(testCase),
      rules: {
        [`b/${rule}`]: testCase.options?.length
          ? ['error', ...testCase.options]
          : 'error',
      },
    } as never;

    const runFix = (filename: string) => {
      try {
        const result = linter.verifyAndFix(testCase.code, config, filename);
        return result.fixed && result.output !== testCase.code
          ? result.output
          : null;
      } catch {
        return null;
      }
    };

    const controlOutput = runFix(withStem(baseline, CONTROL_STEM));
    const controlNames = invented(
      identifierNamesOf,
      testCase.code,
      controlOutput,
      jsx,
    );
    const controlStrings = invented(
      stringValuesOf,
      testCase.code,
      controlOutput,
      jsx,
    );
    if (!controlNames || !controlStrings) {
      unreadableControl++;
      continue;
    }
    if (controlOutput) drive.controlFixes++;
    if (controlNames.size || controlStrings.size) {
      derivationsObserved++;
      drive.derivations++;
      rulesDeriving.add(rule);
    }

    for (const stem of DEGENERATE_STEMS) {
      const filename = withStem(baseline, stem);
      if (filename === baseline) continue;
      considered++;
      const output = runFix(filename);
      if (!output) continue;
      rewritten++;
      drive.degenerateRewrites++;
      rulesRewritten.add(rule);

      if (parseErrorCount(output, filename) > 0) {
        findings.push({
          kind: 'parse',
          rule,
          origin: testCase.origin,
          stem,
          filename,
          derivedControl: '',
          derivedDegenerate: '',
          input: testCase.code,
          output,
        });
        continue;
      }

      const names = invented(identifierNamesOf, testCase.code, output, jsx);
      const strings = invented(stringValuesOf, testCase.code, output, jsx);
      if (!names || !strings) {
        unreadableComparison++;
        continue;
      }

      const nameCollapse = controlNames.size
        ? collapsedAgainst(controlNames, names)
        : null;
      if (nameCollapse) {
        findings.push({
          kind: 'collapsed-name',
          rule,
          origin: testCase.origin,
          stem,
          filename,
          ...nameCollapse,
          input: testCase.code,
          output,
        });
        continue;
      }
      const stringCollapse = controlStrings.size
        ? collapsedAgainst(controlStrings, strings)
        : null;
      if (stringCollapse) {
        findings.push({
          kind: 'collapsed-string',
          rule,
          origin: testCase.origin,
          stem,
          filename,
          ...stringCollapse,
          input: testCase.code,
          output,
        });
      }
    }
  }
}

/**
 * Why a fixable rule could never have been driven with a degenerate stem, read
 * off the counters above rather than asserted by hand.
 *
 * Ordered outermost precondition first, so the cause named is the FIRST that
 * failed: a rule with no TypeScript fixture is not also "invents no name", it
 * was never linted here at all.
 */
const UNDRIVEN_CAUSES = {
  noCorpus:
    'the harvest holds no fixture for it, so nothing was ever handed to its fixer',
  noTsFixture:
    'declares no TypeScript `invalid` fixture, and a file stem is a TypeScript question',
  everyFixtureUnparsable:
    'every fixture fails to parse under its own baseline filename, so no comparison has a control',
  neverRewritesItsOwnFixtures:
    'declares meta.fixable yet rewrites none of its own fixtures under any stem, so there is no output to inspect',
  inventsNoName:
    'rewrites its fixtures without introducing any identifier or string literal absent from the input, so no derived name exists for a stem to collapse',
} as const;
type UndrivenCause = keyof typeof UNDRIVEN_CAUSES;

const rewriteCauseOf = (rule: string): UndrivenCause | null => {
  const drive = driveByRule.get(rule);
  if (!corpus.byRule.has(rule)) return 'noCorpus';
  if (!drive || drive.tsCases === 0) return 'noTsFixture';
  if (drive.unparsable === drive.tsCases) return 'everyFixtureUnparsable';
  if (drive.degenerateRewrites === 0) return 'neverRewritesItsOwnFixtures';
  return null;
};

/**
 * The DERIVATION arm asks a strictly narrower question than the rewrite arm —
 * whether the fixer invents a name at all — so it gets its own accounting. A
 * rule that only deletes, moves or reorders text answers "no" permanently, and
 * that is a fact worth naming rather than a number worth flooring.
 */
const derivationCauseOf = (rule: string): UndrivenCause | null => {
  const drive = driveByRule.get(rule);
  const earlier = rewriteCauseOf(rule);
  if (earlier) return earlier;
  return drive && drive.derivations === 0 ? 'inventsNoName' : null;
};

const measuredUndriven = (
  causeOf: (rule: string) => UndrivenCause | null,
): Record<string, UndrivenCause> =>
  Object.fromEntries(
    [...fixableRuleNames]
      .sort()
      .map((rule) => [rule, causeOf(rule)] as const)
      .filter((entry): entry is readonly [string, UndrivenCause] => !!entry[1]),
  );

const measuredRewriteUndriven = measuredUndriven(rewriteCauseOf);
const measuredDerivationUndriven = measuredUndriven(derivationCauseOf);

/**
 * Fixable rules no degenerate stem ever made rewrite anything, each with the
 * measured cause.
 *
 * The `rewritten > 5000` floor below cannot say that any PARTICULAR rule
 * contributed one of those rewrites, and 81 rules sharing an 11,312 total means
 * a rule can drop to zero without moving it (#1863). Asserted as an exact map,
 * so an unrecorded skip, a stale entry and a changed cause all fail.
 */
const REWRITE_UNDRIVEN: Record<string, UndrivenCause> = {
  'enforce-typescript-markdown-code-blocks': 'noTsFixture',
  'no-unpinned-dependencies': 'noTsFixture',
  // Declares `fixable: 'code'` and emits no fix over any of its 105 fixtures
  // (#1871), so there is no output to read a derived name out of. Fixing that
  // rule retires this entry.
  'no-usememo-for-pass-by-value': 'neverRewritesItsOwnFixtures',
};

/**
 * Fixable rules whose fixes invent nothing, each with the measured cause.
 *
 * `inventsNoName` is not a defect and not a decision: it is what a fixer that
 * only DELETES (`no-unused-usestate`), MOVES (`jsdoc-above-field`,
 * `class-methods-read-top-to-bottom`) or REPLACES with a keyword
 * (`prefer-type-over-interface`) does, and the collapse this file hunts needs an
 * invented name to collapse. Recorded rather than counted, because `rulesDeriving
 * .size >= 40` against an actual 53 lets thirteen of them go dark unheard, and
 * because a rule LEAVING this list has started deriving a name from something —
 * which is precisely the population this guard exists to watch.
 */
const DERIVATION_UNDRIVEN: Record<string, UndrivenCause> = {
  ...REWRITE_UNDRIVEN,
  'class-methods-read-top-to-bottom': 'inventsNoName',
  'enforce-early-destructuring': 'inventsNoName',
  'enforce-exported-function-types': 'inventsNoName',
  'enforce-unique-cursor-headers': 'inventsNoName',
  'flatten-push-calls': 'inventsNoName',
  'jsdoc-above-field': 'inventsNoName',
  'key-only-outermost-element': 'inventsNoName',
  'logical-top-to-bottom-grouping': 'inventsNoName',
  'no-curly-brackets-around-commented-properties': 'inventsNoName',
  'no-direct-function-state': 'inventsNoName',
  'no-empty-dependency-use-callbacks': 'inventsNoName',
  'no-entire-object-hook-deps': 'inventsNoName',
  'no-explicit-return-type': 'inventsNoName',
  'no-redundant-annotation-assertion': 'inventsNoName',
  'no-redundant-param-types': 'inventsNoName',
  'no-redundant-usecallback-wrapper': 'inventsNoName',
  'no-unnecessary-destructuring': 'inventsNoName',
  'no-unnecessary-destructuring-rename': 'inventsNoName',
  'no-unused-usestate': 'inventsNoName',
  'no-useless-fragment': 'inventsNoName',
  'no-useless-usememo-primitives': 'inventsNoName',
  'prefer-block-comments-for-declarations': 'inventsNoName',
  'prefer-destructuring-no-class': 'inventsNoName',
  'prefer-fragment-shorthand': 'inventsNoName',
  'prefer-nullish-coalescing-boolean-props': 'inventsNoName',
  'prefer-type-over-interface': 'inventsNoName',
  'require-hooks-default-params': 'inventsNoName',
  'vertically-group-related-functions': 'inventsNoName',
};

describe('filename-degeneracy fix closure', () => {
  /**
   * The non-TypeScript skip, both ways. An unlisted rule whose fixtures get
   * skipped is a silent loss of coverage; a listed rule whose fixtures stop
   * being skipped is a dead entry that would absorb the next one. The count
   * floor keeps the set equality from passing vacuously.
   */
  it('skips only the named non-TypeScript fixtures', () => {
    expect([...rulesWithNonTypeScriptFixtures].sort()).toEqual(
      Object.keys(NON_TYPESCRIPT_FIXTURES).sort(),
    );
    expect(nonTypeScriptSkipped).toBeGreaterThan(0);
  });

  it('harvested a corpus at all', () => {
    expect(corpus.failures).toEqual([]);
    expect(corpus.filesLoaded).toBeGreaterThan(250);
    expect(fixableRuleNames.length).toBeGreaterThanOrEqual(70);
  });

  it('actually drove fixers with a degenerate file stem', () => {
    // Naming the complement keeps the reach quoted as ASSERTED rather than
    // examined: the deriving count means "a name was invented from the path at
    // all", and the rest are unexercised, not certified clean.
    const notDeriving = fixableRuleNames.filter(
      (name) => !rulesDeriving.has(name),
    );
    // eslint-disable-next-line no-console
    console.log(
      `[filename-degeneracy] considered ${considered}, rewritten ${rewritten} across ` +
        `${rulesRewritten.size} rule(s); derivations ${derivationsObserved} across ` +
        `${rulesDeriving.size} rule(s); discarded ${discardedUnparsable}, ` +
        `unreadable controls ${unreadableControl}, ` +
        `unreadable comparisons ${unreadableComparison}\n` +
        `  never observed deriving from the path (${notDeriving.length}): ${
          notDeriving.join(', ') || '(none)'
        }`,
    );
    // A baseline the harness cannot read withholds its whole fixture while
    // every other counter still reads clean (#1820).
    expect(unreadableControl).toBe(0);
    expect(considered).toBeGreaterThan(8000);
    expect(rewritten).toBeGreaterThan(5000);
    expect(derivationsObserved).toBeGreaterThan(1200);
    expect(rulesDeriving.size).toBeGreaterThanOrEqual(40);
  });

  /**
   * Both arms, both directions. An unlisted rule that stops rewriting (or stops
   * deriving) fails as an unrecorded skip; a listed rule that starts fails as a
   * stale entry, which is what keeps an exemption from outliving its reason
   * (#1839).
   */
  it('accounts for every fixable rule no degenerate stem could drive', () => {
    expect(measuredRewriteUndriven).toEqual(REWRITE_UNDRIVEN);
    expect(fixableRuleNames.length).toBeGreaterThanOrEqual(70);
  });

  it('accounts for every fixable rule that derives no name at all', () => {
    expect(measuredDerivationUndriven).toEqual(DERIVATION_UNDRIVEN);
  });

  it('explains every cause it records, on a rule it actually probes', () => {
    const causes = [
      ...Object.values(REWRITE_UNDRIVEN),
      ...Object.values(DERIVATION_UNDRIVEN),
    ];
    expect(causes.filter((cause) => !UNDRIVEN_CAUSES[cause])).toEqual([]);
    // An entry naming a rule outside the probed population is an exemption
    // nothing can retire, so it would absorb the next absence forever.
    expect(
      [
        ...Object.keys(REWRITE_UNDRIVEN),
        ...Object.keys(DERIVATION_UNDRIVEN),
      ].filter((rule) => !fixableRuleNames.includes(rule)),
    ).toEqual([]);
  });

  /**
   * Per rule, stated as its own row rather than left implicit in the map
   * equality: a green row over a rule the sweep never rewrote is worse than a
   * missing one, because it names the rule in the jest output (#1861).
   */
  it.each(
    [...fixableRuleNames].sort().filter((rule) => !(rule in REWRITE_UNDRIVEN)),
  )('rewrote %s under a degenerate stem', (rule) => {
    expect(driveByRule.get(rule)?.degenerateRewrites || 0).toBeGreaterThan(0);
  });

  it('no fixer derives a broken or collapsed name from the file stem', () => {
    const byRule = [...new Set(findings.map((finding) => finding.rule))];
    const header = byRule.length
      ? `${findings.length} finding(s) across ${
          byRule.length
        } rule(s): ${byRule.join(', ')}\n`
      : '';
    const report =
      header +
      findings
        .slice(0, 20)
        .map((finding) =>
          finding.kind === 'parse'
            ? `${finding.rule} (${finding.origin}) stem ${JSON.stringify(
                finding.stem,
              )} -> output does not parse\n  OUT: ${JSON.stringify(
                finding.output,
              )}`
            : `${finding.rule} (${finding.origin}) stem ${JSON.stringify(
                finding.stem,
              )} derived ${
                finding.derivedDegenerate
              } where a real stem derives ` +
              `${finding.derivedControl}\n  IN : ${JSON.stringify(
                finding.input,
              )}\n  OUT: ${JSON.stringify(finding.output)}`,
        )
        .join('\n');
    expect(report).toBe('');
    expect(findings).toEqual([]);
  });

  /**
   * Positive control: a fixer that builds an identifier out of the stem without
   * checking what is left of it. Without this the sweep could pass by never
   * comparing anything, which is how the shipped literal arm passed while two
   * defects of this exact shape were live.
   */
  it('catches a planted fixer whose name collapses with the stem', () => {
    const planted = {
      meta: {
        type: 'suggestion',
        fixable: 'code',
        schema: [],
        messages: { rename: 'rename' },
      },
      create(context: {
        report: (descriptor: unknown) => void;
        getFilename: () => string;
      }) {
        const stem = path.basename(context.getFilename()).split('.')[0];
        return {
          VariableDeclarator(node: {
            id: { type: string; name: string; range: [number, number] };
          }) {
            if (node.id.type !== 'Identifier') return;
            const derived = stem.toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (derived === node.id.name) return;
            context.report({
              node: node.id,
              messageId: 'rename',
              fix: (fixer: {
                replaceTextRange: (r: [number, number], t: string) => unknown;
              }) => fixer.replaceTextRange(node.id.range, `QK_${derived}`),
            });
          },
        };
      },
    };
    linter.defineRule('planted/fromStem', planted as never);
    const config = {
      parser: 'ts',
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: { 'planted/fromStem': 'error' },
    } as never;
    const source = 'const thing = { a: 1 };\n';
    const fixOf = (stem: string) =>
      linter.verifyAndFix(source, config, withStem('src/useThing.ts', stem))
        .output;

    expect(fixOf(CONTROL_STEM)).toContain('QK_ORDINARYNAME');
    expect(fixOf('---')).toContain('QK_ ');

    expect(
      collapsedAgainst(
        invented(identifierNamesOf, source, fixOf(CONTROL_STEM), false) ??
          new Set<string>(),
        invented(identifierNamesOf, source, fixOf('---'), false) ??
          new Set<string>(),
      ),
    ).toEqual({
      derivedDegenerate: 'QK_',
      derivedControl: 'QK_ORDINARYNAME',
    });
  });

  /**
   * Positive control for the other failure mode: applying the derived text
   * blind yields source that is not parseable at all (#1816's shape, reached
   * through the path instead of through a binding).
   */
  it('catches a planted fixer that renames to a non-identifier stem', () => {
    const planted = {
      meta: {
        type: 'suggestion',
        fixable: 'code',
        schema: [],
        messages: { rename: 'rename' },
      },
      create(context: {
        report: (descriptor: unknown) => void;
        getFilename: () => string;
      }) {
        const stem = path.basename(context.getFilename()).split('.')[0];
        return {
          VariableDeclarator(node: {
            id: { type: string; name: string; range: [number, number] };
          }) {
            if (node.id.type !== 'Identifier') return;
            const derived = stem.toUpperCase().replace(/^_/, '');
            if (derived === node.id.name) return;
            context.report({
              node: node.id,
              messageId: 'rename',
              fix: (fixer: {
                replaceTextRange: (r: [number, number], t: string) => unknown;
              }) => fixer.replaceTextRange(node.id.range, derived),
            });
          },
        };
      },
    };
    linter.defineRule('planted/brokenStem', planted as never);
    const config = {
      parser: 'ts',
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: { 'planted/brokenStem': 'error' },
    } as never;
    const output = linter.verifyAndFix(
      'const thing = { a: 1 };\n',
      config,
      '_.ts',
    ).output;
    expect(output).toContain('const  =');
    expect(parseErrorCount(output, '_.ts')).toBeGreaterThan(0);
  });

  /**
   * Negative control: a fixer that declines, or that derives a merely different
   * name, must not be reported — otherwise the arm would pass by calling every
   * rewrite a collapse.
   */
  it('does not flag a decline or a merely different derivation', () => {
    expect(
      collapsedAgainst(new Set(['QK_ORDINARYNAME']), new Set()),
    ).toBeNull();
    expect(
      collapsedAgainst(new Set(['QK_ORDINARYNAME']), new Set(['QK_FALLBACK'])),
    ).toBeNull();
    expect(
      collapsedAgainst(
        new Set(['QK_ORDINARYNAME']),
        new Set(['QK_ORDINARYNAME']),
      ),
    ).toBeNull();
    // Nor a fixer whose invented names are the SAME set under both stems, which
    // means none of them was derived from the path. Pairing across the shared
    // set flagged `prefer-map-over-conditional-dispatch` on output that is
    // byte-identical under the control and the degenerate stem (#1859).
    const shared = () => new Set(['Record', 'RESULT_BY_RAW', 'a', 'd']);
    expect(collapsedAgainst(shared(), shared())).toBeNull();
    // A genuine collapse alongside shared names is still caught, so the filter
    // suppresses the pairing artifact and not the defect.
    expect(
      collapsedAgainst(
        new Set(['Record', 'd', 'QK_ORDINARYNAME']),
        new Set(['Record', 'd', 'QK_']),
      ),
    ).toEqual({
      derivedDegenerate: 'QK_',
      derivedControl: 'QK_ORDINARYNAME',
    });
  });

  /** The stem perturbation must preserve the extension and any tester infix. */
  it('replaces only the leading segment of the basename', () => {
    expect(withStem('src/useThing.test.tsx', '_')).toBe('src/_.test.tsx');
    expect(withStem('useThing.ts', '2fa')).toBe('2fa.ts');
    expect(withStem('src/deep/entry.f.ts', '---')).toBe('src/deep/---.f.ts');
  });

  /** Pins the parser option the whole sweep's reach depends on (#1820). */
  it('reads identifiers out of JSX, not just plain TypeScript', () => {
    const names = identifierNamesOf(
      'const List = ({ items }) => (<ul>{items.map((i) => (<li>{i}</li>))}</ul>);\n',
      true,
    );
    expect(names).not.toBeNull();
    expect([...(names as Set<string>)]).toEqual(
      expect.arrayContaining(['List', 'items']),
    );
  });
});

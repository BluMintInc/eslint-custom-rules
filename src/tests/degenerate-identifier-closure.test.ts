/**
 * A fixer may never emit source that does not parse.
 *
 * Several rules build a replacement NAME by transforming an existing one —
 * stripping non-alphanumerics, uppercasing, dropping a leading `_`, flipping
 * `charAt(0)`. Those transforms are total functions on text but partial ones on
 * *identifiers*: `_` derives the empty string and `_1`/`_2fa` derive `1`/`2FA`,
 * none of which can be an identifier. A fixer that applies the derived text
 * unconditionally exits 0 having written a file that no longer compiles
 * (#1811, #1813, #1816).
 *
 * Every other corpus guard is structurally blind to this. They lint the
 * fixtures as written, and no fixture was written with a pathological name, so
 * `fixer-type-safety`, `recommended-config-fix-closure` and
 * `fixture-corpus-parsability` all passed while #1816 shipped. The missing
 * ingredient is PERTURBATION: make the input degenerate first, then ask whether
 * the fixer still emits code.
 *
 * It takes TWO arms to cover the three defects, because they degenerate in
 * different places and fail in different ways (#1818):
 *
 * - **Rename a declared binding** to `_`, `_1`, `_2fa`, `$` and require the
 *   output to PARSE. This reaches #1816, whose derived text is not a legal
 *   identifier at all.
 * - **Rewrite a string literal's content** to a value normalization folds away
 *   (`''`, `'   '`, `'---'`) and compare the derived name against a control run
 *   on a value with content. This reaches #1811/#1813, and parseability cannot:
 *   `QUERY_KEY_` is a perfectly legal identifier, so the first arm's assertion
 *   is green on it by construction. Only the differential shows that the
 *   author's value vanished and the rule's constant affix is all that survived
 *   — at whichever end the rule puts it (#1819).
 *
 * The first arm shipped alone, citing all three issues. Reverting #1811 and
 * #1813 left it green — the corpus could not express their trigger and the
 * assertion could not have failed on it. Both directions of that audit are the
 * acceptance test for this file; a planted control alone would not have shown
 * it, since a plant passes even when the corpus reaches no real rule.
 *
 * Three accounting rules make the result mean something:
 *
 * - The floor is on inputs actually REWRITTEN, not inputs considered. A
 *   perturbation pass that triggers no fixer proves nothing, and a
 *   considered-count hides that ([[floor-the-asserted-not-examined-count]]).
 *   For the literal arm the load-bearing floor is stricter still: a control run
 *   that actually INVENTED a name, which is the only evidence the sweep reached
 *   a derive-from-text fixer rather than merely rewriting near one.
 * - Validity is `ts.createSourceFile(...).parseDiagnostics`, never a reparse:
 *   `typescript-estree` recovers from syntax errors and hands back a tree, so a
 *   corrupt rewrite would read as clean.
 * - A pair that fails to parse is SKIPPED, never scored. Treating an unreadable
 *   baseline as "no identifiers" reports the whole output as newly derived and
 *   manufactures findings out of harness artifacts.
 * - An unreadable baseline is COUNTED and asserted at zero. Skipping it quietly
 *   is the mirror failure: `tsParser.parse` needs `range: true` or it throws on
 *   all JSX, and folding that null into "derived nothing" withheld 42% of the
 *   literal arm's derivations and 11 rules while every counter read clean
 *   (#1820). A counter placed past the skip it is meant to measure can only
 *   ever report zero.
 *
 * The perturbation is deliberately allowed to change meaning — it may collide
 * with an existing binding or rename a property. That is sound here because the
 * assertion is not "the fix is correct" but "the fix is *syntax*" and "the fix
 * carries the author's content", neither of which any input licenses a fixer to
 * violate.
 */
import { Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import * as ts from 'typescript';
import {
  harvestFixtureCorpus,
  defaultFilenameFor,
  parserOptionsFor,
  typeAwareRuleNames,
  ruleNameByIdentity,
  FixtureCase,
} from '../utils/fixtureCorpus';

/**
 * Inverting the corpus's identity map avoids a second `require` of the plugin
 * and keeps this guard keyed on the same rule objects the corpus matched
 * suites by, so a rule can never be registered here under a name the corpus
 * resolved differently.
 */
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

/**
 * Names chosen so that each defeats a different derivation: `_` empties a
 * leading-underscore strip, `_1`/`_2fa` survive the strip but start with a
 * digit, and `$` survives every transform while satisfying no naming
 * convention, which is how an unsatisfiable report hides.
 */
const DEGENERATE_NAMES = ['_', '_1', '_2fa', '$'] as const;

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
 * Declared bindings only. Renaming a *reference* would strand it, which breaks
 * the input rather than the fixer and manufactures findings the rule does not
 * own.
 */
const declaredNamesOf = (code: string, jsx: boolean): string[] => {
  let ast: { body?: unknown };
  try {
    ast = tsParser.parse(code, {
      range: true,
      loc: false,
      ecmaFeatures: { jsx },
    }) as never;
  } catch {
    return [];
  }
  const names = new Set<string>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const candidate = node as Record<string, never>;
    const type = candidate.type as unknown as string | undefined;
    if (
      type === 'VariableDeclarator' ||
      type === 'FunctionDeclaration' ||
      type === 'ClassDeclaration'
    ) {
      const id = candidate.id as unknown as
        | { type?: string; name?: string }
        | undefined;
      if (id && id.type === 'Identifier' && id.name) names.add(id.name);
    }
    for (const key of Object.keys(candidate)) {
      if (key === 'parent') continue;
      const value = candidate[key] as unknown;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(ast);
  return [...names];
};

const renameWholeWord = (code: string, from: string, to: string) =>
  code.replace(
    new RegExp(`(?<![$\\w])${from.replace(/\$/g, '\\$')}(?![$\\w])`, 'g'),
    to,
  );

/**
 * The second perturbation surface: the CONTENT of a string literal.
 *
 * Renaming bindings reaches #1816 but cannot reach #1811/#1813, whose trigger is
 * a key VALUE that normalization folds away (`useRouterState({ key: '---' })`).
 * Those derivations read a literal, not an identifier, so no rename expresses
 * their input and the gate that shipped for them could not fail on them.
 */
const stringLiteralRangesOf = (
  code: string,
  jsx: boolean,
): [number, number][] => {
  let ast: unknown;
  try {
    ast = tsParser.parse(code, {
      range: true,
      loc: false,
      sourceType: 'module',
      ecmaFeatures: { jsx },
    });
  } catch {
    return [];
  }
  const ranges: [number, number][] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const candidate = node as Record<string, unknown>;
    if (
      candidate.type === 'Literal' &&
      typeof candidate.value === 'string' &&
      Array.isArray(candidate.range)
    ) {
      ranges.push([...(candidate.range as number[])] as [number, number]);
    }
    for (const key of Object.keys(candidate)) {
      if (key === 'parent') continue;
      const value = candidate[key];
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(ast);
  return ranges;
};

/**
 * Every identifier in `code`, or null when it does not parse.
 *
 * Null rather than an empty set, and the callers must skip on it. Defaulting to
 * empty makes an unparsable BASELINE report every identifier in the output as
 * newly derived: `sourceType` defaults to `script`, so a fixture carrying an
 * `import` threw here, and a fixer that removes the import produced an output
 * that parsed — manufacturing a phantom derivation out of a harness artifact.
 *
 * `range: true` is load-bearing, not cosmetic. Without it `tsParser.parse`
 * throws `Cannot read properties of undefined (reading '0')` on ANY JSX input,
 * which this helper catches and reports as unreadable. That silently withheld
 * 1585 of 3164 invalid fixtures from the literal arm — 42% of its derivations
 * and 11 whole rules — while every counter still read clean.
 */
const identifierNamesOf = (code: string, jsx: boolean): Set<string> | null => {
  const names = new Set<string>();
  let ast: unknown;
  try {
    ast = tsParser.parse(code, {
      range: true,
      loc: false,
      sourceType: 'module',
      ecmaFeatures: { jsx },
    });
  } catch {
    return null;
  }
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const candidate = node as Record<string, unknown>;
    if (candidate.type === 'Identifier' && typeof candidate.name === 'string') {
      names.add(candidate.name);
    }
    for (const key of Object.keys(candidate)) {
      if (key === 'parent') continue;
      const value = candidate[key];
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(ast);
  return names;
};

const spliceRange = (
  code: string,
  [start, end]: [number, number],
  text: string,
) => code.slice(0, start) + text + code.slice(end);

/**
 * The names a fix INVENTED: present in the output, absent from the input.
 * Null when either side fails to parse, so an unreadable pair is skipped rather
 * than counted as a derivation.
 */
const derivedNames = (
  input: string,
  output: string | null,
  jsx: boolean,
): Set<string> | null => {
  if (!output) return new Set<string>();
  const before = identifierNamesOf(input, jsx);
  const after = identifierNamesOf(output, jsx);
  if (!before || !after) return null;
  return new Set([...after].filter((name) => !before.has(name)));
};

/**
 * A value with content, against which a collapsed derivation is measured. It
 * must survive every normalization the rules apply (upper-casing, folding
 * non-alphanumerics to `_`, collapsing runs) with something left over.
 */
const CONTROL_LITERAL = 'ordinaryKey';

/**
 * Values that normalization folds to nothing: empty, whitespace-only, and
 * separator-only. Each leaves a prefix-building fixer with no content to append.
 */
const DEGENERATE_LITERALS = ['', '   ', '---'] as const;

type Finding = {
  rule: string;
  origin: string;
  from: string;
  to: string;
  input: string;
  output: string;
  errors: number;
};

type Totals = {
  findings: Finding[];
  considered: number;
  rewritten: number;
  discardedUnparsable: number;
  rulesRewritten: Set<string>;
};

const fixableRuleNames = [...ruleByName]
  .filter(([, rule]) => rule.meta?.fixable)
  .map(([name]) => name)
  .filter((name) => !typeAwareRuleNames.has(name));

const corpus = harvestFixtureCorpus();

const sweep = (ruleNames: string[]): Totals => {
  const totals: Totals = {
    findings: [],
    considered: 0,
    rewritten: 0,
    discardedUnparsable: 0,
    rulesRewritten: new Set(),
  };

  for (const rule of ruleNames) {
    const cases = (corpus.byRule.get(rule) || []).filter(
      (testCase: FixtureCase) => testCase.bucket === 'invalid',
    );
    for (const testCase of cases) {
      const filename = testCase.filename ?? defaultFilenameFor(testCase);
      const jsx = filename.endsWith('x');
      const declared = declaredNamesOf(testCase.code, jsx);
      if (!declared.length) continue;

      const config = {
        parser: 'ts',
        parserOptions: parserOptionsFor(testCase),
        rules: {
          [`b/${rule}`]: testCase.options?.length
            ? ['error', ...testCase.options]
            : 'error',
        },
      } as never;

      for (const from of declared) {
        for (const to of DEGENERATE_NAMES) {
          if (from === to) continue;
          const input = renameWholeWord(testCase.code, from, to);
          if (input === testCase.code) continue;
          // A perturbation that does not parse is a harness artifact and must
          // never be counted as either a pass or a finding.
          if (parseErrorCount(input, filename) > 0) {
            totals.discardedUnparsable++;
            continue;
          }
          totals.considered++;
          let result;
          try {
            result = linter.verifyAndFix(input, config, filename);
          } catch {
            continue;
          }
          if (!result.fixed || result.output === input) continue;
          totals.rewritten++;
          totals.rulesRewritten.add(rule);
          const errors = parseErrorCount(result.output, filename);
          if (errors > 0) {
            totals.findings.push({
              rule,
              origin: testCase.origin,
              from,
              to,
              input,
              output: result.output,
              errors,
            });
          }
        }
      }
    }
  }
  return totals;
};

const totals = sweep(fixableRuleNames);

type LiteralFinding = {
  kind: 'parse' | 'collapsed';
  rule: string;
  origin: string;
  literal: string;
  derivedControl: string;
  derivedDegenerate: string;
  input: string;
  output: string;
};

type LiteralTotals = {
  findings: LiteralFinding[];
  considered: number;
  rewritten: number;
  /**
   * Control runs where a benign literal made the fixer invent a name. This is
   * the floor that matters: it is the only number proving the corpus actually
   * reaches a derive-a-name-from-text fixer, which is the thing under test.
   */
  derivationsObserved: number;
  discardedUnparsable: number;
  skippedUnparsableComparison: number;
  /**
   * Control runs whose BASELINE could not be read. Distinct from
   * `skippedUnparsableComparison`, which can only count pairs that already
   * cleared the deriving gate — so it stays at 0 no matter how much of the
   * corpus an unreadable baseline withholds.
   */
  unreadableControl: number;
  rulesDeriving: Set<string>;
};

/**
 * Does `degenerate` carry nothing of the literal that `control` carried?
 *
 * The test is differential rather than a naming predicate, so it needs no
 * per-rule affix list and stays silent for a fixer that declines (a decline
 * invents no name at all).
 *
 * The question is whether the control's name survives DELETING the author's
 * content from the middle of it: `degenerate` splits into `head + tail` with
 * `control === head + <something non-empty> + tail`. Testing only
 * `startsWith` answers it for a prefix builder and silently says no for every
 * other affix position, which is the same defect with the constant part
 * somewhere else (#1819):
 *
 *   QUERY_KEY_${n}   QUERY_KEY_ORDINARYKEY  vs QUERY_KEY_  head/tail = pre/''
 *   ${n}_KEY         ORDINARYKEY_KEY        vs _KEY        head/tail = ''/suf
 *   USE_${n}_KEY     USE_ORDINARYKEY_KEY    vs USE__KEY    head/tail = pre/suf
 *
 * A derivation that merely differs (`QUERY_KEY_FALLBACK`) admits no such split
 * and stays silent.
 */
const collapsedAgainst = (control: Set<string>, degenerate: Set<string>) => {
  for (const derived of degenerate) {
    for (const reference of control) {
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

const sweepLiterals = (ruleNames: string[]): LiteralTotals => {
  const literalTotals: LiteralTotals = {
    findings: [],
    considered: 0,
    rewritten: 0,
    derivationsObserved: 0,
    discardedUnparsable: 0,
    skippedUnparsableComparison: 0,
    unreadableControl: 0,
    rulesDeriving: new Set(),
  };

  for (const rule of ruleNames) {
    const cases = (corpus.byRule.get(rule) || []).filter(
      (testCase: FixtureCase) => testCase.bucket === 'invalid',
    );
    for (const testCase of cases) {
      const filename = testCase.filename ?? defaultFilenameFor(testCase);
      const jsx = filename.endsWith('x');
      const ranges = stringLiteralRangesOf(testCase.code, jsx);
      if (!ranges.length) continue;

      const config = {
        parser: 'ts',
        parserOptions: parserOptionsFor(testCase),
        rules: {
          [`b/${rule}`]: testCase.options?.length
            ? ['error', ...testCase.options]
            : 'error',
        },
      } as never;

      const runFix = (input: string) => {
        try {
          const result = linter.verifyAndFix(input, config, filename);
          return result.fixed && result.output !== input ? result.output : null;
        } catch {
          return null;
        }
      };

      for (const range of ranges) {
        const controlInput = spliceRange(
          testCase.code,
          range,
          `'${CONTROL_LITERAL}'`,
        );
        if (parseErrorCount(controlInput, filename) > 0) {
          literalTotals.discardedUnparsable++;
          continue;
        }
        const controlOutput = runFix(controlInput);
        const controlDerived = derivedNames(controlInput, controlOutput, jsx);
        // An unreadable baseline is not a non-deriving one. Folding null to an
        // empty set routes it into the `!controlDerived.size` skip below, where
        // it becomes indistinguishable from a fixer that invented nothing —
        // and `skippedUnparsableComparison` never sees it, because that branch
        // sits past the skip. Counting it separately is what makes the arm's
        // reach measurable rather than merely assumed.
        if (!controlDerived) {
          literalTotals.unreadableControl++;
          continue;
        }
        if (controlDerived.size) {
          literalTotals.derivationsObserved++;
          literalTotals.rulesDeriving.add(rule);
        }

        for (const value of DEGENERATE_LITERALS) {
          const input = spliceRange(testCase.code, range, `'${value}'`);
          if (input === testCase.code) continue;
          if (parseErrorCount(input, filename) > 0) {
            literalTotals.discardedUnparsable++;
            continue;
          }
          literalTotals.considered++;
          const output = runFix(input);
          if (!output) continue;
          literalTotals.rewritten++;

          if (parseErrorCount(output, filename) > 0) {
            literalTotals.findings.push({
              kind: 'parse',
              rule,
              origin: testCase.origin,
              literal: value,
              derivedControl: '',
              derivedDegenerate: '',
              input,
              output,
            });
            continue;
          }
          if (!controlDerived.size) continue;

          const derived = derivedNames(input, output, jsx);
          if (!derived) {
            literalTotals.skippedUnparsableComparison++;
            continue;
          }
          const collapse = collapsedAgainst(controlDerived, derived);
          if (collapse) {
            literalTotals.findings.push({
              kind: 'collapsed',
              rule,
              origin: testCase.origin,
              literal: value,
              ...collapse,
              input,
              output,
            });
          }
        }
      }
    }
  }
  return literalTotals;
};

const literalTotals = sweepLiterals(fixableRuleNames);

describe('degenerate-identifier fix closure', () => {
  it('harvested a corpus at all', () => {
    expect(corpus.failures).toEqual([]);
    expect(corpus.filesLoaded).toBeGreaterThan(250);
    expect(fixableRuleNames.length).toBeGreaterThanOrEqual(70);
  });

  /**
   * The load-bearing floor. `considered` counts perturbations attempted, which
   * stays high even if every fixer declines; only `rewritten` proves a fixer
   * actually ran on degenerate input and therefore that a defect COULD have
   * been observed.
   */
  it('actually drove fixers with degenerate input', () => {
    // Naming the rules this sweep never drove keeps its reach honest: they are
    // unexercised, not certified clean, and a reader who takes the headline
    // count for full coverage would over-trust the gate.
    const untouched = fixableRuleNames.filter(
      (name) => !totals.rulesRewritten.has(name),
    );
    // eslint-disable-next-line no-console
    console.log(
      `[degenerate-identifier] considered ${totals.considered}, rewritten ${totals.rewritten} ` +
        `across ${totals.rulesRewritten.size} rule(s); discarded unparsable ${totals.discardedUnparsable}\n` +
        `  no fixer ever ran on degenerate input for ${
          untouched.length
        } rule(s): ${untouched.join(', ') || '(none)'}`,
    );
    expect(totals.considered).toBeGreaterThan(2000);
    expect(totals.rewritten).toBeGreaterThan(300);
    expect(totals.rulesRewritten.size).toBeGreaterThanOrEqual(20);
  });

  it('no fixer emits source that fails to parse', () => {
    const report = totals.findings
      .slice(0, 20)
      .map(
        (finding) =>
          `${finding.rule} (${finding.origin}) renaming ${finding.from} -> ${finding.to}, ` +
          `${finding.errors} parse error(s)\n  IN : ${JSON.stringify(
            finding.input,
          )}\n  OUT: ${JSON.stringify(finding.output)}`,
      )
      .join('\n');
    expect(report).toBe('');
    expect(totals.findings).toEqual([]);
  });

  /**
   * Positive control: a fixer that renames to the derived text WITHOUT checking
   * it is an identifier must be caught. This is the #1816 defect reconstructed
   * as a standalone rule, so the guard cannot pass by never looking.
   */
  it('catches a planted fixer that renames to a non-identifier', () => {
    const planted = {
      meta: {
        type: 'suggestion',
        fixable: 'code',
        schema: [],
        messages: { rename: 'rename' },
      },
      create(context: {
        report: (descriptor: unknown) => void;
        getSourceCode: () => unknown;
      }) {
        return {
          VariableDeclarator(node: {
            id: { type: string; name: string; range: [number, number] };
          }) {
            if (node.id.type !== 'Identifier') return;
            // The #1816 bug exactly: strip a leading underscore, apply blind.
            const derived = node.id.name.toUpperCase().replace(/^_/, '');
            if (derived === node.id.name) return;
            context.report({
              node: node.id,
              messageId: 'rename',
              fix: (fixer: {
                replaceTextRange: (
                  range: [number, number],
                  text: string,
                ) => unknown;
              }) => fixer.replaceTextRange(node.id.range, derived),
            });
          },
        };
      },
    };
    linter.defineRule('planted/degenerate', planted as never);
    const config = {
      parser: 'ts',
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: { 'planted/degenerate': 'error' },
    } as never;
    const output = linter.verifyAndFix(
      'const _ = { a: 1 };\n',
      config,
      't.ts',
    ).output;
    expect(output).toContain('const  =');
    expect(parseErrorCount(output, 't.ts')).toBeGreaterThan(0);
  });

  /**
   * Negative control: a well-formed rename must NOT be reported, or the guard
   * would pass by calling everything broken.
   */
  it('does not flag a rename that yields a valid identifier', () => {
    expect(parseErrorCount('const PRIVATE_THING = { a: 1 };\n', 't.ts')).toBe(
      0,
    );
    expect(parseErrorCount('const _1 = { a: 1 };\n', 't.ts')).toBe(0);
  });

  /**
   * The literal arm's floor. `derivationsObserved` is the load-bearing count:
   * `considered` stays high even if no fixer reads a literal, and `rewritten`
   * stays high for fixers that rewrite something unrelated to the value. Only a
   * control run that invented a NAME proves the corpus reached the kind of
   * derivation #1811/#1813 live in.
   */
  it('actually drove name-from-literal derivations', () => {
    const notDeriving = fixableRuleNames.filter(
      (name) => !literalTotals.rulesDeriving.has(name),
    );
    // eslint-disable-next-line no-console
    console.log(
      `[degenerate-literal] considered ${literalTotals.considered}, rewritten ${literalTotals.rewritten}, ` +
        `derivations ${literalTotals.derivationsObserved} across ${literalTotals.rulesDeriving.size} rule(s); ` +
        `discarded unparsable ${literalTotals.discardedUnparsable}, ` +
        `skipped unreadable comparisons ${literalTotals.skippedUnparsableComparison}, ` +
        `unreadable controls ${literalTotals.unreadableControl}\n` +
        `  deriving rules (${literalTotals.rulesDeriving.size}): ${
          [...literalTotals.rulesDeriving].join(', ') || '(none)'
        }\n` +
        // Naming the complement keeps the arm's reach quoted as ASSERTED rather
        // than examined. The deriving count alone reads as "20 rules checked"
        // when it means "20 rules where a name-from-literal derivation was
        // observed at all" — the rest are unexercised, not certified clean.
        `  never observed deriving a name from a literal (${
          notDeriving.length
        }): ${notDeriving.join(', ') || '(none)'}`,
    );
    // A baseline the harness cannot read withholds its whole fixture from the
    // arm while every other counter still reads clean, so this is asserted at
    // zero rather than merely reported.
    expect(literalTotals.unreadableControl).toBe(0);
    expect(literalTotals.considered).toBeGreaterThan(1000);
    expect(literalTotals.rewritten).toBeGreaterThan(100);
    expect(literalTotals.derivationsObserved).toBeGreaterThan(800);
    expect(literalTotals.rulesDeriving.size).toBeGreaterThanOrEqual(28);
  });

  /**
   * Pins the parser option the reach depends on. The floors above would also
   * drop if `range` regressed, but they would read as "the corpus shrank"; this
   * names the cause, so the next reader is not left bisecting counters.
   */
  it('reads identifiers out of JSX, not just plain TypeScript', () => {
    const jsxSource =
      'const List = ({ items }) => (\n' +
      '  <ul>{items.map((item) => (<li key={item.id}>{item.name}</li>))}</ul>\n' +
      ');\n';
    const names = identifierNamesOf(jsxSource, true);
    expect(names).not.toBeNull();
    expect([...(names as Set<string>)]).toEqual(
      expect.arrayContaining(['List', 'items', 'item']),
    );
  });

  it('no fixer derives a name that collapses to its bare affix', () => {
    // Every affected rule is named before the truncated examples: slicing to the
    // first 20 findings otherwise hides whole rules behind whichever one the
    // sweep reached first, which is the difference between a report that says
    // what to fix and one that says only where to start looking.
    const byRule = [...new Set(literalTotals.findings.map((f) => f.rule))];
    const header = byRule.length
      ? `${literalTotals.findings.length} finding(s) across ${
          byRule.length
        } rule(s): ${byRule.join(', ')}\n`
      : '';
    const report =
      header +
      literalTotals.findings
        .slice(0, 20)
        .map((finding) =>
          finding.kind === 'parse'
            ? `${finding.rule} (${finding.origin}) literal ${JSON.stringify(
                finding.literal,
              )} -> output does not parse\n  OUT: ${JSON.stringify(
                finding.output,
              )}`
            : `${finding.rule} (${finding.origin}) literal ${JSON.stringify(
                finding.literal,
              )} derived ${finding.derivedDegenerate} ` +
              `where a real value derives ${
                finding.derivedControl
              }\n  IN : ${JSON.stringify(
                finding.input,
              )}\n  OUT: ${JSON.stringify(finding.output)}`,
        )
        .join('\n');
    expect(report).toBe('');
    expect(literalTotals.findings).toEqual([]);
  });

  /**
   * Positive control: #1811/#1813 rebuilt as a standalone rule. Without it the
   * literal arm could pass by never comparing anything, exactly as the shipped
   * gate passed while both defects were live.
   */
  it('catches a planted fixer whose derived name collapses to its prefix', () => {
    const planted = {
      meta: {
        type: 'suggestion',
        fixable: 'code',
        schema: [],
        messages: { key: 'key' },
      },
      create(context: { report: (descriptor: unknown) => void }) {
        return {
          Literal(node: {
            value: unknown;
            range: [number, number];
            parent?: { type?: string };
          }) {
            if (typeof node.value !== 'string') return;
            if (node.parent?.type !== 'Property') return;
            // The #1811/#1813 bug exactly: prefix unconditionally.
            const normalized = node.value
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, '_')
              .replace(/_+/g, '_')
              .replace(/^_|_$/g, '');
            context.report({
              node,
              messageId: 'key',
              fix: (fixer: {
                replaceTextRange: (
                  range: [number, number],
                  text: string,
                ) => unknown;
              }) =>
                fixer.replaceTextRange(node.range, `QUERY_KEY_${normalized}`),
            });
          },
        };
      },
    };
    linter.defineRule('planted/collapse', planted as never);
    const config = {
      parser: 'ts',
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: { 'planted/collapse': 'error' },
    } as never;

    const fixOf = (literal: string) =>
      linter.verifyAndFix(`use({ key: '${literal}' });\n`, config, 't.ts')
        .output;

    const controlOut = fixOf(CONTROL_LITERAL);
    const degenerateOut = fixOf('---');
    expect(controlOut).toContain('QUERY_KEY_ORDINARYKEY');
    expect(degenerateOut).toContain('QUERY_KEY_');

    const newNames = (before: string, after: string) => {
      const baseline = identifierNamesOf(before, false);
      return new Set(
        [...identifierNamesOf(after, false)].filter(
          (name) => !baseline.has(name),
        ),
      );
    };
    const collapse = collapsedAgainst(
      newNames(`use({ key: '${CONTROL_LITERAL}' });\n`, controlOut),
      newNames("use({ key: '---' });\n", degenerateOut),
    );
    expect(collapse).toEqual({
      derivedDegenerate: 'QUERY_KEY_',
      derivedControl: 'QUERY_KEY_ORDINARYKEY',
    });
  });

  /**
   * Negative control: a fixer that declines on a degenerate value invents no
   * name, so there is nothing to collapse and the arm must stay silent. Without
   * this a detector that flagged every decline would look like it worked.
   */
  it('does not flag a fixer that declines on a degenerate value', () => {
    expect(
      collapsedAgainst(new Set(['QUERY_KEY_ORDINARYKEY']), new Set()),
    ).toBeNull();
    // Nor a derivation that is merely different, rather than a bare prefix.
    expect(
      collapsedAgainst(
        new Set(['QUERY_KEY_ORDINARYKEY']),
        new Set(['QUERY_KEY_FALLBACK']),
      ),
    ).toBeNull();
    // Nor an identical derivation, which carries the content unchanged.
    expect(
      collapsedAgainst(
        new Set(['QUERY_KEY_ORDINARYKEY']),
        new Set(['QUERY_KEY_ORDINARYKEY']),
      ),
    ).toBeNull();
  });

  /**
   * The affix position is incidental to the defect but was load-bearing in the
   * first predicate, which tested `startsWith` alone and so answered "clean" for
   * every builder that puts its constant anywhere but the front (#1819).
   */
  it('catches a collapsed derivation at any affix position', () => {
    expect(
      collapsedAgainst(
        new Set(['QUERY_KEY_ORDINARYKEY']),
        new Set(['QUERY_KEY_']),
      ),
    ).toEqual({
      derivedDegenerate: 'QUERY_KEY_',
      derivedControl: 'QUERY_KEY_ORDINARYKEY',
    });
    expect(
      collapsedAgainst(new Set(['ORDINARYKEY_KEY']), new Set(['_KEY'])),
    ).toEqual({
      derivedDegenerate: '_KEY',
      derivedControl: 'ORDINARYKEY_KEY',
    });
    expect(
      collapsedAgainst(new Set(['USE_ORDINARYKEY_KEY']), new Set(['USE__KEY'])),
    ).toEqual({
      derivedDegenerate: 'USE__KEY',
      derivedControl: 'USE_ORDINARYKEY_KEY',
    });
  });

  /**
   * End-to-end for the affix positions the predicate unit test asserts, so the
   * arm is shown to catch a real fixer emitting a suffix-built name and not just
   * to compare two hand-written sets.
   */
  it('catches a planted suffix-building fixer end to end', () => {
    const planted = {
      meta: {
        type: 'suggestion',
        fixable: 'code',
        schema: [],
        messages: { key: 'key' },
      },
      create(context: { report: (descriptor: unknown) => void }) {
        return {
          Literal(node: {
            value: unknown;
            range: [number, number];
            parent?: { type?: string };
          }) {
            if (typeof node.value !== 'string') return;
            if (node.parent?.type !== 'Property') return;
            const normalized = node.value
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, '_')
              .replace(/_+/g, '_')
              .replace(/^_|_$/g, '');
            context.report({
              node,
              messageId: 'key',
              fix: (fixer: {
                replaceTextRange: (
                  range: [number, number],
                  text: string,
                ) => unknown;
              }) => fixer.replaceTextRange(node.range, `${normalized}_KEY`),
            });
          },
        };
      },
    };
    linter.defineRule('planted/suffix', planted as never);
    const config = {
      parser: 'ts',
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: { 'planted/suffix': 'error' },
    } as never;

    const sourceOf = (literal: string) => `use({ key: '${literal}' });\n`;
    const fixOf = (literal: string) =>
      linter.verifyAndFix(sourceOf(literal), config, 't.ts').output;

    expect(fixOf(CONTROL_LITERAL)).toContain('ORDINARYKEY_KEY');
    expect(fixOf('---')).toContain('_KEY');

    const collapse = collapsedAgainst(
      derivedNames(sourceOf(CONTROL_LITERAL), fixOf(CONTROL_LITERAL), false) ??
        new Set<string>(),
      derivedNames(sourceOf('---'), fixOf('---'), false) ?? new Set<string>(),
    );
    expect(collapse).toEqual({
      derivedDegenerate: '_KEY',
      derivedControl: 'ORDINARYKEY_KEY',
    });
  });
});

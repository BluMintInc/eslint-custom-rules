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
 * ingredient is PERTURBATION: rename a declared identifier to a degenerate
 * spelling first, then ask whether the fixer still emits code.
 *
 * Two accounting rules make the result mean something:
 *
 * - The floor is on inputs actually REWRITTEN, not inputs considered. A
 *   perturbation pass that triggers no fixer proves nothing, and a
 *   considered-count hides that ([[floor-the-asserted-not-examined-count]]).
 * - Validity is `ts.createSourceFile(...).parseDiagnostics`, never a reparse:
 *   `typescript-estree` recovers from syntax errors and hands back a tree, so a
 *   corrupt rewrite would read as clean.
 *
 * The perturbation is deliberately allowed to change meaning — it may collide
 * with an existing binding or rename a property. That is sound here because the
 * assertion is not "the fix is correct" but "the fix is *syntax*", which no
 * input, however odd, licenses a fixer to violate.
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
});

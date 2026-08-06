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
  typeAwareRuleNames,
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

const fixableRuleNames = [...ruleByName]
  .filter(([, rule]) => rule.meta?.fixable)
  .map(([name]) => name)
  .filter((name) => !typeAwareRuleNames.has(name));

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

const findings: Finding[] = [];
let considered = 0;
let rewritten = 0;
let derivationsObserved = 0;
let discardedUnparsable = 0;
let unreadableControl = 0;
let unreadableComparison = 0;
const rulesRewritten = new Set<string>();
const rulesDeriving = new Set<string>();

for (const rule of fixableRuleNames) {
  const cases = (corpus.byRule.get(rule) || []).filter(
    (testCase: FixtureCase) => testCase.bucket === 'invalid',
  );
  for (const testCase of cases) {
    const baseline = testCase.filename ?? defaultFilenameFor(testCase);
    const jsx = baseline.endsWith('x');

    if (parseErrorCount(testCase.code, baseline) > 0) {
      discardedUnparsable++;
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
    if (controlNames.size || controlStrings.size) {
      derivationsObserved++;
      rulesDeriving.add(rule);
    }

    for (const stem of DEGENERATE_STEMS) {
      const filename = withStem(baseline, stem);
      if (filename === baseline) continue;
      considered++;
      const output = runFix(filename);
      if (!output) continue;
      rewritten++;
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

describe('filename-degeneracy fix closure', () => {
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

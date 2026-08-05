/**
 * No fixer may emit ESM-only syntax the consumer's CommonJS transform rejects.
 *
 * Generalizes #1716: `enforce-dynamic-firebase-imports` rewrote an
 * `ImportDeclaration` in place into `const { x } = await import('...')`. An
 * `ImportDeclaration` only ever sits at module scope, so the rewrite produced a
 * module-scope `await` — legal ESM, and a syntax error once the module is
 * compiled to CommonJS, which is exactly what agora's jest does
 * (`@babel/preset-env` targeting `node: 'current'`, no `modules: false`).
 *
 * Every other instrument in this repo is blind to the class by construction.
 * The RuleTester, the docs conformance suites and the real-code autofix sweeps
 * all validate output with `sourceType: 'module'`, where top-level `await`
 * parses cleanly. #1716 passed all of them and surfaced only through a
 * consumer's hand-written disable — its own fixture `output` had enshrined the
 * corruption as expected behaviour.
 *
 * Two corpora, because neither covers the other:
 *
 *   A. DECLARED OUTPUTS — every `invalid` fixture's `output` string. Pure text
 *      analysis, so it covers type-aware rules, which have no program here and
 *      would otherwise report nothing and manufacture a false clean.
 *   B. COMPOSED `--fix` — fixtures run through the whole recommended config, so
 *      a construct no single rule declares but the composition produces is
 *      still caught.
 *
 * `babel.transformSync` is NOT a usable oracle here: it happily emits the
 * `await` and only the evaluation step, inside the CommonJS module wrapper,
 * throws. The check is therefore syntactic, over the closed set of constructs
 * that require an ES module.
 */
import fs from 'fs';
import path from 'path';
import { Linter, Rule } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import { harvestRuleTesterCases } from '../utils/harvestRuleTesterCases';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as {
  rules: Record<string, unknown>;
  configs: { recommended: { rules: Record<string, unknown> } };
};
/* eslint-enable @typescript-eslint/no-var-requires */

const PREFIX = '@blumintinc/blumint/';
const RULES_DIR = path.join(__dirname, '..', 'rules');

const PARSE_OPTIONS = {
  ecmaVersion: 2022,
  sourceType: 'module',
  ecmaFeatures: { jsx: true },
  loc: true,
  range: true,
  tokens: true,
  comment: true,
} as const;

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The closed set of constructs a CommonJS module cannot host.
 *
 * `await` is judged by whether any enclosing *function* was entered, since that
 * is the only boundary that makes it legal. Class property initialisers and
 * static blocks are not function boundaries and cannot host an `await` either,
 * so treating only real functions as boundaries is the conservative reading.
 * `import.meta` is ESM-only at any depth — CommonJS has no meta property.
 */
function esmOnlyModuleScope(ast: any): string[] {
  const found: string[] = [];

  const walk = (node: any, insideFunction: boolean): void => {
    if (!node || typeof node.type !== 'string') return;

    if (!insideFunction) {
      if (node.type === 'AwaitExpression') {
        found.push(`top-level await@L${node.loc?.start?.line ?? 0}`);
      } else if (node.type === 'ForOfStatement' && node.await) {
        found.push(`top-level for-await@L${node.loc?.start?.line ?? 0}`);
      }
    }
    if (node.type === 'MetaProperty' && node.meta?.name === 'import') {
      found.push(`import.meta@L${node.loc?.start?.line ?? 0}`);
    }

    const nowInside = insideFunction || FUNCTION_TYPES.has(node.type);
    for (const key of Object.keys(node)) {
      if (key === 'parent' || key === 'loc' || key === 'range') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) walk(item, nowInside);
      } else if (child && typeof child.type === 'string') {
        walk(child, nowInside);
      }
    }
  };

  walk(ast, false);
  return found;
}

/** `null` marks unparseable input, which is a different (already-guarded) axis. */
function analyze(source: string): string[] | null {
  try {
    const { ast } = tsParser.parseForESLint(source, PARSE_OPTIONS as any);
    return esmOnlyModuleScope(ast);
  } catch {
    return null;
  }
}

const typeAwareNames = new Set(
  fs
    .readdirSync(RULES_DIR)
    .filter((file) => file.endsWith('.ts'))
    .filter((file) =>
      /getParserServices|getTypeChecker/.test(
        fs.readFileSync(path.join(RULES_DIR, file), 'utf8'),
      ),
    )
    .map((file) => path.basename(file, '.ts')),
);

/** Rule name by OBJECT IDENTITY: ~100 suites pass a display name that is not a
 * rule name, and name-keyed matching silently drops every one of them. */
const ruleNameByIdentity = new Map<unknown, string>();
for (const [name, rule] of Object.entries(plugin.rules)) {
  ruleNameByIdentity.set(rule, name);
}

const harvested = harvestRuleTesterCases();

/** JSON and markdown fixtures are a different language; the TS parser cannot read them. */
const TS_TESTERS = new Set(['ruleTesterTs', 'ruleTesterJsx']);

// ---------------------------------------------------------------------------
// Corpus A — declared fixture outputs
// ---------------------------------------------------------------------------
type OutputFinding = {
  rule: string;
  origin: string;
  constructs: string[];
  before: string;
  after: string;
};

const outputStats = {
  casesConsidered: 0,
  outputsAnalyzed: 0,
  rulesWithOutput: new Set<string>(),
  inputUnparseable: 0,
};

const outputFindings: OutputFinding[] = [];

/** A fixture's `output` may be a string, `null`, or an array of passes. */
const outputsOf = (testCase: any): string[] => {
  const out = testCase?.output;
  if (typeof out === 'string') return [out];
  if (Array.isArray(out)) return out.filter((o) => typeof o === 'string');
  return [];
};

for (const suite of harvested.suites) {
  if (!TS_TESTERS.has(suite.tester)) continue;
  const name = ruleNameByIdentity.get(suite.rule);
  if (!name) continue;

  for (const raw of suite.invalid) {
    const testCase = raw as any;
    if (!testCase || typeof testCase.code !== 'string') continue;
    outputStats.casesConsidered++;

    const outs = outputsOf(testCase);
    if (outs.length === 0) continue;
    outputStats.rulesWithOutput.add(name);

    const before = analyze(testCase.code);
    if (before === null) {
      outputStats.inputUnparseable++;
      continue;
    }

    for (const out of outs) {
      outputStats.outputsAnalyzed++;
      const after = analyze(out);
      if (after === null) continue;
      if (after.length > before.length) {
        outputFindings.push({
          rule: name,
          origin: `src/tests/${suite.file}`,
          constructs: after,
          before: testCase.code,
          after: out,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Corpus B — the recommended config's composed `--fix`
// ---------------------------------------------------------------------------
const FIX_CONFIG: Record<string, unknown> = {};
for (const [id, severity] of Object.entries(plugin.configs.recommended.rules)) {
  if (!id.startsWith(PREFIX)) continue;
  const name = id.slice(PREFIX.length);
  if (!plugin.rules[name] || typeAwareNames.has(name)) continue;
  FIX_CONFIG[id] = severity;
}

const linter = new Linter();
linter.defineParser('ts', tsParser as never);
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}

/**
 * Stand-in culprit reproducing #1716's exact shape: rewrites a static import in
 * place into `const {...} = await import(...)`. An `ImportDeclaration` is always
 * module-scope, so the result is always a module-scope `await`.
 *
 * The control needs a fixer that provably emits the construct. Keying it to a
 * shipped rule would make the detector go vacuous the moment that rule is fixed
 * — which is the goal of this suite. Registered on the linter but kept out of
 * `FIX_CONFIG`, so it is invisible to the corpus scan.
 */
const CONTROL_DYNAMIC_ID = `${PREFIX}control-dynamic-importer`;
const controlDynamicImporter: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    schema: [],
    messages: { dynamic: 'Import "{{source}}" dynamically.' },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const source = String(node.source.value);
        if (!source.startsWith('control-target')) return;
        const named = node.specifiers.filter(
          (s) => s.type === 'ImportSpecifier',
        );
        if (named.length === 0) return;
        const bindings = named
          .map((s) => (s as any).local.name as string)
          .join(', ');
        context.report({
          node,
          messageId: 'dynamic',
          data: { source },
          fix: (fixer) =>
            fixer.replaceText(
              node,
              `const { ${bindings} } = await import('${source}');`,
            ),
        });
      },
    };
  },
};
linter.defineRule(CONTROL_DYNAMIC_ID, controlDynamicImporter);

const configFor = (
  rules: Record<string, unknown>,
  parserOptions?: unknown,
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

type ComposedCase = {
  code: string;
  filename: string;
  parserOptions?: unknown;
  origin: string;
};

/**
 * Only fixtures that mention `import` or `await` can gain one of these
 * constructs, so restricting the composed corpus to them is strictly more
 * sensitive per case linted rather than a sampling compromise.
 */
const RELEVANT = /\bimport\b|\bawait\b/;

const composedCases: ComposedCase[] = [];
for (const suite of harvested.suites) {
  if (!TS_TESTERS.has(suite.tester)) continue;
  const name = ruleNameByIdentity.get(suite.rule);
  if (!name) continue;

  const defaultFile = suite.tester === 'ruleTesterJsx' ? 'x.tsx' : 'x.ts';
  const push = (raw: unknown) => {
    const testCase = (typeof raw === 'string' ? { code: raw } : raw) as any;
    if (!testCase || typeof testCase.code !== 'string') return;
    if (!RELEVANT.test(testCase.code)) return;
    composedCases.push({
      code: testCase.code,
      filename: testCase.filename || defaultFile,
      parserOptions: testCase.parserOptions,
      origin: `src/tests/${suite.file}`,
    });
  };
  for (const raw of suite.valid) push(raw);
  for (const raw of suite.invalid) push(raw);
}

type ComposedFinding = {
  origin: string;
  filename: string;
  constructs: string[];
  culprits: string[];
  before: string;
  after: string;
};

const composedStats = { considered: 0, rewritten: 0 };
const composedFindings: ComposedFinding[] = [];

/** Co-occurrence is not attribution: replay each fixer alone to name the culprit. */
function attributeCulprits(testCase: ComposedCase, baseline: number): string[] {
  const culprits: string[] = [];
  for (const [id, severity] of Object.entries(FIX_CONFIG)) {
    let alone;
    try {
      alone = linter.verifyAndFix(
        testCase.code,
        configFor({ [id]: severity }, testCase.parserOptions),
        { filename: testCase.filename },
      );
    } catch {
      continue;
    }
    if (!alone.fixed || alone.output === testCase.code) continue;
    const after = analyze(alone.output);
    if (after && after.length > baseline)
      culprits.push(id.slice(PREFIX.length));
  }
  return culprits;
}

for (const testCase of composedCases) {
  composedStats.considered++;
  const before = analyze(testCase.code);
  if (before === null) continue;

  let fixed;
  try {
    fixed = linter.verifyAndFix(
      testCase.code,
      configFor(FIX_CONFIG, testCase.parserOptions),
      { filename: testCase.filename },
    );
  } catch {
    continue;
  }
  if (!fixed.fixed || fixed.output === testCase.code) continue;
  composedStats.rewritten++;

  const after = analyze(fixed.output);
  if (after === null) continue;
  if (after.length <= before.length) continue;

  composedFindings.push({
    origin: testCase.origin,
    filename: testCase.filename,
    constructs: after,
    culprits: attributeCulprits(testCase, before.length),
    before: testCase.code,
    after: fixed.output,
  });
}

// ---------------------------------------------------------------------------

const render = (
  header: string,
  rows: {
    origin: string;
    constructs: string[];
    before: string;
    after: string;
  }[],
) =>
  [
    header,
    ...rows
      .slice(0, 5)
      .map((row) =>
        [
          `  ${row.origin} — ${row.constructs.join(', ')}`,
          `    --- input ---`,
          row.before.replace(/^/gm, '      '),
          `    --- fixer output ---`,
          row.after.replace(/^/gm, '      '),
        ].join('\n'),
      ),
    '',
    'A module-scope `await` (or `import.meta`) parses as ESM but is a syntax',
    'error once the consumer compiles the file to CommonJS, which is what their',
    'jest does. An `ImportDeclaration` is always module-scope, so rewriting one',
    'in place into `await import(...)` can never be correct — relocate the',
    'dynamic import into the async function that uses it, or decline the fix.',
    'See #1716.',
  ].join('\n');

describe('no fixer emits ESM-only syntax a CommonJS transform rejects', () => {
  it('declares no fixture output carrying a module-scope await', () => {
    if (outputFindings.length > 0) {
      throw new Error(
        render(
          `${outputFindings.length} fixture output(s) introduce ESM-only module-scope syntax:`,
          outputFindings.map((f) => ({
            ...f,
            origin: `${f.rule} (${f.origin})`,
          })),
        ),
      );
    }
    expect(outputFindings).toEqual([]);
  });

  it("produces none through the recommended config's composed --fix", () => {
    if (composedFindings.length > 0) {
      throw new Error(
        render(
          `${composedFindings.length} composed fix(es) introduce ESM-only module-scope syntax:`,
          composedFindings.map((f) => ({
            ...f,
            origin: `${f.origin} as ${f.filename} [${
              f.culprits.join(', ') || 'INTERACTION ONLY'
            }]`,
          })),
        ),
      );
    }
    expect(composedFindings).toEqual([]);
  });
});

/**
 * Anti-vacuity controls. A guard whose corpus trips nothing passes forever while
 * asserting nothing, so the harvest, both corpora and the detector are each
 * measured independently.
 */
describe('the CJS emission guard is load-bearing', () => {
  it('harvests the suite without losing it', () => {
    expect(harvested.filesLoaded).toBeGreaterThanOrEqual(250);
    expect(Object.keys(FIX_CONFIG).length).toBeGreaterThan(100);
    expect(typeAwareNames.size).toBeGreaterThan(5);
  });

  it('analyses enough declared outputs across enough rules', () => {
    // 6,422 invalid cases and 2,560 declared outputs across 83 rules at the
    // time of writing; a collapsed corpus would still report zero findings.
    expect(outputStats.casesConsidered).toBeGreaterThanOrEqual(6000);
    expect(outputStats.outputsAnalyzed).toBeGreaterThanOrEqual(2300);
    expect(outputStats.rulesWithOutput.size).toBeGreaterThanOrEqual(75);
  });

  it('actually rewrites a large share of the composed corpus', () => {
    // Step B is vacuous unless the config genuinely fixes these fixtures.
    expect(composedStats.considered).toBeGreaterThanOrEqual(1500);
    expect(composedStats.rewritten).toBeGreaterThanOrEqual(300);
  });

  it('detects a module-scope await (positive control)', () => {
    const planted = [
      "import { getFirestore } from 'control-target/firestore';",
      'export const db = getFirestore();',
    ].join('\n');

    expect(analyze(planted)).toEqual([]);

    const fixed = linter.verifyAndFix(
      planted,
      configFor({ ...FIX_CONFIG, [CONTROL_DYNAMIC_ID]: 'error' }),
      { filename: 'x.ts' },
    );
    expect(fixed.output).toContain('await import(');
    const constructs = analyze(fixed.output);
    expect(constructs && constructs.length).toBeGreaterThan(0);
    expect(
      attributeCulprits(
        { code: planted, filename: 'x.ts', origin: 'planted control' },
        0,
      ),
    ).toEqual([]);
  });

  it('holds the shipped config responsible for the same shape (control)', () => {
    // The other half: with only shipped rules, that snippet must survive
    // `--fix` with its static import intact. This is what makes the planted
    // culprit a statement about the detector rather than a way to skip the
    // config.
    const planted = [
      "import { getFirestore } from 'control-target/firestore';",
      'export const db = getFirestore();',
    ].join('\n');
    const fixed = linter.verifyAndFix(planted, configFor(FIX_CONFIG), {
      filename: 'x.ts',
    });
    expect(analyze(fixed.output)).toEqual([]);
  });

  it('stays silent on an await inside an async function (negative control)', () => {
    const inert = [
      'export const load = async () => {',
      "  const { getFirestore } = await import('firebase/firestore');",
      '  return getFirestore();',
      '};',
    ].join('\n');
    expect(analyze(inert)).toEqual([]);
  });

  it('stays silent on a for-await inside an async function (negative control)', () => {
    const inert = [
      'export const drain = async (stream: AsyncIterable<number>) => {',
      '  for await (const chunk of stream) {',
      '    console.log(chunk);',
      '  }',
      '};',
    ].join('\n');
    expect(analyze(inert)).toEqual([]);
  });

  it('detects a module-scope for-await and import.meta (detector controls)', () => {
    const topLevelForAwait = [
      'declare const stream: AsyncIterable<number>;',
      'for await (const chunk of stream) {',
      '  console.log(chunk);',
      '}',
    ].join('\n');
    expect((analyze(topLevelForAwait) || []).length).toBeGreaterThan(0);
    expect(
      (analyze('export const url = import.meta.url;') || []).length,
    ).toBeGreaterThan(0);
  });
});
/* eslint-enable @typescript-eslint/no-explicit-any */

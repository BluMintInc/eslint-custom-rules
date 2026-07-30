import fs from 'fs';
import path from 'path';
import { Linter } from 'eslint';

// Using require to avoid test build-time ESM interop issues; the test runner
// only needs the plugin object shape (rules), not types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as {
  rules: Record<string, { meta?: Record<string, unknown> }>;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tsParser = require('@typescript-eslint/parser');

const PREFIX = '@blumintinc/blumint/';
const TESTS_DIR = __dirname;

/**
 * A fixer must remove its own trigger. When it does not, ESLint's fix loop
 * re-applies it on every pass until it gives up at the tenth, so a single
 * `--fix` multiplies the fix into the file and still reports the error.
 *
 * `RuleTester` cannot see this: it applies exactly ONE fix pass, and only
 * compares against `output` when a case declares one. A non-convergent fixer
 * therefore looks correct, and a case can even enshrine the broken single-pass
 * result as its expectation — which is what hid #1461, where a `headerTemplate`
 * that did not satisfy the rule was prepended ten times to every matching file.
 *
 * This guard runs the real multi-pass `Linter#verifyAndFix` loop and requires
 * that no message from the same rule survives it *still carrying a fix*. That
 * phrasing is what keeps it precise: a rule that legitimately reports
 * unfixable violations alongside fixable ones leaves messages behind with no
 * `fix`, and those are not failures. Output that no longer parses is also a
 * failure — a fix may not corrupt the file it edits.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const parse = (text: string, filePath: string) => {
  try {
    return tsParser.parseForESLint(text, {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
      loc: true,
      range: true,
      comment: true,
      tokens: true,
      filePath,
    });
  } catch {
    return null;
  }
};

const walkAst = (node: any, visit: (n: any) => void) => {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const k of Object.keys(node)) {
    if (k === 'parent') continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => walkAst(c, visit));
    else if (v && typeof v === 'object' && typeof v.type === 'string') {
      walkAst(v, visit);
    }
  }
};

const NOT_STATIC = Symbol('not-static');

/**
 * Rule options are written as plain data, so evaluating the JSON-shaped subset
 * of expressions recovers them without executing the test file — which would
 * re-register every harvested suite with jest.
 */
const staticValue = (node: any): any => {
  if (!node) return NOT_STATIC;
  switch (node.type) {
    case 'Literal':
      return node.value;
    case 'TemplateLiteral':
      return node.expressions.length === 0
        ? node.quasis.map((q: any) => q.value.cooked).join('')
        : NOT_STATIC;
    case 'ArrayExpression': {
      const out: any[] = [];
      for (const el of node.elements) {
        const v = staticValue(el);
        if (v === NOT_STATIC) return NOT_STATIC;
        out.push(v);
      }
      return out;
    }
    case 'ObjectExpression': {
      const out: Record<string, any> = {};
      for (const p of node.properties) {
        if (p.type !== 'Property' || p.computed) return NOT_STATIC;
        const key =
          p.key.type === 'Identifier' ? p.key.name : staticValue(p.key);
        if (key === NOT_STATIC || typeof key !== 'string') return NOT_STATIC;
        const v = staticValue(p.value);
        if (v === NOT_STATIC) return NOT_STATIC;
        out[key] = v;
      }
      return out;
    }
    case 'UnaryExpression': {
      const arg = staticValue(node.argument);
      if (arg === NOT_STATIC) return NOT_STATIC;
      if (node.operator === '-') return -arg;
      if (node.operator === '+') return +arg;
      if (node.operator === '!') return !arg;
      return NOT_STATIC;
    }
    case 'Identifier':
      return node.name === 'undefined' ? undefined : NOT_STATIC;
    default:
      return NOT_STATIC;
  }
};

type HarvestedCase = { code: string; options?: any[]; filename?: string };

const propOf = (node: any, name: string) =>
  node.properties.find(
    (p: any) =>
      p.type === 'Property' &&
      !p.computed &&
      ((p.key.type === 'Identifier' && p.key.name === name) ||
        (p.key.type === 'Literal' && p.key.value === name)),
  );

/**
 * Options must be harvested alongside the code, not just the code. An
 * option-gated fixer is unreachable on defaults — #1461's autofix only exists
 * once `headerTemplate` is set, so a bare-snippet corpus cannot reach it at all.
 */
const harvestCases = (testFile: string): HarvestedCase[] => {
  if (!fs.existsSync(testFile)) return [];
  const parsed = parse(fs.readFileSync(testFile, 'utf8'), testFile);
  if (!parsed) return [];
  const out: HarvestedCase[] = [];
  const seen = new Set<string>();

  const push = (c: HarvestedCase) => {
    const key = JSON.stringify([c.code, c.options, c.filename]);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(c);
  };

  walkAst(parsed.ast, (node: any) => {
    if (node.type !== 'ObjectExpression') return;
    const codeProp = propOf(node, 'code');
    if (!codeProp) return;
    const code = staticValue(codeProp.value);
    if (code === NOT_STATIC || typeof code !== 'string') return;

    const optionsProp = propOf(node, 'options');
    let options: any[] | undefined;
    if (optionsProp) {
      const v = staticValue(optionsProp.value);
      // A case whose options cannot be recovered would be probed under the
      // wrong configuration, so drop it rather than probe a fiction.
      if (v === NOT_STATIC || !Array.isArray(v)) return;
      options = v;
    }

    const filenameProp = propOf(node, 'filename');
    const filenameValue = filenameProp
      ? staticValue(filenameProp.value)
      : undefined;

    push({
      code,
      options,
      filename: typeof filenameValue === 'string' ? filenameValue : undefined,
    });
  });

  // Cases written as bare strings still exercise the default-option path.
  walkAst(parsed.ast, (node: any) => {
    if (node.type !== 'ArrayExpression') return;
    for (const el of node.elements || []) {
      if (!el) continue;
      const v = staticValue(el);
      // Shorter than this is a messageId or a rule name, not a snippet.
      if (typeof v !== 'string' || v.length < 25 || !/[;{(=<]/.test(v)) {
        continue;
      }
      push({ code: v });
    }
  });

  return out;
};

const linter = new Linter();
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}
linter.defineParser('ts', tsParser);

const configFor = (rule: string, options?: any[]): Linter.Config =>
  ({
    parser: 'ts',
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
    },
    rules: {
      [PREFIX + rule]:
        options && options.length ? ['error', ...options] : 'error',
    },
  } as Linter.Config);

type Finding = {
  kind: 'non-convergent' | 'fix-breaks-parse';
  detail: string;
  code: string;
  options?: any[];
  output: string;
};

const checkCase = (
  rule: string,
  testCase: HarvestedCase,
  filename: string,
): Finding | null => {
  const id = PREFIX + rule;
  const config = configFor(rule, testCase.options);
  let before: Linter.LintMessage[];
  try {
    before = linter.verify(testCase.code, config, { filename });
  } catch {
    return null;
  }
  // Nothing to converge unless this configuration actually offers a fix. This
  // also skips input that does not parse, which reports fatally and nothing else.
  if (!before.some((m) => m.ruleId === id && m.fix)) return null;

  let output: string;
  let after: Linter.LintMessage[];
  try {
    output = linter.verifyAndFix(testCase.code, config, { filename }).output;
    after = linter.verify(output, config, { filename });
  } catch (err) {
    return {
      kind: 'fix-breaks-parse',
      detail: `linting the fixed output threw: ${(err as Error).message}`,
      code: testCase.code,
      options: testCase.options,
      output: '',
    };
  }

  const fatal = after.find((m) => m.fatal || m.ruleId === null);
  if (fatal) {
    return {
      kind: 'fix-breaks-parse',
      detail: fatal.message,
      code: testCase.code,
      options: testCase.options,
      output,
    };
  }

  const stillFixable = after.filter((m) => m.ruleId === id && m.fix);
  if (stillFixable.length > 0) {
    return {
      kind: 'non-convergent',
      detail: `${
        stillFixable.length
      } fixable message(s) survive the fix loop: ${stillFixable
        .map((m) => m.messageId || m.message)
        .join(', ')}`,
      code: testCase.code,
      options: testCase.options,
      output,
    };
  }
  return null;
};

/**
 * A rule that gates on file location needs a filename it accepts; cases that
 * carry their own use it instead.
 */
const FILENAMES = [
  '/repo/src/components/Widget.tsx',
  '/repo/src/util/helper.ts',
  '/repo/functions/src/callable/handler.ts',
];

const fixableRules = Object.entries(plugin.rules)
  .filter(([, rule]) => rule && rule.meta && rule.meta.fixable)
  .map(([name]) => name)
  .sort();

const results = new Map<string, { probed: number; findings: Finding[] }>();
let totalProbed = 0;

for (const rule of fixableRules) {
  const cases = harvestCases(path.join(TESTS_DIR, `${rule}.test.ts`));
  const findings: Finding[] = [];
  let probed = 0;
  for (const testCase of cases) {
    for (const filename of testCase.filename
      ? [testCase.filename]
      : FILENAMES) {
      probed++;
      const finding = checkCase(rule, testCase, filename);
      if (finding) findings.push(finding);
    }
  }
  results.set(rule, { probed, findings });
  totalProbed += probed;
}

const rulesProbed = [...results.values()].filter((r) => r.probed > 0).length;

describe('fixers must converge under the multi-pass fix loop', () => {
  /**
   * Coverage floor. The assertions below pass trivially if harvesting breaks,
   * so the corpus size is asserted rather than assumed.
   */
  it('probes a meaningful share of the fixable rules', () => {
    expect(fixableRules.length).toBeGreaterThan(70);
    expect(rulesProbed).toBeGreaterThanOrEqual(70);
    expect(totalProbed).toBeGreaterThanOrEqual(8000);
  });

  it.each(fixableRules)('%s', (rule) => {
    const { findings } = results.get(rule)!;
    const report = findings
      .map(
        (f) =>
          `[${f.kind}] ${f.detail}\noptions: ${JSON.stringify(
            f.options,
          )}\n--- input ---\n${f.code}\n--- after --fix ---\n${f.output}`,
      )
      .join('\n\n');
    // A finding means the fix must decline instead; see #1461.
    expect(findings.length === 0 ? '' : report).toBe('');
  });
});

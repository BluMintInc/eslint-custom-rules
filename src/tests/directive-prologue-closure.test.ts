/**
 * A fixer must not demote a directive prologue or displace a shebang.
 *
 * Generalizes #1695. `enforce-centralized-mock-firestore` rebuilt the file from
 * offset 0 and spliced its generated import at the top, which demoted a
 * `'use client'` prologue below an import — silently turning a client component
 * into a server one — and broke a shebang file outright by pushing `#!` off
 * line 1. That fix routed the rule through `importInsertion`, whose anchor owns
 * directive, shebang and header-comment placement. Sixteen rules use that
 * helper; nothing checks the ones that do not.
 *
 * `comment-fix-fidelity` names #1695 among the issues it generalizes, but it
 * perturbs a source with a COMMENT and compares transforms. A directive and a
 * shebang are neither comments nor semantically inert, so that probe cannot see
 * this defect: reverting the #1695 fix leaves it green while breaking 20 of the
 * rule's own tests.
 *
 * Both invariants are absolute, which is what makes this checkable without a
 * baseline:
 *
 * - A shebang is only a shebang at offset 0. One byte in front of it and the
 *   file is no longer executable.
 * - A directive is only a directive while it is in the prologue — an unbroken
 *   run of string-literal expression statements at the top of the Program. A
 *   statement inserted above it does not move it; it *demotes* it to a no-op
 *   string expression, which every bundler stops honouring.
 */
import fs from 'fs';
import path from 'path';
import { Linter } from 'eslint';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tsParser = require('@typescript-eslint/parser');
import {
  FixtureCase,
  harvestFixtureCorpus,
  parserOptionsFor,
  defaultFilenameFor,
  severityWithOptions,
  typeAwareRuleNames,
} from '../utils/fixtureCorpus';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as {
  rules: Record<string, { meta?: { fixable?: string } }>;
};
/* eslint-enable @typescript-eslint/no-var-requires */

const PREFIX = '@blumintinc/blumint/';
const SHEBANG = '#!/usr/bin/env node';
const DIRECTIVE = "'use client';";

const linter = new Linter();
linter.defineParser(
  '@typescript-eslint/parser',
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('@typescript-eslint/parser'),
);
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}

/**
 * Only a fixable rule can displace anything, and a type-aware rule reports
 * nothing under a bare `Linter` (no program), so probing one manufactures a
 * false clean rather than a finding. The skipped set is counted below rather
 * than dropped, so the filter cannot quietly become a blind spot.
 */
const FIXABLE_RULES = new Set(
  Object.entries(plugin.rules)
    .filter(([name, rule]) => rule.meta?.fixable && !typeAwareRuleNames.has(name))
    .map(([name]) => name),
);

const corpus = harvestFixtureCorpus();

type Variant = {
  kind: 'shebang' | 'directive' | 'shebang+directive';
  prefix: string;
};

const VARIANTS: Variant[] = [
  { kind: 'shebang', prefix: `${SHEBANG}\n` },
  { kind: 'directive', prefix: `${DIRECTIVE}\n` },
  { kind: 'shebang+directive', prefix: `${SHEBANG}\n${DIRECTIVE}\n` },
];

const configFor = (rules: Record<string, unknown>, tc: FixtureCase) =>
  ({
    parser: '@typescript-eslint/parser',
    parserOptions: parserOptionsFor(tc),
    rules,
  } as never);

const fixOf = (code: string, rules: Record<string, unknown>, tc: FixtureCase) => {
  try {
    return linter.verifyAndFix(code, configFor(rules, tc), {
      filename: defaultFilenameFor(tc),
    });
  } catch {
    return null;
  }
};

/**
 * Which invariant the output breaks, or null when it holds. Only the tokens the
 * variant actually prepended are checked — demanding a directive of the
 * shebang-only variant would report every rule in the plugin.
 *
 * The two tokens need different instruments, and using one for both is what
 * produces a phantom. A shebang is positional in the TEXT: it is a shebang only
 * at byte 0. A directive is positional in the AST: it survives any amount of
 * leading trivia, because comments are not statements. Checking the directive
 * textually reports every fixer that inserts a header comment —
 * `enforce-unique-cursor-headers` prepends a `@fileoverview` block and leaves
 * `'use client'` a directive still, which a line-based check calls a demotion.
 */
const prologueBreak = (
  output: string,
  variant: Variant,
  tc: FixtureCase,
): Finding['reason'] | null => {
  if (variant.kind !== 'directive' && !output.startsWith(`${SHEBANG}\n`)) {
    return 'SHEBANG_DISPLACED';
  }
  if (variant.kind === 'shebang') return null;

  let body: { type: string; expression?: { type: string; value?: unknown } }[];
  try {
    body = tsParser.parse(output, {
      ...parserOptionsFor(tc),
      loc: true,
      range: true,
      tokens: true,
      comment: true,
    }).body as never;
  } catch {
    // Unparseable output is the autofix probe's finding, not this one.
    return null;
  }
  const first = body[0];
  const isDirective =
    first?.type === 'ExpressionStatement' &&
    first.expression?.type === 'Literal' &&
    first.expression.value === 'use client';
  return isDirective ? null : 'DIRECTIVE_DEMOTED';
};

type Finding = {
  rule: string;
  variant: Variant['kind'];
  origin: string;
  reason: 'SHEBANG_DISPLACED' | 'DIRECTIVE_DEMOTED';
  before: string;
  after: string;
};

const stats = {
  considered: 0,
  baseFixed: 0,
  variantFixed: 0,
  rulesProbed: new Set<string>(),
  rulesFixing: new Set<string>(),
  skippedTypeAware: 0,
  skippedNotFixable: 0,
};

const findings: Finding[] = [];

const probeCase = (name: string, tc: FixtureCase, collect: Finding[]) => {
  const rules = { [PREFIX + name]: severityWithOptions(tc) as never };

  // A fixture that already opens with either token would make the invariant
  // ambiguous about which copy moved.
  if (tc.code.startsWith('#!') || /^\s*['"]use /.test(tc.code)) return;

  // A case the rule does not actually rewrite proves nothing about placement.
  const base = fixOf(tc.code, rules, tc);
  if (!base || !base.fixed) return;
  stats.baseFixed++;
  stats.rulesFixing.add(name);

  for (const variant of VARIANTS) {
    const source = variant.prefix + tc.code;
    const fixed = fixOf(source, rules, tc);
    if (!fixed || !fixed.fixed) continue;
    stats.variantFixed++;

    const displaced = prologueBreak(fixed.output, variant, tc);
    if (!displaced) continue;

    collect.push({
      rule: name,
      variant: variant.kind,
      origin: tc.origin,
      reason: displaced,
      before: source,
      after: fixed.output,
    });
  }
};

for (const [name, cases] of corpus.byRule) {
  if (typeAwareRuleNames.has(name)) {
    stats.skippedTypeAware++;
    continue;
  }
  if (!FIXABLE_RULES.has(name)) {
    stats.skippedNotFixable++;
    continue;
  }
  stats.rulesProbed.add(name);
  for (const tc of cases) {
    if (tc.bucket !== 'invalid') continue;
    stats.considered++;
    probeCase(name, tc, findings);
  }
}

describe('directive prologue and shebang survive every fixer', () => {
  it('harvested the suite corpus', () => {
    expect(corpus.failures).toEqual([]);
    expect(corpus.filesLoaded).toBeGreaterThanOrEqual(250);
  });

  /**
   * Floors, not a bare `findings.length === 0`. A corpus that silently shrank
   * to nothing reports zero findings and reads identically to a clean sweep.
   */
  it('probed a non-vacuous corpus', () => {
    expect(stats.rulesProbed.size).toBeGreaterThanOrEqual(55);
    expect(stats.considered).toBeGreaterThanOrEqual(1500);
    expect(stats.baseFixed).toBeGreaterThanOrEqual(800);
    expect(stats.variantFixed).toBeGreaterThanOrEqual(2000);
    expect(stats.rulesFixing.size).toBeGreaterThanOrEqual(50);
  });

  it('flags a fixer that inserts above the prologue (positive control)', () => {
    const rogue = {
      meta: { type: 'problem', fixable: 'code', schema: [], messages: { x: 'x' } },
      create(context: never) {
        const ctx = context as unknown as {
          report: (d: unknown) => void;
          getSourceCode: () => { ast: { body: unknown[] } };
        };
        return {
          Program(node: { body: unknown[] }) {
            if (!node.body.length) return;
            ctx.report({
              node,
              messageId: 'x',
              fix: (fixer: { insertTextAfterRange: (r: number[], t: string) => unknown }) =>
                fixer.insertTextAfterRange([0, 0], "import x from 'y';\n"),
            });
          },
        };
      },
    };
    linter.defineRule(PREFIX + '__rogue__', rogue as never);
    const collected: Finding[] = [];
    probeCase(
      '__rogue__',
      {
        code: 'const a = 1;\n',
        tester: 'ruleTesterTs',
        origin: 'planted',
        bucket: 'invalid',
      },
      collected,
    );
    expect(collected.map((f) => f.reason).sort()).toEqual([
      'DIRECTIVE_DEMOTED',
      'SHEBANG_DISPLACED',
      'SHEBANG_DISPLACED',
    ]);
  });

  it('clears a fixer that edits below the prologue (negative control)', () => {
    const polite = {
      meta: { type: 'problem', fixable: 'code', schema: [], messages: { x: 'x' } },
      create(context: never) {
        const ctx = context as unknown as { report: (d: unknown) => void };
        return {
          VariableDeclarator(node: { init?: { type: string; range: number[] } }) {
            if (node.init?.type !== 'Literal') return;
            ctx.report({
              node,
              messageId: 'x',
              fix: (fixer: { replaceTextRange: (r: number[], t: string) => unknown }) =>
                fixer.replaceTextRange(node.init!.range, '2'),
            });
          },
        };
      },
    };
    linter.defineRule(PREFIX + '__polite__', polite as never);
    const collected: Finding[] = [];
    probeCase(
      '__polite__',
      {
        code: 'const a = 1;\n',
        tester: 'ruleTesterTs',
        origin: 'planted',
        bucket: 'invalid',
      },
      collected,
    );
    expect(collected).toEqual([]);
  });

  it('no fixer displaces a shebang or demotes a directive', () => {
    if (process.env.PROLOGUE_DUMP) {
      fs.writeFileSync(
        path.join('/tmp', 'prologue-findings.json'),
        JSON.stringify(findings, null, 2),
      );
    }
    if (findings.length > 0) {
      const byRule = new Map<string, Finding[]>();
      for (const f of findings) {
        const key = `${f.rule} :: ${f.reason}`;
        byRule.set(key, [...(byRule.get(key) || []), f]);
      }
      throw new Error(
        [
          `${byRule.size} rule(s) break the prologue:`,
          ...[...byRule.entries()].map(([key, hits]) =>
            [
              `  ${key} (${hits.length} case(s), variant ${hits[0].variant})`,
              `    ${hits[0].origin}`,
              `    --- input ---`,
              hits[0].before.replace(/^/gm, '      '),
              `    --- fixed ---`,
              hits[0].after.replace(/^/gm, '      '),
            ].join('\n'),
          ),
        ].join('\n'),
      );
    }
    expect(findings).toEqual([]);
  });
});

/**
 * Corpus shape on every run, INCLUDING the two skipped populations. Silence
 * from an excluded rule and silence from a clean one look identical on the
 * page, so a filter that quietly grows is how this guard would decay.
 */
afterAll(() => {
  process.stdout.write(
    `\n[directive-prologue] rules=${stats.rulesProbed.size} ` +
      `considered=${stats.considered} baseFixed=${stats.baseFixed} ` +
      `variantFixed=${stats.variantFixed} findings=${findings.length} ` +
      `skipped(typeAware)=${stats.skippedTypeAware} ` +
      `skipped(notFixable)=${stats.skippedNotFixable}\n`,
  );
});

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
 *
 * Both rewrite channels are probed. `--fix` never applies a suggestion, and six
 * of the seven rules offering one are not `meta.fixable`, so a guard keyed on
 * `meta.fixable` alone leaves them to nobody — the #1733 decay. Three of those
 * six emit a top-of-file import, which is the exact edit policed here.
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
  suggestionEditsOf,
  silentWithoutProgramRuleNames,
} from '../utils/fixtureCorpus';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as {
  rules: Record<
    string,
    { meta?: { fixable?: string; hasSuggestions?: boolean } }
  >;
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
 * Every rule that can rewrite a source, through EITHER channel.
 *
 * Filtering on `meta.fixable` alone is the #1733 defect: six of the seven
 * rules offering suggestions are not `meta.fixable`, and three of those
 * (`react-memoize-literals`, `enforce-safe-stringify`,
 * `enforce-snapshot-state-narrowing`) emit a top-of-file import — exactly the
 * edit this guard exists to police. `--fix` never applies a suggestion, so the
 * fix channel cannot reach them.
 *
 * A rule that measurably reports NOTHING here is excluded for the opposite
 * reason: it would manufacture a false clean. That set is currently empty. The
 * wider "mentions the type checker" set was excluded before, on the theory that
 * a bare `Linter` has no program; it has one (isolated, single-file), and 11 of
 * the 12 rewriting rules among those 16 measurably rewrite under this very
 * harness, so the exclusion withheld live coverage (#1859). Both skipped
 * populations are counted and printed rather than dropped.
 */
const REWRITING_RULES = new Set(
  Object.entries(plugin.rules)
    .filter(
      ([name, rule]) =>
        (rule.meta?.fixable || rule.meta?.hasSuggestions) &&
        !silentWithoutProgramRuleNames.has(name),
    )
    .map(([name]) => name),
);

const corpus = harvestFixtureCorpus();

type Variant = {
  kind: 'shebang' | 'directive' | 'shebang+directive';
  prefix: string;
  /** The prologue token whose survival is asserted, when the variant has one. */
  directive?: string;
};

/**
 * `'use client'` is the directive whose loss is silent and expensive (the
 * component quietly becomes a server one), but the invariant is about position
 * in the prologue, not about which string sits there — so `'use server'` and a
 * double-quoted `"use strict"` are probed too. A rule keyed on one spelling
 * would otherwise pass here and fail on the others, the
 * exemption-keyed-on-one-spelling shape.
 */
const VARIANTS: Variant[] = [
  { kind: 'shebang', prefix: `${SHEBANG}\n` },
  { kind: 'directive', prefix: `${DIRECTIVE}\n`, directive: 'use client' },
  {
    kind: 'shebang+directive',
    prefix: `${SHEBANG}\n${DIRECTIVE}\n`,
    directive: 'use client',
  },
  { kind: 'directive', prefix: `'use server';\n`, directive: 'use server' },
  { kind: 'directive', prefix: `"use strict";\n`, directive: 'use strict' },
];

const configFor = (rules: Record<string, unknown>, tc: FixtureCase) =>
  ({
    parser: '@typescript-eslint/parser',
    parserOptions: parserOptionsFor(tc),
    rules,
  } as never);

const fixOf = (
  code: string,
  rules: Record<string, unknown>,
  tc: FixtureCase,
) => {
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
    first.expression.value === variant.directive;
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
  baseSuggested: 0,
  variantSuggested: 0,
  rulesProbed: new Set<string>(),
  rulesFixing: new Set<string>(),
  rulesSuggesting: new Set<string>(),
  skippedUndrivable: 0,
  skippedInert: 0,
};

const findings: Finding[] = [];

const verify = (
  code: string,
  rules: Record<string, unknown>,
  tc: FixtureCase,
) => {
  try {
    return linter.verify(code, configFor(rules, tc), {
      filename: defaultFilenameFor(tc),
    });
  } catch {
    return null;
  }
};

/**
 * Every state one accepted suggestion can reach. `--fix` never applies a
 * suggestion, so without this the six suggestion-only rules are probed by
 * nobody even though three of them emit a top-of-file import.
 */
const suggestionOutputs = (
  name: string,
  code: string,
  rules: Record<string, unknown>,
  tc: FixtureCase,
) => {
  const messages = verify(code, rules, tc);
  if (!messages) return [];
  return suggestionEditsOf(code, messages, PREFIX + name).map(
    (edit) => edit.output,
  );
};

const probeCase = (name: string, tc: FixtureCase, collect: Finding[]) => {
  const rules = { [PREFIX + name]: severityWithOptions(tc) as never };

  // A fixture that already opens with either token would make the invariant
  // ambiguous about which copy moved.
  if (tc.code.startsWith('#!') || /^\s*['"]use /.test(tc.code)) return;

  // A case the rule rewrites through NEITHER channel proves nothing about
  // placement, so it is not counted as probed.
  const base = fixOf(tc.code, rules, tc);
  const baseFixed = Boolean(base?.fixed);
  const baseSuggests = suggestionOutputs(name, tc.code, rules, tc).length > 0;
  if (!baseFixed && !baseSuggests) return;
  if (baseFixed) {
    stats.baseFixed++;
    stats.rulesFixing.add(name);
  }
  if (baseSuggests) {
    stats.baseSuggested++;
    stats.rulesSuggesting.add(name);
  }

  const record = (variant: Variant, after: string, source: string) => {
    const displaced = prologueBreak(after, variant, tc);
    if (!displaced) return;
    collect.push({
      rule: name,
      variant: variant.kind,
      origin: tc.origin,
      reason: displaced,
      before: source,
      after,
    });
  };

  for (const variant of VARIANTS) {
    const source = variant.prefix + tc.code;

    const fixed = fixOf(source, rules, tc);
    if (fixed?.fixed) {
      stats.variantFixed++;
      record(variant, fixed.output, source);
    }

    for (const output of suggestionOutputs(name, source, rules, tc)) {
      stats.variantSuggested++;
      record(variant, output, source);
    }
  }
};

/**
 * Fixtures this guard's probe cannot be applied to, named per (guard, rule)
 * with the reason.
 *
 * The probe prepends a TypeScript directive prologue (`'use client'`, a
 * shebang) to a fixture and asks whether the fixer still edits below it. A
 * `package.json` body and a Markdown document have no prologue and no
 * TypeScript AST, so a case in either language cannot pose the question.
 * Skipping by LANGUAGE rather than by parse failure is what keeps the skip
 * honest: a Markdown fence is an empty template literal, so several of those
 * fixtures do parse as TypeScript and would otherwise answer a TypeScript
 * question by accident (#1860).
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

let nonTypeScriptSkipped = 0;
const rulesWithNonTypeScriptFixtures = new Set<string>();

for (const [name, cases] of corpus.byRule) {
  if (silentWithoutProgramRuleNames.has(name)) {
    stats.skippedUndrivable++;
    continue;
  }
  if (!REWRITING_RULES.has(name)) {
    stats.skippedInert++;
    continue;
  }
  stats.rulesProbed.add(name);
  for (const tc of cases) {
    if (tc.language !== 'ts') {
      nonTypeScriptSkipped++;
      rulesWithNonTypeScriptFixtures.add(name);
      continue;
    }
    if (tc.bucket !== 'invalid') continue;
    stats.considered++;
    probeCase(name, tc, findings);
  }
}

describe('directive prologue and shebang survive every fixer', () => {
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

  /**
   * The suggestion channel gets its OWN floor. Rolled into the aggregate above,
   * the ~2,000 fix-channel rewrites would cover for it going to zero — which is
   * exactly how it stayed unmeasured in four other guards until #1733.
   */
  it('probed the suggestion channel', () => {
    expect(stats.rulesSuggesting.size).toBeGreaterThanOrEqual(3);
    expect(stats.baseSuggested).toBeGreaterThanOrEqual(20);
    expect(stats.variantSuggested).toBeGreaterThanOrEqual(100);
  });

  it('flags a fixer that inserts above the prologue (positive control)', () => {
    const rogue = {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { x: 'x' },
      },
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
              fix: (fixer: {
                insertTextAfterRange: (r: number[], t: string) => unknown;
              }) => fixer.insertTextAfterRange([0, 0], "import x from 'y';\n"),
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
      'DIRECTIVE_DEMOTED',
      'DIRECTIVE_DEMOTED',
      'SHEBANG_DISPLACED',
      'SHEBANG_DISPLACED',
    ]);
  });

  /**
   * The same planted defect offered as a SUGGESTION rather than a fix. Without
   * this, `REWRITING_RULES` could widen to include suggestion rules while the
   * probe still only ever drove `verifyAndFix`, and the sweep would read clean.
   */
  it('flags a SUGGESTION that inserts above the prologue (positive control)', () => {
    const rogue = {
      meta: {
        type: 'problem',
        hasSuggestions: true,
        schema: [],
        messages: { x: 'x', s: 's' },
      },
      create(context: never) {
        const ctx = context as unknown as { report: (d: unknown) => void };
        return {
          Program(node: { body: unknown[] }) {
            if (!node.body.length) return;
            ctx.report({
              node,
              messageId: 'x',
              suggest: [
                {
                  messageId: 's',
                  fix: (fixer: {
                    insertTextAfterRange: (r: number[], t: string) => unknown;
                  }) =>
                    fixer.insertTextAfterRange([0, 0], "import x from 'y';\n"),
                },
              ],
            });
          },
        };
      },
    };
    linter.defineRule(PREFIX + '__rogueSuggest__', rogue as never);
    const collected: Finding[] = [];
    const before = stats.variantSuggested;
    probeCase(
      '__rogueSuggest__',
      {
        code: 'const a = 1;\n',
        tester: 'ruleTesterTs',
        origin: 'planted',
        bucket: 'invalid',
      },
      collected,
    );
    expect(stats.variantSuggested).toBeGreaterThan(before);
    expect(collected.map((f) => f.reason).sort()).toEqual([
      'DIRECTIVE_DEMOTED',
      'DIRECTIVE_DEMOTED',
      'DIRECTIVE_DEMOTED',
      'SHEBANG_DISPLACED',
      'SHEBANG_DISPLACED',
    ]);
  });

  it('clears a fixer that edits below the prologue (negative control)', () => {
    const polite = {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { x: 'x' },
      },
      create(context: never) {
        const ctx = context as unknown as { report: (d: unknown) => void };
        return {
          VariableDeclarator(node: {
            init?: { type: string; range: number[] };
          }) {
            if (node.init?.type !== 'Literal') return;
            ctx.report({
              node,
              messageId: 'x',
              fix: (fixer: {
                replaceTextRange: (r: number[], t: string) => unknown;
              }) => fixer.replaceTextRange(node.init!.range, '2'),
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
      `variantFixed=${stats.variantFixed} suggested=${stats.variantSuggested} findings=${findings.length} ` +
      `skipped(undrivable)=${stats.skippedUndrivable} ` +
      `skipped(inert)=${stats.skippedInert}\n`,
  );
});

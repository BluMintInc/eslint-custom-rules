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
 *
 * NON-VACUITY IS PER-RULE (#1863). A floor on `variantFixed`, measured at
 * 23,560, is a global sum: the 26 lowest-yield rules can go silent inside it
 * without moving it. Every member of `REWRITING_RULES` therefore has to have
 * rewritten a prologue-bearing source, or be named below with a measured cause
 * that fails when it goes stale.
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
  /**
   * Which corpus bucket the fixture came from. A finding reached from a `valid`
   * fixture still names a real displacement, but the rewrite that produced it
   * only happens because the rule reports on code its author declared clean —
   * so the bucket is carried into the message rather than left to be re-derived
   * from `origin`.
   */
  bucket: string;
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
  /**
   * TypeScript fixtures of a rewriting rule that are not `invalid`, split by
   * bucket — 4,143 `valid` and 4,441 `output`.
   *
   * These used to be SKIPPED, on the reasoning that the guard's question is
   * asked of a fixture whose rule reports. It is not: the question is whether a
   * rewrite displaces a prologue, and a rewrite reached from any bucket poses it
   * just as well. Driving both through `probeCase` costs almost nothing beyond
   * the base step, because a case the rule rewrites through neither channel
   * returns before the variant arm — so the 8,584 are filtered down to the
   * handful that actually rewrite by the code that was already there (#2255).
   *
   * Counted per bucket, not folded into `considered`, so the expansion stays
   * legible: a corpus that stopped holding either bucket would otherwise be
   * indistinguishable from one this guard simply covers (#1984).
   */
  validBucketProbed: 0,
  outputBucketProbed: 0,
  /**
   * Base rewrites split by the bucket they came from, so the population the
   * expansion actually added is a measured number rather than a claim. A
   * `valid` fixture that rewrites is worth reading twice — see the arm below.
   */
  baseRewritesByBucket: { invalid: 0, valid: 0, output: 0 } as Record<
    string,
    number
  >,
  /** Rules contributing a rewrite from a bucket the sweep used to drop. */
  rulesRewritingOffInvalid: new Set<string>(),
  /**
   * Fixtures that already open with a shebang or a directive of their own. The
   * variant arm cannot use them — a second copy of the same token makes "which
   * one moved" ambiguous — but they are the most realistic inputs this guard
   * has, so they get their own arm below rather than a silent `return`.
   */
  ownPrologue: 0,
  ownPrologueRewritten: 0,
  rulesOwnPrologue: new Set<string>(),
};

type Drive = {
  /** TypeScript fixtures reaching `probeCase`, in every bucket. */
  considered: number;
  /** Those not already carrying a shebang or a directive of their own. */
  probeable: number;
  /** Those the rule rewrites through EITHER channel before any prefix. */
  baseRewrites: number;
  /** Rewrites observed with a prologue prepended — the actual measurement. */
  variantRewrites: number;
  /**
   * The suggestion channel alone. `--fix` never applies a suggestion, so rolled
   * into the count above the fix channel's thousands of rewrites would cover for
   * it reaching zero — the #1733 decay, at the per-rule scale.
   */
  variantSuggestions: number;
};

const driveByRule = new Map<string, Drive>();
const driveOf = (name: string): Drive => {
  const existing = driveByRule.get(name);
  if (existing) return existing;
  const fresh: Drive = {
    considered: 0,
    probeable: 0,
    baseRewrites: 0,
    variantRewrites: 0,
    variantSuggestions: 0,
  };
  driveByRule.set(name, fresh);
  return fresh;
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

/**
 * Splices text at offset 0 — above whatever prologue the source carries. Shared
 * by the prepended-variant control and the own-prologue controls so both arms
 * are proven against the SAME defect, rather than each against its own double.
 */
const ROGUE_PREPENDER = {
  meta: {
    type: 'problem',
    fixable: 'code',
    schema: [],
    messages: { x: 'x' },
  },
  create(context: never) {
    const ctx = context as unknown as { report: (d: unknown) => void };
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

/** The prologue a fixture carries of its OWN, or null if it carries none. */
type OwnPrologue = { shebang: boolean; directive: string | null };

const ownPrologueOf = (tc: FixtureCase): OwnPrologue | null => {
  const shebang = tc.code.startsWith('#!');
  let directive: string | null = null;
  try {
    const body = tsParser.parse(tc.code, {
      ...parserOptionsFor(tc),
      loc: true,
      range: true,
      tokens: true,
      comment: true,
    }).body as {
      type: string;
      expression?: { type: string; value?: unknown };
    }[];
    const first = body[0];
    if (
      first?.type === 'ExpressionStatement' &&
      first.expression?.type === 'Literal' &&
      typeof first.expression.value === 'string' &&
      /^use /.test(first.expression.value)
    ) {
      directive = first.expression.value;
    }
  } catch {
    return null;
  }
  if (!shebang && !directive) {
    return null;
  }
  return { shebang, directive };
};

/**
 * The same two invariants asked of the prologue the fixture ALREADY carries.
 *
 * Nothing is prepended, so there is no second copy and no ambiguity about which
 * one moved — the objection that made the variant arm skip this population is
 * a property of the synthetic prefix, not of the fixtures.
 */
const ownPrologueBreak = (
  output: string,
  own: OwnPrologue,
  tc: FixtureCase,
): Finding['reason'] | null => {
  if (own.shebang && !output.startsWith('#!')) {
    return 'SHEBANG_DISPLACED';
  }
  if (!own.directive) {
    return null;
  }
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
    first.expression.value === own.directive;
  return isDirective ? null : 'DIRECTIVE_DEMOTED';
};

const probeOwnPrologue = (
  name: string,
  tc: FixtureCase,
  own: OwnPrologue,
  collect: Finding[],
) => {
  const rules = { [PREFIX + name]: severityWithOptions(tc) as never };
  stats.ownPrologue++;
  const record = (after: string) => {
    const displaced = ownPrologueBreak(after, own, tc);
    if (!displaced) return;
    collect.push({
      rule: name,
      variant:
        own.shebang && own.directive
          ? 'shebang+directive'
          : own.shebang
          ? 'shebang'
          : 'directive',
      origin: `${tc.origin} [own prologue]`,
      bucket: tc.bucket,
      reason: displaced,
      before: tc.code,
      after,
    });
  };

  const fixed = fixOf(tc.code, rules, tc);
  if (fixed?.fixed) {
    stats.ownPrologueRewritten++;
    stats.rulesOwnPrologue.add(name);
    record(fixed.output);
  }
  for (const output of suggestionOutputs(name, tc.code, rules, tc)) {
    stats.ownPrologueRewritten++;
    stats.rulesOwnPrologue.add(name);
    record(output);
  }
};

const probeCase = (name: string, tc: FixtureCase, collect: Finding[]) => {
  const rules = { [PREFIX + name]: severityWithOptions(tc) as never };
  const drive = driveOf(name);

  // A fixture that already opens with either token would make the invariant
  // ambiguous about which copy moved — for the PREPENDED prefix. It is not a
  // reason to drop the fixture: the prologue it already carries answers the
  // same question with no second copy involved, so it is routed to its own arm
  // rather than returned on in silence. That silent `return` sat above
  // `drive.probeable++`, so the population was invisible to every counter
  // (#2216), and it holds this guard's most realistic inputs — including the
  // #1695 regression fixtures the guard generalises.
  if (tc.code.startsWith('#!') || /^\s*['"]use /.test(tc.code)) {
    const own = ownPrologueOf(tc);
    if (own) {
      probeOwnPrologue(name, tc, own, collect);
    }
    return;
  }
  drive.probeable++;

  // A case the rule rewrites through NEITHER channel proves nothing about
  // placement, so it is not counted as probed.
  const base = fixOf(tc.code, rules, tc);
  const baseFixed = Boolean(base?.fixed);
  const baseSuggests = suggestionOutputs(name, tc.code, rules, tc).length > 0;
  if (!baseFixed && !baseSuggests) return;
  drive.baseRewrites++;
  stats.baseRewritesByBucket[tc.bucket] =
    (stats.baseRewritesByBucket[tc.bucket] ?? 0) + 1;
  if (tc.bucket !== 'invalid') stats.rulesRewritingOffInvalid.add(name);
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
      bucket: tc.bucket,
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
      drive.variantRewrites++;
      record(variant, fixed.output, source);
    }

    for (const output of suggestionOutputs(name, source, rules, tc)) {
      stats.variantSuggested++;
      drive.variantRewrites++;
      drive.variantSuggestions++;
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
    if (tc.bucket === 'valid') stats.validBucketProbed++;
    else if (tc.bucket === 'output') stats.outputBucketProbed++;
    stats.considered++;
    driveOf(name).considered++;
    probeCase(name, tc, findings);
  }
}

/**
 * Why a rewriting rule could never have been driven with a prologue in front of
 * it, read off the counters above rather than asserted by hand.
 *
 * Ordered outermost precondition first, so the cause named is the FIRST that
 * failed: a rule with no TypeScript fixture is not also "declines once a
 * prologue is present", it was never linted here at all.
 */
const UNDRIVEN_CAUSES = {
  noCorpus:
    'the harvest holds no fixture for it, so nothing was ever handed to its fixer',
  noTsFixture:
    'declares no TypeScript fixture in any bucket, and a directive prologue is a TypeScript question',
  everyFixtureHasItsOwnPrologue:
    'every fixture already opens with a shebang or a directive, which makes it ambiguous which copy moved',
  neverRewritesItsOwnFixtures:
    'declares a fix or a suggestion yet offers neither on any of its own fixtures, so no rewrite exists to place',
  declinesOnceProloguePresent:
    'rewrites its own fixtures but produces nothing once a prologue is prepended',
  neverSuggestsOnItsOwnFixtures:
    'declares meta.hasSuggestions yet offers no suggestion on any of its own fixtures, so the suggestion channel has nothing to place',
} as const;
type UndrivenCause = keyof typeof UNDRIVEN_CAUSES;

const undrivenCauseOf = (name: string): UndrivenCause | null => {
  const drive = driveByRule.get(name);
  if (!corpus.byRule.has(name)) return 'noCorpus';
  if (!drive || drive.considered === 0) return 'noTsFixture';
  if (drive.probeable === 0) return 'everyFixtureHasItsOwnPrologue';
  if (drive.baseRewrites === 0) return 'neverRewritesItsOwnFixtures';
  if (drive.variantRewrites === 0) return 'declinesOnceProloguePresent';
  return null;
};

const measuredUndriven: Record<string, UndrivenCause> = Object.fromEntries(
  [...REWRITING_RULES]
    .sort()
    .map((name) => [name, undrivenCauseOf(name)] as const)
    .filter((entry): entry is readonly [string, UndrivenCause] => !!entry[1]),
);

/**
 * Rewriting rules this probe never drove with a prologue present, each with the
 * measured cause.
 *
 * The floors below say the sweep produced 23,560 variant rewrites across 82
 * rules; they cannot say that any PARTICULAR rule contributed one, and a rule
 * whose fixer went silent drops to zero inside a five-figure sum without moving
 * it (#1863). This map is the other direction: every member of
 * `REWRITING_RULES` either measurably rewrote a prologue-bearing source, or is
 * named here. Asserted as an exact map, so an unrecorded skip, a stale entry and
 * a changed cause all fail.
 */
const UNDRIVEN_RULES: Record<string, UndrivenCause> = {
  'enforce-typescript-markdown-code-blocks': 'noTsFixture',
  'no-unpinned-dependencies': 'noTsFixture',
};

/**
 * The suggestion channel, accounted separately for the reason its floor is
 * separate: `--fix` never applies a suggestion, and the fix channel's 23,560
 * rewrites would cover for every suggestion-capable rule going silent at once.
 */
const suggestionRules = Object.entries(plugin.rules)
  .filter(([, rule]) => rule.meta?.hasSuggestions)
  .map(([name]) => name)
  .sort();

const suggestionCauseOf = (name: string): UndrivenCause | null => {
  const drive = driveByRule.get(name);
  if (drive?.variantSuggestions) return null;
  return undrivenCauseOf(name) ?? 'neverSuggestsOnItsOwnFixtures';
};

const measuredSuggestionUndriven: Record<string, UndrivenCause> =
  Object.fromEntries(
    suggestionRules
      .map((name) => [name, suggestionCauseOf(name)] as const)
      .filter((entry): entry is readonly [string, UndrivenCause] => !!entry[1]),
  );

/**
 * Suggestion-offering rules whose suggestions this probe never placed under a
 * prologue, each with the measured cause. SHIPS EMPTY: all seven offer one.
 */
const SUGGESTION_UNDRIVEN_RULES: Record<string, UndrivenCause> = {};

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
    // A bare `> 0` lets the whole non-TypeScript population fall to one case
    // while the set equality above still holds, since two rules own all of it.
    expect(nonTypeScriptSkipped).toBeGreaterThanOrEqual(100); // measured 108
  });

  it('harvested the suite corpus', () => {
    expect(corpus.failures).toEqual([]);
    expect(corpus.filesLoaded).toBeGreaterThanOrEqual(275); // measured 282
  });

  /**
   * The four rule- and bucket-level skips, pinned to the corpus properties they
   * must equal rather than to ceilings. Each was a bare `continue` beside a
   * printed-but-unread number, and a filter that started dropping probeable
   * fixtures for an unrelated reason would shrink this sweep at a steady green
   * (#1984, #2225).
   *
   * The rule-level pair is derived from the same sets the loop consults, so an
   * exclusion list that grows without a matching rule population fails here.
   */
  it('accounts for every rule and every bucket it sets aside', () => {
    const owners = [...corpus.byRule.keys()];
    expect(stats.skippedUndrivable).toBe(
      owners.filter((name) => silentWithoutProgramRuleNames.has(name)).length,
    );
    expect(stats.skippedInert).toBe(
      owners.filter(
        (name) =>
          !silentWithoutProgramRuleNames.has(name) &&
          !REWRITING_RULES.has(name),
      ).length,
    );
    // `silentWithoutProgramRuleNames` ships empty, so the undrivable skip is
    // structurally zero; the equality above is what makes an entry added to that
    // set show up here as a population rather than as silence.
    expect(stats.skippedInert).toBeGreaterThan(0);

    const bucketCount = (bucket: string) =>
      [...corpus.byRule.entries()]
        .filter(
          ([name]) =>
            !silentWithoutProgramRuleNames.has(name) &&
            REWRITING_RULES.has(name),
        )
        .reduce(
          (count, [, cases]) =>
            count +
            cases.filter((tc) => tc.language === 'ts' && tc.bucket === bucket)
              .length,
          0,
        );
    // Every TypeScript case of a rewriting rule is now DRIVEN, whichever bucket
    // declared it. The equalities are kept pointing at the same corpus
    // properties so a bucket that stopped reaching the sweep fails here rather
    // than shrinking `considered` by an amount nobody notices.
    expect(stats.validBucketProbed).toBe(bucketCount('valid'));
    expect(stats.outputBucketProbed).toBe(bucketCount('output'));
    expect(stats.validBucketProbed).toBeGreaterThan(4000); // measured 4,143
    expect(stats.outputBucketProbed).toBeGreaterThan(4300); // measured 4,441
    expect(stats.considered).toBe(
      bucketCount('valid') + bucketCount('output') + bucketCount('invalid'),
    );
  });

  /**
   * Floors, not a bare `findings.length === 0`. A corpus that silently shrank
   * to nothing reports zero findings and reads identically to a clean sweep.
   */
  it('probed a non-vacuous corpus', () => {
    // eslint-disable-next-line no-console
    console.log(
      `[directive-prologue] files=${corpus.filesLoaded} ` +
        `rulesProbed=${stats.rulesProbed.size} considered=${stats.considered} ` +
        `baseFixed=${stats.baseFixed} variantFixed=${stats.variantFixed} ` +
        `rulesFixing=${stats.rulesFixing.size} ` +
        `ownPrologue=${stats.ownPrologue}/${stats.ownPrologueRewritten}/${stats.rulesOwnPrologue.size} ` +
        `baseSuggested=${stats.baseSuggested} variantSuggested=${stats.variantSuggested} ` +
        `rulesSuggesting=${stats.rulesSuggesting.size} ` +
        `validProbed=${stats.validBucketProbed} outputProbed=${stats.outputBucketProbed} ` +
        `baseByBucket=${JSON.stringify(stats.baseRewritesByBucket)} ` +
        `rulesOffInvalid=${stats.rulesRewritingOffInvalid.size} ` +
        `skippedInert=${stats.skippedInert} nonTsSkipped=${nonTypeScriptSkipped} ` +
        `rewritingRules=${REWRITING_RULES.size}`,
    );
    expect(stats.rulesProbed.size).toBeGreaterThanOrEqual(85); // measured 90
    expect(stats.considered).toBeGreaterThanOrEqual(14800); // measured 15,074
    // #2298 moved most of prefer-spread-over-reassembly's rewrites from the
    // fix channel to the suggestion channel, which is where the two floors
    // below lost their headroom; the suggestion counters below carry them.
    expect(stats.baseFixed).toBeGreaterThanOrEqual(4600); // measured 4,653
    expect(stats.variantFixed).toBeGreaterThanOrEqual(23000); // measured 23,245
    expect(stats.rulesFixing.size).toBeGreaterThanOrEqual(80); // measured 83
  });

  /**
   * The yield of driving the buckets this guard used to drop.
   *
   * Floored, because the expansion is worth nothing if the added cases all
   * return at the base step: 8,584 extra fixtures that never rewrite would cost
   * runtime and prove exactly as much as skipping them did. Measured at 171
   * base rewrites (37 `valid`, 134 `output`) spread across 41 rules — twice the
   * 20 the issue estimated — each of which the variant arm then places a
   * prologue in front of.
   *
   * The `valid` 37 are the ones worth reading twice, and they are NOT evidence
   * of an over-reporting rule. A `valid` fixture is declared valid under its own
   * suite's `RuleTester` — its declared `filename` and `parserOptions`, and for
   * a type-aware rule a real `project`. This harness lints it under an invented
   * filename with `project` stripped, so a rule gated on either reports here and
   * not there. The rewrite is therefore real *for this harness*, which is all
   * this guard needs: it asks whether a fixer that runs displaces a prologue,
   * not whether the fixer should have run. Findings carry their `bucket` so a
   * report from this population is never mistaken for one off an `invalid`
   * fixture.
   */
  it('the expanded buckets actually yield rewrites to probe', () => {
    expect(
      stats.baseRewritesByBucket.valid + stats.baseRewritesByBucket.output,
    ).toBeGreaterThanOrEqual(160); // measured 171
    expect(stats.baseRewritesByBucket.valid).toBeGreaterThanOrEqual(30); // measured 37
    expect(stats.baseRewritesByBucket.output).toBeGreaterThanOrEqual(125); // measured 134
    expect(stats.rulesRewritingOffInvalid.size).toBeGreaterThanOrEqual(38); // measured 41
    // The buckets are driven, not merely counted: a base rewrite can only be
    // recorded from a case that reached `probeCase`.
    expect(stats.baseRewritesByBucket.invalid).toBeGreaterThan(
      stats.baseRewritesByBucket.valid,
    );
  });

  /**
   * The population the variant arm cannot use, now asked about the prologue it
   * already carries. Before #2216 these were dropped above `drive.probeable++`,
   * invisible to every counter.
   *
   * Measured at 140 fixtures across 21 rules, of which 70 rewrite. The two
   * numbers separated when #2255 brought the `valid` and `output` buckets into
   * the sweep, and the gap is the expected shape rather than a loss: a `valid`
   * fixture is one its author declared the rule silent on, and an `output`
   * fixture is already at its post-fix state, so neither is likely to rewrite.
   * `ownPrologueRewritten` is floored separately for exactly that reason — it is
   * the half that proves this arm drives fixers rather than merely counting
   * inputs, and folding the two together would let the driven half collapse
   * behind a rising total.
   *
   * The planted controls below route through `probeCase` too and so add three
   * to these counters. The floors sit far enough above three that a collapsed
   * corpus still fails them — a control that could carry its own floor would
   * certify nothing.
   */
  it('probes the fixtures that carry a prologue of their own', () => {
    expect(stats.ownPrologue).toBeGreaterThanOrEqual(135); // measured 140
    expect(stats.ownPrologueRewritten).toBeGreaterThanOrEqual(68); // measured 70
    expect(stats.rulesOwnPrologue.size).toBeGreaterThanOrEqual(20); // measured 21
  });

  it('flags a fixer that demotes the fixture OWN directive (positive)', () => {
    linter.defineRule(PREFIX + '__rogue_own__', ROGUE_PREPENDER as never);
    const collected: Finding[] = [];
    probeCase(
      '__rogue_own__',
      {
        code: "'use client';\nconst a = 1;\n",
        tester: 'ruleTesterTs',
        origin: 'planted',
        bucket: 'invalid',
      },
      collected,
    );
    expect(collected.map((f) => f.reason)).toEqual(['DIRECTIVE_DEMOTED']);
  });

  it('flags a fixer that displaces the fixture OWN shebang (positive)', () => {
    linter.defineRule(
      PREFIX + '__rogue_own_shebang__',
      ROGUE_PREPENDER as never,
    );
    const collected: Finding[] = [];
    probeCase(
      '__rogue_own_shebang__',
      {
        code: '#!/usr/bin/env node\nconst a = 1;\n',
        tester: 'ruleTesterTs',
        origin: 'planted',
        bucket: 'invalid',
      },
      collected,
    );
    expect(collected.map((f) => f.reason)).toEqual(['SHEBANG_DISPLACED']);
  });

  /**
   * The negative half. Without it a checker that returned a finding for every
   * rewrite would pass both positives above and prove nothing — and the arm
   * would condemn all 70 corpus fixtures, which are the reason it exists.
   */
  it('stays silent on a fixer that writes BELOW the own prologue (negative)', () => {
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
          Program(node: { body: unknown[]; range: [number, number] }) {
            if (node.body.length < 2) return;
            const second = node.body[1] as { range: [number, number] };
            ctx.report({
              node,
              messageId: 'x',
              fix: (fixer: {
                insertTextBeforeRange: (r: number[], t: string) => unknown;
              }) =>
                fixer.insertTextBeforeRange(
                  second.range,
                  "import x from 'y';\n",
                ),
            });
          },
        };
      },
    };
    linter.defineRule(PREFIX + '__polite_own__', polite as never);
    const collected: Finding[] = [];
    probeCase(
      '__polite_own__',
      {
        code: "'use client';\nconst a = 1;\n",
        tester: 'ruleTesterTs',
        origin: 'planted',
        bucket: 'invalid',
      },
      collected,
    );
    // It must REWRITE and still report nothing, or it would pass by declining.
    expect(stats.ownPrologueRewritten).toBeGreaterThan(0);
    expect(collected).toEqual([]);
  });

  /**
   * Per rule, which is the unit the floors above cannot express. Both
   * directions: an unlisted rule that stops rewriting fails as an unrecorded
   * skip, and a listed rule that starts rewriting fails as a stale entry —
   * which is what keeps an exemption from outliving its reason (#1839).
   */
  it('accounts for every rewriting rule it could not drive', () => {
    expect(measuredUndriven).toEqual(UNDRIVEN_RULES);
    expect(
      Object.values(UNDRIVEN_RULES).filter((cause) => !UNDRIVEN_CAUSES[cause]),
    ).toEqual([]);
    // An entry outside `REWRITING_RULES` is never measured by the equality
    // above, so it would be an exemption nothing can retire.
    expect(
      Object.keys(UNDRIVEN_RULES).filter((name) => !REWRITING_RULES.has(name)),
    ).toEqual([]);
    expect(REWRITING_RULES.size).toBeGreaterThanOrEqual(88); // measured 90
  });

  /**
   * And every rule NOT listed must have driven a variant rewrite, stated as its
   * own assertion rather than left implicit in the map equality: a row that
   * renders green having rewritten nothing is worse than a missing row, because
   * it names the rule in the jest output (#1861).
   */
  it.each(
    [...REWRITING_RULES].sort().filter((name) => !(name in UNDRIVEN_RULES)),
  )('drove %s with a prologue in front of it', (name) => {
    expect(driveByRule.get(name)?.variantRewrites || 0).toBeGreaterThan(0);
  });

  /**
   * The suggestion channel gets its OWN floor. Rolled into the aggregate above,
   * the 23,560 fix-channel rewrites would cover for it going to zero — which is
   * exactly how it stayed unmeasured in four other guards until #1733.
   */
  it('probed the suggestion channel', () => {
    expect(stats.rulesSuggesting.size).toBeGreaterThanOrEqual(6); // measured 8
    expect(stats.baseSuggested).toBeGreaterThanOrEqual(310); // measured 438
    expect(stats.variantSuggested).toBeGreaterThanOrEqual(1700); // measured 2,345
  });

  /** Per rule, so one chatty suggester cannot cover for the other seven. */
  it('accounts for every suggestion-offering rule', () => {
    expect(measuredSuggestionUndriven).toEqual(SUGGESTION_UNDRIVEN_RULES);
    expect(suggestionRules.length).toBeGreaterThanOrEqual(5); // measured 8
    expect(
      Object.keys(SUGGESTION_UNDRIVEN_RULES).filter(
        (name) => !suggestionRules.includes(name),
      ),
    ).toEqual([]);
  });

  it('flags a fixer that inserts above the prologue (positive control)', () => {
    linter.defineRule(PREFIX + '__rogue__', ROGUE_PREPENDER as never);
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
      `skipped(inert)=${stats.skippedInert} ` +
      `probed(valid)=${stats.validBucketProbed} ` +
      `probed(output)=${stats.outputBucketProbed} ` +
      `ownPrologue=${stats.ownPrologue} ` +
      `ownPrologueRewritten=${stats.ownPrologueRewritten} ` +
      `rulesOwnPrologue=${stats.rulesOwnPrologue.size}\n`,
  );
});

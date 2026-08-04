/**
 * A fixer must not write text it does not own.
 *
 * Generalizes #1693/#1694/#1695. Each was a fixer that rebuilt a region from its
 * parts instead of editing the part it meant to change: `enforce-microdiff`
 * re-emitted a whole function body (deleting every other statement in it),
 * `enforce-centralized-mock-firestore` dropped whole LINES by index (deleting a
 * live statement that shared one) and re-emitted the file's leading trivia.
 *
 * The axis makes that visible without needing to know what each fixer intends:
 * perturb the input in a provably comment-only way and re-run `--fix`. Comments
 * carry no semantics, so with them stripped the transform must be identical. A
 * fixer that reconstructs a span instead of editing it fails immediately —
 * the perturbation lands inside the span it re-emits.
 *
 * Nothing else in the suite can see this class:
 *   - `fixer-convergence` / `fixer-type-safety` / `recommended-config-fix-closure`
 *     all judge the fix OUTPUT on its own; a body rebuilt without its statements
 *     is a perfectly good output in isolation.
 *   - `comment-orphan` covers a fixer deleting an eslint-disable, i.e. one
 *     comment shape and only when its subject survives.
 *   - The agora `fix: true` sweep is structurally blind: the mangled output
 *     parses, binds every reference, and converges. It returned 0 findings over
 *     8,700 files in the same cycle these three bugs were live.
 *
 * Neutrality is PROVEN, not assumed: a variant is used only when its non-comment
 * token stream is byte-identical to the original's. Without that guard a marker
 * landing inside a template literal or JSX text manufactures findings.
 */
import fs from 'fs';
import path from 'path';
import { Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import { harvestRuleTesterCases } from '../utils/harvestRuleTesterCases';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as {
  rules: Record<string, { meta?: { fixable?: string } }>;
};
/* eslint-enable @typescript-eslint/no-var-requires */

const PREFIX = '@blumintinc/blumint/';
const RULES_DIR = path.join(__dirname, '..', 'rules');

/**
 * Type-aware rules are excluded for the same reason as
 * `exemption-composition-closure`: with no `parserOptions.project` they report
 * nothing, so they would contribute a false clean rather than a finding.
 */
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

/** Only a rule that rewrites text can destroy a comment. */
const FIXABLE_RULES = new Set(
  Object.entries(plugin.rules)
    .filter(([name, rule]) => rule.meta?.fixable && !typeAwareNames.has(name))
    .map(([name]) => name),
);

const linter = new Linter();
linter.defineParser('ts', tsParser as never);
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}

const configFor = (
  rules: Record<string, unknown>,
  parserOptions: unknown,
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

const parseOptions = {
  ecmaVersion: 2022,
  sourceType: 'module',
  ecmaFeatures: { jsx: true },
  loc: true,
  range: true,
  comment: true,
  tokens: true,
} as const;

/**
 * Signature of the non-comment token stream. Two sources sharing a signature
 * differ only in comments and whitespace, so any difference in what a fixer
 * writes between them is the fixer's fault rather than a reaction to changed
 * code. `null` means the text does not parse, which is itself a finding when the
 * unperturbed baseline did.
 */
const tokenSignature = (text: string): string | null => {
  try {
    const ast = tsParser.parse(text, parseOptions as never) as {
      tokens?: { type: string; value: string }[];
    };
    if (!ast.tokens) return null;
    return ast.tokens.map((token) => `${token.type} ${token.value}`).join('');
  } catch {
    return null;
  }
};

const commentsOf = (text: string): string[] | null => {
  try {
    const ast = tsParser.parse(text, parseOptions as never) as {
      comments?: { value: string }[];
    };
    return (ast.comments || []).map((comment) => comment.value);
  } catch {
    return null;
  }
};

type InvalidCase = {
  code: string;
  filename: string;
  options?: readonly unknown[];
  parserOptions?: unknown;
  origin: string;
};

/**
 * Resolved by OBJECT IDENTITY, never by the display name `run` received: ~100 of
 * the 311 suites pass a name that is not a rule name, and name-keyed matching
 * drops every case they declare.
 */
const ruleNameByIdentity = new Map<unknown, string>();
for (const [name, rule] of Object.entries(plugin.rules)) {
  ruleNameByIdentity.set(rule, name);
}

const harvested = harvestRuleTesterCases();
const TS_TESTERS = new Set(['ruleTesterTs', 'ruleTesterJsx']);

const casesByRule = new Map<string, InvalidCase[]>();
for (const suite of harvested.suites) {
  const name = ruleNameByIdentity.get(suite.rule);
  if (!name || !FIXABLE_RULES.has(name)) continue;
  if (!TS_TESTERS.has(suite.tester)) continue;

  const bucket = casesByRule.get(name) || [];
  for (const raw of suite.invalid) {
    const testCase = raw as Partial<InvalidCase> | null | undefined;
    if (!testCase || typeof testCase.code !== 'string') continue;
    bucket.push({
      code: testCase.code,
      filename:
        testCase.filename ||
        (suite.tester === 'ruleTesterJsx' ? 'x.tsx' : 'x.ts'),
      options: testCase.options,
      parserOptions: testCase.parserOptions,
      origin: `src/tests/${suite.file}`,
    });
  }
  casesByRule.set(name, bucket);
}

const BLOCK_MARKER = '/* fidelity */';
const LINE_MARKER = '// fidelity';
const MARKER_TEXT = 'fidelity';

/**
 * Both shapes are needed. A block comment is inert almost everywhere; a LINE
 * comment is the one that turns following code into a comment when a fixer joins
 * lines, which is the severe half of the class.
 */
type Variant = { kind: string; text: string };

function insertLineBefore(
  text: string,
  line: number,
  marker: string,
): string | null {
  const lines = text.split('\n');
  if (line < 1 || line > lines.length) return null;
  const indent = (lines[line - 1].match(/^\s*/) || [''])[0];
  lines.splice(line - 1, 0, `${indent}${marker}`);
  return lines.join('\n');
}

function appendTrailing(
  text: string,
  line: number,
  marker: string,
): string | null {
  const lines = text.split('\n');
  if (line < 1 || line > lines.length) return null;
  if (!lines[line - 1].trim()) return null;
  lines[line - 1] = `${lines[line - 1]} ${marker}`;
  return lines.join('\n');
}

type Finding = {
  rule: string;
  kind: 'PARSE_BREAK' | 'TRANSFORM_DIVERGED' | 'COMMENT_LOST';
  variantKind: string;
  origin: string;
  filename: string;
  before: string;
  variant: string;
  baseOutput: string;
  variantOutput: string;
};

/** Non-vacuity accounting; a zero finding count means nothing without these. */
const stats = {
  considered: 0,
  reported: 0,
  baselineFixed: 0,
  comparisons: 0,
  rejectedNonNeutral: 0,
  rulesCompared: new Set<string>(),
};

const soloRules = (name: string, testCase: InvalidCase) => ({
  [PREFIX + name]: testCase.options
    ? ['error', ...testCase.options]
    : ('error' as unknown),
});

const verify = (
  code: string,
  rules: Record<string, unknown>,
  tc: InvalidCase,
) => {
  try {
    return linter
      .verify(code, configFor(rules, tc.parserOptions), {
        filename: tc.filename,
      })
      .filter((message) => !message.fatal);
  } catch {
    return null;
  }
};

const fixOf = (
  code: string,
  rules: Record<string, unknown>,
  tc: InvalidCase,
) => {
  try {
    return linter.verifyAndFix(code, configFor(rules, tc.parserOptions), {
      filename: tc.filename,
    });
  } catch {
    return null;
  }
};

/**
 * The comparison, for one case: fix the original, fix each provably-neutral
 * commented variant, and demand the two outputs agree once comments are removed.
 */
function compareCase(rule: string, tc: InvalidCase, into: Finding[]): void {
  stats.considered++;
  const solo = soloRules(rule, tc);

  const signature = tokenSignature(tc.code);
  if (signature === null) return;

  const base = verify(tc.code, solo, tc);
  if (!base || base.length === 0) return;
  stats.reported++;

  const baseFix = fixOf(tc.code, solo, tc);
  if (!baseFix) return;
  const baseSignature = tokenSignature(baseFix.output);
  // An unparseable baseline output is a different axis (`fixer-convergence`).
  if (baseSignature === null) return;
  if (baseFix.fixed) stats.baselineFixed++;

  const variants: Variant[] = [];
  const addVariant = (kind: string, text: string | null) => {
    if (text === null) return;
    if (tokenSignature(text) !== signature) {
      stats.rejectedNonNeutral++;
      return;
    }
    variants.push({ kind, text });
  };
  addVariant('LEADING_BLOCK', `${BLOCK_MARKER}\n${tc.code}`);
  addVariant('LEADING_LINE', `${LINE_MARKER}\n${tc.code}`);

  // Reported lines are where a fixer edits, so they are where a rebuilt span
  // shows up. Capped so one many-error fixture cannot dominate the run.
  const reportedLines = [
    ...new Set(
      base
        .map((message) => message.line)
        .filter((line): line is number => Number.isInteger(line)),
    ),
  ].slice(0, 4);
  for (const line of reportedLines) {
    addVariant('BLOCK_ABOVE', insertLineBefore(tc.code, line, BLOCK_MARKER));
    addVariant('LINE_ABOVE', insertLineBefore(tc.code, line, LINE_MARKER));
    addVariant('TRAILING_BLOCK', appendTrailing(tc.code, line, BLOCK_MARKER));
    addVariant('TRAILING_LINE', appendTrailing(tc.code, line, LINE_MARKER));
  }

  for (const variant of variants) {
    const variantFix = fixOf(variant.text, solo, tc);
    if (!variantFix) continue;
    stats.comparisons++;
    stats.rulesCompared.add(rule);

    const record = (kind: Finding['kind']) =>
      into.push({
        rule,
        kind,
        variantKind: variant.kind,
        origin: tc.origin,
        filename: tc.filename,
        before: tc.code,
        variant: variant.text,
        baseOutput: baseFix.output,
        variantOutput: variantFix.output,
      });

    const variantSignature = tokenSignature(variantFix.output);
    if (variantSignature === null) {
      record('PARSE_BREAK');
      continue;
    }
    if (variantSignature !== baseSignature) {
      record('TRANSFORM_DIVERGED');
      continue;
    }
    // Substring, not equality: a marker appended to a line that already ends in
    // a comment MERGES into it, and an exact-match predicate reads every such
    // case as a deletion.
    if (!variantFix.output.includes(MARKER_TEXT)) {
      record('COMMENT_LOST');
      continue;
    }
    const comments = commentsOf(variantFix.output) || [];
    if (!comments.some((comment) => comment.includes(MARKER_TEXT))) {
      // Survives as text but is no longer a comment: it was absorbed into a
      // string or into another comment's body.
      record('COMMENT_LOST');
    }
  }
}

function collectFindings(): Finding[] {
  const findings: Finding[] = [];
  for (const [rule, cases] of casesByRule) {
    for (const testCase of cases) compareCase(rule, testCase, findings);
  }
  return findings;
}

const findings = collectFindings();
const groupKey = (finding: Finding) => `${finding.rule} :: ${finding.kind}`;

/**
 * Comment-sensitive fix behaviour that is understood and accepted, keyed
 * `<rule> :: <kind>`.
 *
 * AN ENTRY IS NOT A WAY TO MAKE A BUILD GREEN. Each records a verified reason
 * why this rule may legitimately produce a different fix — or none — when a
 * comment is present. Anything unlisted fails, and a listed group that stops
 * reproducing also fails, so an entry cannot rot into a shield for the next
 * regression.
 *
 * Two reasons recur and are both legitimate:
 *   - DECLINE: the rule detects that its rewrite would destroy a comment and
 *     withholds the fix, keeping the report. That is the preferred remedy on
 *     this axis, so a rule appearing here for that reason is working correctly.
 *   - IN-NODE: the perturbation lands inside a node the fixer legitimately
 *     replaces or deletes wholesale, so the comment goes with its subject. The
 *     discriminator is a trailing same-line comment after the terminating token,
 *     which sits OUTSIDE the node's range — a fixer that drops one of those is
 *     writing text it does not own, and is a defect.
 */
export const COMMENT_FIDELITY_BASELINE: Record<string, string> = {
  // DECLINE. The rule re-hosts each comment in the span onto the element it
  // annotates, or withholds the fix entirely so none is destroyed (#1589). Every
  // case here leaves the source byte-identical and keeps its report.
  'parallelize-async-operations :: TRANSFORM_DIVERGED':
    'declines rather than destroy a comment in the span it would merge (#1589); output is byte-identical to the input and the report stands',
  // DECLINE. `clobbersComment` refuses the interface-to-type rewrite when a
  // comment sits where the generated text would land.
  'prefer-type-over-interface :: TRANSFORM_DIVERGED':
    'clobbersComment withholds the rewrite when a comment occupies the generated span',
  // FORMATTING. The divergence is line wrapping and trailing commas only.
  // Verified by formatting both outputs with agora's pinned prettier (2.8.8,
  // not this repo's 2.7.1) and comparing code tokens: all cases converge. agora
  // enforces prettier through the fixable `prettier/prettier` rule rather than a
  // `prettier --check` step, so the drift self-heals in the same `--fix` run.
  'prefer-sx-prop-over-system-props :: TRANSFORM_DIVERGED':
    'wrapping-only divergence that agora prettier normalizes to an identical token stream',
  'use-custom-memo :: TRANSFORM_DIVERGED':
    'trailing-comma/wrapping divergence that agora prettier normalizes to an identical token stream',
  'use-latest-callback :: TRANSFORM_DIVERGED':
    'wrapping-only divergence that agora prettier normalizes to an identical token stream',

  // IN-NODE. The marker lands inside a node the fixer replaces or deletes
  // wholesale, so the comment goes with its subject. Verified mechanically:
  // the marker's offset was tracked through every applied fix pass and found
  // contained in an applied `fix.range` in every case. The discriminator that
  // separates these from a defect is a trailing same-line comment AFTER the
  // terminating token, which sits outside the node — each of these rules
  // preserves one of those.
  'use-latest-callback :: COMMENT_LOST':
    'marker sits inside the useCallback import specifier list / call the fixer replaces',
  'enforce-centralized-mock-firestore :: COMMENT_LOST':
    'marker sits inside the retired mockFirestore declaration itself',
  'prefer-union-from-const-array :: COMMENT_LOST':
    'marker sits inside the type alias the fixer replaces with a const array',
  'enforce-unique-cursor-headers :: COMMENT_LOST':
    'the rule exists to delete a duplicate header comment; the marker is inserted into the block it removes',
  // The enforce-dynamic-firebase-imports entry is gone with #1716: the fixer no
  // longer converts the static import where it stands, so no marker inside that
  // import is consumed by it.
  'prefer-clone-deep :: COMMENT_LOST':
    'marker sits inside the object literal the fixer replaces with a cloneDeep call',
  'no-empty-dependency-use-callbacks :: COMMENT_LOST':
    'marker sits inside the callback the fixer hoists out of the component',
  'no-redundant-usecallback-wrapper :: COMMENT_LOST':
    'marker sits inside the useCallback wrapper the fixer collapses (the wrapper body itself is #1696, a separate defect)',
};

const observedGroups = new Set(findings.map(groupKey));

describe('a fixer does not write text it does not own', () => {
  it('produces the same transform with and without a neutral comment', () => {
    const unlisted = findings.filter(
      (finding) => !(groupKey(finding) in COMMENT_FIDELITY_BASELINE),
    );

    if (unlisted.length > 0) {
      const byGroup = new Map<string, Finding[]>();
      for (const finding of unlisted) {
        const key = groupKey(finding);
        byGroup.set(key, [...(byGroup.get(key) || []), finding]);
      }
      throw new Error(
        [
          `${byGroup.size} rule(s) change what --fix writes when a comment is added:`,
          ...[...byGroup.entries()].map(([key, hits]) =>
            [
              `  ${key} (${hits.length} case(s), variant ${hits[0].variantKind})`,
              `    ${hits[0].origin} as ${hits[0].filename}`,
              `    --- fixed WITHOUT the comment ---`,
              hits[0].baseOutput.replace(/^/gm, '      '),
              `    --- the same input plus a comment, fixed ---`,
              hits[0].variantOutput.replace(/^/gm, '      '),
            ].join('\n'),
          ),
          '',
          'A comment carries no semantics, so stripping it must leave the',
          'transform identical. A fixer that rebuilds a span from its parts',
          'instead of editing the part it means to change fails here, because',
          'the comment lands in the span it re-emits — and so does every',
          'statement it silently drops (#1693, #1694, #1695).',
          'Edit the node you mean to change, decline when a rewrite would',
          'destroy a comment, or add the group to COMMENT_FIDELITY_BASELINE',
          'with a verified reason.',
        ].join('\n'),
      );
    }
    expect(unlisted).toEqual([]);
  });

  it('carries no stale baseline entry', () => {
    const stale = Object.keys(COMMENT_FIDELITY_BASELINE).filter(
      (group) => !observedGroups.has(group),
    );
    if (stale.length > 0) {
      throw new Error(
        [
          'COMMENT_FIDELITY_BASELINE lists group(s) this corpus no longer',
          'reproduces:',
          ...stale.map(
            (group) => `  ${group} — ${COMMENT_FIDELITY_BASELINE[group]}`,
          ),
          '',
          'Either the behaviour was fixed (delete the entry) or the fixture that',
          'reached it was edited away (restore coverage). A stale entry silently',
          'absorbs the next real regression.',
        ].join('\n'),
      );
    }
    expect(stale).toEqual([]);
  });
});

/**
 * Anti-vacuity controls. This guard compares two fix outputs, so a bug that
 * makes both sides equal — or that makes every fix fail — reads exactly like a
 * clean corpus.
 */
describe('the comment fidelity guard is load-bearing', () => {
  it('harvests the suite without executing or losing it', () => {
    expect(harvested.failures).toEqual([]);
    expect(harvested.filesLoaded).toBeGreaterThanOrEqual(250);
  });

  it('covers the fixable rule population', () => {
    // Guards the denominator: a high ratio over a collapsed rule set would still
    // look healthy.
    expect(FIXABLE_RULES.size).toBeGreaterThanOrEqual(60);
    expect(casesByRule.size).toBeGreaterThanOrEqual(55);
    expect(stats.rulesCompared.size).toBeGreaterThanOrEqual(55);
  });

  it('reaches enough reported fixtures, and actually fixes them', () => {
    expect(stats.considered).toBeGreaterThanOrEqual(1500);
    expect(stats.reported).toBeGreaterThanOrEqual(1200);
    // If the baseline never fixes anything there is no transform to compare.
    expect(stats.baselineFixed).toBeGreaterThanOrEqual(1000);
    expect(stats.comparisons).toBeGreaterThanOrEqual(5000);
  });

  it('rejects perturbations that are not comment-only', () => {
    // The token guard is what separates this axis from noise; a marker landing
    // in a template literal or JSX text changes the code and must be discarded.
    expect(stats.rejectedNonNeutral).toBeGreaterThan(0);
    const inTemplate = 'const s = `\nhello\n`;';
    expect(tokenSignature(inTemplate)).not.toBe(
      tokenSignature(insertLineBefore(inTemplate, 2, BLOCK_MARKER) as string),
    );
  });

  it('detects a fixer that rebuilds a span (positive control)', () => {
    // The #1693 shape: rebuild a call from its parts, which drops anything
    // written between them. Hard-coded so the detector stays proven even if
    // every real rule stops exhibiting it.
    linter.defineRule('__control__/rebuild', {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: never) {
        const ctx = context as unknown as {
          getSourceCode: () => { getText: (n?: unknown) => string };
          report: (d: unknown) => void;
        };
        const src = ctx.getSourceCode();
        return {
          CallExpression(node: never) {
            const call = node as unknown as {
              callee: { name?: string };
              arguments: unknown[];
            };
            if (call.callee.name !== 'rebuildMe') return;
            const args = call.arguments
              .map((argument) => src.getText(argument))
              .join(', ');
            ctx.report({
              node,
              messageId: 'm',
              fix: (fixer: {
                replaceText: (n: unknown, t: string) => unknown;
              }) => fixer.replaceText(node, `rebuildMe(${args})`),
            });
          },
        };
      },
    } as never);

    const planted: InvalidCase = {
      code: 'rebuildMe(\n  1,\n);\n',
      filename: 'x.ts',
      origin: 'planted control',
    };
    const rules = { '__control__/rebuild': 'error' };
    const baseOut = linter.verifyAndFix(planted.code, configFor(rules, null), {
      filename: planted.filename,
    });
    const variantOut = linter.verifyAndFix(
      'rebuildMe(\n  /* fidelity */ 1,\n);\n',
      configFor(rules, null),
      { filename: planted.filename },
    );
    expect(baseOut.fixed).toBe(true);
    expect(variantOut.fixed).toBe(true);
    // The marker sat between the parts, so the rebuild dropped it.
    expect(variantOut.output).not.toContain(MARKER_TEXT);
  });

  it('stays silent on a fixer that edits in place (negative control)', () => {
    // The same pipeline over a fixer that replaces only the node it means to
    // change, so a green run means the corpus is clean rather than that the
    // detector never fires.
    linter.defineRule('__control__/inplace', {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: never) {
        const ctx = context as unknown as { report: (d: unknown) => void };
        return {
          Identifier(node: never) {
            const id = node as unknown as { name: string };
            if (id.name !== 'renameMe') return;
            ctx.report({
              node,
              messageId: 'm',
              fix: (fixer: {
                replaceText: (n: unknown, t: string) => unknown;
              }) => fixer.replaceText(node, 'renamed'),
            });
          },
        };
      },
    } as never);

    const rules = { '__control__/inplace': 'error' };
    const baseOut = linter.verifyAndFix(
      'const renameMe = 1;\n',
      configFor(rules, null),
      {
        filename: 'x.ts',
      },
    );
    const variantOut = linter.verifyAndFix(
      'const renameMe = 1; // fidelity\n',
      configFor(rules, null),
      { filename: 'x.ts' },
    );
    expect(baseOut.fixed).toBe(true);
    expect(variantOut.output).toContain(MARKER_TEXT);
    expect(tokenSignature(variantOut.output)).toBe(
      tokenSignature(baseOut.output),
    );
  });
});

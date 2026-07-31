import fs from 'fs';
import path from 'path';
import { Linter } from 'eslint';

// Using require to avoid test build-time ESM interop issues; the test runner
// only needs the plugin object shape (rules), not types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as {
  rules: Record<string, unknown>;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tsParser = require('@typescript-eslint/parser');

const PREFIX = '@blumintinc/blumint/';
const DOCS_DIR = path.join(__dirname, '../../docs/rules');

/**
 * Every `docs/rules/*.md` carries "correct" example blocks, and those are the
 * contract consumers actually read — but nothing executed them, so a doc could
 * contradict its own rule indefinitely. Issues #1451-#1454 were all of this
 * shape, including two rules whose documented `eslint-disable-next-line`
 * placement suppressed nothing (the report anchors to a node deeper than the
 * statement the comment sat above) and one whose "correct" example was asserted
 * to be a violation by the rule's own invalid tests.
 *
 * This guard lints each documented "correct" block with only its own rule
 * enabled and requires ZERO reports: following the docs must never produce a
 * lint error.
 *
 * The reverse direction (an "incorrect" block must report) is deliberately NOT
 * asserted. Those blocks are frequently fragments that depend on surrounding
 * context, so requiring them to fire produces false alarms rather than signal.
 *
 * Out of scope, by design: rules whose examples are not TypeScript (e.g.
 * `avoid-utils-directory` illustrates directory layout in ```text fences) and
 * rules documenting no correct examples at all.
 *
 * A block the harness cannot lint — it fails to parse, or the rule throws for
 * want of the type information `parserOptions.project` would supply — asserts
 * NOTHING, which made it permanently exempt without any signal (#1466). Such
 * blocks are now recorded and audited against `UNCHECKABLE_BLOCKS`, so a newly
 * unlintable example fails this suite by name instead of disappearing.
 */

/** Fence languages that hold lintable TypeScript. */
const LINTABLE_LANGS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'typescript',
  'javascript',
  '',
]);

/**
 * Candidate filenames, tried in order. Many rules key off the path (cloud
 * function entry points, test-file exemptions, component directories), so a
 * single hard-coded filename would make correct examples report for reasons the
 * doc never claimed.
 */
const TS_CANDIDATES = [
  'src/util/helper.ts',
  'functions/src/callable/handler.f.ts',
  'functions/src/util/helper.ts',
  'src/util/helper.test.ts',
  'src/components/Widget.tsx',
];
const TSX_CANDIDATES = ['src/components/Widget.tsx', 'src/pages/index.tsx'];

/**
 * Rules that match on path segments need a rooted path — `functions/src/types/x.ts`
 * relative does not satisfy the same check that `/repo/functions/src/types/x.ts`
 * does, which would fail a doc example for a reason the doc never claimed.
 */
const ROOT = '/repo/';
const anchor = (p: string) => (p.startsWith('/') ? p : ROOT + p);

type Block = {
  /**
   * `null` for a fence under no example heading. Such blocks are kept rather
   * than dropped: a page whose fences all come back unlabelled is a detection
   * failure, and dropping them made it indistinguishable from a page that
   * documents no examples at all (#1499).
   */
  polarity: 'correct' | 'incorrect' | null;
  lang: string;
  code: string;
  line: number;
};

/**
 * Classify an example heading.
 *
 * Only H2+ headings count: the H1 title ends with the rule id, and rule names
 * routinely contain `prefer`, `valid`, or `no`, which would otherwise classify
 * every block in the intro prose. The rule-id parenthetical is stripped for the
 * same reason.
 *
 * Order matters — "incorrect" contains "correct" and "invalid" contains "valid",
 * so the negative spellings must be tested first.
 */
export function headingPolarity(line: string): Block['polarity'] | null {
  if (!/^#{2,6}\s/.test(line)) return null;
  const text = line
    .replace(/^#{2,6}\s*/, '')
    .replace(/\(`?@blumintinc\/blumint\/[^)]*`?\)/g, '')
    .toLowerCase();
  if (/❌|👎|\bincorrect\b|\binvalid\b|\bbad\b|\bwrong\b/.test(text))
    return 'incorrect';
  if (/✅|👍|\bcorrect\b|\bvalid\b|\bgood\b/.test(text)) return 'correct';
  return null;
}

/**
 * Pull every fenced code block, tagged with the polarity of the example heading
 * it sits under (`null` when it sits under none).
 *
 * Polarity is inherited by DEEPER headings, because docs routinely split an
 * example section into named cases (`#### Option 1: …` under `### Examples of
 * correct code`). Treating such a sub-heading as the end of the section dropped
 * every block beneath it, which is how three whole pages asserted nothing.
 */
export function extractBlocks(md: string): Block[] {
  const lines = md.split('\n');
  const blocks: Block[] = [];
  let polarity: Block['polarity'] | null = null;
  let polarityDepth = 0;
  let fence: string | null = null;
  let buf: string[] = [];
  let lang = '';
  let startLine = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fenceMatch = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);

    if (fence) {
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence[0] &&
        fenceMatch[1].length >= fence.length
      ) {
        blocks.push({
          polarity,
          lang: lang.trim().toLowerCase(),
          code: buf.join('\n'),
          line: startLine,
        });
        fence = null;
        buf = [];
      } else {
        buf.push(line);
      }
      continue;
    }

    const heading = /^(#{1,6})\s/.exec(line);
    if (heading) {
      const depth = heading[1].length;
      const own = headingPolarity(line);
      if (own) {
        polarity = own;
        polarityDepth = depth;
      } else if (!(polarity && depth > polarityDepth)) {
        // A sibling or shallower heading ends the example section; a deeper one
        // is a named case inside it and keeps the section's polarity.
        polarity = null;
        polarityDepth = 0;
      }
      continue;
    }

    if (fenceMatch) {
      fence = fenceMatch[1];
      lang = fenceMatch[2] || '';
      startLine = i + 1;
      buf = [];
    }
  }
  return blocks;
}

/**
 * Docs declare the context a snippet assumes inside the snippet itself:
 * `// File: functions/src/...` (or a bare path comment) for path-sensitive
 * rules, and `// eslint-options: {...}` for an example that only holds under a
 * non-default option. Honouring both is what lets every correct block be
 * enforced without exempting the awkward ones.
 */
export function filenameHint(code: string): string | null {
  const explicit = /^\s*(?:\/\/|\/\*)\s*File:\s*([^\s*]+)/im.exec(code);
  if (explicit) return anchor(explicit[1].replace(/^\.\//, ''));
  const firstLine = code.split('\n').find((l) => l.trim().length > 0) || '';
  const bare = /^\s*\/\/\s*((?:[\w.-]+\/)+[\w.-]+\.tsx?)\b/.exec(firstLine);
  return bare ? anchor(bare[1]) : null;
}

export function optionsHint(code: string): unknown | null {
  const m = /^\s*\/\/\s*eslint-options:\s*(\{.*\})\s*$/im.exec(code);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    throw new Error(`malformed // eslint-options: ${m[1]}`);
  }
}

const linter = new Linter();
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}
linter.defineParser('ts', tsParser);

type LintResult = { reports: string[]; skipped: boolean; reason?: string };

export function lintBlock(
  ruleName: string,
  filename: string,
  code: string,
  options: unknown | null,
): LintResult {
  const config = {
    parser: 'ts',
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: { jsx: filename.endsWith('.tsx') },
    },
    rules: {
      [PREFIX + ruleName]: options
        ? (['error', options] as const)
        : ('error' as const),
    },
  } as unknown as Linter.Config;

  let messages;
  try {
    messages = linter.verify(code, config, { filename });
  } catch (error) {
    // A rule needing type information throws without `parserOptions.project`,
    // which the RuleTester cannot supply; such rules are out of scope here.
    return {
      reports: [],
      skipped: true,
      reason: `the rule threw: ${(error as Error).message}`,
    };
  }
  // A block that does not parse never ran the rule. That is not a pass — see
  // UNCHECKABLE_BLOCKS.
  const fatal = messages.find((m) => m.fatal);
  if (fatal) {
    return {
      reports: [],
      skipped: true,
      reason: `parse failure at block line ${fatal.line}: ${fatal.message}`,
    };
  }

  return {
    reports: messages
      .filter((m) => m.ruleId === PREFIX + ruleName)
      .map((m) => `line ${m.line}: ${m.message}`),
    skipped: false,
  };
}

/**
 * Pick the filename this rule's own bad examples fire under, so its good
 * examples are judged in the same context. Judging a correct block under a path
 * the rule was never meant to see would manufacture a failure.
 */
function calibrateFilename(
  ruleName: string,
  incorrect: Block[],
  jsxish: boolean,
): string {
  const candidates = jsxish ? TSX_CANDIDATES : TS_CANDIDATES;
  let best = candidates[0];
  let bestHits = -1;
  for (const candidate of candidates) {
    let hits = 0;
    for (const block of incorrect) {
      const filename = filenameHint(block.code) || anchor(candidate);
      const { reports } = lintBlock(
        ruleName,
        filename,
        block.code,
        optionsHint(block.code),
      );
      if (reports.length > 0) hits += 1;
    }
    if (hits > bestHits) {
      bestHits = hits;
      best = candidate;
    }
  }
  return best;
}

const ruleNames = Object.keys(plugin.rules)
  .filter((name) => fs.existsSync(path.join(DOCS_DIR, `${name}.md`)))
  .sort();

export type SkippedBlock = { rule: string; line: number; reason: string };

/**
 * Documented "correct" blocks this guard knowingly cannot lint, keyed
 * `<rule>:<line in the .md>` and carrying the reason the exemption exists.
 *
 * The list is empty on purpose and should stay that way. A block that does not
 * parse asserts NOTHING, so before #1466 eight documented examples — including
 * every example of `prefer-sx-prop-over-system-props` — were exempt from this
 * guard forever without anyone knowing. Almost every such block is a packaging
 * defect in the doc (an unclosed JSX tag, or several complete snippets crammed
 * into one fence, where the second `<` parses as a relational operator); fix the
 * doc rather than adding an entry here.
 *
 * A legitimate entry is a block that is malformed BY DESIGN — the way
 * `no-curly-brackets-around-commented-properties` documents a syntax error as
 * the defect it prevents (that one lands in an "incorrect" fence, which this
 * guard never asserts on, so it needs no entry).
 */
export const UNCHECKABLE_BLOCKS: Record<string, string> = {};

/**
 * Compare the blocks that were skipped against the allowlist, in both
 * directions. An unlisted skip is a documented example verified by nothing; a
 * listed block that no longer skips is a stale exemption that would silently
 * absorb the next real skip.
 */
export function auditSkips(
  skips: readonly SkippedBlock[],
  allowlist: Record<string, string>,
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const skip of skips) {
    const key = `${skip.rule}:${skip.line}`;
    seen.add(key);
    if (key in allowlist) continue;
    problems.push(
      [
        `docs/rules/${skip.rule}.md:${skip.line} is documented as CORRECT but the guard could not lint it`,
        `  (${skip.reason})`,
        '  Nothing was asserted about this example. Make the fence parse as one',
        '  program — close/self-close JSX tags, and split a fence that packs',
        '  several independent snippets into one fence per snippet — or add',
        `  '${key}' to UNCHECKABLE_BLOCKS with the reason it cannot be checked.`,
      ].join('\n'),
    );
  }

  for (const [key, reason] of Object.entries(allowlist)) {
    if (seen.has(key)) continue;
    problems.push(
      [
        `UNCHECKABLE_BLOCKS lists '${key}' (${reason}) but that block is no longer skipped.`,
        '  Delete the entry: a stale exemption hides the next real skip.',
      ].join('\n'),
    );
  }

  return problems;
}

export type SkippedPage = { rule: string; blocks: number };

/**
 * Rule docs that carry lintable code fences yet document no CORRECT example,
 * keyed by rule name and carrying the reason.
 *
 * Empty on purpose. A page whose examples are announced in prose
 * (`Examples of **correct** code for this rule:`) rather than in a heading set
 * no polarity, so every one of its fences was discarded and the page skipped
 * itself in silence — 42 pages and roughly 77 unverified examples (#1499),
 * including the one that hid #1498. Both anti-vacuity defences sat downstream of
 * that skip and could not see it. Fix the page's headings rather than adding an
 * entry here.
 */
export const PAGES_WITHOUT_CORRECT_EXAMPLES: Record<string, string> = {};

/**
 * A page with lintable fences but no correct example is a detection failure
 * until proven otherwise, so it fails by name instead of skipping. A page with
 * no lintable fence at all (directory layouts in ```text, config in ```json) is
 * genuinely out of scope and never reaches here.
 */
export function auditPageSkips(
  skips: readonly SkippedPage[],
  allowlist: Record<string, string>,
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const skip of skips) {
    seen.add(skip.rule);
    if (skip.rule in allowlist) continue;
    problems.push(
      [
        `docs/rules/${skip.rule}.md has ${skip.blocks} lintable code block(s) but none is labelled a CORRECT example, so the whole page was skipped`,
        '  Nothing on this page was asserted. Polarity is read from HEADINGS only:',
        "  give the section a heading such as '### Examples of correct code' and",
        "  '### Examples of incorrect code'. A prose line like",
        "  'Examples of **correct** code for this rule:' is not a heading and",
        '  matches nothing. If the page truly documents no correct example, add',
        `  '${skip.rule}' to PAGES_WITHOUT_CORRECT_EXAMPLES with the reason.`,
      ].join('\n'),
    );
  }

  for (const [rule, reason] of Object.entries(allowlist)) {
    if (seen.has(rule)) continue;
    problems.push(
      [
        `PAGES_WITHOUT_CORRECT_EXAMPLES lists '${rule}' (${reason}) but that page now contributes assertions.`,
        '  Delete the entry: a stale exemption hides the next page that vanishes.',
      ].join('\n'),
    );
  }

  return problems;
}

/**
 * Coverage floor. If heading matching or fence extraction ever breaks, every
 * block silently disappears and the whole suite passes while asserting nothing —
 * the vacuous green that makes a guard worse than no guard. These counters make
 * that failure loud.
 */
let lintedBlocks = 0;
const skippedBlocks: SkippedBlock[] = [];
const skippedPages: SkippedPage[] = [];

describe('documented "correct" examples must not report', () => {
  it('finds rule docs to check', () => {
    expect(ruleNames.length).toBeGreaterThan(100);
  });

  afterAll(() => {
    // Sits just under the real count (360 at the time of writing) so a silent
    // drop of a page or two goes red, while adding docs does not require editing
    // this test. Raise it when coverage grows; never lower it to make a run pass.
    expect(lintedBlocks).toBeGreaterThan(350);
    const problems = [
      ...auditPageSkips(skippedPages, PAGES_WITHOUT_CORRECT_EXAMPLES),
      ...auditSkips(skippedBlocks, UNCHECKABLE_BLOCKS),
    ];
    if (problems.length > 0) {
      throw new Error(
        [
          `${problems.length} documented example(s) are exempt from this guard without being listed:`,
          ...problems,
        ].join('\n\n'),
      );
    }
  });

  describe.each(ruleNames)('%s', (ruleName) => {
    const md = fs.readFileSync(path.join(DOCS_DIR, `${ruleName}.md`), 'utf8');
    const blocks = extractBlocks(md).filter((b) => LINTABLE_LANGS.has(b.lang));
    const correct = blocks.filter((b) => b.polarity === 'correct');
    const incorrect = blocks.filter((b) => b.polarity === 'incorrect');

    if (correct.length === 0) {
      // Recorded rather than thrown here so the audit can name every vanished
      // page at once instead of failing on the first.
      if (blocks.length > 0) {
        skippedPages.push({ rule: ruleName, blocks: blocks.length });
      }
      it.skip('has no documented correct examples', () => undefined);
      return;
    }

    const jsxish = blocks.some((b) => b.lang === 'tsx' || b.lang === 'jsx');
    const calibrated = calibrateFilename(ruleName, incorrect, jsxish);

    it.each(correct.map((b) => [b.line, b] as const))(
      'correct example at line %i lints clean',
      (_line, block) => {
        const hinted = filenameHint(block.code);
        const filename =
          hinted ||
          anchor(
            block.lang === 'tsx' || block.lang === 'jsx'
              ? calibrated.replace(/\.ts$/, '.tsx')
              : calibrated,
          );

        const { reports, skipped, reason } = lintBlock(
          ruleName,
          filename,
          block.code,
          optionsHint(block.code),
        );
        if (skipped) {
          // Recorded rather than asserted here so the audit can name every
          // exempt block at once instead of failing on the first.
          skippedBlocks.push({
            rule: ruleName,
            line: block.line,
            reason: reason ?? 'unknown',
          });
          return;
        }
        lintedBlocks += 1;

        if (reports.length > 0) {
          throw new Error(
            [
              `docs/rules/${ruleName}.md:${block.line} is documented as CORRECT but the rule reports on it:`,
              ...reports.map((r) => `  ${r}`),
              `(linted as ${filename})`,
              'Either the example is wrong, or it needs a `// File: <path>` or',
              '`// eslint-options: {...}` hint declaring the context it assumes.',
              block.code,
            ].join('\n'),
          );
        }
        expect(reports).toEqual([]);
      },
    );
  });
});

/**
 * Planted-defect controls. The skip audit only earns trust if it can go red, so
 * both halves are exercised on synthetic input: the detector must see an
 * unparseable block as a skip (not a pass), and the audit must fail an unlisted
 * skip while clearing a listed one.
 */
describe('unlintable blocks are surfaced, not silently skipped', () => {
  const WIDGET = '/repo/src/components/Widget.tsx';

  it('classifies an unparseable block as skipped, not clean (control)', () => {
    // Two complete JSX snippets in one fence: the defect shape that hid eight
    // documented examples until #1466.
    const packed = lintBlock(
      'no-jsx-whitespace-literal',
      WIDGET,
      '<div>a{" "}b</div>\n<div>c{" "}d</div>',
      null,
    );
    expect(packed.skipped).toBe(true);
    expect(packed.reason).toMatch(/parse failure/);
    // The dangerous part: with the block unparsed the rule never ran, so a bare
    // "no reports" check would have called this documentation verified.
    expect(packed.reports).toEqual([]);

    const single = lintBlock(
      'no-jsx-whitespace-literal',
      WIDGET,
      '<div>a{" "}b</div>',
      null,
    );
    expect(single.skipped).toBe(false);
    expect(single.reports).toHaveLength(1);
  });

  it('fails an unlisted skip and clears a listed one (control)', () => {
    const skip: SkippedBlock = {
      rule: 'planted-rule',
      line: 42,
      reason: 'parse failure at block line 2: unexpected token',
    };

    const unlisted = auditSkips([skip], {});
    expect(unlisted).toHaveLength(1);
    expect(unlisted[0]).toContain('docs/rules/planted-rule.md:42');
    expect(unlisted[0]).toContain('parse failure');

    expect(
      auditSkips([skip], { 'planted-rule:42': 'malformed by design' }),
    ).toEqual([]);

    const stale = auditSkips([], { 'planted-rule:42': 'malformed by design' });
    expect(stale).toHaveLength(1);
    expect(stale[0]).toContain('no longer skipped');
  });

  // Pins the state #1466 reached: every documented "correct" block is linted.
  // An exemption is meant to be a conscious, reviewable opt-out, so adding one
  // means updating this expectation on purpose rather than quietly growing the
  // invisible set.
  it('ships with an empty allowlist, so every correct block is asserted', () => {
    expect(Object.keys(UNCHECKABLE_BLOCKS)).toEqual([]);
  });
});

/**
 * Planted-defect controls for the page-level hole (#1499). The per-block audit
 * above cannot see a page that never produced a block, so the detector is
 * exercised on the exact markdown shapes that caused and cured the blind spot.
 */
describe('pages whose examples are announced in prose fail, not skip', () => {
  const PROSE = [
    '# Rule (`@blumintinc/blumint/planted-rule`)',
    '',
    '## Rule Details',
    '',
    'Examples of **correct** code for this rule:',
    '',
    '```ts',
    'const ok = 1;',
    '```',
    '',
  ].join('\n');

  const HEADING = PROSE.replace(
    'Examples of **correct** code for this rule:',
    '### Examples of **correct** code for this rule:',
  );

  it('leaves every block of a prose-announced page unlabelled (control)', () => {
    const blocks = extractBlocks(PROSE);
    expect(blocks).toHaveLength(1);
    // Unlabelled, so nothing is asserted about it — but still counted, which is
    // what lets the page-level audit tell this apart from a page with no code.
    expect(blocks[0].polarity).toBeNull();
    // The same page one heading marker later is fully classified, which is what
    // makes the drop a detection failure rather than an absent example.
    expect(extractBlocks(HEADING)).toHaveLength(1);
    expect(extractBlocks(HEADING)[0].polarity).toBe('correct');
  });

  it('keeps a section polarity across deeper sub-headings (control)', () => {
    const nested = [
      '### Examples of correct code',
      '',
      '#### Option 1',
      '',
      '```ts',
      'const a = 1;',
      '```',
      '',
      '## When Not To Use It',
      '',
      '```ts',
      'const b = 2;',
      '```',
    ].join('\n');

    // Only the block under the deeper `#### Option 1` keeps the section's
    // polarity; the sibling `## When Not To Use It` ends the section, so its
    // fence comes back unlabelled.
    const blocks = extractBlocks(nested);
    expect(blocks.map((b) => b.polarity)).toEqual(['correct', null]);
  });

  it('fails an unlisted page skip and clears a listed one (control)', () => {
    const skip: SkippedPage = { rule: 'planted-rule', blocks: 4 };

    const unlisted = auditPageSkips([skip], {});
    expect(unlisted).toHaveLength(1);
    expect(unlisted[0]).toContain('docs/rules/planted-rule.md');
    expect(unlisted[0]).toContain('4 lintable code block(s)');
    expect(unlisted[0]).toContain('### Examples of correct code');

    expect(
      auditPageSkips([skip], { 'planted-rule': 'documents only violations' }),
    ).toEqual([]);

    const stale = auditPageSkips([], {
      'planted-rule': 'documents only violations',
    });
    expect(stale).toHaveLength(1);
    expect(stale[0]).toContain('now contributes assertions');
  });

  it('ships with no exempt pages, so no doc page is silently skipped', () => {
    expect(Object.keys(PAGES_WITHOUT_CORRECT_EXAMPLES)).toEqual([]);
  });
});

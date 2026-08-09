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
 * The reverse direction is asserted too (#1641): every lintable "incorrect"
 * fence must produce at least one report from its own rule. A documented
 * violation the rule never flags is a promise the plugin does not keep — a
 * consumer who writes exactly that code is never warned — and #1625 and #1637
 * both shipped through that hole. Rules declaring `meta.docs.requiresTypeChecking`
 * are exempt because no `Linter` without `parserOptions.project` can exercise
 * them at all; the rest of the residue is named in SILENT_INCORRECT_BLOCKS.
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

type LintResult = {
  reports: string[];
  /** 1-based lines of the same reports, for segment attribution (#1622). */
  reportLines: number[];
  skipped: boolean;
  reason?: string;
};

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
      reportLines: [],
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
      reportLines: [],
      skipped: true,
      reason: `parse failure at block line ${fatal.line}: ${fatal.message}`,
    };
  }

  const mine = messages.filter((m) => m.ruleId === PREFIX + ruleName);
  return {
    reports: mine.map((m) => `line ${m.line}: ${m.message}`),
    reportLines: mine.map((m) => m.line),
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
 * the defect it prevents (that one lands in an "incorrect" fence, so it is out
 * of this allowlist's scope; the #1641 guard counts it as unlintable and
 * asserts nothing about it either).
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
    // Sits just under the real count (384 at the time of writing) so a silent
    // drop of a page or two goes red, while adding docs does not require editing
    // this test. Raise it when coverage grows; never lower it to make a run pass.
    expect(lintedBlocks).toBeGreaterThan(375);
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

/**
 * Segment-level dead-example guard (#1622).
 *
 * The suites above judge fences whole, so a fence that bundles several
 * independent bad examples passes as long as ANY of them reports — which is
 * exactly how no-unused-props' headline `React.FC<Props>` example stayed dead
 * behind its live sibling (#1620). Fences are linted once, in full (so no
 * segment ever loses its imports or type context), and each report is then
 * attributed to the top-level segment whose line range contains it.
 *
 * Asserting every silent segment would drown the signal: most segments are
 * setup for a sibling (stub components, variables the payoff line reads), and
 * several rules legitimately report once per file. The guard therefore fires
 * only for a segment whose own comment CLAIMS it violates ("// flagged",
 * "// ❌ ...", "never read or forwarded") — self-declared bad examples, the
 * #1620 shape precisely. Measured on the full corpus: 80 silent segments,
 * 7 claim-carrying, of which 1 was a real docs bug — the claim filter is what
 * makes this assertable at all.
 */
const SEGMENT_STARTER =
  /^(export\s+)?(const|let|var|function|class|abstract\s+class|enum)\b/;
/** Shared setup, not an example in its own right. */
const PRELUDE_STARTER = /^(import\b|type\b|interface\b)/;

type FenceSegment = { start: number; end: number; text: string };

export function segmentFence(code: string): FenceSegment[] {
  const lines = code.split('\n');
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (SEGMENT_STARTER.test(lines[i]) && !PRELUDE_STARTER.test(lines[i])) {
      starts.push(i + 1);
    }
  }
  if (starts.length <= 1) {
    return [{ start: 1, end: lines.length, text: code }];
  }
  return starts.map((start, idx) => {
    // Leading prelude (imports, types, comments) folds into the first segment;
    // each later segment begins at its own declaration.
    const from = idx === 0 ? 1 : start;
    const to = idx === starts.length - 1 ? lines.length : starts[idx + 1] - 1;
    return {
      start: from,
      end: to,
      text: lines.slice(from - 1, to).join('\n'),
    };
  });
}

/**
 * A comment asserting THIS segment is the violation. Deliberately narrow:
 * "flagged", an ❌ marker, or the never-read/not-X phrasing docs use to call
 * out the defect. Widening it re-admits the setup-segment noise measured above.
 */
export const CLAIM_COMMENT =
  /\/\/.*(flagged|❌|never (read|reported|fires|used)|\bunused\b|\bviolat)|\/\*[^*]*(flagged|❌|violat)/i;

/**
 * Silent claim-carrying segments verified by hand, keyed
 * `<rule>:<fence docs line>:<segment start line within fence>`. Each entry is a
 * conscious, audited exemption; the audit fails a stale entry the same way
 * UNCHECKABLE_BLOCKS does.
 */
export const SILENT_CLAIM_SEGMENTS: Record<string, string> = {
  'no-redundant-annotation-assertion:17:1':
    'the trailing "// ❌ Redundant..." comment is a header for the NEXT segment, where the report lands (verified: the annotated statement below it fires)',
};

type SilentClaimSegment = { key: string; head: string };

export function auditClaimSegments(
  silents: readonly SilentClaimSegment[],
  allowlist: Record<string, string>,
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const s of silents) {
    seen.add(s.key);
    if (s.key in allowlist) continue;
    problems.push(
      [
        `${s.key} carries a comment claiming it violates, but the rule never reports inside it:`,
        `  ${s.head}`,
        '  Either the example is broken (missing import/context — see #1622), the',
        '  claim comment is wrong, or the rule cannot catch the documented shape.',
        `  Fix it, or add the key to SILENT_CLAIM_SEGMENTS with the verified reason.`,
      ].join('\n'),
    );
  }
  for (const [key, reason] of Object.entries(allowlist)) {
    if (seen.has(key)) continue;
    problems.push(
      `SILENT_CLAIM_SEGMENTS lists '${key}' (${reason}) but that segment now fires or no longer exists. Delete the entry.`,
    );
  }
  return problems;
}

describe('claim-carrying segments of "incorrect" fences must report (#1622)', () => {
  const silents: SilentClaimSegment[] = [];
  let multiFences = 0;
  let claimSegments = 0;

  it('attributes reports to segments across every rule page', () => {
    for (const ruleName of ruleNames) {
      const md = fs.readFileSync(path.join(DOCS_DIR, `${ruleName}.md`), 'utf8');
      const incorrect = extractBlocks(md).filter(
        (b) => b.polarity === 'incorrect' && LINTABLE_LANGS.has(b.lang),
      );
      for (const block of incorrect) {
        const segments = segmentFence(block.code);
        if (segments.length <= 1) continue;
        multiFences += 1;

        const hinted = filenameHint(block.code);
        const candidates = hinted
          ? [hinted]
          : (block.lang === 'tsx' || block.lang === 'jsx'
              ? TSX_CANDIDATES
              : [...TS_CANDIDATES, ...TSX_CANDIDATES]
            ).map(anchor);

        // Same calibration idea as the fence guard, at segment granularity:
        // the filename that lights up the most segments judges the fence.
        let bestLines: number[] | null = null;
        let bestCovered = -1;
        for (const filename of candidates) {
          const outcome = lintBlock(
            ruleName,
            filename,
            block.code,
            optionsHint(block.code),
          );
          if (outcome.skipped) continue;
          const covered = segments.filter((s) =>
            outcome.reportLines.some((l) => l >= s.start && l <= s.end),
          ).length;
          if (covered > bestCovered) {
            bestCovered = covered;
            bestLines = outcome.reportLines;
          }
        }
        // A fence no candidate can lint asserts nothing here; the fence-level
        // machinery owns unparsable/type-needing examples.
        if (bestLines === null) continue;

        for (const s of segments) {
          if (!CLAIM_COMMENT.test(s.text)) continue;
          claimSegments += 1;
          const fired = bestLines.some((l) => l >= s.start && l <= s.end);
          if (!fired) {
            silents.push({
              key: `${ruleName}:${block.line}:${s.start}`,
              head: s.text.split('\n').find((l) => l.trim()) ?? '',
            });
          }
        }
      }
    }

    // Coverage floor: the corpus holds ~106 multi-segment incorrect fences and
    // ~20 claim-carrying segments; a collapse here means extraction or
    // segmentation broke, not that the docs got clean.
    expect(multiFences).toBeGreaterThan(80);
    expect(claimSegments).toBeGreaterThan(10);

    const problems = auditClaimSegments(silents, SILENT_CLAIM_SEGMENTS);
    if (problems.length > 0) {
      throw new Error(
        [`${problems.length} claim-segment problem(s):`, ...problems].join(
          '\n\n',
        ),
      );
    }
  });

  it('catches a planted dead claim segment (control)', () => {
    // Two bundled components; only the second violates. The first carries a
    // violation claim but is clean — the #1620 shape exactly.
    const fence = [
      "import { memo } from 'react';",
      'const Dead = () => <div>a{" "}b</div>; // flagged',
      'const Live = () => <span>c{" "}d</span>;',
    ].join('\n');
    const segments = segmentFence(fence);
    expect(segments.length).toBe(2);
    const outcome = lintBlock(
      'no-jsx-whitespace-literal',
      '/repo/src/components/Widget.tsx',
      fence,
      null,
    );
    expect(outcome.skipped).toBe(false);
    // Both segments report here (the rule fires on both literals), so the
    // planted death is simulated by attributing only Live's report lines.
    const liveOnly = outcome.reportLines.filter((l) => l >= segments[1].start);
    const dead = segments[0];
    expect(CLAIM_COMMENT.test(dead.text)).toBe(true);
    expect(liveOnly.some((l) => l >= dead.start && l <= dead.end)).toBe(false);
    const problems = auditClaimSegments(
      [{ key: 'planted:1:1', head: 'const Dead = ...' }],
      {},
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('claiming it violates');
    // A listed key clears; a stale key fails.
    expect(
      auditClaimSegments([{ key: 'planted:1:1', head: 'x' }], {
        'planted:1:1': 'reason',
      }),
    ).toEqual([]);
    expect(auditClaimSegments([], { 'planted:1:1': 'reason' })[0]).toContain(
      'Delete the entry',
    );
  });
});

/**
 * Fence-level dead-example guard (#1641).
 *
 * Everything above asserts one direction: a documented CORRECT fence must not
 * report. The reverse went unasserted, so a rule could ship a headline ❌
 * example it never flags — #1625 (`Math.max(1, 2) === 0`) and #1637 both did,
 * and both were found by hand rather than by a gate.
 *
 * Each incorrect fence is linted under the context it declares (`// File:` /
 * `// eslint-options:`), or under every candidate filename when it declares
 * none, and counts as live if ANY candidate produces a report from that fence's
 * own rule. Which part of the fence reports is the #1622 guard's concern; this
 * one only asks whether the fence is enforced at all.
 */

/**
 * A rule declaring it needs type information cannot be exercised here: the
 * isolated program the parser builds without `parserOptions.project` resolves
 * imported and cross-declaration types to `any`, so such rules either return an
 * empty visitor or see nothing to report. Reading the declaration off the rule
 * object keeps the exemption self-maintaining — a rule that stops needing types
 * is asserted again with no edit here, and one that starts needing them does not
 * accumulate allowlist entries.
 */
export function requiresTypeChecking(ruleName: string): boolean {
  const rule = plugin.rules[ruleName] as
    | { meta?: { docs?: { requiresTypeChecking?: boolean } } }
    | undefined;
  return rule?.meta?.docs?.requiresTypeChecking === true;
}

type SilentIncorrectBlock = { key: string; head: string };

/**
 * Documented "incorrect" fences verified by hand to be unreportable by this
 * harness, keyed `<rule>:<fence docs line>` and carrying the reason.
 *
 * Deliberately tiny, and audited both ways like UNCHECKABLE_BLOCKS and
 * SILENT_CLAIM_SEGMENTS. A dead fence is almost always fixable by declaring the
 * context the example already assumes — the path for a path-scoped rule, the
 * option for an option-gated one — so add the hint rather than an entry here.
 */
export const SILENT_INCORRECT_BLOCKS: Record<string, string> = {
  'consistent-callback-naming:44':
    'the JSX-prop half resolves the prop type through getTypeChecker (consistent-callback-naming.ts:53-57), so `<Dialog submit={onSubmit} />` needs parserOptions.project; the rule is not dead — its Implementations fences fire here',
  'consistent-callback-naming:48':
    'same type-aware JSX-prop half as :44 — `<Form changeHandler={onChange} />` cannot be typed from an isolated program; the implementation half of the rule still fires',
};

/**
 * Compare the silent fences against the allowlist in both directions. An
 * unlisted silent fence is a documented violation nobody enforces; a listed
 * fence that fires again is a stale exemption that would absorb the next real
 * one.
 */
export function auditSilentIncorrect(
  silents: readonly SilentIncorrectBlock[],
  allowlist: Record<string, string>,
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const silent of silents) {
    const [rule, line] = silent.key.split(':');
    seen.add(silent.key);
    if (silent.key in allowlist) continue;
    problems.push(
      [
        `docs/rules/${rule}.md:${line} is documented as INCORRECT but the rule never reports on it:`,
        `  ${silent.head}`,
        '  A documented violation nobody flags is a promise the plugin does not keep.',
        '  Usually the fence omits the context it assumes: add a `// File: <path>`',
        '  comment for a path-scoped rule or `// eslint-options: {...}` for an',
        '  option-gated one. If the example is genuinely uncatchable, fix the rule —',
        `  or add '${silent.key}' to SILENT_INCORRECT_BLOCKS with the verified reason.`,
      ].join('\n'),
    );
  }

  for (const [key, reason] of Object.entries(allowlist)) {
    if (seen.has(key)) continue;
    problems.push(
      [
        `SILENT_INCORRECT_BLOCKS lists '${key}' (${reason}) but that fence now reports or no longer exists.`,
        '  Delete the entry: a stale exemption hides the next dead example.',
      ].join('\n'),
    );
  }

  return problems;
}

describe('documented "incorrect" fences must report (#1641)', () => {
  const silents: SilentIncorrectBlock[] = [];
  let assertedFences = 0;
  let typeAwareFences = 0;
  let unlintableFences = 0;

  it('requires every lintable "incorrect" fence to fire its own rule', () => {
    for (const ruleName of ruleNames) {
      const md = fs.readFileSync(path.join(DOCS_DIR, `${ruleName}.md`), 'utf8');
      const incorrect = extractBlocks(md).filter(
        (b) => b.polarity === 'incorrect' && LINTABLE_LANGS.has(b.lang),
      );
      if (incorrect.length === 0) continue;
      if (requiresTypeChecking(ruleName)) {
        typeAwareFences += incorrect.length;
        continue;
      }

      for (const block of incorrect) {
        const hinted = filenameHint(block.code);
        const candidates = hinted
          ? [hinted]
          : (block.lang === 'tsx' || block.lang === 'jsx'
              ? TSX_CANDIDATES
              : [...TS_CANDIDATES, ...TSX_CANDIDATES]
            ).map(anchor);

        let lintable = false;
        let fired = false;
        for (const filename of candidates) {
          const outcome = lintBlock(
            ruleName,
            filename,
            block.code,
            optionsHint(block.code),
          );
          if (outcome.skipped) continue;
          lintable = true;
          if (outcome.reports.length > 0) {
            fired = true;
            break;
          }
        }

        // A fence no candidate can lint (it does not parse, or the rule threw)
        // asserts nothing here; the fence-level machinery above owns that class.
        if (!lintable) {
          unlintableFences += 1;
          continue;
        }

        assertedFences += 1;
        if (fired) continue;
        silents.push({
          key: `${ruleName}:${block.line}`,
          head: block.code.split('\n').find((l) => l.trim()) ?? '',
        });
      }
    }

    // Coverage floor. If extraction or heading classification breaks, every
    // fence disappears and this suite passes while asserting nothing — the
    // vacuous green that makes a guard worse than none. The corpus holds ~330
    // asserted fences; raise this as coverage grows, never lower it to make a
    // run pass.
    expect(assertedFences).toBeGreaterThan(300);
    // Ceilings on the two exempt classes, so neither absorbs the corpus. Type-
    // aware rules legitimately appear (~9 fences across 6 rules), but declaring
    // requiresTypeChecking must not become the way to retire an example, and
    // unlintable fences (1: the syntax error `no-curly-brackets-around-commented
    // -properties` documents on purpose) are packaging defects everywhere else.
    expect(typeAwareFences).toBeLessThan(30);
    expect(unlintableFences).toBeLessThan(5);

    const problems = auditSilentIncorrect(silents, SILENT_INCORRECT_BLOCKS);
    if (problems.length > 0) {
      throw new Error(
        [
          `${problems.length} documented "incorrect" example(s) report nothing:`,
          ...problems,
        ].join('\n\n'),
      );
    }
  });

  it('catches an option-gated fence that never fires (control)', () => {
    // The shape this guard was built for: a fence filed under "incorrect" that
    // only violates under a non-default option, so by default it documents a
    // rule that says nothing (memoize-root-level-hocs, #1641).
    const fence = [
      'function ReduxComponent() {',
      '  const Connected = connect(mapState)(BaseComponent);',
      '  return <Connected />;',
      '}',
    ].join('\n');
    const WIDGET = '/repo/src/components/Widget.tsx';

    const bare = lintBlock('memoize-root-level-hocs', WIDGET, fence, null);
    expect(bare.skipped).toBe(false);
    // Dead: parsed, rule ran, nothing reported. The danger is that this reads
    // exactly like a page with no examples at all.
    expect(bare.reports).toEqual([]);

    const hinted = lintBlock('memoize-root-level-hocs', WIDGET, fence, {
      additionalHocNames: ['connect'],
    });
    expect(hinted.skipped).toBe(false);
    expect(hinted.reports.length).toBeGreaterThan(0);
    expect(hinted.reports[0]).toContain('HOC "connect" is created inside');

    const problems = auditSilentIncorrect(
      [{ key: 'planted-rule:36', head: 'function ReduxComponent() {' }],
      {},
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('docs/rules/planted-rule.md:36');
    expect(problems[0]).toContain('documented as INCORRECT');
    // A listed key clears; a stale key fails.
    expect(
      auditSilentIncorrect([{ key: 'planted-rule:36', head: 'x' }], {
        'planted-rule:36': 'reason',
      }),
    ).toEqual([]);
    expect(
      auditSilentIncorrect([], { 'planted-rule:36': 'reason' })[0],
    ).toContain('Delete the entry');
  });

  it('catches a path-scoped fence that never fires (control)', () => {
    // The other dead shape (require-migration-script-metadata, #1641): a rule
    // scoped by glob, documented in a fence that omits the path it assumes, so
    // the rule never engages and the example enforces nothing.
    const fence = [
      '/**',
      ' * @migration true',
      ' * @migrationPhase after',
      ' * @migrationDescription Backfill data',
      ' */',
      "import { onCallVaripotent } from '../../v2/https/onCall';",
    ].join('\n');

    const offPath = lintBlock(
      'require-migration-script-metadata',
      '/repo/src/util/helper.ts',
      fence,
      null,
    );
    expect(offPath.skipped).toBe(false);
    expect(offPath.reports).toEqual([]);

    const hint = '// functions/src/callable/scripts/backfillData.f.ts';
    const hinted = filenameHint(`${hint}\n${fence}`);
    expect(hinted).toBe(
      '/repo/functions/src/callable/scripts/backfillData.f.ts',
    );
    const onPath = lintBlock(
      'require-migration-script-metadata',
      hinted as string,
      `${hint}\n${fence}`,
      null,
    );
    expect(onPath.skipped).toBe(false);
    expect(onPath.reports.length).toBeGreaterThan(0);
    expect(onPath.reports[0]).toContain('@migrationDependencies');
  });

  // Pins the residue to the two fences verified as harness artifacts. An
  // exemption is meant to be a conscious, reviewable opt-out, so growing this
  // set means editing this expectation on purpose.
  it('ships with only the two verified type-aware JSX-prop exemptions', () => {
    expect(Object.keys(SILENT_INCORRECT_BLOCKS).sort()).toEqual([
      'consistent-callback-naming:44',
      'consistent-callback-naming:48',
    ]);
  });

  it('skips exactly the rules that declare requiresTypeChecking', () => {
    const declared = ruleNames.filter(requiresTypeChecking);
    // Non-vacuity: if the metadata read ever breaks, every rule looks
    // type-aware (or none does) and the skip silently swallows the corpus.
    expect(declared.length).toBeGreaterThan(0);
    expect(declared.length).toBeLessThan(ruleNames.length / 10);
    expect(declared).toContain('no-usememo-for-pass-by-value');
    expect(requiresTypeChecking('no-jsx-whitespace-literal')).toBe(false);
  });
});

/**
 * Statement-level dead-example guard (#1742).
 *
 * The #1641 guard asks whether a fence reports AT ALL and stops at the first
 * hit, so a fence documenting several violations is satisfied by any one of
 * them still working. Pages routinely document several per fence: of the 341
 * incorrect fences that fire, 192 top-level non-declaration statements sit
 * inside them, so the coarser question leaves most documented violations
 * unasserted. Reverting the #1625 fix leaves its documented example silent and
 * the fence guard green, because a sibling in the same fence reports.
 *
 * This asks the same question one level down: inside a fence that fires, does
 * every top-level statement carry a report of its own? A statement that does
 * not is either scaffolding the example needs, or a documented violation
 * nobody flags — and the difference has to be written down rather than
 * inferred from a sibling's report.
 */

/**
 * Statement kinds excluded from the assertion.
 *
 * A fence's declarations are overwhelmingly setup for the violation that
 * follows — the `const docRef = ...` that a bad `docRef.update()` needs.
 * Measured across the corpus, 645 top-level declarations sit in firing fences
 * and 216 of them carry no report, against 17 silent non-declaration
 * statements; asserting declarations would trade one real finding for a dozen
 * exemptions of mixed validity.
 *
 * The declaration half is not left unguarded. `segmentFence` splits fences at
 * exactly these boundaries (`SEGMENT_STARTER` matches `const`/`let`/`var`/
 * `function`/`class`/`enum`), and the #1622 guard asserts every segment whose
 * own comment claims it violates — which is the shape a declaration-level
 * documented violation takes. The two guards partition the fence between them.
 *
 * Know what this reaches before trusting it (#1747). Of 343 firing fences, 246
 * hold NO assertable statement at all: their whole body is one
 * `const Component = () => {...}`, so they contribute a single top-level
 * declaration and their interior is never examined. Statement granularity
 * therefore covers 97 fences, and for the other 246 the coarseness #1742
 * describes is intact — several violations in one component body, satisfied by
 * any one of them firing. `assertedStatements` counts statements, not fences,
 * so a floor on it cannot detect that; `fencesWithStatements` below is the
 * number to watch.
 */
const DECLARATION_TYPES = new Set([
  'VariableDeclaration',
  'FunctionDeclaration',
  'ImportDeclaration',
  'ClassDeclaration',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'TSEnumDeclaration',
  'TSModuleDeclaration',
  'TSDeclareFunction',
  'ExportNamedDeclaration',
  'ExportDefaultDeclaration',
  'ExportAllDeclaration',
]);

type TopLevelStatement = {
  /** 1-based lines relative to the fence, matching `LintResult.reportLines`. */
  start: number;
  end: number;
  type: string;
  head: string;
};

/**
 * Top-level statements of a fence, or `null` when it parses under neither JSX
 * setting. JSX is tried first and plain TS second: a fence's language tag is
 * not always accurate, and the two disagree only on constructs (`<T>x`) that a
 * documented example does not use.
 *
 * `range` is not optional despite nothing here reading it: the parser attaches
 * comments by range, and without it every fence carrying a `//` comment throws
 * `Cannot read properties of undefined` — which reads as an unparsable fence
 * and quietly retires 142 of the 345.
 */
export function parseFence(code: string): { body: ASTNode[] } | null {
  for (const jsx of [true, false]) {
    try {
      return tsParser.parse(code, {
        ecmaVersion: 2022,
        sourceType: 'module',
        loc: true,
        range: true,
        ecmaFeatures: { jsx },
      }) as unknown as { body: ASTNode[] };
    } catch {
      continue;
    }
  }
  return null;
}

/** The one-line summary a statement is reported by, for error messages. */
function headOf(lines: string[], start: number, end: number): string {
  return lines.slice(start - 1, end).find((l) => l.trim()) ?? '';
}

export function topLevelStatements(code: string): TopLevelStatement[] | null {
  const ast = parseFence(code);
  if (ast === null) return null;
  const lines = code.split('\n');
  return ast.body.map((stmt) => ({
    start: stmt.loc.start.line,
    end: stmt.loc.end.line,
    type: stmt.type,
    head: headOf(lines, stmt.loc.start.line, stmt.loc.end.line),
  }));
}

type TSLoc = { start: { line: number }; end: { line: number } };

type ASTNode = { type: string; loc: TSLoc; [key: string]: unknown };

/** The statements this guard judges: everything but the setup-shaped kinds. */
export function assertableStatements(
  statements: readonly TopLevelStatement[],
): TopLevelStatement[] {
  return statements.filter((s) => !DECLARATION_TYPES.has(s.type));
}

/**
 * Assertable statements of `code` with no report landing inside them. Exported
 * so the controls can drive the attribution on hand-built fences rather than
 * asserting it only through the corpus.
 */
export function silentStatementsOf(
  code: string,
  reportLines: readonly number[],
): TopLevelStatement[] {
  const parsed = topLevelStatements(code);
  if (parsed === null) return [];
  return assertableStatements(parsed).filter(
    (s) => !reportLines.some((line) => line >= s.start && line <= s.end),
  );
}

type SilentStatement = { key: string; docsLine: number; head: string };

/**
 * Statements verified by hand to report nothing legitimately, keyed
 * `<rule>:<fence docs line>:<statement line within fence>` — the fence line
 * alone cannot address a fence hiding more than one.
 *
 * Two classes live here, and each entry says which it is: a statement that is
 * context for the violation reported elsewhere in the same fence, and a
 * documented violation the rule genuinely misses, carrying the issue that
 * tracks it. The second class is a debt marker, not an acquittal — when the
 * rule is fixed the entry goes stale and the audit below fails until it is
 * deleted.
 */
export const SILENT_INCORRECT_STATEMENTS: Record<string, string> = {
  'enforce-centralized-mock-firestore:98:3':
    "usage scaffolding, byte-identical to the page's own correct fence; the one file-level report sits on `const mockFirestore = jest.fn()` at fence line 1 and its fix imports the shared mock, rebinding this call",
  'enforce-centralized-mock-firestore:108:4':
    'usage scaffolding for the aliased mock; the report sits on `const mockFirestore = myMockFirestore` at fence line 2. That report is deliberately unfixable — retiring the alias would strand `myMockFirestore` (#1900) — so the prose under the fence sends the reader to delete both declarations by hand',
  'enforce-centralized-mock-firestore:123:3':
    'the report on the destructured require at fence line 1 carries a fix that rewrites `customMockFirestore(` to `mockFirestore(` inside this very describe, so one report already covers and repairs it',
  'enforce-centralized-mock-firestore:139:3':
    'usage scaffolding identical to the correct fence; the report sits on the exported declaration at fence line 1 and is deliberately unfixable, since collapsing that export is what repairs this call',
  'enforce-firestore-set-merge:157:3':
    'DEBT (#1743): flagging `docRef.update(...)` requires the file to declare a namespaced `admin.firestore()` instance, which this fence has no reason to carry and the modular SDK never produces. Delete this entry when #1743 lands',
  'enforce-firestore-set-merge:157:6':
    "DEBT (#1743): detection requires the receiver's last member to be `batchManager`, so `batchManager.batch.update(...)` never matches and this documented violation is unenforced. Delete this entry when #1743 lands",
  'flatten-push-calls:19:3':
    'one violation per consecutive run: the report lands on `handlers.push` at fence line 2 and its fixer replaces the range spanning all three statements with `handlers.push(fnA, fnB, fnC)`',
  'flatten-push-calls:19:4':
    "tail of the same run as fence line 2, whose fixer range ends at this statement's semicolon; `checkStatements` skips past a merged run, so a run can never yield a second report",
  'flatten-push-calls:26:4':
    'part of the run reported at `items.push` on fence line 2, whose fixer rewrites every statement through the spread push into one merged call',
  'flatten-push-calls:26:5':
    'tail of the same run; `canSafelyFix` accepts a spread argument, so `...more` is merged into the single call reported at fence line 2 rather than reported again',
  'logical-top-to-bottom-grouping:37:5':
    'the loop is an ordering barrier, never a subject: `moveSideEffect` claims only expression statements, and the report on `console.log` at fence line 3 alone yields the documented correct code',
  'no-firestore-jest-mock:23:3':
    "the rule bans the import, not the mock calls; the report on `import ... from 'firestore-jest-mock'` at fence line 1 has a fix that rewrites the module this block's bindings come from",
  'no-unused-usestate:25:3':
    "the setter call is the example's premise — it is what makes the setter half live while the value half is dead; the sole report lands on the `useState` declaration at fence line 2",
  'prefer-document-flattening:36:3':
    'the nested payload is evidence for one per-instance violation reported at the `DocSetter` constructor on fence line 1, whose message names both remedies (shouldFlatten and field paths)',
  'require-image-optimized:19:2':
    'the JSX visitor claims only `img`; the whole next/image surface is reported once at the import on fence line 1, whose fix rewrites the module so this element renders the wrapper untouched',
};

/**
 * Compare the silent statements against the allowlist in both directions, the
 * same way `auditSilentIncorrect` does for whole fences. An unlisted silent
 * statement is a documented violation nobody enforces; a listed statement that
 * fires again is a stale exemption that would absorb the next real one.
 */
export function auditSilentStatements(
  silents: readonly SilentStatement[],
  allowlist: Record<string, string>,
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const silent of silents) {
    const [rule] = silent.key.split(':');
    seen.add(silent.key);
    if (silent.key in allowlist) continue;
    problems.push(
      [
        `docs/rules/${rule}.md:${silent.docsLine} sits in a fence documented as INCORRECT, but no report lands on it:`,
        `  ${silent.head}`,
        '  Its fence reports elsewhere, so the fence-level guard (#1641) is satisfied',
        '  while this statement documents a violation nobody is warned about.',
        '  Either the rule should flag it — fix the rule — or it is setup rather',
        `  than a claim, in which case add '${silent.key}' to`,
        '  SILENT_INCORRECT_STATEMENTS naming where the report does land.',
      ].join('\n'),
    );
  }

  for (const [key, reason] of Object.entries(allowlist)) {
    if (seen.has(key)) continue;
    problems.push(
      [
        `SILENT_INCORRECT_STATEMENTS lists '${key}' (${reason}) but that statement now reports or no longer exists.`,
        '  Delete the entry: a stale exemption hides the next dead example.',
      ].join('\n'),
    );
  }

  return problems;
}

describe('claimed statements inside firing "incorrect" fences must report (#1742)', () => {
  const silents: SilentStatement[] = [];
  let firingFences = 0;
  /** Firing fences that hold at least one statement this guard judges. */
  let fencesWithStatements = 0;
  let assertedStatements = 0;
  let declarationStatements = 0;
  let unparsedFences = 0;

  it('attributes reports per statement, not per fence', () => {
    for (const ruleName of ruleNames) {
      if (requiresTypeChecking(ruleName)) continue;
      const md = fs.readFileSync(path.join(DOCS_DIR, `${ruleName}.md`), 'utf8');
      const incorrect = extractBlocks(md).filter(
        (b) => b.polarity === 'incorrect' && LINTABLE_LANGS.has(b.lang),
      );

      for (const block of incorrect) {
        const parsed = topLevelStatements(block.code);
        if (parsed === null || parsed.length === 0) {
          unparsedFences += 1;
          continue;
        }
        const assertable = assertableStatements(parsed);

        const hinted = filenameHint(block.code);
        const candidates = hinted
          ? [hinted]
          : (block.lang === 'tsx' || block.lang === 'jsx'
              ? TSX_CANDIDATES
              : [...TS_CANDIDATES, ...TSX_CANDIDATES]
            ).map(anchor);

        // Same calibration as the #1622 segment guard, one level down: the
        // filename that lights up the most statements judges the fence, so a
        // path-scoped rule is not marked silent for running off its path.
        // Total reports break ties, so a fence whose assertable statements are
        // all silent still counts as firing when some declaration reports.
        let bestLines: number[] | null = null;
        let bestCovered = -1;
        let bestTotal = -1;
        for (const filename of candidates) {
          const outcome = lintBlock(
            ruleName,
            filename,
            block.code,
            optionsHint(block.code),
          );
          if (outcome.skipped) continue;
          const covered = assertable.filter((s) =>
            outcome.reportLines.some((l) => l >= s.start && l <= s.end),
          ).length;
          if (
            covered > bestCovered ||
            (covered === bestCovered && outcome.reportLines.length > bestTotal)
          ) {
            bestCovered = covered;
            bestTotal = outcome.reportLines.length;
            bestLines = outcome.reportLines;
          }
        }
        // A fence no candidate can lint asserts nothing here, and a fence that
        // reports nowhere is the #1641 guard's finding — flagging its
        // statements too would report one defect many times.
        if (bestLines === null || bestLines.length === 0) continue;

        firingFences += 1;
        if (assertable.length > 0) fencesWithStatements += 1;
        declarationStatements += parsed.length - assertable.length;
        assertedStatements += assertable.length;

        for (const statement of assertable) {
          if (bestLines.some((l) => l >= statement.start && l <= statement.end))
            continue;
          silents.push({
            key: `${ruleName}:${block.line}:${statement.start}`,
            // `block.line` is the fence marker, so the first code line is the
            // one after it.
            docsLine: block.line + statement.start,
            head: statement.head,
          });
        }
      }
    }

    // Coverage floors. If extraction, parsing, or attribution breaks, the
    // corpus empties and this suite passes while asserting nothing. The corpus
    // holds ~341 firing fences and ~192 assertable statements; raise these as
    // coverage grows, never lower one to make a run pass.
    expect(firingFences).toBeGreaterThan(300);
    expect(assertedStatements).toBeGreaterThan(150);
    // The guard's REACH, which a statement count hides: statements cluster, so
    // `assertedStatements` can hold while the set of fences contributing them
    // shrinks. 97 of 343 firing fences reach statement granularity (#1747);
    // this floor fails if that set erodes, and should rise as #1747 descends
    // into declaration bodies.
    expect(fencesWithStatements).toBeGreaterThan(90);
    // The declaration carve-out is the larger half by design; if that inverts,
    // the classification broke rather than the docs changing.
    expect(declarationStatements).toBeGreaterThan(assertedStatements);
    // Unparsable fences are exempt by construction, so they must stay rare —
    // otherwise a parse regression would retire the corpus silently.
    expect(unparsedFences).toBeLessThan(10);

    const problems = auditSilentStatements(
      silents,
      SILENT_INCORRECT_STATEMENTS,
    );
    if (problems.length > 0) {
      throw new Error(
        [
          `${problems.length} statement-level problem(s) in documented "incorrect" fences:`,
          ...problems,
        ].join('\n\n'),
      );
    }
  });

  it('catches a statement its firing fence hides (control)', () => {
    // The exact hiding shape: the import reports, so the fence-level guard is
    // satisfied, and everything below it is judged by that one report.
    const fence = [
      "import { mockFirebase } from 'firestore-jest-mock';",
      'beforeEach(() => {',
      "  mockFirebase({ 'some/path': [{ id: 'test' }] });",
      '});',
    ].join('\n');
    const outcome = lintBlock(
      'no-firestore-jest-mock',
      '/repo/src/util/helper.test.ts',
      fence,
      null,
    );
    expect(outcome.skipped).toBe(false);
    expect(outcome.reportLines).toEqual([1]);

    const silent = silentStatementsOf(fence, outcome.reportLines);
    expect(silent.map((s) => s.start)).toEqual([2]);
    expect(silent[0].type).toBe('ExpressionStatement');
    // The statement spans lines 2-4, so attribution is by range, not by the
    // statement's first line.
    expect(silent[0].end).toBe(4);
  });

  it('leaves statements that carry their own report alone (control)', () => {
    const fence = [
      'await transaction.update(userRef, { visits: 1 });',
      'await transaction.update(otherRef, { visits: 2 });',
    ].join('\n');
    const outcome = lintBlock(
      'enforce-firestore-set-merge',
      '/repo/src/util/helper.ts',
      fence,
      null,
    );
    expect(outcome.skipped).toBe(false);
    expect(outcome.reportLines).toEqual([1, 2]);
    expect(silentStatementsOf(fence, outcome.reportLines)).toEqual([]);
  });

  it('judges statements but not declarations (carve-out control)', () => {
    const fence = ['const setup = { a: 1 };', 'doThing();'].join('\n');
    // Nothing reports anywhere, yet only the expression statement is judged.
    const silent = silentStatementsOf(fence, []);
    expect(silent.map((s) => s.type)).toEqual(['ExpressionStatement']);
    expect(topLevelStatements(fence)).toHaveLength(2);
    // A fence that does not parse under either setting yields no statements
    // rather than throwing mid-suite.
    expect(topLevelStatements('const = ;')).toBeNull();
    expect(silentStatementsOf('const = ;', [])).toEqual([]);
  });

  it('audits the allowlist in both directions (control)', () => {
    const planted = [
      { key: 'planted-rule:12:3', docsLine: 14, head: 'doThing();' },
    ];
    const problems = auditSilentStatements(planted, {});
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('docs/rules/planted-rule.md:14');
    expect(problems[0]).toContain('no report lands on it');
    expect(
      auditSilentStatements(planted, { 'planted-rule:12:3': 'reason' }),
    ).toEqual([]);
    expect(
      auditSilentStatements([], { 'planted-rule:12:3': 'reason' })[0],
    ).toContain('Delete the entry');
  });

  it('keys every exemption to a real rule and every debt entry to an issue', () => {
    const entries = Object.entries(SILENT_INCORRECT_STATEMENTS);
    // The exemption set is meant to stay small, so growth is a conscious edit
    // rather than a drift nobody reviews.
    expect(entries.length).toBeLessThanOrEqual(20);

    for (const [key, reason] of entries) {
      const [rule, fenceLine, statementLine] = key.split(':');
      expect(ruleNames).toContain(rule);
      expect(Number(fenceLine)).toBeGreaterThan(0);
      expect(Number(statementLine)).toBeGreaterThan(0);
      // A one-liner is a placeholder, not a verified exemption.
      expect(reason.length).toBeGreaterThan(60);
      // The two classes are not interchangeable. A statement the rule genuinely
      // misses is debt and must name the issue that retires it; without that it
      // reads as an acquittal and the defect is never fixed.
      if (reason.startsWith('DEBT')) expect(reason).toMatch(/#\d+/);
    }

    // Pinned so a new unenforced violation cannot be filed away as debt
    // silently — raising this means deciding to ship another one.
    expect(
      entries.filter(([, reason]) => reason.startsWith('DEBT')),
    ).toHaveLength(2);
  });
});

/**
 * Statements nested one level inside a top-level declaration — the interior of
 * `const Component = () => {...}` and of class method bodies.
 *
 * This is the region #1747 measured as unreached: statement granularity (#1742)
 * judges only a fence's TOP level, and 246 of 343 firing fences are a single
 * declaration, so their whole body was one unit. `segmentFence` does not close
 * it either — `SEGMENT_STARTER` is anchored at column 0, so an indented
 * statement starts no segment.
 *
 * Only the first function body on each path is collected. A nested callback is
 * its own level, and pulling its statements up here would attribute a claim
 * written about the callback to the body that contains it.
 */
export function nestedStatements(code: string): TopLevelStatement[] | null {
  const ast = parseFence(code);
  if (ast === null) return null;
  const lines = code.split('\n');
  const out: TopLevelStatement[] = [];

  const collectBody = (body: unknown) => {
    const block = body as ASTNode | undefined;
    if (!block || block.type !== 'BlockStatement') return;
    for (const stmt of block.body as ASTNode[]) {
      out.push({
        start: stmt.loc.start.line,
        end: stmt.loc.end.line,
        type: stmt.type,
        head: headOf(lines, stmt.loc.start.line, stmt.loc.end.line),
      });
    }
  };

  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    const n = node as ASTNode;
    if (typeof n.type !== 'string') return;
    if (FUNCTION_TYPES.has(n.type)) {
      collectBody(n.body);
      return;
    }
    for (const key of Object.keys(n)) {
      if (key === 'parent' || key === 'loc' || key === 'range') continue;
      walk(n[key]);
    }
  };

  for (const top of ast.body) {
    if (!DECLARATION_TYPES.has(top.type)) continue;
    walk(top);
  }
  return out;
}

const FUNCTION_TYPES = new Set([
  'ArrowFunctionExpression',
  'FunctionExpression',
  'FunctionDeclaration',
]);

/**
 * A comment asserting THIS statement is the violation, on its own lines or on a
 * whole-line comment directly above it.
 *
 * The whole-line requirement is load-bearing, not tidiness. A TRAILING comment
 * belongs to the code sharing its line, and in a fence the line above a nested
 * statement is usually its block opener or its preceding sibling. Accepting a
 * trailing claim from above produced three findings, all false:
 * `methodA() { // ❌ methodA appears before constructor` claims methodA rather
 * than the call beneath it; `function useCustomHook(Component: ReactNode) {
 * // ❌ Should be lowercase` claims the parameter; and
 * `const PAGE_SIZE = 50; // ❌ you recreate it on every render` claims the
 * declaration, not the `return` below. Requiring a whole-line comment takes the
 * finding set to zero, which is the true state.
 */
export function claimsStatement(
  lines: readonly string[],
  statement: TopLevelStatement,
): boolean {
  const own = lines.slice(statement.start - 1, statement.end).join('\n');
  if (CLAIM_COMMENT.test(own)) return true;
  const above = lines[statement.start - 2];
  if (above === undefined || !CLAIM_COMMENT.test(above)) return false;
  return /^\s*(\/\/|\/\*|\*)/.test(above);
}

/** Claim-carrying nested statements of `code` with no report inside them. */
export function silentNestedClaimsOf(
  code: string,
  reportLines: readonly number[],
): TopLevelStatement[] {
  const nested = nestedStatements(code);
  if (nested === null) return [];
  const lines = code.split('\n');
  return nested.filter(
    (s) =>
      claimsStatement(lines, s) &&
      !reportLines.some((line) => line >= s.start && line <= s.end),
  );
}

/**
 * Nested statements that declare themselves a violation yet report nothing.
 *
 * Empty on purpose: the corpus holds 10 claim-carrying nested statements across
 * 8 fences, and all 10 report. An entry here is a documented violation nobody
 * enforces, so it must name the issue that retires it rather than reading as an
 * acquittal.
 */
export const SILENT_NESTED_CLAIMS: Record<string, string> = {};

export function auditNestedClaims(
  silents: readonly SilentStatement[],
  allowlist: Record<string, string>,
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const silent of silents) {
    const [rule] = silent.key.split(':');
    seen.add(silent.key);
    if (silent.key in allowlist) continue;
    problems.push(
      [
        `docs/rules/${rule}.md:${silent.docsLine} sits inside a declaration body and its own comment calls it a violation, but no report lands on it:`,
        `  ${silent.head}`,
        '  Its fence reports elsewhere, so both the fence guard (#1641) and the',
        '  top-level statement guard (#1742) are satisfied while the statement the',
        '  docs point at is unenforced. Either fix the rule, or — if the comment',
        `  describes a neighbour rather than this line — add '${silent.key}' to`,
        '  SILENT_NESTED_CLAIMS naming where the report actually lands.',
      ].join('\n'),
    );
  }

  for (const [key, reason] of Object.entries(allowlist)) {
    if (seen.has(key)) continue;
    problems.push(
      [
        `SILENT_NESTED_CLAIMS lists '${key}' (${reason}) but that statement now reports or no longer exists.`,
        '  Delete the entry: a stale exemption hides the next dead example.',
      ].join('\n'),
    );
  }

  return problems;
}

describe('claim-carrying statements inside declaration bodies must report (#1748)', () => {
  const silents: SilentStatement[] = [];
  /** Firing fences whose interior this guard opens at all. */
  let fencesExamined = 0;
  /** Firing fences it actually ASSERTS on — those holding a claim. Not the same
   * number, and the smaller one is the one that matters. */
  let fencesAsserted = 0;
  let nestedTotal = 0;
  let claimCarrying = 0;
  /** Examined fences whose top level offers the #1742 guard nothing to judge. */
  let fencesBlindToTopLevel = 0;
  let assertedBlindToTopLevel = 0;

  it('descends into declaration bodies the top-level guard cannot see', () => {
    for (const ruleName of ruleNames) {
      if (requiresTypeChecking(ruleName)) continue;
      const md = fs.readFileSync(path.join(DOCS_DIR, `${ruleName}.md`), 'utf8');
      const incorrect = extractBlocks(md).filter(
        (b) => b.polarity === 'incorrect' && LINTABLE_LANGS.has(b.lang),
      );

      for (const block of incorrect) {
        const nested = nestedStatements(block.code);
        if (nested === null || nested.length === 0) continue;
        const lines = block.code.split('\n');
        const claimed = nested.filter((s) => claimsStatement(lines, s));
        // Fences the #1742 guard is structurally blind to: their top level is
        // one declaration, so it holds nothing that guard judges.
        const top = topLevelStatements(block.code);
        const blindToTopLevel =
          top !== null && assertableStatements(top).length === 0;

        const hinted = filenameHint(block.code);
        const candidates = hinted
          ? [hinted]
          : (block.lang === 'tsx' || block.lang === 'jsx'
              ? TSX_CANDIDATES
              : [...TS_CANDIDATES, ...TSX_CANDIDATES]
            ).map(anchor);

        // Same calibration as #1622 and #1742: the filename lighting up the most
        // claimed statements judges the fence, so a path-scoped rule is not
        // marked silent for running off its path.
        let bestLines: number[] | null = null;
        let bestCovered = -1;
        let bestTotal = -1;
        for (const filename of candidates) {
          const outcome = lintBlock(
            ruleName,
            filename,
            block.code,
            optionsHint(block.code),
          );
          if (outcome.skipped) continue;
          const covered = claimed.filter((s) =>
            outcome.reportLines.some((l) => l >= s.start && l <= s.end),
          ).length;
          if (
            covered > bestCovered ||
            (covered === bestCovered && outcome.reportLines.length > bestTotal)
          ) {
            bestCovered = covered;
            bestTotal = outcome.reportLines.length;
            bestLines = outcome.reportLines;
          }
        }
        // A fence reporting nowhere is the #1641 guard's finding; flagging its
        // interior too would report one defect many times.
        if (bestLines === null || bestLines.length === 0) continue;

        fencesExamined += 1;
        nestedTotal += nested.length;
        claimCarrying += claimed.length;
        if (claimed.length > 0) fencesAsserted += 1;
        if (blindToTopLevel) {
          fencesBlindToTopLevel += 1;
          if (claimed.length > 0) assertedBlindToTopLevel += 1;
        }

        for (const statement of claimed) {
          if (bestLines.some((l) => l >= statement.start && l <= statement.end))
            continue;
          silents.push({
            key: `${ruleName}:${block.line}:${statement.start}`,
            docsLine: block.line + statement.start,
            head: statement.head,
          });
        }
      }
    }

    // Coverage floors on the two units #1747 asks for. They must be units that
    // can actually diverge: an earlier draft floored two counters incremented on
    // the same line, which reads as two floors and is one.
    //
    // EXAMINED is how much interior the descent opens — it collapses if parsing
    // or the walker breaks.
    expect(fencesExamined).toBeGreaterThan(140);
    expect(nestedTotal).toBeGreaterThan(250);
    // ASSERTED is what this guard actually bites on, and it is the smaller,
    // load-bearing number: 10 claim-carrying statements across 8 fences. They
    // diverge because claims cluster (one fence can hold three), so a floor on
    // statements alone would hold while the set of fences producing them shrank.
    expect(claimCarrying).toBeGreaterThan(5);
    expect(fencesAsserted).toBeGreaterThan(5);
    // The claim filter is what makes this assertable at all — 193 of 311 nested
    // statements are silent setup, so a blanket assertion would need an
    // allowlist larger than the corpus it guards.
    expect(claimCarrying).toBeLessThan(nestedTotal / 10);

    const problems = auditNestedClaims(silents, SILENT_NESTED_CLAIMS);
    if (problems.length > 0) {
      throw new Error(
        [
          `${problems.length} nested claim problem(s) in documented "incorrect" fences:`,
          ...problems,
        ].join('\n\n'),
      );
    }
  });

  it('opens interior the top-level guard is structurally blind to (#1747)', () => {
    // What descending actually bought, stated honestly. It is NOT "reach rises
    // 91 -> 149": the #1742 suite's 91 is fences it ASSERTS on, while 149 is
    // merely fences this one OPENS. Comparing them flatters this guard.
    //
    // The true gain is the blind region #1747 named — fences whose entire top
    // level is one declaration, so #1742 judges nothing in them. This guard is
    // the only statement-level assertion that reaches inside those.
    expect(fencesBlindToTopLevel).toBeGreaterThan(100);
    expect(assertedBlindToTopLevel).toBeGreaterThan(0);
    // Assertion reach is small by construction — 10 statements over 8 fences,
    // the same order as the #1622 claim-segment guard's 7. This is a narrow,
    // high-precision regression gate, not a broad sweep, and the floors above
    // are what keep it from quietly becoming a no-op.
    expect(fencesAsserted).toBeLessThan(fencesExamined / 5);
  });

  it('credits a claim inside a callback to the statement containing it', () => {
    // Depth-1 is justified empirically, not by taste: collecting EVERY function
    // body at any depth yields the same 10 claim-carrying statements over the
    // same 8 fences, because no documented fence writes a claim inside a nested
    // callback. Depth-1 is the simpler walker with identical corpus behaviour.
    //
    // The coarseness it accepts, recorded so nobody mistakes it for precision: a
    // claim written about a line INSIDE a multi-line statement is credited to
    // that whole statement, so a report landing anywhere in its span satisfies
    // it. That is weaker than per-line attribution and stronger than the nothing
    // this region had before.
    const fence = [
      'const Widget = () => {',
      '  useEffect(() => {',
      '    // ❌ flagged',
      '    doThing();',
      '  }, []);',
      '};',
    ].join('\n');
    const nested = nestedStatements(fence);
    // One statement, spanning the whole useEffect call — not the callback body.
    expect(nested).toHaveLength(1);
    expect(nested![0].start).toBe(2);
    expect(nested![0].end).toBe(5);
    // The interior claim makes the containing statement claimed…
    expect(silentNestedClaimsOf(fence, []).map((s) => s.start)).toEqual([2]);
    // …and a report anywhere inside its span clears it, including on the inner
    // line the comment was really about.
    expect(silentNestedClaimsOf(fence, [4])).toEqual([]);
  });

  it('catches a claimed statement buried in a component body (positive control)', () => {
    // The exact hiding shape: one top-level declaration, so #1742 judges nothing
    // inside it, and the fence reports — satisfying #1641.
    const fence = [
      'const Widget = () => {',
      '  const handler = useCallback(() => run(), []);',
      '  // ❌ flagged: this literal is recreated every render',
      '  const style = { margin: 0 };',
      '  return <div style={style} onClick={handler} />;',
      '};',
    ].join('\n');
    const nested = nestedStatements(fence);
    expect(nested).not.toBeNull();
    // The body's three statements are visible here; at top level the fence is
    // one VariableDeclaration and the guard above sees none of them.
    expect(nested).toHaveLength(3);
    expect(topLevelStatements(fence)).toHaveLength(1);
    expect(assertableStatements(topLevelStatements(fence)!)).toEqual([]);

    // With a report elsewhere in the fence, the claimed statement is still flagged.
    const silent = silentNestedClaimsOf(fence, [2]);
    expect(silent.map((s) => s.start)).toEqual([4]);
  });

  it('ignores unclaimed setup and honours a landing report (negative controls)', () => {
    const fence = [
      'const Widget = () => {',
      '  const style = { margin: 0 };',
      '  return <div style={style} />;',
      '};',
    ].join('\n');
    // Nothing reports anywhere, yet no statement carries a claim, so the guard
    // stays silent. This is what keeps the other 193 silent statements out.
    expect(silentNestedClaimsOf(fence, [])).toEqual([]);

    const claimed = [
      'const Widget = () => {',
      '  // ❌ flagged',
      '  doThing();',
      '};',
    ].join('\n');
    expect(silentNestedClaimsOf(claimed, [])).toHaveLength(1);
    // A report landing on it clears it.
    expect(silentNestedClaimsOf(claimed, [3])).toEqual([]);
  });

  it('does not let a trailing claim above bleed onto the next statement (control)', () => {
    // The false-finding shape this guard was nearly shipped with: the ❌ is
    // ABOUT the block opener, and the statement below it is innocent.
    const opener = [
      'class C {',
      '  methodA() { // ❌ methodA appears before constructor',
      '    this.methodB();',
      '  }',
      '}',
    ].join('\n');
    expect(silentNestedClaimsOf(opener, [])).toEqual([]);

    // The trailing ❌ claims the declaration it sits on, which is a real claim;
    // what must NOT happen is it bleeding down onto the `return` beneath.
    const sibling = [
      'function renderPage() {',
      '  const PAGE_SIZE = 50; // ❌ you recreate it on every render',
      '  return paginate(items, PAGE_SIZE);',
      '}',
    ].join('\n');
    expect(silentNestedClaimsOf(sibling, []).map((s) => s.start)).toEqual([2]);
    // …and once the declaration reports, nothing in the body is left claimed.
    expect(silentNestedClaimsOf(sibling, [2])).toEqual([]);

    // …but a whole-line comment above DOES claim what follows.
    const wholeLine = [
      'function renderPage() {',
      '  // ❌ you recreate it on every render',
      '  return paginate(items, 50);',
      '}',
    ].join('\n');
    expect(silentNestedClaimsOf(wholeLine, [])).toHaveLength(1);
  });

  it('audits the allowlist in both directions (control)', () => {
    const planted = [
      { key: 'planted-rule:12:3', docsLine: 15, head: 'doThing();' },
    ];
    const problems = auditNestedClaims(planted, {});
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('docs/rules/planted-rule.md:15');
    expect(problems[0]).toContain('calls it a violation');
    expect(
      auditNestedClaims(planted, { 'planted-rule:12:3': 'reason' }),
    ).toEqual([]);
    expect(
      auditNestedClaims([], { 'planted-rule:12:3': 'reason' })[0],
    ).toContain('Delete the entry');
  });

  it('keys every exemption to a real rule and every entry to an issue', () => {
    for (const [key, reason] of Object.entries(SILENT_NESTED_CLAIMS)) {
      const [rule, fenceLine, statementLine] = key.split(':');
      expect(ruleNames).toContain(rule);
      expect(Number(fenceLine)).toBeGreaterThan(0);
      expect(Number(statementLine)).toBeGreaterThan(0);
      expect(reason.length).toBeGreaterThan(60);
      // A statement that declares itself a violation and reports nothing is a
      // rule miss, not context — it must cite the issue that retires it.
      expect(reason).toMatch(/#\d+/);
    }
  });
});

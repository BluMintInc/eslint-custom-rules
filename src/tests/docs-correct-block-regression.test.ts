import {
  readPage,
  extractBlocks,
  filenameHint,
  optionsHint,
  lintBlock,
  anchor,
  TS_CANDIDATES,
  TSX_CANDIDATES,
  LINTABLE_LANGS,
  Block,
} from '../utils/docsFixtures';

/**
 * The 15 documented "correct" blocks fixed by #1982 must stay fixed.
 *
 * Each of those blocks sat under a ✅/Correct heading on its page while drawing
 * an `error` from a DIFFERENT recommended rule — a developer copying the example
 * the plugin told them to copy got a red CI. They were fixed page by page and
 * the issue closed with NO guard, so the next docs edit can reintroduce any of
 * them silently. `npm run docs` regenerates these pages, which makes that a
 * routine event rather than a hypothetical one.
 *
 * SCOPE — deliberately the fixed pairs only, NOT the general axis.
 *
 * "Every documented correct block survives the full recommended config" is an
 * open design call (#1519) and stays open: the unrestricted probe reports 674
 * findings, 345 of them from `export-if-in-doubt` (214) and
 * `prefer-block-comments-for-declarations` (131) objecting to things
 * documentation legitimately does — a throwaway example binding that is not
 * exported, a `// ✅ Correct` line comment above a declaration. Deciding which
 * of those a doc snippet must satisfy is a judgment about what documentation is
 * FOR, and #1519 exists to make it.
 *
 * This guard asks a strictly smaller question that needs no such judgment: the
 * specific (page, rule) pairs somebody already decided were defects, and already
 * fixed, must not come back. It is a regression pin, not a policy.
 *
 * WHY IT CANNOT ROT INTO A STALE EXEMPTION. Every entry asserts a page is
 * CLEAN under a rule. The failure mode that produced #1839 — an exemption
 * recording a violation as acceptable, which then absorbs the next real one —
 * has no analogue here, because there is nothing blessed to go stale. The
 * inverse risk is a pin that stops examining anything, so each entry must
 * contribute a block that actually linted, asserted per-entry rather than
 * through a global floor (#1863).
 *
 * PATH SENSITIVITY. Many rules key off the file path, so a violation counts
 * only when it is present under EVERY candidate filename (or under the block's
 * own `// File:` hint when it carries one). That biases hard toward false
 * negatives, which is the house preference and matches the probe that found
 * these.
 *
 * MUTATION AUDIT:
 *
 *   #1982's own fix reverted on `export-if-in-doubt.md` (`serveRequest` back to
 *     `handleRequest`, the group A defect verbatim) RED, naming the page, the
 *     doc line, the rule and the note. This is the regression the pin exists
 *     for, reproduced from the real page rather than a planted string.
 *   The correct-block filter collapsed to match nothing RED three ways: the
 *     per-pair non-vacuity check plus both red-path controls. A pin whose
 *     corpus goes empty cannot pass while asserting nothing.
 *
 * The shared fence reader lives in `src/utils/docsFixtures.ts` rather than in
 * `docs-examples-conformance`, so this guard cannot drift from that one about
 * which blocks exist or which filenames they are judged under — the failure
 * `fixtureCorpus.ts` prevents on the RuleTester side (#1984).
 */
/** `page -> rules that must not report on that page's correct blocks`. */
const PINNED: Record<string, { rules: string[]; note: string }> = {
  'prefer-usecallback-over-usememo-for-functions': {
    rules: ['consistent-callback-naming'],
    note: '#1982 group A: `handleClick` filler renamed; the page documents memoization, not naming',
  },
  'prefer-params-over-parent-id': {
    rules: ['consistent-callback-naming'],
    note: '#1982 group A: exported `handleUpdate` renamed',
  },
  'prefer-use-base62-id': {
    rules: ['consistent-callback-naming'],
    note: '#1982 group A: `handleSubmit`/`handleUpload`, two instances in one block',
  },
  'enforce-boolean-naming-prefixes': {
    rules: ['consistent-callback-naming'],
    note: '#1982 group A: `handleSubmit` filler; the block is about boolean PARAMETERS',
  },
  'export-if-in-doubt': {
    rules: ['consistent-callback-naming'],
    note: '#1982 group A: `handleRequest` filler for `export default`',
  },
  'vertically-group-related-functions': {
    rules: ['consistent-callback-naming'],
    note: "#1982 group A, handled separately: the name is load-bearing here, since the block demonstrates this page's own event-handlers-first ordering",
  },
  'no-passthrough-getters': {
    rules: [
      'no-redundant-annotation-assertion',
      'prefer-nullish-coalescing-boolean-props',
    ],
    note: "#1982 groups B and E: a getter writing its type twice, and `|| []` under a heading that calls itself null/undefined handling while `??` is the plugin's own prescription",
  },
  'prefer-type-alias-over-typeof-constant': {
    rules: ['no-redundant-annotation-assertion'],
    note: '#1982 group B: with the literal-type annotation present the `as const` is inert',
  },
  'enforce-early-destructuring': {
    rules: ['enforce-empty-object-check'],
    note: '#1982 group C: `data` matches the Data-suffix heuristic and carried only a falsiness guard',
  },
  'enforce-object-literal-as-const': {
    rules: ['prefer-use-deep-compare-memo'],
    note: '#1982 group D: `hits` is a genuinely identity-unstable array in the dep list',
  },
  'enforce-empty-object-check': {
    rules: ['prefer-nullish-coalescing-boolean-props'],
    note: '#1982 group E: fixed by DECLARING the operands, not by rewriting `||` to `??` (see #1981)',
  },
  'logical-top-to-bottom-grouping': {
    rules: ['prefer-nullish-coalescing-boolean-props'],
    note: '#1982 group E: operands declared',
  },
  'no-always-true-false-conditions': {
    rules: ['prefer-nullish-coalescing-boolean-props'],
    note: '#1982 group E: `const options = config || {}` carried a comment reading as the plugin blessing the `||` form',
  },
  'no-misleading-boolean-prefixes': {
    rules: ['prefer-nullish-coalescing-boolean-props'],
    note: '#1982 group E: operands declared',
  },
};

/**
 * Correct-polarity fences holding lintable TypeScript. The language filter is
 * not cosmetic: a ```text fence illustrating a directory layout would otherwise
 * be counted as a block that failed to parse, which inflates the skip count
 * this guard asserts on and hides a block that skipped for a real reason.
 */
const correctBlocksOf = (markdown: string): Block[] =>
  extractBlocks(markdown).filter(
    (block) => block.polarity === 'correct' && LINTABLE_LANGS.has(block.lang),
  );

type Violation = {
  page: string;
  rule: string;
  docLine: number;
  reports: string[];
};

type PageAudit = {
  blocksSeen: number;
  blocksLinted: number;
  blocksSkipped: number;
  violations: Violation[];
};

/**
 * A violation counts only where every candidate filename agrees, so a
 * path-keyed rule cannot manufacture one. A block carrying a `// File:` hint is
 * judged under that path alone, because the hint is the doc stating its own
 * context.
 */
function auditPage(page: string, rule: string): PageAudit {
  const markdown = readPage(page);
  const audit: PageAudit = {
    blocksSeen: 0,
    blocksLinted: 0,
    blocksSkipped: 0,
    violations: [],
  };
  if (!markdown) return audit;

  for (const block of correctBlocksOf(markdown)) {
    audit.blocksSeen++;
    const hint = filenameHint(block.code);
    const jsxish = /<[A-Za-z]/.test(block.code);
    const candidates = hint
      ? [hint]
      : (jsxish ? TSX_CANDIDATES : TS_CANDIDATES).map(anchor);

    let options: unknown | null;
    try {
      options = optionsHint(block.code);
    } catch {
      audit.blocksSkipped++;
      continue;
    }

    const perFilename = candidates.map((filename) =>
      lintBlock(rule, filename, block.code, options),
    );
    // A block that never parsed never ran the rule; that is a skip, not a pass.
    if (perFilename.every((result) => result.skipped)) {
      audit.blocksSkipped++;
      continue;
    }
    audit.blocksLinted++;

    const ran = perFilename.filter((result) => !result.skipped);
    if (ran.every((result) => result.reports.length > 0)) {
      audit.violations.push({
        page,
        rule,
        docLine: block.line,
        reports: ran[0].reports,
      });
    }
  }
  return audit;
}

const PINNED_PAIRS = Object.entries(PINNED).flatMap(([page, { rules }]) =>
  rules.map((rule) => ({ page, rule })),
);

const audits = PINNED_PAIRS.map((pair) => ({
  ...pair,
  audit: auditPage(pair.page, pair.rule),
}));

describe('documented correct blocks fixed by #1982 stay fixed', () => {
  it('pins every pair the issue resolved', () => {
    // The issue listed 15 blocks; they sit on 14 pages because
    // `no-passthrough-getters` carried one from group B and one from group E.
    expect(PINNED_PAIRS).toHaveLength(15);
    expect(Object.keys(PINNED)).toHaveLength(14);
  });

  it('finds every pinned page on disk', () => {
    const missing = Object.keys(PINNED).filter((page) => !readPage(page));
    expect(missing).toEqual([]);
  });

  it('actually lints a correct block for every pinned pair', () => {
    // Per-member, not a global floor: a pair that stops examining anything is
    // a pin that silently stopped pinning (#1863).
    const vacuous = audits
      .filter(({ audit }) => audit.blocksLinted === 0)
      .map(
        ({ page, rule, audit }) =>
          `${page} :: ${rule} linted 0 of ${audit.blocksSeen} correct blocks ` +
          `(${audit.blocksSkipped} skipped). The pin is asserting nothing.`,
      );
    expect(vacuous).toEqual([]);
  });

  it('accounts for every correct block it saw', () => {
    // A skip no expect reads is indistinguishable from a pass (#1984).
    for (const { page, rule, audit } of audits) {
      expect({
        pair: `${page}::${rule}`,
        total: audit.blocksSeen,
        accounted: audit.blocksLinted + audit.blocksSkipped,
      }).toEqual({
        pair: `${page}::${rule}`,
        total: audit.blocksSeen,
        accounted: audit.blocksSeen,
      });
    }
  });

  it('draws no report from the rule that #1982 fixed', () => {
    const failures = audits.flatMap(({ page, rule, audit }) =>
      audit.violations.map(
        (violation) =>
          `${page}.md:${violation.docLine} — a ✅ correct block reports under ` +
          `${rule}, which #1982 fixed: ${violation.reports[0]}. ` +
          `Context: ${PINNED[page].note}. Fix the block, never this pin — and ` +
          `check the page you copied the replacement FROM (#1516 -> #1518).`,
      ),
    );
    expect(failures).toEqual([]);
  });
});

describe('the pin detector itself (controls)', () => {
  /** Runs the same predicate the pin uses, over supplied markdown. */
  const detect = (markdown: string, rule: string) => {
    const blocks = correctBlocksOf(markdown);
    return blocks.filter((block) => {
      const results = (
        /<[A-Za-z]/.test(block.code) ? TSX_CANDIDATES : TS_CANDIDATES
      )
        .map(anchor)
        .map((filename) => lintBlock(rule, filename, block.code, null))
        .filter((result) => !result.skipped);
      return results.length > 0 && results.every((r) => r.reports.length > 0);
    });
  };

  const wrap = (code: string) => `## ✅ Correct\n\n\`\`\`ts\n${code}\n\`\`\`\n`;

  it('flags a planted reintroduction of the group A defect (red path)', () => {
    // Exactly what #1982 removed from six pages: `handle<Capital>` filler.
    expect(
      detect(
        wrap('const handleClick = () => {\n  doThing();\n};'),
        'consistent-callback-naming',
      ),
    ).toHaveLength(1);
  });

  it('passes the spelling #1982 replaced it with', () => {
    expect(
      detect(
        wrap('const logClick = () => {\n  doThing();\n};'),
        'consistent-callback-naming',
      ),
    ).toEqual([]);
  });

  it('flags a planted reintroduction of the group B defect (red path)', () => {
    expect(
      detect(
        wrap("const STATUS: 'exceeding' = 'exceeding' as const;"),
        'no-redundant-annotation-assertion',
      ),
    ).toHaveLength(1);
  });

  it('ignores blocks under an incorrect heading', () => {
    // The pin is about ✅ blocks only; an ❌ block is SUPPOSED to violate.
    const markdown = `## ❌ Incorrect\n\n\`\`\`ts\nconst handleClick = () => {\n  doThing();\n};\n\`\`\`\n`;
    expect(detect(markdown, 'consistent-callback-naming')).toEqual([]);
  });
});

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
 * `avoid-utils-directory` illustrates directory layout in ```text fences), rules
 * documenting no correct examples at all, and rules needing type information
 * (they throw without `parserOptions.project`, which the RuleTester cannot
 * supply). Those are skipped rather than silently passing.
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
  polarity: 'correct' | 'incorrect';
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

/** Pull fenced code blocks that sit under an example heading. */
export function extractBlocks(md: string): Block[] {
  const lines = md.split('\n');
  const blocks: Block[] = [];
  let polarity: Block['polarity'] | null = null;
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
        if (polarity) {
          blocks.push({
            polarity,
            lang: lang.trim().toLowerCase(),
            code: buf.join('\n'),
            line: startLine,
          });
        }
        fence = null;
        buf = [];
      } else {
        buf.push(line);
      }
      continue;
    }

    if (/^#{1,6}\s/.test(line)) {
      // An H1 or a non-example H2+ heading both end the current example section.
      polarity = headingPolarity(line);
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
 * non-default option. Honouring both is what keeps this guard free of an
 * allowlist — every correct block is enforced.
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

type LintResult = { reports: string[]; skipped: boolean };

function lintBlock(
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
  } catch {
    // A rule needing type information throws without `parserOptions.project`,
    // which the RuleTester cannot supply; such rules are out of scope here.
    return { reports: [], skipped: true };
  }
  // A doc snippet is often a fragment; if it does not parse, the rule never ran
  // and there is nothing to assert.
  if (messages.some((m) => m.fatal)) return { reports: [], skipped: true };

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

/**
 * Coverage floor. If heading matching or fence extraction ever breaks, every
 * block silently disappears and the whole suite passes while asserting nothing —
 * the vacuous green that makes a guard worse than no guard. These counters make
 * that failure loud.
 */
let lintedBlocks = 0;
let skippedBlocks = 0;

describe('documented "correct" examples must not report', () => {
  it('finds rule docs to check', () => {
    expect(ruleNames.length).toBeGreaterThan(100);
  });

  afterAll(() => {
    expect(lintedBlocks).toBeGreaterThan(200);
    // Skips are parse-failed fragments and type-aware rules; a sudden jump means
    // the harness stopped being able to lint, not that the docs improved.
    expect(skippedBlocks).toBeLessThan(lintedBlocks / 2);
  });

  describe.each(ruleNames)('%s', (ruleName) => {
    const md = fs.readFileSync(path.join(DOCS_DIR, `${ruleName}.md`), 'utf8');
    const blocks = extractBlocks(md).filter((b) => LINTABLE_LANGS.has(b.lang));
    const correct = blocks.filter((b) => b.polarity === 'correct');
    const incorrect = blocks.filter((b) => b.polarity === 'incorrect');

    if (correct.length === 0) {
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

        const { reports, skipped } = lintBlock(
          ruleName,
          filename,
          block.code,
          optionsHint(block.code),
        );
        if (skipped) {
          skippedBlocks += 1;
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

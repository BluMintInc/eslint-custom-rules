import fs from 'fs';
import path from 'path';
import { Linter } from 'eslint';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as { rules: Record<string, unknown> };
const tsParser = require('@typescript-eslint/parser');
/* eslint-enable @typescript-eslint/no-var-requires */

/**
 * Shared machinery for reading the documented examples out of `docs/rules/*.md`
 * and linting them.
 *
 * Extracted so that more than one guard can ask a question of the SAME parsed
 * corpus. `docs-examples-conformance` asks whether a block satisfies its own
 * rule; `docs-correct-block-regression` asks whether the blocks #1982 fixed
 * still satisfy the OTHER rule that used to report on them. Hand-rolling the
 * fence walker or the candidate-filename list a second time is how two guards
 * come to disagree about which blocks exist — the failure `fixtureCorpus.ts`
 * exists to prevent on the RuleTester side, and the reason four guards there
 * inherited the same two silent losses (#1984).
 *
 * The filename list in particular is load-bearing and must not be duplicated:
 * many rules key off the path, so judging a block under a path the rule was
 * never meant to see manufactures a failure.
 */

export const PREFIX = '@blumintinc/blumint/';
export const DOCS_DIR = path.join(__dirname, '../../docs/rules');

export const pageExists = (rule: string) =>
  fs.existsSync(path.join(DOCS_DIR, `${rule}.md`));

export const readPage = (rule: string) =>
  pageExists(rule)
    ? fs.readFileSync(path.join(DOCS_DIR, `${rule}.md`), 'utf8')
    : null;

/** Fence languages that hold lintable TypeScript. */
export const LINTABLE_LANGS = new Set([
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
export const TS_CANDIDATES = [
  'src/util/helper.ts',
  'functions/src/callable/handler.f.ts',
  'functions/src/util/helper.ts',
  'src/util/helper.test.ts',
  'src/components/Widget.tsx',
];
export const TSX_CANDIDATES = [
  'src/components/Widget.tsx',
  'src/pages/index.tsx',
];

/**
 * Rules that match on path segments need a rooted path — `functions/src/types/x.ts`
 * relative does not satisfy the same check that `/repo/functions/src/types/x.ts`
 * does, which would fail a doc example for a reason the doc never claimed.
 */
export const ROOT = '/repo/';
export const anchor = (p: string) => (p.startsWith('/') ? p : ROOT + p);
export type Block = {
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

export type LintResult = {
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

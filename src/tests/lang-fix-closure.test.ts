/**
 * The core-equivalent `--fix` oracle for the JSON and Markdown languages.
 *
 * Every core-violation guard in this repo is a JavaScript/TypeScript
 * instrument and says so — `composed-fix-core-violation-closure` states
 * outright that "`no-unpinned-dependencies` and
 * `enforce-typescript-markdown-code-blocks` are `error`-severity and
 * `fixable`, so a core-equivalent oracle for their languages is an open
 * to-do". Both rules ship in `recommended` at `error` with `fixable: 'code'`,
 * so a consumer running `--fix` over its `.md` and `package.json` files
 * applies them unattended, and nothing has ever checked what they WRITE.
 *
 * What "core-equivalent" means per language, since neither has core rules:
 *
 *   JSON     — the output must still parse, and must denote the SAME value
 *              except at `dependencies`/`devDependencies` leaves, where the
 *              only licensed change is dropping a leading `^`/`~`. That is the
 *              analogue of "the fix introduced no syntax error and no
 *              `no-dupe-keys`".
 *   Markdown — the document's code blocks must survive byte-identical. The
 *              only licensed change is an empty info string becoming
 *              `typescript` on a triple-backtick fence. Anything else means
 *              the fixer wrote into literal document content.
 *
 * The Markdown oracle carries its OWN CommonMark fence tokenizer rather than
 * reading the rule's answer, because the rule's scanner IS the component under
 * test (#2213 was two divergences in exactly that scanner). It cannot borrow a
 * library one either: `markdown-eslint-parser`, the only declared Markdown
 * dependency, yields a bare `Program` with no block structure, and every real
 * CommonMark parser present (`mdast-util-from-markdown`, `micromark`, `marked`)
 * is both transitive and ESM-only, which this CommonJS jest cannot load. A
 * CommonMark-backed cross-check therefore lives out of band at
 * `.claude/tmp/lang-fix-oracle.mts` (`npx tsx`), and this guard's controls are
 * what keep the in-repo tokenizer honest.
 *
 * ANTI-VACUITY. The declared non-TS fixture corpus is ~40 cases across two
 * rules, which is close enough to empty to certify anything — the same shape as
 * the `throw` restricted-production arm that had a detector and no plant. So
 * the corpus here is three sources, and the floors below sit just under their
 * measured values:
 *
 *   A. every non-TS fixture the suite declares,
 *   B. every `.md` file in the repo and its `package.json` — real documents,
 *      and the source that caught #2213's second defect (the rule corrupted
 *      its OWN docs page),
 *   C. a generated fence-shape space (indent x fence run x info string x body,
 *      composed into multi-block documents), which is what reaches the
 *      combinations a hand-written fixture list does not.
 *
 * Three controls, all asserted: a planted POSITIVE transform that must be
 * caught, a planted NEGATIVE (every document against itself) that must not be,
 * and floors on documents considered, documents actually rewritten, and reports
 * produced. A fix-validity guard whose corpus trips nothing passes forever
 * while asserting nothing. Replayed against the pre-#2213 rule the oracle
 * returns 471 findings, so it is known to be capable of failing.
 */
import fs from 'fs';
import path from 'path';
import { Linter } from 'eslint';
import {
  harvestFixtureCorpus,
  defineCorpusParsers,
  defaultFilenameFor,
} from '../utils/fixtureCorpus';

const PREFIX = '@blumintinc/blumint/';
/**
 * Floors, each just under its measured value at the commit that shipped this
 * guard: considered 3409, markdown 3296, json 113, reports 201, fixed 158,
 * declared non-TS fixtures 82, planted-positive catches 1763. Kept
 * close so that a corpus which quietly stops reaching a fixer fails here rather
 * than passing on a smaller population.
 */
const FLOOR_CONSIDERED = 3350;
const FLOOR_MARKDOWN = 3250;
const FLOOR_JSON = 105;
const FLOOR_REPORTS = 190;
const FLOOR_FIXED = 145;
const FLOOR_DECLARED = 78;
const FLOOR_PLANTED = 1650;
const MD_RULE = 'enforce-typescript-markdown-code-blocks';
const JSON_RULE = 'no-unpinned-dependencies';
const REPO_ROOT = path.join(__dirname, '..', '..');

/* ------------------------------------------------------------------ *
 * An independent CommonMark block tokenizer.                          *
 * ------------------------------------------------------------------ */

const TAB_STOP = 4;
const MAX_FENCE_INDENT = 3;

type Block = {
  kind: 'fenced' | 'indented';
  marker: '`' | '~' | null;
  runLength: number;
  info: string;
  content: string;
};

const indentColumnsOf = (line: string) => {
  let columns = 0;
  let offset = 0;
  while (offset < line.length) {
    if (line[offset] === ' ') columns += 1;
    else if (line[offset] === '\t') columns += TAB_STOP - (columns % TAB_STOP);
    else break;
    offset += 1;
  }
  return { columns, offset };
};

const fenceAt = (line: string) => {
  const { columns, offset } = indentColumnsOf(line);
  if (columns > MAX_FENCE_INDENT) return null;
  const marker = line[offset];
  if (marker !== '`' && marker !== '~') return null;
  let runLength = 0;
  while (line[offset + runLength] === marker) runLength += 1;
  if (runLength < 3) return null;
  const info = line.slice(offset + runLength);
  // A backtick fence's info string may not contain a backtick; a tilde's may.
  if (marker === '`' && info.includes('`')) return null;
  return { marker: marker as '`' | '~', runLength, info, columns };
};

/**
 * Extracts every code block, in order. Deliberately a whole-document
 * extraction rather than the rule's incremental walk, so the two do not share
 * a control-flow shape.
 */
const blocksOf = (text: string): Block[] => {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const fence = fenceAt(lines[index]);
    if (fence) {
      const body: string[] = [];
      let cursor = index + 1;
      let closed = false;
      while (cursor < lines.length) {
        const candidate = fenceAt(lines[cursor]);
        if (
          candidate &&
          candidate.marker === fence.marker &&
          candidate.runLength >= fence.runLength &&
          candidate.info.trim().length === 0
        ) {
          closed = true;
          break;
        }
        body.push(lines[cursor]);
        cursor += 1;
      }
      blocks.push({
        kind: 'fenced',
        marker: fence.marker,
        runLength: fence.runLength,
        info: fence.info,
        content: body.join('\n'),
      });
      index = closed ? cursor + 1 : cursor;
      continue;
    }

    // An indented code block: 4+ columns, opened only from a blank/absent line.
    const previous = index === 0 ? '' : lines[index - 1];
    const { columns } = indentColumnsOf(lines[index]);
    const blank = lines[index].trim().length === 0;
    if (!blank && columns >= TAB_STOP && previous.trim().length === 0) {
      const body: string[] = [];
      let cursor = index;
      while (cursor < lines.length) {
        const isBlank = lines[cursor].trim().length === 0;
        const wide = indentColumnsOf(lines[cursor]).columns >= TAB_STOP;
        if (!isBlank && !wide) break;
        body.push(lines[cursor]);
        cursor += 1;
      }
      while (body.length && body[body.length - 1].trim().length === 0)
        body.pop();
      blocks.push({
        kind: 'indented',
        marker: null,
        runLength: 0,
        info: '',
        content: body.join('\n'),
      });
      index = cursor;
      continue;
    }
    index += 1;
  }
  return blocks;
};

/** The only licensed Markdown delta. */
const markdownViolations = (before: string, after: string): string[] => {
  const a = blocksOf(before);
  const b = blocksOf(after);
  if (a.length !== b.length) return [`block count ${a.length} -> ${b.length}`];
  const problems: string[] = [];
  a.forEach((block, i) => {
    const other = b[i];
    if (block.kind !== other.kind || block.marker !== other.marker) {
      problems.push(
        `block ${i}: kind ${block.kind}/${block.marker} -> ${other.kind}/${other.marker}`,
      );
      return;
    }
    if (block.runLength !== other.runLength) {
      problems.push(
        `block ${i}: fence run ${block.runLength} -> ${other.runLength}`,
      );
      return;
    }
    if (block.content !== other.content) {
      problems.push(
        `block ${i}: CONTENT ${JSON.stringify(
          block.content.slice(0, 70),
        )} -> ${JSON.stringify(other.content.slice(0, 70))}`,
      );
      return;
    }
    if (block.info === other.info) return;
    const licensed =
      block.kind === 'fenced' &&
      block.marker === '`' &&
      block.runLength === 3 &&
      block.info.trim().length === 0 &&
      other.info.trim() === 'typescript';
    if (!licensed) {
      problems.push(
        `block ${i}: info ${JSON.stringify(block.info)} -> ${JSON.stringify(
          other.info,
        )}`,
      );
    }
  });
  return problems;
};

/* ------------------------------------------------------------------ *
 * JSON oracle                                                         *
 * ------------------------------------------------------------------ */

const PINNED =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/** Denotation of a JSONC document, which throws on a duplicated key. */
const jsonValueOf = (parser: any, text: string): unknown => {
  const { ast } = parser.parseForESLint(text, { ecmaVersion: 2020 });
  const convert = (node: any): any => {
    switch (node.type) {
      case 'Program':
        return convert(node.body[0]);
      case 'JSONExpressionStatement':
        return convert(node.expression);
      case 'JSONObjectExpression': {
        const object: Record<string, unknown> = {};
        for (const property of node.properties) {
          const key =
            property.key.type === 'JSONIdentifier'
              ? property.key.name
              : property.key.value;
          if (Object.prototype.hasOwnProperty.call(object, key)) {
            throw new Error(`duplicate key ${key}`);
          }
          object[key] = convert(property.value);
        }
        return object;
      }
      case 'JSONArrayExpression':
        return node.elements.map(convert);
      case 'JSONLiteral':
        return node.value;
      case 'JSONUnaryExpression':
        return node.operator === '-'
          ? -convert(node.argument)
          : convert(node.argument);
      case 'JSONIdentifier':
        return node.name;
      default:
        return null;
    }
  };
  return convert(ast);
};

const jsonViolations = (
  parser: any,
  before: string,
  after: string,
): string[] => {
  const problems: string[] = [];
  let a: unknown;
  let b: unknown;
  try {
    a = jsonValueOf(parser, before);
    b = jsonValueOf(parser, after);
  } catch (error) {
    return [`unparseable after fix: ${(error as Error).message}`];
  }
  const walk = (x: any, y: any, at: string) => {
    if (typeof x !== typeof y || (x === null) !== (y === null)) {
      problems.push(`${at}: type ${typeof x} -> ${typeof y}`);
      return;
    }
    if (x && typeof x === 'object') {
      const keysX = Object.keys(x);
      const keysY = Object.keys(y);
      if (keysX.join(',') !== keysY.join(',')) {
        problems.push(`${at}: keys ${keysX} -> ${keysY}`);
        return;
      }
      keysX.forEach((key) => walk(x[key], y[key], `${at}.${key}`));
      return;
    }
    if (x === y) return;
    if (!/^\.(dependencies|devDependencies)\./.test(at)) {
      problems.push(
        `${at}: ${JSON.stringify(x)} -> ${JSON.stringify(
          y,
        )} outside dependencies`,
      );
      return;
    }
    if (typeof y !== 'string' || !PINNED.test(y)) {
      problems.push(
        `${at}: ${JSON.stringify(x)} -> ${JSON.stringify(
          y,
        )} is not a pinned version`,
      );
      return;
    }
    if (typeof x === 'string' && x.replace(/^[~^]/, '') !== y) {
      problems.push(
        `${at}: ${JSON.stringify(x)} -> ${JSON.stringify(
          y,
        )} is not the range-stripped original`,
      );
    }
  };
  walk(a, b, '');
  return problems;
};

/* ------------------------------------------------------------------ *
 * Corpus                                                              *
 * ------------------------------------------------------------------ */

type Document = {
  source: string;
  language: 'json' | 'markdown';
  code: string;
  filename: string;
};

/**
 * Mirrors jest's own `testPathIgnorePatterns`. `.claude/tmp` and
 * `.claude/worktrees` are gitignored, so counting their Markdown would make the
 * floors below pass locally and fail in CI: measured, `.claude/tmp` alone holds
 * 69 `.md` files, more than the margin the floors leave.
 */
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'coverage',
  'lib',
  'tmp',
  'worktrees',
]);

const collectMarkdownFiles = (dir: string, acc: string[]) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectMarkdownFiles(full, acc);
    else if (entry.name.endsWith('.md')) acc.push(full);
  }
};

/**
 * Corpus C: the shape space, composed into multi-block documents. #2213's
 * second defect needed TWO four-backtick blocks to trigger, so single-block
 * shapes would have missed it — the composition is the point, not the shapes.
 */
const generatedDocuments = (): Document[] => {
  const indents = ['', ' ', '  ', '   ', '    ', '\t', ' \t'];
  const runs = ['```', '````', '`````', '~~~', '~~~~'];
  const infos = ['', 'ts', 'markdown', '   '];
  const bodies = [
    ['x = 1;'],
    ['```', 'inner', '```'],
    [],
    ['a', '', 'b'],
    ['~~~', 'i', '~~~'],
  ];
  const pieces: string[][] = [];
  for (const indent of indents)
    for (const run of runs)
      for (const info of infos)
        for (const body of bodies) {
          pieces.push([
            indent + run + info,
            ...body.map((l) => indent + l),
            indent + run,
          ]);
          pieces.push([
            indent + run + info,
            ...body.map((l) => indent + l),
            indent + run + run[0],
          ]);
        }
  // A fixed seed keeps the corpus, and therefore the floors, reproducible.
  let seed = 20260829;
  const next = () =>
    (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const documents: Document[] = [];
  for (let n = 0; n < 3000; n++) {
    const blocks = 1 + Math.floor(next() * 3);
    const parts = ['Doc', ''];
    for (let b = 0; b < blocks; b++) {
      parts.push(...pieces[Math.floor(next() * pieces.length)]);
      parts.push('');
    }
    documents.push({
      source: `generated#${n}`,
      language: 'markdown',
      code: `${parts.join('\n')}\n`,
      filename: 'docs/generated.md',
    });
  }
  return documents;
};

/**
 * Corpus C for JSON. The declared JSON fixtures are a handful, so the shape
 * space of npm version spellings is generated rather than hand-listed —
 * including the ones that must NOT be rewritten (complex ranges, aliases,
 * tarball URLs) and the ones that would break the emitted string if the fixer
 * ever interpolated them unescaped.
 */
const generatedJsonDocuments = (): Document[] => {
  const versions = [
    '1.2.3',
    '^1.2.3',
    '~1.2.3',
    '^1.2.3-beta.1',
    '~0.0.1',
    '^1.2.3+build.5',
    '>=1.0.0',
    '>=1.0.0 <2.0.0',
    '^1.2.3 || ~2.0.0',
    '1.x',
    '*',
    'latest',
    '^1.2',
    '~1',
    'npm:foo@^1.2.3',
    'github:a/b#^1.2.3',
    'file:../x',
    'workspace:^1.2.3',
    '^v1.2.3',
    '^1.2.3-rc.1+meta',
    '^10.20.30',
    '^1.2.3-0',
    'https://example.test/y-^1.2.3.tgz',
    '~^1.2.3',
    '^~1.2.3',
    '^^1.2.3',
  ];
  const sections = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'resolutions',
  ];
  const documents: Document[] = [];
  for (const section of sections) {
    for (const version of versions) {
      documents.push({
        source: `generated:${section}:${version}`,
        language: 'json',
        code: JSON.stringify(
          {
            name: 'p',
            version: '1.0.0',
            [section]: { dep: version, other: '2.0.0' },
          },
          null,
          2,
        ),
        filename: 'package.json',
      });
    }
  }
  return documents;
};

describe('the JSON and Markdown fixers write only what they own', () => {
  const linter = new Linter();
  defineCorpusParsers(linter);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const plugin = require('../index');
  for (const [name, rule] of Object.entries(plugin.rules)) {
    linter.defineRule(`${PREFIX}${name}`, rule as never);
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const jsoncParser = require('jsonc-eslint-parser');

  const documents: Document[] = [];
  const corpus = harvestFixtureCorpus();
  for (const cases of corpus.byRule.values()) {
    for (const testCase of cases) {
      if (testCase.language === 'ts') continue;
      documents.push({
        source: `fixture:${testCase.origin}`,
        language: testCase.language,
        code: testCase.code,
        filename: testCase.filename ?? defaultFilenameFor(testCase),
      });
    }
  }
  const declaredNonTs = documents.length;

  const markdownFiles: string[] = [];
  collectMarkdownFiles(REPO_ROOT, markdownFiles);
  for (const file of markdownFiles) {
    documents.push({
      source: `repo:${path.relative(REPO_ROOT, file)}`,
      language: 'markdown',
      code: fs.readFileSync(file, 'utf8'),
      filename: path.relative(REPO_ROOT, file),
    });
  }
  documents.push({
    source: 'repo:package.json',
    language: 'json',
    code: fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'),
    filename: 'package.json',
  });
  documents.push(...generatedDocuments());
  documents.push(...generatedJsonDocuments());

  const configFor = (language: 'json' | 'markdown') => ({
    // `defineCorpusParsers` registers each parser under its LANGUAGE key, not
    // its module id; naming the module leaves every case a fatal parse.
    parser: language,
    parserOptions: language === 'json' ? { ecmaVersion: 2020 } : {},
    rules: {
      [`${PREFIX}${language === 'json' ? JSON_RULE : MD_RULE}`]:
        'error' as const,
    },
  });

  /** Applies the real fixer and returns the oracle's verdict. */
  const audit = (
    document: Document,
    transform?: (before: string) => string,
  ) => {
    const config = configFor(document.language) as never;
    const before = document.code;
    const raw = linter.verify(before, config, { filename: document.filename });
    if (raw.some((message) => message.fatal)) return null;
    // Filtered by ruleId: a "Definition for rule not found" message sits in the
    // same array and would read as the rule reporting.
    const ruleId = `${PREFIX}${
      document.language === 'json' ? JSON_RULE : MD_RULE
    }`;
    const messages = raw.filter((message) => message.ruleId === ruleId);
    const applied = transform
      ? { fixed: true, output: transform(before) }
      : linter.verifyAndFix(before, config, { filename: document.filename });
    if (!applied.fixed || applied.output === before) {
      return {
        reports: messages.length,
        fixed: false,
        problems: [] as string[],
      };
    }
    const problems =
      document.language === 'markdown'
        ? markdownViolations(before, applied.output)
        : jsonViolations(jsoncParser, before, applied.output);
    if (!problems.length && !transform) {
      const again = linter.verifyAndFix(applied.output, config, {
        filename: document.filename,
      });
      if (again.fixed && again.output !== applied.output) {
        problems.push(
          'the fix is not a fixed point: a second pass rewrote it again',
        );
      }
      const after = linter.verify(applied.output, config, {
        filename: document.filename,
      });
      if (after.some((message) => message.fatal)) {
        problems.push('the output no longer parses');
      }
    }
    return { reports: messages.length, fixed: true, problems };
  };

  const stats = {
    considered: 0,
    skippedFatal: 0,
    reports: 0,
    fixed: 0,
    markdown: 0,
    json: 0,
  };
  const findings: string[] = [];
  for (const document of documents) {
    const verdict = audit(document);
    if (verdict === null) {
      stats.skippedFatal += 1;
      continue;
    }
    stats.considered += 1;
    stats[document.language] += 1;
    stats.reports += verdict.reports;
    if (verdict.fixed) stats.fixed += 1;
    for (const problem of verdict.problems) {
      findings.push(`${document.source}: ${problem}`);
    }
  }

  it('rewrites nothing it does not own', () => {
    expect(findings).toEqual([]);
  });

  /**
   * Non-vacuity. Floors sit just under the measured values so a corpus that
   * quietly stops reaching the fixers fails instead of passing silently.
   */
  it('is measured over a corpus that actually drives both fixers', () => {
    expect(stats.considered).toBeGreaterThanOrEqual(FLOOR_CONSIDERED);
    expect(stats.markdown).toBeGreaterThanOrEqual(FLOOR_MARKDOWN);
    expect(stats.json).toBeGreaterThanOrEqual(FLOOR_JSON);
    expect(stats.reports).toBeGreaterThanOrEqual(FLOOR_REPORTS);
    expect(stats.fixed).toBeGreaterThanOrEqual(FLOOR_FIXED);
    expect(declaredNonTs).toBeGreaterThanOrEqual(FLOOR_DECLARED);
    // A fixture the parser rejects is invisible to the oracle, so it is pinned
    // rather than merely counted: 106 cases once went missing exactly this way.
    expect(stats.skippedFatal).toBe(0);
  });

  it('detects a fixer that writes outside what it owns (planted positive)', () => {
    // Labels every line opening with three backticks, which is what the rule
    // did before #2213: it reaches closing fences and indented code alike.
    const naive = (text: string) =>
      text
        .split('\n')
        .map((line) =>
          /^[\t ]*```\s*$/.test(line)
            ? `${line.replace(/\s+$/, '')}typescript`
            : line,
        )
        .join('\n');
    const caught = documents.filter((document) => {
      if (document.language !== 'markdown') return false;
      const verdict = audit(document, naive);
      return verdict !== null && verdict.problems.length > 0;
    });
    expect(caught.length).toBeGreaterThanOrEqual(FLOOR_PLANTED);
  });

  /**
   * The oracle must have no false-positive floor of its own: comparing every
   * document to itself has to be silent. Called directly rather than through
   * `audit`, which short-circuits an unchanged output before the oracle runs —
   * routing the control through that path would assert nothing at all.
   */
  it('is silent when nothing changed (planted negative)', () => {
    const flagged = documents.filter((document) =>
      document.language === 'markdown'
        ? markdownViolations(document.code, document.code).length > 0
        : jsonViolations(jsoncParser, document.code, document.code).length > 0,
    );
    expect(flagged.map((document) => document.source)).toEqual([]);
  });
});

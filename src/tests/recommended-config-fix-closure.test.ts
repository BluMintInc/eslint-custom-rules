import fs from 'fs';
import path from 'path';
import { Linter } from 'eslint';

// Using require to avoid test build-time ESM interop issues; the guard only
// needs the plugin object shape (rules, configs), not types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as {
  rules: Record<string, { meta?: { fixable?: string } }>;
  configs: { recommended: { rules: Record<string, unknown> } };
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tsParser = require('@typescript-eslint/parser');

const PREFIX = '@blumintinc/blumint/';
const DOCS_DIR = path.join(__dirname, '../../docs/rules');

/**
 * The recommended config must be closed under its own autofixes: running
 * `eslint --fix` with it must never leave behind a violation of another
 * recommended rule.
 *
 * A sweep over a consumer mainline (#1477) found 289 fix-induced violations,
 * every one of them NON-fixable — so `--fix` converted machine-resolvable work
 * into manual work. Nothing in the suite could see that. The autofix corruption
 * sweep only asks whether a *fixable* report survives the fix (it filters
 * `m.fix`), and ESLint's multi-pass fixing silently absorbs any newly-introduced
 * *fixable* violation, so a newly-introduced *unfixable* one is never counted.
 *
 * Method, matching that sweep: fix a snippet with one rule, then lint the
 * snippet and the fixed output with the SAME full recommended rule set and
 * fixing disabled. Any rule whose report count rises was introduced by the
 * fixer.
 *
 * Corpus: every fenced code block in `docs/rules/<rule>.md`, fixed by that
 * rule alone. Polarity ("correct"/"incorrect") is deliberately NOT consulted —
 * a block the rule does not report on produces no fix and drops out on its own,
 * so taking every block costs nothing and roughly doubles the corpus. The
 * alternative corpus — each rule's own `invalid` test-case `output` — is a dead
 * end: `src/tests/*.test.ts` call `RuleTester.run` and `describe`/`it` at module
 * scope, so importing them re-executes the entire suite inside this file (2350
 * tests, 2 minutes, 48 cross-file side-effect failures when measured).
 */

/** Fence languages that hold TypeScript this harness can parse. */
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
 * Candidate filenames, tried in order until one produces a fix. Many rules key
 * off the path (cloud function entry points, test-file exemptions, component
 * directories), so a single hard-coded filename would leave those fixers
 * unexercised.
 */
const FILENAME_CANDIDATES = [
  'src/util/helper.ts',
  'functions/src/callable/handler.f.ts',
  'functions/src/util/helper.ts',
  'src/util/helper.test.ts',
  'src/components/Widget.tsx',
];

/** Path-segment matching needs a rooted path, not a relative one. */
const ROOT = '/repo/';
const anchor = (filePath: string) =>
  filePath.startsWith('/') ? filePath : ROOT + filePath;

/**
 * Libraries whose static import a shipped fixer emits. `enforce-dynamic-imports`
 * rejects any external import outside its ignore list, so every one of these
 * must be accepted there — the exact defect #1474 fixed after fixers injected
 * imports the default ignore list did not allow.
 *
 * Asserted to be reachable from the corpus below: if a doc edit stops a fixer
 * from firing, coverage of this axis would otherwise vanish silently.
 *
 * `safe-stable-stringify` (enforce-safe-stringify) is absent because that rule
 * ships no fixer, so no fix can introduce its import.
 */
const FIXER_INJECTED_LIBRARIES = [
  'use-latest-callback',
  '@blumintinc/typescript-memoize',
  '@blumintinc/use-deep-compare',
  '@blumintinc/microdiff',
  '@blumintinc/fast-deep-equal',
];

type Block = { lang: string; code: string; line: number };

/**
 * Pull every fenced code block out of a markdown document.
 *
 * Deliberately a local copy of the extractor in
 * `docs-examples-conformance.test.ts` rather than a shared import: that file
 * registers ~500 tests at module scope, so importing it would re-run them here.
 * Drift is caught by the corpus floor below, which fails loudly if extraction
 * stops finding blocks.
 */
export function extractBlocks(md: string): Block[] {
  const lines = md.split('\n');
  const blocks: Block[] = [];
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

    if (fenceMatch) {
      fence = fenceMatch[1];
      lang = fenceMatch[2] || '';
      startLine = i + 1;
      buf = [];
    }
  }
  return blocks;
}

/** Docs declare a path-sensitive snippet's context inside the snippet itself. */
export function filenameHint(code: string): string | null {
  const explicit = /^\s*(?:\/\/|\/\*)\s*File:\s*([^\s*]+)/im.exec(code);
  if (explicit) return anchor(explicit[1].replace(/^\.\//, ''));
  const firstLine = code.split('\n').find((l) => l.trim().length > 0) || '';
  const bare = /^\s*\/\/\s*((?:[\w.-]+\/)+[\w.-]+\.tsx?)\b/.exec(firstLine);
  return bare ? anchor(bare[1]) : null;
}

/**
 * A snippet that only holds under a non-default option declares it inline. The
 * hint is applied to BOTH the fix and the observation: judging a fix computed
 * under one configuration against a differently-configured observer manufactures
 * a finding that no consumer could ever hit.
 */
export function optionsHint(code: string): unknown | null {
  const match = /^\s*\/\/\s*eslint-options:\s*(\{.*\})\s*$/im.exec(code);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    throw new Error(`malformed // eslint-options: ${match[1]}`);
  }
}

const recommendedRuleNames = Object.keys(plugin.configs.recommended.rules)
  .filter((id) => id.startsWith(PREFIX))
  .map((id) => id.slice(PREFIX.length))
  .filter((name) => Boolean(plugin.rules[name]));

const fixableRuleNames = recommendedRuleNames.filter((name) =>
  Boolean(plugin.rules[name].meta?.fixable),
);

const linter = new Linter();
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}
linter.defineParser('ts', tsParser);

const buildConfig = (
  filename: string,
  rules: Linter.Config['rules'],
): Linter.Config =>
  ({
    parser: 'ts',
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: { jsx: filename.endsWith('.tsx') },
    },
    rules,
  } as unknown as Linter.Config);

/** The rule set a consumer actually runs, every rule at `error`. */
const OBSERVER_RULES: Record<string, 'error'> = Object.fromEntries(
  recommendedRuleNames.map((name) => [PREFIX + name, 'error' as const]),
);

export type Counts = Record<string, number>;

/**
 * Report counts per rule for `code`, with the whole recommended config enabled
 * and fixing off.
 *
 * Returns null when the snippet does not parse: an unparsed snippet ran no rule
 * at all, so counting zero for it would silently pass anything.
 */
export function observe(
  code: string,
  filename: string,
  scopedRule?: string,
  scopedOptions?: unknown,
): Counts | null {
  const rules =
    scopedRule && scopedOptions
      ? { ...OBSERVER_RULES, [PREFIX + scopedRule]: ['error', scopedOptions] }
      : OBSERVER_RULES;

  let messages;
  try {
    messages = linter.verify(
      code,
      buildConfig(filename, rules as Linter.Config['rules']),
      { filename },
    );
  } catch {
    return null;
  }
  if (messages.some((message) => message.fatal)) return null;

  const counts: Counts = {};
  for (const message of messages) {
    if (!message.ruleId?.startsWith(PREFIX)) continue;
    const name = message.ruleId.slice(PREFIX.length);
    counts[name] = (counts[name] || 0) + 1;
  }
  return counts;
}

export type CorpusEntry = {
  rule: string;
  line: number;
  filename: string;
  options: unknown | null;
  before: string;
  after: string;
};

/** Every documented snippet that the owning rule's fixer actually rewrites. */
function buildCorpus(): CorpusEntry[] {
  const corpus: CorpusEntry[] = [];

  for (const rule of fixableRuleNames) {
    const docPath = path.join(DOCS_DIR, `${rule}.md`);
    if (!fs.existsSync(docPath)) continue;

    const blocks = extractBlocks(fs.readFileSync(docPath, 'utf8')).filter(
      (block) => LINTABLE_LANGS.has(block.lang),
    );

    for (const block of blocks) {
      const options = optionsHint(block.code);
      const rules = {
        [PREFIX + rule]: options ? ['error', options] : 'error',
      } as Linter.Config['rules'];
      const jsxish = block.lang === 'tsx' || block.lang === 'jsx';
      const hinted = filenameHint(block.code);
      const candidates = hinted
        ? [hinted]
        : FILENAME_CANDIDATES.map((candidate) =>
            anchor(jsxish ? candidate.replace(/\.ts$/, '.tsx') : candidate),
          );

      for (const filename of candidates) {
        let result;
        try {
          result = linter.verifyAndFix(
            block.code,
            buildConfig(filename, rules),
            { filename },
          );
        } catch {
          // Rule crashes are a separate, already-guarded axis.
          continue;
        }
        if (!result.fixed || result.output === block.code) continue;
        corpus.push({
          rule,
          line: block.line,
          filename,
          options,
          before: block.code,
          after: result.output,
        });
        break;
      }
    }
  }
  return corpus;
}

export type Finding = {
  pair: string;
  rule: string;
  introduced: string;
  line: number;
  filename: string;
  before: number;
  after: number;
};

/** Diff per-rule counts across the fix; a rise means the fixer introduced it. */
export function findIntroduced(entries: readonly CorpusEntry[]): Finding[] {
  const findings: Finding[] = [];

  for (const entry of entries) {
    const before = observe(
      entry.before,
      entry.filename,
      entry.rule,
      entry.options,
    );
    const after = observe(
      entry.after,
      entry.filename,
      entry.rule,
      entry.options,
    );
    if (!before || !after) continue;

    for (const introduced of Object.keys(after)) {
      if ((after[introduced] || 0) <= (before[introduced] || 0)) continue;
      findings.push({
        pair: `${entry.rule} -> ${introduced}`,
        rule: entry.rule,
        introduced,
        line: entry.line,
        filename: entry.filename,
        before: before[introduced] || 0,
        after: after[introduced],
      });
    }
  }
  return findings;
}

/**
 * Fixer -> introduced-rule pairs the shipped config produces today, keyed
 * `<fixer> -> <rule it makes report>`.
 *
 * EVERY ENTRY IS AN UNRESOLVED DESIGN QUESTION FROM #1477, NOT ACCEPTED
 * BEHAVIOUR. Resolving one is a product call — either the fixer declines the
 * rewrite, or the rule it upsets learns to accept the shape a fixer emits — so
 * they are recorded rather than guessed at. Anything NOT listed here fails this
 * suite, which is the point: the next #1474 (fixers injecting an import
 * `enforce-dynamic-imports` rejected, 129 consumer files) goes red at the commit
 * that introduces it.
 *
 * Do not add an entry to make a build green. An entry is a promise that someone
 * decided the contradiction is acceptable for now.
 */
export const FIX_INDUCED_BASELINE: Record<string, string> = {
  // --- The fix hoists or rewrites a declaration at module scope, and a rule
  // that polices module scope then objects. Root cause 2 in #1477 (55 consumer
  // hits). Open question: should the fixer keep the declaration scoped, or
  // should the module-scope rules exempt a declaration they did not previously
  // see?
  'no-empty-dependency-use-callbacks -> export-if-in-doubt':
    'the callback is hoisted to module scope, where export-if-in-doubt demands it be exported',
  'no-empty-dependency-use-callbacks -> vertically-group-related-functions':
    'the hoisted helper lands above its caller, which vertically-group-related-functions orders the other way',
  'enforce-global-constants -> export-if-in-doubt':
    'the constant is hoisted to module scope, where export-if-in-doubt demands it be exported',
  'prefer-union-from-const-array -> export-if-in-doubt':
    'the emitted const array and derived type are module-scope declarations export-if-in-doubt demands be exported',
  'prefer-type-over-interface -> export-if-in-doubt':
    'the interface becomes a module-scope type alias export-if-in-doubt demands be exported',
  'no-class-instance-destructuring -> export-if-in-doubt':
    'the destructure becomes a module-scope const export-if-in-doubt demands be exported',
  'no-class-instance-destructuring -> global-const-style':
    'the emitted module-scope const keeps its camelCase name, which global-const-style requires be UPPER_SNAKE_CASE',
  'no-unnecessary-destructuring -> export-if-in-doubt':
    'collapsing the rest pattern yields module-scope bindings export-if-in-doubt demands be exported',
  'no-useless-usememo-primitives -> global-const-style':
    'unwrapping the useMemo leaves a camelCase module-scope const, which global-const-style requires be UPPER_SNAKE_CASE',

  // --- The fix introduces a construct that a second rule then demands MORE of,
  // and the demand is a rename or an extra argument no fixer can supply. Same
  // shape as root cause 3 in #1477 (enforce-assert-safe-object-key ->
  // enforce-assert-throws, 122 consumer hits); that exact pair is not reachable
  // from this corpus, so it is not listed. Open question: should the fix decline
  // when it would trigger the second rule, or should the second rule ignore
  // fixer-introduced code?
  'prefer-map-over-conditional-dispatch -> enforce-assert-safe-object-key':
    'the emitted RECORD[key] lookup is exactly the dynamic key enforce-assert-safe-object-key requires be wrapped in assertSafe()',
  'require-memo -> memo-compare-deeply-complex-props':
    'wrapping the component in memo() makes memo-compare-deeply-complex-props demand a custom comparator for its complex props',
  'prefer-usecallback-over-usememo-for-functions -> no-empty-dependency-use-callbacks':
    'useMemo(() => fn, []) becomes useCallback(fn, []), and an empty dependency array is what no-empty-dependency-use-callbacks rejects',
  'no-array-length-in-deps -> no-entire-object-hook-deps':
    'the stableHash dependency the fix emits is by design never read in the hook body, which is what no-entire-object-hook-deps reports',
  'enforce-early-destructuring -> react-memoize-literals':
    'the hoisted destructuring introduces an object literal recreated on every render',
  'require-hooks-default-params -> react-memoize-literals':
    'the `= {}` default parameter the fix adds is an object literal recreated on every render',

  // --- The fix changes what a pre-existing line comment sits above.
  // Open question: should a fixer relocate or rewrite comments it strands?
  'enforce-dynamic-firebase-imports -> prefer-block-comments-for-declarations':
    'the static import becomes `const { x } = await import(...)`, so a line comment above the import now sits above a declaration',
  'prefer-usecallback-over-usememo-for-functions -> prefer-block-comments-for-declarations':
    'the rewritten call is a declaration, so a line comment above it now needs to be a block comment',
};

const corpus = buildCorpus();
const findings = findIntroduced(corpus);
const observedPairs = new Set(findings.map((finding) => finding.pair));
const exercisedRules = new Set(corpus.map((entry) => entry.rule));

describe('the recommended config is closed under its own autofixes', () => {
  it('introduces no fix-induced violation outside the documented baseline', () => {
    const unlisted = findings.filter(
      (finding) => !(finding.pair in FIX_INDUCED_BASELINE),
    );
    if (unlisted.length > 0) {
      const byPair = new Map<string, Finding[]>();
      for (const finding of unlisted) {
        byPair.set(finding.pair, [
          ...(byPair.get(finding.pair) || []),
          finding,
        ]);
      }
      throw new Error(
        [
          `${byPair.size} fixer(s) produce code the recommended config rejects:`,
          ...[...byPair.entries()].map(([pair, hits]) =>
            [
              `  ${pair} (${hits.length} documented snippet(s))`,
              ...hits.map(
                (hit) =>
                  `    docs/rules/${hit.rule}.md:${hit.line} as ${hit.filename}: ${hit.introduced} ${hit.before} -> ${hit.after}`,
              ),
            ].join('\n'),
          ),
          '',
          'Running `eslint --fix` now leaves a consumer with a violation the fix',
          'created. Make the fixer emit code the config accepts, or — if the',
          'contradiction needs a product decision — add the pair to',
          'FIX_INDUCED_BASELINE with the reason, referencing #1477.',
        ].join('\n'),
      );
    }
    expect(unlisted).toEqual([]);
  });

  it('carries no stale baseline entry', () => {
    const stale = Object.keys(FIX_INDUCED_BASELINE).filter(
      (pair) => !observedPairs.has(pair),
    );
    if (stale.length > 0) {
      throw new Error(
        [
          'FIX_INDUCED_BASELINE lists pair(s) this corpus no longer reproduces:',
          ...stale.map((pair) => `  ${pair} — ${FIX_INDUCED_BASELINE[pair]}`),
          '',
          'Either the contradiction was resolved (delete the entry) or the',
          'documented snippet that reached it was edited away (restore coverage).',
          'A stale entry silently absorbs the next real regression.',
        ].join('\n'),
      );
    }
    expect(stale).toEqual([]);
  });
});

/**
 * Anti-vacuity controls. A closure guard over a corpus that trips no fixer
 * passes forever while asserting nothing, so the corpus is measured, the
 * observer is proven to report at all, and the detector is proven to catch a
 * planted regression.
 */
describe('the closure guard is load-bearing', () => {
  it('exercises most of the fixable rules in the recommended config', () => {
    // Guards the denominator: if rule registration broke, a high ratio over a
    // tiny rule set would still look healthy.
    expect(fixableRuleNames.length).toBeGreaterThanOrEqual(80);
    // 71 of 83 at the time of writing. The rules this corpus cannot reach are
    // ones whose documented blocks never produce a fix under any candidate
    // filename, plus `no-unpinned-dependencies` and
    // `enforce-typescript-markdown-code-blocks`, which need the JSON and
    // markdown parsers rather than the TypeScript one.
    expect(exercisedRules.size).toBeGreaterThanOrEqual(65);
    expect(corpus.length).toBeGreaterThanOrEqual(110);
  });

  it('reaches every library a shipped fixer statically imports', () => {
    // Direct coverage of the #1474 axis. Each of these must be newly present in
    // some fixed output, or a regression in `DEFAULT_IGNORED_LIBRARIES` would
    // go unnoticed for that library.
    const unreached = FIXER_INJECTED_LIBRARIES.filter(
      (library) =>
        !corpus.some(
          (entry) =>
            entry.after.includes(`'${library}'`) &&
            !entry.before.includes(`'${library}'`),
        ),
    );
    expect(unreached).toEqual([]);
  });

  it('observes reports at all (positive control)', () => {
    // A silently-empty observer would make every count diff zero and the whole
    // suite vacuously green.
    const counts = observe(
      'export const x = { a: 1 };\nexport const y = x.a === 1 ? 1 : 2;\n',
      '/repo/src/util/helper.ts',
    );
    expect(counts).not.toBeNull();
    expect(Object.keys(counts as Counts).length).toBeGreaterThan(0);
  });

  it('is deterministic, so a count diff means something', () => {
    for (const entry of corpus.slice(0, 20)) {
      const first = observe(
        entry.after,
        entry.filename,
        entry.rule,
        entry.options,
      );
      const second = observe(
        entry.after,
        entry.filename,
        entry.rule,
        entry.options,
      );
      expect(second).toEqual(first);
    }
  });

  it('treats an unparseable snippet as unobservable, not clean', () => {
    // Counting zero for a snippet no rule ran on would pass anything.
    expect(observe('const = ;', '/repo/src/util/helper.ts')).toBeNull();
  });

  it('detects a planted fix-induced violation (control)', () => {
    // Reproduces the #1474 shape without touching any rule: a "fix" that adds a
    // static import of a library `enforce-dynamic-imports` does not ignore.
    const planted: CorpusEntry = {
      rule: 'planted-fixer',
      line: 1,
      filename: '/repo/src/util/helper.ts',
      options: null,
      before: 'export const value = 1;\n',
      after:
        "import helper from 'not-an-ignored-library';\nexport const value = helper;\n",
    };
    const planted_findings = findIntroduced([planted]);
    expect(planted_findings.map((finding) => finding.pair)).toContain(
      'planted-fixer -> enforce-dynamic-imports',
    );

    // The same detector must stay silent when the fix introduces nothing.
    const inert: CorpusEntry = {
      ...planted,
      after: 'export const value = 1;\n',
    };
    expect(findIntroduced([inert])).toEqual([]);
  });
});
